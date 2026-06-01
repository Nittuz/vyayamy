import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExerciseSeed } from '@/queries/repeatLastWorkout';
import { useTheme } from '@/ui/useTheme';
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
  const displaySeeds = seeds.slice(0, 4);

  const handlePress = () => {
    haptics.light();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={`Repeat ${title} workout`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          opacity: pressed ? 0.85 : loading ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        {labelText(title, daysAgo)}
      </Text>
      <Text
        style={[
          styles.title,
          {
            color: theme.color.inkHero,
            fontFamily: theme.font.family.sansSemibold,
            fontSize: theme.font.size.title,
            letterSpacing: theme.font.tracking.title,
          },
        ]}
      >
        {title || 'Workout'}
      </Text>
      <View style={styles.seedList}>
        {displaySeeds.map((seed) => (
          <View
            key={seed.exerciseId}
            style={styles.seedRow}
            accessibilityLabel={`${seed.exerciseName}, ${formatSeed(seed)}`}
          >
            <Text
              style={[
                styles.seedName,
                { color: theme.color.ink, fontFamily: theme.font.family.sans },
              ]}
              numberOfLines={1}
            >
              {seed.exerciseName}
            </Text>
            <Text
              style={[
                styles.seedValue,
                {
                  color: theme.color.inkSecondary,
                  fontFamily: theme.font.family.mono,
                },
              ]}
            >
              {formatSeed(seed)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.ctaRow}>
        <Text
          style={[
            styles.cta,
            { color: theme.color.accent, fontFamily: theme.font.family.sansMedium },
          ]}
        >
          → Repeat workout
        </Text>
      </View>
    </Pressable>
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

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    marginBottom: 14,
  },
  seedList: {
    gap: 6,
  },
  seedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  seedName: {
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  seedValue: {
    fontSize: 13,
  },
  ctaRow: {
    marginTop: 16,
  },
  cta: {
    fontSize: 13,
    fontWeight: '500',
  },
});
