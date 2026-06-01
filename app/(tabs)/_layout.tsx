import { router, Tabs } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { TabIcon } from '@/ui/TabIcon';
import { useTheme } from '@/ui/useTheme';

const todayOptions = {
  title: 'Today',
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <TabIcon name="today" color={color} focused={focused} />
  ),
};
const progressOptions = {
  title: 'Progress',
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <TabIcon name="progress" color={color} focused={focused} />
  ),
};
const profileOptions = {
  title: 'Profile',
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <TabIcon name="profile" color={color} focused={focused} />
  ),
};

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const theme = useTheme();

  const tabsScreenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: theme.color.accent,
      tabBarInactiveTintColor: theme.color.inkSecondary,
      tabBarStyle: {
        backgroundColor: theme.color.surface,
        borderTopColor: theme.color.border,
        height: theme.touch.navHeight,
        paddingTop: 6,
        paddingBottom: 8,
      },
      headerStyle: { backgroundColor: theme.color.bg },
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: '600' as const, fontSize: theme.font.size.card + 1 },
    }),
    [theme],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        gate: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.color.bg,
        },
      }),
    [theme],
  );

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
        <Tabs.Screen name="progress" options={progressOptions} />
        <Tabs.Screen name="profile" options={profileOptions} />
      </Tabs>
      {loading || !session ? <View pointerEvents="none" style={styles.gate} /> : null}
    </View>
  );
}
