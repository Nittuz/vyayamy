/**
 * Live workout-volume tally — the calm home for the signature complete-set
 * moment. Each banked set counts the cumulative volume up over 600ms and blooms
 * a single ember glow behind it; a PR blooms hotter and flashes a "PR" pill
 * (backlog 10.1 / #25 — the live PR signal now actually fires).
 *
 * The parent signals each banked set via `bankSignal` (a nonce + isPR), so the
 * pulse fires on banking only — not when an already-logged set is edited.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/ui/Text';
import { useCompleteSetAnimation } from '@/ui/useCompleteSetAnimation';
import { motion } from '@/ui/motion';
import { useTheme, type Theme } from '@/ui/useTheme';

const AnimatedText = Animated.createAnimatedComponent(RNText);

export interface BankSignal {
  /** Increments once per banked set. */
  nonce: number;
  /** Whether the just-banked set set a personal record. */
  isPR: boolean;
}

export function SessionVolumeBar({
  volume,
  units,
  bankSignal,
}: {
  volume: number;
  units: 'kg' | 'lb';
  bankSignal?: BankSignal;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { glowOpacity, pulse } = useCompleteSetAnimation();
  const v = useSharedValue(volume);
  const prevVolume = useRef(volume);
  const prevNonce = useRef(bankSignal?.nonce ?? 0);
  const [showPRPill, setShowPRPill] = useState(false);

  // Count the headline up whenever the cumulative volume changes.
  useEffect(() => {
    if (volume !== prevVolume.current) {
      v.value = withTiming(volume, {
        duration: motion.duration.counter,
        easing: Easing.out(Easing.cubic),
      });
      prevVolume.current = volume;
    }
  }, [volume, v]);

  // Bloom + (for a PR) flash the pill, once per banked set.
  useEffect(() => {
    const nonce = bankSignal?.nonce ?? 0;
    if (nonce === prevNonce.current) return;
    prevNonce.current = nonce;
    const isPR = bankSignal?.isPR ?? false;
    void pulse(isPR);
    if (isPR) setShowPRPill(true);
  }, [bankSignal, pulse]);

  // Auto-retire the pill a beat after it shows.
  useEffect(() => {
    if (!showPRPill) return;
    const t = setTimeout(() => setShowPRPill(false), 3000);
    return () => clearTimeout(t);
  }, [showPRPill]);

  const counterProps = useAnimatedProps(() => ({ text: `${Math.round(v.value)}` }) as never);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  // Reanimated only applies the animated `text` prop after the first frame, so
  // a cold-opened in-progress workout would flash a blank tally. Freeze the
  // mount value as static children for the first paint; the worklet's native
  // text takes over for the count-up (children never re-renders, so no flicker).
  const mountText = useRef(`${Math.round(volume)}`).current;

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        // Full ember fill — the choreography's glowPeak IS the on-screen alpha.
        style={[styles.glow, { backgroundColor: theme.color.accent }, glowStyle]}
      />
      <View style={styles.labelRow}>
        <Text variant="label" color={theme.color.inkTertiary}>
          Workout volume
        </Text>
        {showPRPill ? (
          <View style={styles.prPill}>
            <Text variant="label" color={theme.color.onAccent}>
              PR
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.valueRow}>
        <AnimatedText animatedProps={counterProps} style={styles.value}>
          {mountText}
        </AnimatedText>
        <RNText style={styles.unit}> {units}</RNText>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      marginHorizontal: theme.space.s4,
      marginTop: theme.space.s3,
      paddingVertical: theme.space.s2,
      paddingHorizontal: theme.space.s4,
      borderRadius: theme.radius.card,
      overflow: 'hidden',
    },
    glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s2 },
    prPill: {
      backgroundColor: theme.color.accent,
      paddingHorizontal: theme.space.s2,
      paddingVertical: 1,
      borderRadius: theme.radius.sm,
    },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: theme.space.half },
    value: {
      color: theme.color.inkHero,
      fontFamily: theme.font.family.monoMedium,
      fontSize: theme.font.size.numeralLg,
      letterSpacing: theme.font.tracking.numeralLg,
    },
    unit: {
      color: theme.color.inkSecondary,
      fontFamily: theme.font.family.mono,
      fontSize: theme.font.size.card,
    },
  });
