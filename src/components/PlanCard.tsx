/**
 * PlanCard — Today's primary slot when the active plan schedules a workout
 * (spec 2026-08-10-plan-reaches-today). Mirrors RepeatCard's Blacktop
 * treatment: inverted panel, whole card pressable, mono strip on top, quiet
 * exercise rows, plain ink CTA line.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { pluralize } from '@/core/format';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { resolvePlateStyles } from '@/ui/plateStyles';
import { Text } from '@/ui/Text';
import { useFontScale } from '@/ui/useFontScale';
import { useTheme, type Theme } from '@/ui/useTheme';
import { haptics } from '@/ui/haptics';

interface Props {
  /** Slot label or template name — becomes the workout title on start. */
  title: string;
  planName: string;
  exerciseNames: string[];
  loading?: boolean;
  onPress: () => void;
}

export function PlanCard({ title, planName, exerciseNames, loading, onPress }: Props) {
  const theme = useTheme();
  const fontScale = useFontScale();
  // Raw (uncapped) scale — the name rows' own decision of whether they fit at
  // all, distinct from useFontScale's 1.5x ceiling used for icon sizing.
  const { fontScale: rawFontScale } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const ink = useMemo(() => resolvePlateStyles(theme, { tone: 'inverted' }).ink, [theme]);
  const displayNames = exerciseNames.slice(0, 4);
  const overflow = exerciseNames.length - displayNames.length;
  // Past fontScale 2x, a title + 4 truncated rows + CTA no longer fit
  // legibly in a card — the card's job collapses to "here's the workout,
  // start it": drop the name rows and keep title + strip + CTA only.
  const degraded = rawFontScale > 2;

  const handlePress = () => {
    haptics.light();
    onPress();
  };

  return (
    <Plate
      tone="inverted"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Scheduled today: ${title}. Start this workout.`}
      accessibilityHint="Creates the workout from your training plan"
      style={styles.card}
      faceStyle={styles.face}
    >
      <Text variant="strip" color={ink} style={styles.strip}>
        {stripText(planName, exerciseNames.length)}
      </Text>
      <Text variant="title" color={ink}>
        {title}
      </Text>
      {degraded ? null : (
        <View style={styles.nameList}>
          {displayNames.map((name, i) => (
            <Text key={`${name}-${i}`} variant="body" color={ink} numberOfLines={1}>
              {name}
            </Text>
          ))}
          {overflow > 0 ? (
            <Text variant="meta" color={ink} style={styles.strip}>
              +{overflow} more
            </Text>
          ) : null}
        </View>
      )}
      <View style={styles.ctaRow}>
        {loading ? (
          <ActivityIndicator color={ink} />
        ) : (
          <>
            <Text variant="card" color={ink} numberOfLines={1} style={styles.ctaLabel}>
              Start workout
            </Text>
            <Icon name="arrow-right" size={Math.round(16 * fontScale)} color={ink} />
          </>
        )}
      </View>
    </Plate>
  );
}

function stripText(planName: string, exerciseCount: number): string {
  return `Scheduled today · ${planName} · ${pluralize(exerciseCount, 'exercise')}`;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginHorizontal: theme.space.s4 },
    face: { padding: theme.space.s5, gap: theme.space.s3 },
    strip: { opacity: 0.65 },
    nameList: { gap: theme.space.half },
    ctaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s2,
      marginTop: theme.space.s1,
      minHeight: theme.space.s6,
    },
    ctaLabel: {
      fontFamily: theme.font.family.sansSemibold,
      // The arrow icon keeps its fixed size; the label truncates first.
      flexShrink: 1,
    },
  });
