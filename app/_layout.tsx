import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { initDb } from '@/db/client';
import { initErrorReporting } from '@/lib/errorReporting';
import { startSyncEngine, stopSyncEngine } from '@/sync/engine';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ToastProvider } from '@/ui/ToastContext';
import { theme } from '@/ui/theme';

initErrorReporting();
void SplashScreen.preventAutoHideAsync();

const INIT_TIMEOUT_MS = 5_000;

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
              {!ready && !bootError && (
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
