import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
// Default edges (all): this screen is full-bleed with no header or tab bar,
// so it owns every inset itself — same as the BootOverlay.
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithOtp, signInWithPassword, verifyEmailOtp } from '@/auth/authActions';
import { classifyMagicLinkSend, sentCardCopy, type SentCardMode } from '@/auth/magicLinkSend';
import {
  isCompleteSignInCode,
  normalizeSignInCode,
  shouldSubmitSignInCode,
  SIGN_IN_CODE_LENGTH,
} from '@/auth/signInCode';
import { useAuth } from '@/auth/useAuth';
import { brand } from '@/ui/brand';
import { Button } from '@/ui/Button';
import { resolveInputStyle } from '@/ui/inputStyles';
import { FBarMark } from '@/ui/Logo';
import { OutlineDisplay } from '@/ui/OutlineDisplay';
import { Plate } from '@/ui/Plate';
import { PRESS_DIP_OPACITY } from '@/ui/plateStyles';
import { SettleSlam } from '@/ui/SettleSlam';
import { Text } from '@/ui/Text';
import { ThemeScope, useTheme, type Theme } from '@/ui/useTheme';

// Copy is path-specific but generic enough not to leak whether an account
// exists (#92). The link error covers expired, used, and malformed codes with
// one neutral line plus both recovery paths (#94).
const MAGIC_LINK_ERROR = "Couldn't send your magic link. Check the email address and try again.";
const PASSWORD_ERROR = "Couldn't sign in. Check your email and password and try again.";
const LINK_FAILED_ERROR =
  "That sign-in link didn't work. It may have expired. Send yourself a fresh link, or sign in with your password.";
// Wrong, expired, and already-used codes all read the same (#92 posture).
const CODE_FAILED_ERROR = "That code didn't work. Check it, or send yourself a fresh link.";
// The iOS number pad has no Done key, so the code field carries its own
// accessory bar (same treatment as the set-entry keypad).
const CODE_ACCESSORY_ID = 'sign-in-code-accessory';

// The wordmark carries this screen's one outlined word: solid FLEX, stroked YUG.
const WORDMARK_SOLID = brand.name.slice(0, 4);
const WORDMARK_OUTLINE = brand.name.slice(4);

// Login pins to the dark Blacktop palette regardless of the system scheme —
// it's brand chrome, not content (owner decision after the wordmark render
// broke and the disabled CTA read as a smear). ThemeScope forces every
// useTheme() call under this subtree (this screen's own + every primitive it
// renders — Button, Plate, OutlineDisplay, SettleSlam, FBarMark) to the dark
// palette; unmounting on navigation reverts everything to normal automatically.
export default function LoginScreen() {
  return (
    <ThemeScope scheme="dark">
      <LoginScreenInner />
    </ThemeScope>
  );
}

function LoginScreenInner() {
  const { session, loading, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // The emailed eight-digit code: the sign-in path that survives mail clients
  // which drop the link's custom-scheme redirect (Gmail in-app browser,
  // Chrome-hosted Gmail) and works when the email is opened elsewhere.
  const [code, setCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [sent, setSent] = useState(false);
  // How the code card was reached (sentCardCopy): a fresh send, a
  // rate-limited send (not a bad address — the latest email still carries a
  // valid code), or "I already have a code".
  const [cardMode, setCardMode] = useState<SentCardMode>('sent');
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (loading) return null;
  if (session) return <Redirect href="/" />;

  async function handleSubmit() {
    setError(null);
    // Recovering from a failed link: drop the stale sent state along with the
    // error, so the form (not the old sent card) hosts the in-flight spinner.
    if (authError) setSent(false);
    clearAuthError();
    setSending(true);
    const redirectTo = Linking.createURL('/login');
    const { error: err } = await signInWithOtp(email.trim(), redirectTo);
    setSending(false);
    const outcome = classifyMagicLinkSend(err);
    if (outcome === 'failed') {
      // Map raw Supabase errors to a single neutral string so the UI doesn't
      // leak whether the email exists or whether signup is disabled.
      setError(MAGIC_LINK_ERROR);
      return;
    }
    setCardMode(outcome === 'rate-limited' ? 'rate-limited' : 'sent');
    setCode('');
    setSent(true);
  }

  // The user already holds an unexpired code (app relaunched, or a link
  // failed) — open the code card without spending another email.
  function openCodeCard() {
    setError(null);
    clearAuthError();
    setCardMode('have-code');
    setCode('');
    setSent(true);
  }

  async function handleCodeSignIn(submitted: string = code) {
    setError(null);
    clearAuthError();
    setVerifyingCode(true);
    const { error: err } = await verifyEmailOtp(email.trim(), submitted);
    setVerifyingCode(false);
    // Success needs no navigation here: onAuthStateChange stores the session
    // and the <Redirect href="/" /> above takes over.
    if (err) setError(CODE_FAILED_ERROR);
  }

  async function handlePasswordSignIn() {
    setError(null);
    clearAuthError();
    setSigningIn(true);
    const { error: err } = await signInWithPassword(email.trim(), password);
    setSigningIn(false);
    if (err) setError(PASSWORD_ERROR);
  }

  const emailEmpty = email.trim().length === 0;
  const formError = error ?? (authError ? LINK_FAILED_ERROR : null);
  // A failed link exchange overrides the sent state: the recovery form
  // (resend CTA + password path) shows with the error instead of a dead-end
  // "check your email" card. Actions that clear authError also reset `sent`,
  // so the sent card never reappears out from under the user.
  const showSent = sent && !authError;

  return (
    <SafeAreaView style={styles.container}>
      {/* Login is pinned dark (ThemeScope above) regardless of system scheme,
          so its status bar must match — light content against the dark bg —
          independent of the root layout's scheme-driven StatusBar. Mounted
          after the root one, expo-status-bar merges the two and this one wins
          for as long as this screen is on screen; unmounting on navigation
          hands control straight back to the root bar (#5, must not leak). */}
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        {/* Poster header (Today's grammar): mark, kicker, then the wordmark
            as ONE word on one line — solid FLEX flowing into outlined YUG
            (owner call: stacked lines read awkward). Same variant on both
            halves keeps the line boxes identical, so bottom-aligning the row
            aligns the glyphs; the outline's stroke copies extend one hairline
            past its box, which reads as the natural inter-glyph gap. */}
        <SettleSlam style={styles.header}>
          <FBarMark size={96} />
          <Text variant="label" color={theme.color.inkTertiary}>
            {brand.tagline}
          </Text>
          <View
            style={styles.wordmark}
            accessible
            accessibilityRole="header"
            accessibilityLabel={brand.name}
          >
            <Text variant="displayXL" color={theme.color.inkHero}>
              {WORDMARK_SOLID}
            </Text>
            <OutlineDisplay size="displayXL">{WORDMARK_OUTLINE}</OutlineDisplay>
          </View>
        </SettleSlam>

        <Plate faceStyle={styles.cardFace}>
          {showSent ? (
            <View style={styles.sent}>
              <Text variant="title" color={theme.color.inkHero}>
                Check your email
              </Text>
              <Text variant="numeral" color={theme.color.ink} style={styles.centerText}>
                {email.trim()}
              </Text>
              <Text
                variant="meta"
                color={cardMode === 'rate-limited' ? theme.color.danger : theme.color.inkSecondary}
                style={styles.centerText}
                accessibilityLiveRegion="polite"
              >
                {sentCardCopy(cardMode)}
              </Text>
              <TextInput
                value={code}
                onChangeText={(v) => {
                  const next = normalizeSignInCode(v);
                  setCode(next);
                  // The completing keystroke (or a one-time-code autofill) IS
                  // the submit: the number pad covers the button and has no
                  // Done key of its own.
                  if (shouldSubmitSignInCode(code, next)) {
                    Keyboard.dismiss();
                    void handleCodeSignIn(next);
                  }
                }}
                onSubmitEditing={() => void handleCodeSignIn()}
                inputAccessoryViewID={Platform.OS === 'ios' ? CODE_ACCESSORY_ID : undefined}
                placeholder={`${SIGN_IN_CODE_LENGTH}-digit code`}
                placeholderTextColor={theme.color.inkTertiary}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={SIGN_IN_CODE_LENGTH}
                editable={!verifyingCode}
                accessibilityLabel="Sign-in code"
                style={[styles.input, styles.codeInput]}
              />
              {Platform.OS === 'ios' ? (
                <InputAccessoryView nativeID={CODE_ACCESSORY_ID}>
                  <View style={styles.accessoryBar}>
                    <Pressable
                      onPress={() => Keyboard.dismiss()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Done"
                      style={({ pressed }) => [
                        styles.accessoryKey,
                        pressed && { opacity: PRESS_DIP_OPACITY },
                      ]}
                    >
                      <Text variant="label" color={theme.color.ink}>
                        DONE
                      </Text>
                    </Pressable>
                  </View>
                </InputAccessoryView>
              ) : null}
              {error ? (
                <Text
                  variant="meta"
                  color={theme.color.danger}
                  style={styles.centerText}
                  accessibilityLiveRegion="polite"
                >
                  {error}
                </Text>
              ) : null}
              <Button
                label="Sign in with code"
                size="cta"
                loading={verifyingCode}
                disabled={!isCompleteSignInCode(code)}
                onPress={() => void handleCodeSignIn()}
                style={styles.fullBtn}
              />
              <View style={styles.rule} />
              <View style={styles.actions}>
                <Button
                  label="Resend link"
                  kind="secondary"
                  size="row"
                  loading={sending}
                  onPress={handleSubmit}
                />
                <Button
                  label="Use a different email"
                  kind="ghost"
                  size="row"
                  onPress={() => {
                    setSent(false);
                    setError(null);
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.form}>
              <Text variant="meta" color={theme.color.inkTertiary}>
                Email address
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.color.inkTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!sending}
                accessibilityLabel="Email address"
                style={styles.input}
              />
              {usePassword ? (
                <>
                  <Text variant="meta" color={theme.color.inkTertiary}>
                    Password
                  </Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Your password"
                    placeholderTextColor={theme.color.inkTertiary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    editable={!signingIn}
                    accessibilityLabel="Password"
                    style={styles.input}
                  />
                </>
              ) : null}

              {formError ? (
                <Text variant="meta" color={theme.color.danger} accessibilityLiveRegion="polite">
                  {formError}
                </Text>
              ) : null}

              {usePassword ? (
                <Button
                  label="Sign in"
                  size="cta"
                  loading={signingIn}
                  disabled={emailEmpty || password.length === 0}
                  onPress={handlePasswordSignIn}
                  style={styles.fullBtn}
                />
              ) : (
                <Button
                  label="Email me a sign-in link"
                  size="cta"
                  loading={sending}
                  disabled={emailEmpty}
                  onPress={handleSubmit}
                  style={styles.fullBtn}
                />
              )}
              {usePassword ? null : (
                <Button
                  label="I already have a code"
                  kind="ghost"
                  size="row"
                  disabled={emailEmpty}
                  onPress={openCodeCard}
                />
              )}
              <Button
                label={usePassword ? 'Use a sign-in link instead' : 'Use a password instead'}
                kind="ghost"
                size="row"
                onPress={() => {
                  setUsePassword((v) => !v);
                  setSent(false);
                  setError(null);
                  clearAuthError();
                }}
              />
            </View>
          )}
        </Plate>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    // Upper-third anchor for the header instead of a dead-centered stack:
    // a fixed top offset plus one comfortable gap before the card, so the
    // two form one rhythm instead of floating in independent whitespace.
    kav: {
      flex: 1,
      paddingHorizontal: theme.space.page,
      paddingTop: theme.space.s12,
      paddingBottom: theme.space.page,
      gap: theme.space.section,
    },
    header: { alignItems: 'center', gap: theme.space.s3 },
    // Stacked, not inlined: OutlineDisplay's knockout only holds up when it
    // owns its own line (see the SettleSlam comment above).
    wordmark: { flexDirection: 'row', alignItems: 'flex-end' },
    cardFace: { padding: theme.space.s6, gap: theme.space.s5 },
    centerText: { textAlign: 'center' },
    form: { gap: theme.space.s3 },
    // Shared input; the pinned-dark poster keeps the stronger hairline so the
    // field reads against the near-black poster (border alone is too quiet here).
    input: { ...resolveInputStyle(theme), borderColor: theme.color.borderStrong },
    fullBtn: { alignSelf: 'stretch', marginTop: theme.space.s2 },
    // The code is data, not prose: mono numerals, centered, tracked so the
    // digits read as one token.
    codeInput: {
      alignSelf: 'stretch',
      marginTop: theme.space.s2,
      textAlign: 'center',
      fontFamily: theme.font.family.mono,
      fontSize: theme.font.size.title,
      letterSpacing: theme.font.tracking.micro,
    },
    sent: { alignItems: 'center', gap: theme.space.s2 },
    rule: {
      alignSelf: 'stretch',
      height: theme.depth.hairline,
      backgroundColor: theme.color.border,
      marginTop: theme.space.s3,
    },
    actions: { alignSelf: 'stretch', gap: theme.space.s2, marginTop: theme.space.s2 },
    accessoryBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s2,
    },
    accessoryKey: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      paddingHorizontal: theme.space.s3,
    },
  });
