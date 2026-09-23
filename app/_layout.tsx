import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  useFonts as useGeist,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { useAuth } from '@/auth/useAuth';
import { useMagicLinkHandler } from '@/auth/useMagicLinkHandler';
import { canMountNavigator } from '@/lib/bootGate';
import { initErrorReporting } from '@/lib/errorReporting';
import { useAppBoot } from '@/lib/useAppBoot';
import { useRestNotificationRouting } from '@/rest/useRestNotificationRouting';
import { BootOverlay } from '@/ui/BootOverlay';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ToastProvider } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

initErrorReporting();
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Every pushed route is given an explicit title — even an empty one — so it
// never falls back to rendering its raw route name in the header (the old
// "history/index" bug). History/TrainingPlan/PlanSetup have no user-authored
// title to show here: their chrome title moved in-screen (Anton display,
// mirroring Progress/Profile) with an empty header, so this bar shows only
// the back chevron. WorkoutActive and HistoryDetail keep real header text —
// a workout's name IS user text (see the headerTitleStyle comment below).
const tabsScreenOpts = { headerShown: false };
const loginScreenOpts = { headerShown: false };
const workoutActiveOpts = { title: 'Workout' };
const historyIndexOpts = { title: '' };
const historyDetailOpts = { title: 'Workout' };
const planIndexOpts = { title: '' };
const planSetupOpts = { title: '' };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useGeist({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    Anton_400Regular,
  });
  const fontsReady = canMountNavigator(fontsLoaded, fontError);

  const { ready, bootError } = useAppBoot(queryClient);

  // The navigator mounts only once the custom fonts are registered
  // (canMountNavigator): a Text laid out before that keeps the system font
  // for the life of the process, which is how TestFlight build 7 shipped a
  // Login wordmark in SF on real iPhones while every simulator run looked
  // right. Until then the tree is the providers plus the boot overlay — no
  // non-navigator content is rendered in the Stack's place (that shape is
  // what used to trigger the "no navigator in root layout" +not-found
  // redirect). Loading/error states stay overlays on top of the navigator.
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={rootStyles.gestureRoot}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                {fontsReady ? <AppNavigator /> : null}
                <BootOverlay ready={ready} fontsLoaded={fontsReady} bootError={bootError} />
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
  // Both hooks navigate through the router singleton; living here, inside the
  // font gate and next to the Stack, guarantees the navigator is mounted
  // before either can fire (the notification hook navigates on mount when
  // the app was cold-launched from a rest-timer notification).
  useMagicLinkHandler();
  useRestNotificationRouting();

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
    // Header titles are user/workout text, so where they're shown (Workout,
    // HistoryDetail) they stay in the Geist voice, not the Anton display face
    // used for chrome screen titles.
    headerTitleStyle: { fontFamily: theme.font.family.sansSemibold, color: theme.color.inkHero },
    // The back chevron is a utility affordance, not an act-now/achievement
    // moment — volt is reserved for those, so the chevron reads in plain ink
    // (matching the in-content chevron-left precedent in WorkoutActive).
    headerTintColor: theme.color.ink,
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
        <Stack.Screen name="history/index" options={historyIndexOpts} />
        <Stack.Screen name="history/[id]" options={historyDetailOpts} />
        <Stack.Screen name="profile/plan/index" options={planIndexOpts} />
        <Stack.Screen name="profile/plan/setup" options={planSetupOpts} />
      </Stack>
    </>
  );
}

const rootStyles = StyleSheet.create({ gestureRoot: { flex: 1 } });
