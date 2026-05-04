import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { theme } from '@/ui/theme';

export default function LoginScreen() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        const parsed = Linking.parse(url);
        const code = (parsed.queryParams?.code as string | undefined) ?? null;
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) setError(exchangeErr.message);
          else router.replace('/');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    void Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url);
    });
    return () => sub.remove();
  }, []);

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
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.monogram}>
              <Text style={styles.monogramText}>V</Text>
            </View>
            <Text style={styles.title}>Vyayamy</Text>
            <Text style={styles.tagline}>Track your training, with less noise.</Text>
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
                placeholderTextColor={theme.color.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!sending}
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={handleSubmit}
                disabled={sending || email.trim().length === 0}
                style={({ pressed }) => [
                  styles.button,
                  (sending || email.trim().length === 0) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={theme.color.onAccent} />
                ) : (
                  <Text style={styles.buttonText}>Send magic link</Text>
                )}
              </Pressable>
              <Text style={styles.hint}>We&apos;ll email you a secure sign-in link.</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  kav: { flex: 1, justifyContent: 'center', padding: theme.space.s5 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.s8,
    gap: theme.space.s6,
  },
  header: { alignItems: 'center', gap: theme.space.s3 },
  monogram: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    color: theme.color.onAccent,
    fontSize: 28,
    fontWeight: theme.font.weight.bold,
  },
  title: {
    fontSize: theme.font.title,
    fontWeight: theme.font.weight.bold,
    color: theme.color.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  form: { gap: theme.space.s3 },
  label: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    fontWeight: theme.font.weight.medium,
  },
  input: {
    height: 48,
    paddingHorizontal: theme.space.s4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    fontSize: theme.font.body,
    color: theme.color.text,
    backgroundColor: theme.color.bg,
  },
  button: {
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space.s2,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85 },
  buttonText: {
    color: theme.color.onAccent,
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
  },
  hint: {
    fontSize: theme.font.micro,
    color: theme.color.textTertiary,
    textAlign: 'center',
  },
  error: { color: theme.color.danger, fontSize: theme.font.meta },
  sent: { alignItems: 'center', gap: theme.space.s2 },
  sentHeading: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  sentBody: { fontSize: theme.font.body, color: theme.color.text, textAlign: 'center' },
  bold: { fontWeight: theme.font.weight.semibold },
  meta: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    textAlign: 'center',
    marginTop: theme.space.s2,
  },
});
