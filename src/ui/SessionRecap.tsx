/**
 * Finish recap — a calm "progress earned" moment, not a celebratory takeover.
 * The session volume is the headline (mono, counts up over 600ms); set count and
 * duration settle in beneath it with the list-mount motion. Framed as a journey,
 * never a guilt-streak.
 *
 * PRs are accepted as an optional prop; live PR detection in the active flow is a
 * documented follow-up (it would require query plumbing that's out of scope), so
 * callers currently omit it and the PR line simply doesn't render.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import { FadeInView } from './FadeInView';
import { motion } from './motion';
import { useTheme } from './useTheme';

const AnimatedText = Animated.createAnimatedComponent(Text);

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
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withTiming(volume, {
      duration: motion.duration.counter,
      easing: Easing.out(Easing.cubic),
    });
  }, [volume, v]);

  const volumeProps = useAnimatedProps(() => ({ text: `${Math.round(v.value)}` }) as never);

  const mono = theme.font.family.mono;
  const labelFont = theme.font.family.sansMedium;

  return (
    <View style={styles.wrap}>
      <FadeInView style={styles.headlineWrap}>
        <Text style={[styles.headlineLabel, { color: theme.color.accent, fontFamily: labelFont }]}>
          SESSION VOLUME
        </Text>
        <View style={styles.headlineRow}>
          <AnimatedText
            animatedProps={volumeProps}
            style={[styles.headlineValue, { color: theme.color.inkHero, fontFamily: mono }]}
          />
          <Text style={[styles.headlineUnit, { color: theme.color.inkSecondary, fontFamily: mono }]}>
            {' '}
            {units}
          </Text>
        </View>
      </FadeInView>

      <View style={styles.statRow}>
        <FadeInView delay={80} style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.color.inkHero, fontFamily: mono }]}>
            {setCount}
          </Text>
          <Text style={[styles.statLabel, { color: theme.color.inkTertiary, fontFamily: labelFont }]}>
            SETS
          </Text>
        </FadeInView>
        <FadeInView delay={140} style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.color.inkHero, fontFamily: mono }]}>
            {formatDuration(durationMs)}
          </Text>
          <Text style={[styles.statLabel, { color: theme.color.inkTertiary, fontFamily: labelFont }]}>
            DURATION
          </Text>
        </FadeInView>
      </View>

      {prs.length > 0 ? (
        <FadeInView delay={200} style={[styles.prCard, { backgroundColor: theme.color.accentSoft }]}>
          <Text style={[styles.prLabel, { color: theme.color.accent, fontFamily: labelFont }]}>
            {prs.length === 1 ? 'NEW PERSONAL RECORD' : `${prs.length} NEW PERSONAL RECORDS`}
          </Text>
          {prs.map((p) => (
            <Text key={p} style={[styles.prItem, { color: theme.color.inkHero, fontFamily: labelFont }]}>
              {p}
            </Text>
          ))}
        </FadeInView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 20, width: '100%' },
  headlineWrap: { alignItems: 'center' },
  headlineLabel: { fontSize: 10, letterSpacing: 1.6, marginBottom: 4 },
  headlineRow: { flexDirection: 'row', alignItems: 'baseline' },
  headlineValue: { fontSize: 52, letterSpacing: -2 },
  headlineUnit: { fontSize: 16 },
  statRow: { flexDirection: 'row', gap: 40 },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, letterSpacing: 1.4 },
  prCard: {
    alignSelf: 'stretch',
    marginHorizontal: 8,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    gap: 4,
  },
  prLabel: { fontSize: 10, letterSpacing: 1.4 },
  prItem: { fontSize: 14 },
});
