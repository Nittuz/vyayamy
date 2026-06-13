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
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

// Two paths are supported (magic link + password). Keep the copy path-specific
// and generic enough not to leak whether an account exists (#92).
const MAGIC_LINK_ERROR = "Couldn't send your magic link. Check the email address and try again.";
const PASSWORD_ERROR = "Couldn't sign in. Check your email and password and try again.";

export default function LoginScreen() {
  const { session, loading } = useAuth();
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
    setSigningIn(true);
    const { error: err } = await signInWithPassword(email.trim(), password);
    setSigningIn(false);
    if (err) setError(PASSWORD_ERROR);
  }

  const emailEmpty = email.trim().length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.header}>
          <FBarMark size={96} />
          <Text variant="displayXL" color={theme.color.inkHero}>
            {brand.name}
          </Text>
          <Text variant="label" color={theme.color.inkSecondary}>
            {brand.tagline}
          </Text>
        </View>

        <Plate faceStyle={styles.cardFace}>
          {sent ? (
            <View style={styles.sent}>
              <Text variant="title" color={theme.color.inkHero}>
                Check your email
              </Text>
              <Text variant="body" color={theme.color.ink} style={styles.centerText}>
                We sent a sign-in link to {email}
              </Text>
              <Text variant="meta" color={theme.color.inkSecondary} style={styles.centerText}>
                Open the link on this device; it&apos;ll bring you back to the app.
              </Text>
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
              <Text variant="label" color={theme.color.inkTertiary}>
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
                style={styles.input}
              />
              {usePassword ? (
                <>
                  <Text variant="label" color={theme.color.inkTertiary}>
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
                    style={styles.input}
                  />
                </>
              ) : null}

              {error ? (
                <Text variant="meta" color={theme.color.danger}>
                  {error}
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
                  setError(null);
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
    cardFace: { padding: theme.space.s6, gap: theme.space.s5 },
    centerText: { textAlign: 'center' },
    form: { gap: theme.space.s3 },
    input: {
      height: theme.touch.min + 4,
      paddingHorizontal: theme.space.s4,
      borderRadius: theme.radius.sm,
      borderWidth: theme.depth.rule,
      borderColor: theme.color.borderStrong,
      fontSize: theme.font.size.body,
      fontFamily: theme.font.family.sans,
      color: theme.color.ink,
      backgroundColor: theme.color.bg,
    },
    fullBtn: { alignSelf: 'stretch', marginTop: theme.space.s2 },
    sent: { alignItems: 'center', gap: theme.space.s2 },
    actions: { alignSelf: 'stretch', gap: theme.space.s2, marginTop: theme.space.s4 },
  });
