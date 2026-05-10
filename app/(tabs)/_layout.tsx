import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth/useAuth';
import { TabIcon } from '@/ui/TabIcon';
import { theme } from '@/ui/theme';

const tabsScreenOptions = {
  tabBarActiveTintColor: theme.color.accent,
  tabBarInactiveTintColor: theme.color.textMuted,
  tabBarStyle: {
    backgroundColor: theme.color.surface,
    borderTopColor: theme.color.border,
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerStyle: { backgroundColor: theme.color.bg },
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '600' as const, fontSize: 17 },
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
  // Individual screens already guard with `if (!userId) return null`.
  return (
    <Tabs screenOptions={tabsScreenOptions}>
      <Tabs.Screen name="today" options={todayOptions} />
      <Tabs.Screen name="history" options={historyOptions} />
      <Tabs.Screen name="progress" options={progressOptions} />
      <Tabs.Screen name="profile" options={profileOptions} />
    </Tabs>
  );
}
