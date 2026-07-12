/**
 * RepeatCard — Today's primary slot when the last session can be repeated.
 * Blacktop: an inverted panel (THE elevation state), whole card pressable,
 * mono metadata strip on top, seeded exercises as quiet mono rows, and a
 * plain ink CTA line. Volt stays reserved for act-now CTAs elsewhere.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ExerciseSeed } from '@/queries/repeatLastWorkout';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { resolvePlateStyles } from '@/ui/plateStyles';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';
import { haptics } from '@/ui/haptics';

interface Props {
  title: string;
  daysAgo: number;
  seeds: ExerciseSeed[];
  loading?: boolean;
  onPress: () => void;
}

export function RepeatCard({ title, daysAgo, seeds, loading, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Recommended foreground for the inverted tone (blacktop-on-chalk in dark,
  // chalk-on-black in light) — never hand-picked per scheme.
  const ink = useMemo(() => resolvePlateStyles(theme, { tone: 'inverted' }).ink, [theme]);
  const displaySeeds = seeds.slice(0, 4);

  const handlePress = () => {
    haptics.light();
    onPress();
  };

  return (
    <Plate
      tone="inverted"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Repeat ${title || 'workout'} workout`}
      accessibilityHint="Start a new workout with the same exercises"
      style={styles.card}
      faceStyle={styles.face}
    >
      {/* Inverted panel: strip keeps the panel ink at 0.65 opacity. */}
      <Text variant="strip" color={ink} style={styles.strip}>
        {stripText(daysAgo, seeds.length)}
      </Text>
      <Text variant="title" color={ink}>
        {title || 'Workout'}
      </Text>
      <View style={styles.seedList}>
        {displaySeeds.map((seed, i) => (
          <View
            key={`${seed.exerciseId}-${i}`}
            style={styles.seedRow}
            accessibilityLabel={`${seed.exerciseName}, ${formatSeed(seed)}`}
          >
            <Text variant="body" color={ink} numberOfLines={1} style={styles.seedName}>
              {seed.exerciseName}
            </Text>
            <Text variant="numeral" color={ink} style={styles.seedFigures}>
              {formatSeed(seed)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.ctaRow}>
        {loading ? (
          <ActivityIndicator color={ink} />
        ) : (
          <>
            <Text variant="card" color={ink} style={styles.ctaLabel}>
              Repeat workout
            </Text>
            <Icon name="arrow-right" size={16} color={ink} />
          </>
        )}
      </View>
    </Plate>
  );
}

function stripText(daysAgo: number, exerciseCount: number): string {
  // Sentence case — the strip variant handles the uppercasing.
  const ago = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
  const ex = exerciseCount === 1 ? '1 exercise' : `${exerciseCount} exercises`;
  return `${ago} · ${ex}`;
}

function formatSeed(seed: ExerciseSeed): string {
  if (seed.seedWeight == null || seed.seedReps == null) return '- × -';
  return `${seed.seedWeight} × ${seed.seedReps}`;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginHorizontal: theme.space.s4 },
    face: { padding: theme.space.s5, gap: theme.space.s3 },
    strip: { opacity: 0.65 },
    seedList: { gap: theme.space.half },
    seedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: theme.space.s3,
    },
    seedName: { flex: 1 },
    seedFigures: { opacity: 0.65 },
    ctaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s2,
      marginTop: theme.space.s1,
      minHeight: theme.space.s6,
    },
    ctaLabel: {
      fontFamily: theme.font.family.sansSemibold,
    },
  });
