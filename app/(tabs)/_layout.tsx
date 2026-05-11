import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { TabIcon } from '@/ui/TabIcon';
import { theme } from '@/ui/theme';

const tabsScreenOptions = {
  tabBarActiveTintColor: theme.color.accent,
  tabBarInactiveTintColor: theme.color.textMuted,
  tabBarStyle: {
    backgroundColor: theme.color.surface,
    borderTopColor: theme.color.border,
    height: theme.touch.navHeight,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerStyle: { backgroundColor: theme.color.bg },
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '600' as const, fontSize: theme.font.card + 1 },
};

const todayOptions = {
  title: 'Today',
  tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
    <TabIcon name="today" color={color} focused={focused} />
  ),
};
const historyOptions = {
  title: 'History',
  tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
    <TabIcon name="history" color={color} focused={focused} />
  ),
};
const progressOptions = {
  title: 'Progress',
  tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
    <TabIcon name="progress" color={color} focused={focused} />
  ),
};
const profileOptions = {
  title: 'Profile',
  tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
    <TabIcon name="profile" color={color} focused={focused} />
  ),
};

export default function TabsLayout() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/login');
    }
  }, [loading, session]);

  // Always render Tabs — never conditionally swap it with a non-navigator element.
  // The Stack navigator reacts badly to its child route switching between a navigator
  // and a plain component, triggering the useSyncState render loop in react-navigation.
  // While auth is loading we render a full-bleed background overlay so the user
  // never sees the empty state of every tab flash before the redirect to /login.
  return (
    <View style={styles.container}>
      <Tabs screenOptions={tabsScreenOptions}>
        <Tabs.Screen name="today" options={todayOptions} />
        <Tabs.Screen name="history" options={historyOptions} />
        <Tabs.Screen name="progress" options={progressOptions} />
        <Tabs.Screen name="profile" options={profileOptions} />
      </Tabs>
      {loading || !session ? <View pointerEvents="none" style={styles.gate} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.color.bg,
  },
});
