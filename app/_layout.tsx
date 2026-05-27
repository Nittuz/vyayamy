import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts as useGeist, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { supabase } from '@/auth/supabase';
import { initDb } from '@/db/client';
import { initErrorReporting } from '@/lib/errorReporting';
import { startSyncEngine, stopSyncEngine } from '@/sync/engine';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ToastProvider } from '@/ui/ToastContext';
import { theme } from '@/ui/theme';

initErrorReporting();
void SplashScreen.preventAutoHideAsync();

// Web does an extra wasm fetch + worker spin-up, which can be slow on a cold load.
const INIT_TIMEOUT_MS = Platform.OS === 'web' ? 15_000 : 5_000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const stackScreenOptions = {
  headerStyle: { backgroundColor: theme.color.bg },
  headerTitleStyle: { fontWeight: '600' as const },
  contentStyle: { backgroundColor: theme.color.bg },
};

const tabsScreenOpts = { headerShown: false };
const loginScreenOpts = { headerShown: false };
const workoutActiveOpts = { title: 'Workout' };
const historyDetailOpts = { title: 'Workout' };
const planIndexOpts = { title: 'Training plan' };
const planSetupOpts = { title: 'Plan setup' };

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const started = useRef(false);
  const initialUrlConsumed = useRef(false);

  const [fontsLoaded] = useGeist({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        await Promise.race([
          initDb(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Database init exceeded ${INIT_TIMEOUT_MS}ms`)),
              INIT_TIMEOUT_MS,
            ),
          ),
        ]);
        setReady(true);
        startSyncEngine(queryClient);
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
      } finally {
        void SplashScreen.hideAsync();
      }
    })();

    return () => {
      stopSyncEngine();
    };
  }, []);

  // Handle the magic-link deep link at the root so it fires regardless of which
  // route the OS dropped us into. Previously this lived only in /login, so a
  // user already on /today would never have their code consumed. The ref guards
  // React 19 strict-mode's double-mount in dev (otherwise exchangeCodeForSession
  // runs twice and the second call returns "code already used").
  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        const parsed = Linking.parse(url);
        const code = (parsed.queryParams?.code as string | undefined) ?? null;
        if (!code) return;
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) router.replace('/');
      } catch {
        // Swallow — we surface auth errors via the AuthProvider state, not here.
      }
    };
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    if (!initialUrlConsumed.current) {
      initialUrlConsumed.current = true;
      void Linking.getInitialURL().then((url) => {
        if (url) void handleUrl(url);
      });
    }
    return () => sub.remove();
  }, []);

  // Always render the Stack so expo-router has a navigator from the start.
  // Loading/error states are shown as overlays rather than replacing the navigator,
  // which prevents the "no navigator in root layout" +not-found redirect.
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={stackScreenOptions}>
                <Stack.Screen name="(tabs)" options={tabsScreenOpts} />
                <Stack.Screen name="login" options={loginScreenOpts} />
                <Stack.Screen name="workout/active" options={workoutActiveOpts} />
                <Stack.Screen name="history/[id]" options={historyDetailOpts} />
                <Stack.Screen name="profile/plan/index" options={planIndexOpts} />
                <Stack.Screen name="profile/plan/setup" options={planSetupOpts} />
              </Stack>
              {(!ready || !fontsLoaded) && !bootError && (
                <View style={bootStyles.overlay}>
                  <ActivityIndicator color={theme.color.accent} />
                </View>
              )}
              {bootError && (
                <SafeAreaView style={bootStyles.overlay} edges={['top', 'bottom', 'left', 'right']}>
                  <Text style={bootStyles.title}>Cannot start</Text>
                  <Text style={bootStyles.body}>{bootError}</Text>
                </SafeAreaView>
              )}
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const bootStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.bg,
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.page,
    backgroundColor: theme.color.bg,
  },
  title: {
    fontSize: theme.font.title,
    fontWeight: '600',
    color: theme.color.text,
    marginBottom: theme.space.s4,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.font.body,
    color: theme.color.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
});
