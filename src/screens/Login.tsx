import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { signInWithOtp, signInWithPassword } from '@/auth/authActions';
import { useAuth } from '@/auth/useAuth';
import { brand } from '@/ui/brand';
import { Button } from '@/ui/Button';
import { FBarMark } from '@/ui/Logo';
import { OutlineDisplay } from '@/ui/OutlineDisplay';
import { Plate } from '@/ui/Plate';
import { SettleSlam } from '@/ui/SettleSlam';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

// Copy is path-specific but generic enough not to leak whether an account
// exists (#92). The link error covers expired, used, and malformed codes with
// one neutral line plus both recovery paths (#94).
const MAGIC_LINK_ERROR = "Couldn't send your magic link. Check the email address and try again.";
const PASSWORD_ERROR = "Couldn't sign in. Check your email and password and try again.";
const LINK_FAILED_ERROR =
  "That sign-in link didn't work. It may have expired. Send yourself a fresh link, or sign in with your password.";

// The wordmark carries this screen's one outlined word: solid FLEX, stroked YUG.
const WORDMARK_SOLID = brand.name.slice(0, 4);
const WORDMARK_OUTLINE = brand.name.slice(4);

export default function LoginScreen() {
  const { session, loading, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [sent, setSent] = useState(false);
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
    if (err) {
      // Map raw Supabase errors to a single neutral string so the UI doesn't
      // leak whether the email exists or whether signup is disabled.
      setError(MAGIC_LINK_ERROR);
      return;
    }
    setSent(true);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <SettleSlam style={styles.header}>
          <FBarMark size={96} />
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
          <Text variant="label" color={theme.color.inkTertiary}>
            {brand.tagline}
          </Text>
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
              <Text variant="meta" color={theme.color.inkSecondary} style={styles.centerText}>
                Your sign-in link is on its way. Open it on this device and it will bring you
                straight back here.
              </Text>
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
    kav: { flex: 1, justifyContent: 'center', padding: theme.space.page, gap: theme.space.s8 },
    header: { alignItems: 'center', gap: theme.space.s3 },
    wordmark: { flexDirection: 'row', alignItems: 'flex-end' },
    cardFace: { padding: theme.space.s6, gap: theme.space.s5 },
    centerText: { textAlign: 'center' },
    form: { gap: theme.space.s3 },
    input: {
      height: theme.touch.min + 4,
      paddingHorizontal: theme.space.s4,
      borderWidth: theme.depth.hairline,
      borderColor: theme.color.borderStrong,
      fontSize: theme.font.size.body,
      fontFamily: theme.font.family.sans,
      color: theme.color.ink,
      backgroundColor: theme.color.bg,
    },
    fullBtn: { alignSelf: 'stretch', marginTop: theme.space.s2 },
    sent: { alignItems: 'center', gap: theme.space.s2 },
    rule: {
      alignSelf: 'stretch',
      height: theme.depth.hairline,
      backgroundColor: theme.color.border,
      marginTop: theme.space.s3,
    },
    actions: { alignSelf: 'stretch', gap: theme.space.s2, marginTop: theme.space.s2 },
  });
