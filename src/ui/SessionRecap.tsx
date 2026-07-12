/**
 * Finish recap — a "progress earned" moment, not a celebratory takeover. The
 * workout volume is the headline (big mono, counts up over 600ms); sets and
 * duration settle in beneath with the list-mount motion. A PR is stamped onto
 * a volt Plate (achievement is the one volt semantic). Framed as a journey,
 * never a guilt-streak.
 *
 * PRs are passed in by the active flow now that live detection exists (#25):
 * the finish handler recomputes records and hands the labels here.
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FadeInView } from './FadeInView';
import { motion } from './motion';
import { Plate } from './Plate';
import { Text } from './Text';
import { useTheme, type Theme } from './useTheme';

const AnimatedText = Animated.createAnimatedComponent(RNText);

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export function SessionRecap({
  volume,
  setCount,
  durationMs,
  units,
  prs = [],
}: {
  volume: number;
  setCount: number;
  durationMs: number;
  units: 'kg' | 'lb';
  prs?: string[];
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withTiming(volume, {
      duration: motion.duration.counter,
      easing: Easing.out(Easing.cubic),
    });
  }, [volume, v]);

  const volumeProps = useAnimatedProps(() => ({ text: `${Math.round(v.value)}` }) as never);
  // Static first-paint content so the headline never flashes blank before
  // Reanimated applies the animated text; the count-up runs from 0.
  const mountText = useRef('0').current;

  return (
    <View style={styles.wrap}>
      <FadeInView style={styles.headlineWrap}>
        <Text variant="strip" color={theme.color.inkTertiary}>
          Volume
        </Text>
        <View style={styles.headlineRow}>
          <AnimatedText animatedProps={volumeProps} style={styles.headlineValue}>
            {mountText}
          </AnimatedText>
          <RNText style={styles.headlineUnit}> {units}</RNText>
        </View>
      </FadeInView>

      <View style={styles.statRow}>
        <FadeInView delay={80} style={styles.stat}>
          <Text variant="numeralLg" color={theme.color.inkHero}>
            {setCount}
          </Text>
          <Text variant="strip" color={theme.color.inkTertiary}>
            Sets
          </Text>
        </FadeInView>
        <FadeInView delay={140} style={styles.stat}>
          <Text variant="numeralLg" color={theme.color.inkHero}>
            {formatDuration(durationMs)}
          </Text>
          <Text variant="strip" color={theme.color.inkTertiary}>
            Duration
          </Text>
        </FadeInView>
      </View>

      {prs.length > 0 ? (
        <FadeInView delay={200} style={styles.prWrap}>
          <Plate tone="volt" faceStyle={styles.prFace}>
            <Text variant="label" color={theme.color.onAccent}>
              {prs.length === 1 ? 'New personal record' : `${prs.length} new personal records`}
            </Text>
            {prs.map((p) => (
              <Text key={p} variant="card" color={theme.color.onAccent} style={styles.prItem}>
                {p}
              </Text>
            ))}
          </Plate>
        </FadeInView>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: theme.space.s5, width: '100%' },
    headlineWrap: { alignItems: 'center', gap: theme.space.s1 },
    headlineRow: { flexDirection: 'row', alignItems: 'baseline' },
    headlineValue: {
      color: theme.color.inkHero,
      fontFamily: theme.font.family.monoMedium,
      fontSize: 52,
      letterSpacing: -2,
    },
    headlineUnit: {
      color: theme.color.inkSecondary,
      fontFamily: theme.font.family.mono,
      fontSize: theme.font.size.card,
    },
    statRow: { flexDirection: 'row', gap: theme.space.s10 },
    stat: { alignItems: 'center', gap: theme.space.half },
    prWrap: { alignSelf: 'stretch', marginHorizontal: theme.space.s2 },
    prFace: { alignItems: 'center', gap: theme.space.s1, paddingVertical: theme.space.s4 },
    prItem: { textAlign: 'center' },
  });
