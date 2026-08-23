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
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { settledCounterText } from './animatedCounterSync';
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
  // Plain-React fallback for the digits, guaranteed correct once the count-up
  // finishes — see the effect below for why the worklet-only path (the
  // animated `text` prop) can't be trusted alone (live-QA #volume-tally).
  // Starts '0' to match the choreography: the headline always counts up from
  // zero on mount, never flashing the final number before the animation runs.
  const [settleText, setSettleText] = useState('0');

  // The headline is painted by the `volumeProps` worklet below — a UI-thread
  // write to a native "text" prop that bypasses React's render cycle
  // entirely (that's what lets it animate without re-rendering). Live-QA
  // found that write can silently not land — if the recap mounts while a
  // burst of complete/delete/undo writes is still settling, the worklet's
  // OWN paint can simply never happen, and nothing in the worklet-only path
  // ever repaints the headline afterward, even though `volume`/`setCount`
  // (plain React reads of the same data) are correct the entire time. Settle
  // the label through real React state once the animation genuinely
  // finishes, so the headline can never get permanently stuck on '0'.
  useEffect(() => {
    v.value = withTiming(
      volume,
      { duration: motion.duration.counter, easing: Easing.out(Easing.cubic) },
      (finished) => {
        const next = settledCounterText(finished, volume);
        if (next != null) runOnJS(setSettleText)(next);
      },
    );
  }, [volume, v]);

  const volumeProps = useAnimatedProps(() => ({ text: `${Math.round(v.value)}` }) as never);

  return (
    <View style={styles.wrap}>
      <FadeInView style={styles.headlineWrap}>
        <Text variant="strip" color={theme.color.inkTertiary}>
          Volume
        </Text>
        <View style={styles.headlineRow}>
          <AnimatedText
            animatedProps={volumeProps}
            style={styles.headlineValue}
            // VoiceOver reads animatedProps' mount value ("0") — announce the
            // real total instead (re-score fix).
            accessible
            accessibilityLabel={`${Math.round(volume)} ${units} total volume`}
          >
            {settleText}
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
