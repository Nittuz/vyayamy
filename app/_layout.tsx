import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { useFonts as useGeist, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { exchangeCodeForSession } from '@/auth/authActions';
import { useAuth } from '@/auth/useAuth';
import { initDb } from '@/db/client';
import { initErrorReporting } from '@/lib/errorReporting';
import { removeKv } from '@/lib/kvStore';
import { hydrateSnapshot } from '@/ui/todaySnapshot';
import { startSyncEngine, stopSyncEngine } from '@/sync/engine';
import { darkPalette, lightPalette, type PaletteTokens } from '@/ui/colors';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ToastProvider } from '@/ui/ToastContext';
import { typography } from '@/ui/typography';
import { space, useTheme } from '@/ui/useTheme';

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
    Anton_400Regular,
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        // Hydrate the Today snapshot in parallel with SQLite init so the first paint
        // has render-ready state. Don't await — initDb is the gate, hydrate races it.
        void hydrateSnapshot();
        // One-time cleanup: drop the legacy skin preference left behind by the
        // retired multi-skin system. Best-effort, errors swallowed by removeKv.
        void removeKv('flexyug.skin');
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
        const { error } = await exchangeCodeForSession(code);
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

  // Route a tapped "Rest complete" notification back into the workout, including
  // when the tap cold-starts the app — otherwise the user is stranded on whatever
  // screen launched (#159).
  useEffect(() => {
    const toWorkout = (response: Notifications.NotificationResponse | null) => {
      const category = response?.notification.request.content.categoryIdentifier;
      if (category === 'rest-timer') router.navigate('/workout/active');
    };
    const sub = Notifications.addNotificationResponseReceivedListener(toWorkout);
    void Notifications.getLastNotificationResponseAsync().then(toWorkout);
    return () => sub.remove();
  }, []);

  // Always render the Stack so expo-router has a navigator from the start.
  // Loading/error states are shown as overlays rather than replacing the navigator,
  // which prevents the "no navigator in root layout" +not-found redirect.
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={rootStyles.gestureRoot}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                <AppNavigator />
                <BootOverlay ready={ready} fontsLoaded={fontsLoaded} bootError={bootError} />
              </ToastProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

/**
 * Root stack + status bar. Header chrome follows the theme (header
 * bg/title/tint, content bg) and light/dark scheme.
 * `headerBackButtonDisplayMode: 'minimal'` shows just the chevron — the
 * tab group has no title, so the default label would read "(tabs)".
 */
function AppNavigator() {
  const theme = useTheme();
  const { session, loading } = useAuth();
  const segments = useSegments();

  // Single root-level auth gate. The (tabs) layout gated only the tabs, leaving
  // every sibling stack route (workout/active, history/[id], profile/plan/*)
  // reachable by deep link with no session. Redirect any non-auth route to /login
  // until a session exists (#91).
  useEffect(() => {
    if (loading) return;
    const onLoginScreen = segments[0] === 'login';
    if (!session && !onLoginScreen) router.replace('/login');
  }, [session, loading, segments]);

  const screenOptions = {
    headerStyle: { backgroundColor: theme.color.bg },
    // Header titles are user/workout text, so they stay in the Geist voice
    // (not the Anton display face used for chrome screen titles).
    headerTitleStyle: { fontFamily: theme.font.family.sansSemibold, color: theme.color.inkHero },
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
 * Boot overlay shown until the database and fonts are ready. Resolves the
 * Forged Iron palette from the system color scheme so light-mode users don't
 * get a dark flash (#7.7).
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
  const scheme = useColorScheme();
  const palette = scheme === 'light' ? lightPalette : darkPalette;
  const styles = bootStyles(palette);
  if (bootError) {
    return (
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <Text style={styles.title}>Cannot start</Text>
        <Text style={styles.body}>{bootError}</Text>
      </SafeAreaView>
    );
  }
  if (!ready || !fontsLoaded) {
    return (
      <View style={styles.overlay}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }
  return null;
}

const rootStyles = StyleSheet.create({ gestureRoot: { flex: 1 } });

const bootStyles = (c: PaletteTokens) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.page,
      backgroundColor: c.bg,
    },
    title: {
      fontFamily: typography.family.sansSemibold,
      fontSize: typography.size.title,
      color: c.ink,
      marginBottom: space.s4,
      textAlign: 'center',
    },
    body: {
      fontFamily: typography.family.sans,
      fontSize: typography.size.body,
      color: c.inkSecondary,
      lineHeight: 22,
      textAlign: 'center',
    },
  });
