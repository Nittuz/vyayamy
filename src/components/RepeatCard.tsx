import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ExerciseSeed } from '@/queries/repeatLastWorkout';
import { Button } from '@/ui/Button';
import { Plate } from '@/ui/Plate';
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
  const displaySeeds = seeds.slice(0, 4);

  const handlePress = () => {
    haptics.light();
    onPress();
  };

  return (
    <Plate style={styles.card} faceStyle={styles.face}>
      <Text variant="label" color={theme.color.inkTertiary}>
        {labelText(title, daysAgo)}
      </Text>
      <Text variant="title" color={theme.color.ink}>
        {title || 'Workout'}
      </Text>
      <View style={styles.seedList}>
        {displaySeeds.map((seed, i) => (
          <View
            key={`${seed.exerciseId}-${i}`}
            style={styles.seedRow}
            accessibilityLabel={`${seed.exerciseName}, ${formatSeed(seed)}`}
          >
            <Text variant="body" color={theme.color.ink} numberOfLines={1} style={styles.seedName}>
              {seed.exerciseName}
            </Text>
            <Text variant="numeral" color={theme.color.inkSecondary}>
              {formatSeed(seed)}
            </Text>
          </View>
        ))}
      </View>
      <Button
        label="Repeat workout"
        kind="secondary"
        size="row"
        icon="arrow-right"
        loading={loading}
        onPress={handlePress}
        accessibilityLabel={`Repeat ${title} workout`}
      />
    </Plate>
  );
}

function labelText(title: string, daysAgo: number): string {
  const ago = daysAgo === 0 ? 'TODAY' : daysAgo === 1 ? '1 DAY AGO' : `${daysAgo} DAYS AGO`;
  return `LAST WORKOUT · ${ago}`;
}

function formatSeed(seed: ExerciseSeed): string {
  if (seed.seedWeight == null || seed.seedReps == null) return '– × –';
  return `${seed.seedWeight} × ${seed.seedReps}`;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginHorizontal: theme.space.s4 },
    face: { padding: theme.space.s5, gap: theme.space.s3 },
    seedList: { gap: theme.space.half },
    seedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: theme.space.s3,
    },
    seedName: { flex: 1 },
  });
