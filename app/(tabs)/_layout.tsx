import { Tabs } from 'expo-router';
import { useMemo } from 'react';
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
      // No nav headers on tabs: the in-screen display headline IS the title
      // (kills the Today/PROGRESS/PROFILE duplication).
      headerShown: false,
      // Active state is the volt underline tick inside TabIcon — the glyph and
      // label stay chalk, never volt-filled.
      tabBarActiveTintColor: theme.color.ink,
      tabBarInactiveTintColor: theme.color.inkSecondary,
      tabBarStyle: {
        backgroundColor: theme.color.bg,
        borderTopColor: theme.color.border,
        borderTopWidth: theme.depth.hairline,
        height: theme.touch.navHeight,
        paddingTop: 6,
        paddingBottom: 8,
      },
      tabBarLabelStyle: {
        fontFamily: theme.font.family.mono,
        fontSize: 10,
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
      },
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

  // Redirect for unauthenticated users is owned by the single root-level gate in
  // app/_layout.tsx (#91). Here we only suppress the flash of empty tabs until a
  // session is confirmed, via the overlay below.

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
