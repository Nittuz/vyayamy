import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { initDb } from '@/db/client';
import { initErrorReporting } from '@/lib/errorReporting';
import { startSyncEngine, stopSyncEngine } from '@/sync/engine';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ToastProvider } from '@/ui/ToastContext';
import { theme } from '@/ui/theme';

initErrorReporting();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initDb();
      if (cancelled) return;
      setReady(true);
      startSyncEngine(queryClient);
    })();
    return () => {
      cancelled = true;
      stopSyncEngine();
    };
  }, []);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.color.bg },
                headerTitleStyle: { fontWeight: '600' },
                contentStyle: { backgroundColor: theme.color.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="workout/active" options={{ title: 'Workout' }} />
              <Stack.Screen name="history/[id]" options={{ title: 'Workout' }} />
              <Stack.Screen name="profile/plan/index" options={{ title: 'Training plan' }} />
              <Stack.Screen name="profile/plan/setup" options={{ title: 'Plan setup' }} />
            </Stack>
          </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
