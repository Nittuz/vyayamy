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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { supabase } from '@/auth/supabase';
import { initDb } from '@/db/client';
import { initErrorReporting } from '@/lib/errorReporting';
import { hydrateSnapshot } from '@/ui/todaySnapshot';
import { startSyncEngine, stopSyncEngine } from '@/sync/engine';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { SkinProvider, useSkin } from '@/ui/SkinContext';
import { ToastProvider } from '@/ui/ToastContext';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

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
        // Hydrate the Today snapshot in parallel with SQLite init so the first paint
        // has render-ready state. Don't await — initDb is the gate, hydrate races it.
        void hydrateSnapshot();
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
      <GestureHandlerRootView style={bootStyles.gestureRoot}>
        <SafeAreaProvider>
          <SkinProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <ToastProvider>
                  <AppNavigator />
                  <BootOverlay ready={ready} fontsLoaded={fontsLoaded} bootError={bootError} />
                </ToastProvider>
              </AuthProvider>
            </QueryClientProvider>
          </SkinProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

/**
 * Root stack + status bar, rendered inside SkinProvider so the header chrome
 * follows the active skin (header bg/title/tint, content bg) and light/dark
 * scheme. `headerBackButtonDisplayMode: 'minimal'` shows just the chevron — the
 * tab group has no title, so the default label would read "(tabs)".
 */
function AppNavigator() {
  const theme = useTheme();
  const screenOptions = {
    headerStyle: { backgroundColor: theme.color.bg },
    headerTitleStyle: { fontWeight: '600' as const, color: theme.color.inkHero },
    headerTintColor: theme.color.accent,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: theme.color.bg },
  };
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" options={tabsScreenOpts} />
        <Stack.Screen name="login" options={loginScreenOpts} />
        <Stack.Screen name="workout/active" options={workoutActiveOpts} />
        <Stack.Screen name="history/[id]" options={historyDetailOpts} />
        <Stack.Screen name="profile/plan/index" options={planIndexOpts} />
        <Stack.Screen name="profile/plan/setup" options={planSetupOpts} />
      </Stack>
    </>
  );
}

/**
 * Boot overlay rendered inside SkinProvider so it can gate first paint on skin
 * hydration — this prevents a flash of the default skin before the stored one
 * loads from AsyncStorage. Uses the legacy theme shim (Forge dark) for the
 * brief loading state only.
 */
function BootOverlay({
  ready,
  fontsLoaded,
  bootError,
}: {
  ready: boolean;
  fontsLoaded: boolean;
  bootError: string | null;
}) {
  const { hydrated } = useSkin();
  if (bootError) {
    return (
      <SafeAreaView style={bootStyles.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <Text style={bootStyles.title}>Cannot start</Text>
        <Text style={bootStyles.body}>{bootError}</Text>
      </SafeAreaView>
    );
  }
  if (!ready || !fontsLoaded || !hydrated) {
    return (
      <View style={bootStyles.overlay}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }
  return null;
}

const bootStyles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
