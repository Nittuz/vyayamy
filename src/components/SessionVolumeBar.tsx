/**
 * Live session-volume tally — the calm home for the signature complete-set
 * moment. Each time a set is banked the cumulative volume counts up over 600ms
 * and a single accent glow blooms behind it. Restrained: one number, one pulse.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useCompleteSetAnimation } from '@/ui/useCompleteSetAnimation';
import { motion } from '@/ui/motion';
import { useTheme } from '@/ui/useTheme';

const AnimatedText = Animated.createAnimatedComponent(Text);

export function SessionVolumeBar({ volume, units }: { volume: number; units: 'kg' | 'lb' }) {
  const theme = useTheme();
  const { glowOpacity, pulse } = useCompleteSetAnimation();
  const v = useSharedValue(volume);
  const prev = useRef(volume);

  useEffect(() => {
    if (volume !== prev.current) {
      v.value = withTiming(volume, {
        duration: motion.duration.counter,
        easing: Easing.out(Easing.cubic),
      });
      // Only bloom when volume grows (a set was banked), not on resets.
      if (volume > prev.current) void pulse();
      prev.current = volume;
    }
  }, [volume, v, pulse]);

  const counterProps = useAnimatedProps(
    () => ({ text: `${Math.round(v.value)}` }) as never,
  );
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        // Full accent fill — the choreography's glowPeak IS the on-screen alpha.
        // (Was accentSoft × 0.45 ≈ 5%, invisible, #25.)
        style={[styles.glow, { backgroundColor: theme.color.accent }, glowStyle]}
      />
      <Text
        style={[
          styles.label,
          { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        SESSION VOLUME
      </Text>
      <View style={styles.valueRow}>
        <AnimatedText
          animatedProps={counterProps}
          style={[
            styles.value,
            { color: theme.color.inkHero, fontFamily: theme.font.family.mono },
          ]}
        />
        <Text
          style={[styles.unit, { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono }]}
        >
          {' '}
          {units}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  label: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  value: { fontSize: 22, letterSpacing: -0.5 },
  unit: { fontSize: 13 },
});
