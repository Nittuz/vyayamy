/**
 * Live workout-volume tally — the calm home for the signature complete-set
 * moment. Each banked set counts the cumulative volume up over 600ms and blooms
 * a single volt glow behind it; a PR blooms hotter, flashes a volt "PR" pill,
 * and blinks the bar chalk↔blacktop for one inversion beat (Blacktop spec,
 * backlog 10.1 / #25 — the live PR signal now actually fires).
 *
 * The parent signals each banked set via `bankSignal` (a nonce + isPR), so the
 * pulse fires on banking only — not when an already-logged set is edited.
 * Reduced motion: glow and blink are suppressed (mount-read pattern); the pill
 * still shows because it is state, not motion.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { formatCounterText, settledCounterText } from '@/ui/animatedCounterSync';
import { Text } from '@/ui/Text';
import { useCompleteSetAnimation } from '@/ui/useCompleteSetAnimation';
import { motion } from '@/ui/motion';
import { useReduceMotion } from '@/ui/useReduceMotion';
import { useTheme, type Theme } from '@/ui/useTheme';

const AnimatedText = Animated.createAnimatedComponent(RNText);

export interface BankSignal {
  /** Increments once per banked set. */
  nonce: number;
  /** Whether the just-banked set set a personal record. */
  isPR: boolean;
}

function SessionVolumeBarBase({
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
  const blink = useSharedValue(0);
  const prevVolume = useRef(volume);
  const prevNonce = useRef(bankSignal?.nonce ?? 0);
  const [showPRPill, setShowPRPill] = useState(false);
  // Plain-React fallback for the digits — see the count-up effect below.
  // Starts already correct (no mount-time animation needed to reach it), and
  // only ever moves when a count-up actually finishes.
  const [settleText, setSettleText] = useState(() => formatCounterText(volume));

  // Live reduced-motion for the blink (impeccable r2 #I3); the glow is gated
  // inside useCompleteSetAnimation already. Only read inside the bank-signal
  // effect below, never mid-render, so the sync can run in an effect too.
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  // Count the headline up whenever the cumulative volume changes. The digits
  // are painted by the `counterProps` worklet below — a UI-thread write that
  // bypasses React's render cycle entirely, which is what lets it animate
  // without re-rendering. Live-QA found that write can silently not land (a
  // fresh mount racing a burst of complete/delete/undo writes): once that
  // happens NOTHING in the worklet-only path ever repaints the label, even
  // though `volume` keeps updating correctly the whole time (#volume-tally).
  // `settleText` is the guaranteed fallback — set from a real completion
  // callback, so it can never freeze the label on a stale value either.
  useEffect(() => {
    if (volume !== prevVolume.current) {
      const target = volume;
      v.value = withTiming(
        target,
        { duration: motion.duration.counter, easing: Easing.out(Easing.cubic) },
        (finished) => {
          const next = settledCounterText(finished, target);
          if (next != null) runOnJS(setSettleText)(next);
        },
      );
      prevVolume.current = volume;
    }
  }, [volume, v]);

  // Bloom + (for a PR) flash the pill and blink the inversion, once per banked set.
  useEffect(() => {
    const nonce = bankSignal?.nonce ?? 0;
    if (nonce === prevNonce.current) return;
    prevNonce.current = nonce;
    const isPR = bankSignal?.isPR ?? false;
    void pulse(isPR);
    if (isPR) {
      setShowPRPill(true);
      if (!reduceMotionRef.current) {
        // One chalk↔blacktop inversion beat (120ms in, 120ms out).
        blink.value = withSequence(
          withTiming(1, { duration: motion.duration.inversionBlink }),
          withTiming(0, { duration: motion.duration.inversionBlink }),
        );
      }
    }
  }, [bankSignal, pulse, blink]);

  // Auto-retire the pill a beat after it shows.
  useEffect(() => {
    if (!showPRPill) return;
    const t = setTimeout(() => setShowPRPill(false), 3000);
    return () => clearTimeout(t);
  }, [showPRPill]);

  const counterProps = useAnimatedProps(() => ({ text: `${Math.round(v.value)}` }) as never);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  // Inversion blink: bar flips to an ink face, type flips to bg — both schemes
  // resolve correctly because the interpolation runs on theme tokens.
  const blinkFace = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(blink.value, [0, 1], [theme.color.bg, theme.color.ink]),
  }));
  const blinkValueInk = useAnimatedStyle(() => ({
    color: interpolateColor(blink.value, [0, 1], [theme.color.inkHero, theme.color.bg]),
  }));
  const blinkMetaInk = useAnimatedStyle(() => ({
    color: interpolateColor(blink.value, [0, 1], [theme.color.inkTertiary, theme.color.bg]),
  }));

  return (
    <Animated.View style={[styles.wrap, blinkFace]}>
      <Animated.View
        pointerEvents="none"
        // Full volt fill — the choreography's glowPeak IS the on-screen alpha.
        style={[styles.glow, { backgroundColor: theme.color.accent }, glowStyle]}
      />
      <View style={styles.labelRow}>
        <AnimatedText style={[styles.label, blinkMetaInk]}>VOLUME</AnimatedText>
        {showPRPill ? (
          <View style={styles.prPill}>
            <Text variant="meta" color={theme.color.onAccent} style={styles.prText}>
              PR
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.valueRow}>
        <AnimatedText animatedProps={counterProps} style={[styles.value, blinkValueInk]}>
          {settleText}
        </AnimatedText>
        <AnimatedText style={[styles.unit, blinkMetaInk]}> {units}</AnimatedText>
      </View>
    </Animated.View>
  );
}

// Memoized: `volume`/`bankSignal` change on every banked set, but this bar
// re-rendered on every 250ms rest tick too before that tick was isolated to
// RestProgressBar (Batch 2 P1) — memo() keeps it that way going forward.
export const SessionVolumeBar = memo(SessionVolumeBarBase);
SessionVolumeBar.displayName = 'SessionVolumeBar';

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      marginHorizontal: theme.space.s4,
      marginTop: theme.space.s3,
      paddingVertical: theme.space.s2,
      paddingHorizontal: theme.space.s4,
      overflow: 'hidden',
    },
    glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s2 },
    label: {
      fontFamily: theme.font.family.mono,
      fontSize: theme.font.size.meta,
      letterSpacing: 0.5,
    },
    prPill: {
      backgroundColor: theme.color.accent,
      paddingHorizontal: theme.space.s2,
      paddingVertical: 1,
    },
    prText: { fontFamily: theme.font.family.monoMedium, letterSpacing: 0.5 },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: theme.space.half },
    value: {
      fontFamily: theme.font.family.monoMedium,
      fontSize: theme.font.size.numeralLg,
      letterSpacing: theme.font.tracking.numeralLg,
    },
    unit: {
      fontFamily: theme.font.family.mono,
      fontSize: theme.font.size.card,
    },
  });
