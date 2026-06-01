import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/auth/supabase';
import { useAuth } from '@/auth/useAuth';
import { FBarMark } from '@/ui/Logo';
import { brand } from '@/ui/theme';
import { useTheme, type Theme } from '@/ui/useTheme';

const GENERIC_AUTH_ERROR = "Couldn't sign in. Check your email and password and try again.";

export default function LoginScreen() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setSending(false);
    if (err) {
      // Map raw Supabase errors to a single neutral string so the UI doesn't
      // leak whether the email exists or whether signup is disabled.
      setError(GENERIC_AUTH_ERROR);
      return;
    }
    setSent(true);
  }

  async function handlePasswordSignIn() {
    setError(null);
    setSigningIn(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSigningIn(false);
    if (err) setError(GENERIC_AUTH_ERROR);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <FBarMark size={44} />
            <Text style={styles.title}>{brand.name}</Text>
            <Text style={styles.tagline}>{brand.tagline}</Text>
          </View>

          {sent ? (
            <View style={styles.sent}>
              <Text style={styles.sentHeading}>Check your email</Text>
              <Text style={styles.sentBody}>
                We sent a sign-in link to <Text style={styles.bold}>{email}</Text>
              </Text>
              <Text style={styles.meta}>
                Open the link on this device; it&apos;ll bring you back to the app.
              </Text>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Email address</Text>
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
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Optional — for direct sign-in"
                placeholderTextColor={theme.color.inkTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                editable={!sending && !signingIn}
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={handlePasswordSignIn}
                disabled={signingIn || email.trim().length === 0 || password.length === 0}
                style={({ pressed }) => [
                  styles.button,
                  (signingIn || email.trim().length === 0 || password.length === 0) &&
                    styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                {signingIn ? (
                  <ActivityIndicator color={theme.color.onAccent} />
                ) : (
                  <Text style={styles.buttonText}>Sign in</Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={sending || email.trim().length === 0}
                style={({ pressed }) => [
                  styles.buttonSecondary,
                  (sending || email.trim().length === 0) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={theme.color.ink} />
                ) : (
                  <Text style={styles.buttonSecondaryText}>Send magic link instead</Text>
                )}
              </Pressable>
              <Text style={styles.hint}>
                Use your password, or get a one-time email sign-in link.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    kav: { flex: 1, justifyContent: 'center', padding: theme.space.s5 },
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      padding: theme.space.s8,
      gap: theme.space.s6,
    },
    header: { alignItems: 'center', gap: theme.space.s3 },
    title: {
      fontSize: theme.font.size.title,
      fontWeight: theme.font.weight.semibold,
      color: theme.color.ink,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: theme.font.size.meta,
      color: theme.color.inkSecondary,
      textAlign: 'center',
    },
    form: { gap: theme.space.s3 },
    label: {
      fontSize: theme.font.size.meta,
      color: theme.color.inkSecondary,
      fontWeight: theme.font.weight.medium,
    },
    input: {
      height: theme.touch.min + 4,
      paddingHorizontal: theme.space.s4,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      fontSize: theme.font.size.body,
      color: theme.color.ink,
      backgroundColor: theme.color.bg,
    },
    button: {
      height: theme.touch.min + 4,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.space.s2,
    },
    buttonSecondary: {
      height: theme.touch.min + 4,
      borderRadius: theme.radius.sm,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonPressed: { opacity: 0.85 },
    buttonText: {
      color: theme.color.onAccent,
      fontSize: theme.font.size.card,
      fontWeight: theme.font.weight.semibold,
    },
    buttonSecondaryText: {
      color: theme.color.ink,
      fontSize: theme.font.size.card,
      fontWeight: theme.font.weight.medium,
    },
    hint: {
      fontSize: theme.font.size.micro,
      color: theme.color.inkTertiary,
      textAlign: 'center',
    },
    error: { color: theme.color.danger, fontSize: theme.font.size.meta },
    sent: { alignItems: 'center', gap: theme.space.s2 },
    sentHeading: {
      fontSize: theme.font.size.title,
      fontWeight: theme.font.weight.semibold,
      color: theme.color.ink,
    },
    sentBody: { fontSize: theme.font.size.body, color: theme.color.ink, textAlign: 'center' },
    bold: { fontWeight: theme.font.weight.semibold },
    meta: {
      fontSize: theme.font.size.meta,
      color: theme.color.inkSecondary,
      textAlign: 'center',
      marginTop: theme.space.s2,
    },
  });
