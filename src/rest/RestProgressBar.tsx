/**
 * Rest countdown — the most-stared-at element on the screen (backlog 3.1 / #24).
 *
 * Was a 2px hairline with no numbers. Now a clear panel: a big mono countdown
 * (m:ss) against the target, a ≥44pt skip control, and a 3px progress rule that
 * crosses to accent as the target nears. The success haptic at the target is
 * owned by useRestTimer; this surface owns tap-to-skip (light) and long-press
 * for the override sheet (medium).
 */
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatClock } from '@/core/format';
import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { motion } from '@/ui/motion';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  running: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
  onSkip: () => void;
  onOpenOverride?: () => void;
}

export function RestProgressBar({ running, elapsedSeconds, targetSeconds, onSkip, onOpenOverride }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const progress = useSharedValue(0);

  const fraction = Math.min(elapsedSeconds / Math.max(targetSeconds, 1), 1);
  const remaining = Math.max(0, targetSeconds - elapsedSeconds);

  // Smooth the once-a-second tick into a continuous fill. Shared value only —
  // no per-frame state. Width is a layout prop, so this runs off the native
  // thread's fast path either way (same as the legacy JS-driven tween).
  useEffect(() => {
    progress.value = withTiming(fraction, { duration: motion.duration.base });
  }, [fraction, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const handleSkip = () => {
    haptics.light();
    onSkip();
  };

  const handleLongPress = () => {
    if (!onOpenOverride) return;
    haptics.medium();
    onOpenOverride();
  };

  if (!running) return null;

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={350}
      accessibilityRole="timer"
      accessibilityLabel={`Resting, ${formatClock(remaining)} remaining. Long-press for rest options.`}
      style={styles.panel}
    >
      <View style={styles.topRow}>
        <View style={styles.clockRow}>
          <Text variant="label" color={theme.color.inkTertiary}>
            Rest
          </Text>
          <Text variant="numeralLg" color={theme.color.inkHero} style={styles.clock}>
            {formatClock(remaining)}
          </Text>
          <Text variant="numeral" color={theme.color.inkTertiary}>
            / {formatClock(targetSeconds)}
          </Text>
        </View>
        <Pressable
          onPress={handleSkip}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
        >
          <Text variant="label" color={theme.color.accent}>
            Skip
          </Text>
          <Icon name="skip" size={16} color={theme.color.accent} />
        </Pressable>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: theme.color.accent }, fillStyle]} />
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: {
      marginHorizontal: theme.space.s4,
      marginTop: theme.space.s3,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s3,
      backgroundColor: theme.color.surface2,
      borderWidth: theme.depth.rule,
      borderColor: theme.color.borderStrong,
      borderRadius: theme.radius.card,
      gap: theme.space.s2,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    clockRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.s2 },
    clock: { minWidth: 64 },
    skip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s1,
      minHeight: theme.touch.min,
      minWidth: theme.touch.min,
      justifyContent: 'flex-end',
    },
    skipPressed: { opacity: 0.6 },
    track: {
      height: theme.depth.ruleHeavy,
      backgroundColor: theme.color.border,
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
    },
    fill: { height: theme.depth.ruleHeavy },
  });
