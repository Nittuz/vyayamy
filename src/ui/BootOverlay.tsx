/**
 * Boot overlay shown until the database and fonts are ready. Resolves the
 * Forged Iron palette from the system color scheme so light-mode users don't
 * get a dark flash (#7.7).
 */
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type PaletteTokens } from './colors';
import { typography } from './typography';
import { buildTheme, space } from './useTheme';

export function BootOverlay({
  ready,
  fontsLoaded,
  bootError,
}: {
  ready: boolean;
  fontsLoaded: boolean;
  bootError: string | null;
}) {
  const raw = useColorScheme();
  const palette = buildTheme(raw === 'light' ? 'light' : 'dark').color;
  const styles = bootStyles(palette);
  if (bootError) {
    return (
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <Text style={styles.title}>{"FlexYug can't start"}</Text>
        <Text style={styles.body}>
          Close and reopen the app. If this keeps happening, reinstall — synced workouts are safe on
          your account.
        </Text>
        {/* Raw thrown-error text, demoted to a small mono detail line for
            support/screenshots — never the user-facing message. Honesty
            guard: useAppBoot only surfaces bootError when initDb() itself
            fails or times out, before startSyncEngine ever runs, so no sync
            state is knowable here — the body copy above deliberately stays
            neutral ("synced workouts are safe") rather than claiming
            anything about THIS session's sync state. */}
        <Text style={styles.detail} selectable>
          {bootError}
        </Text>
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
    // Demoted raw-error line (copy review Batch D): mono to read as data
    // rather than prose, inkTertiary so it recedes behind the body copy.
    detail: {
      fontFamily: typography.family.mono,
      fontSize: typography.size.meta,
      color: c.inkTertiary,
      marginTop: space.s4,
      textAlign: 'center',
    },
  });
