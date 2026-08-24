import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatStartLabel, pluralize } from '@/core/format';
import type { Workout } from '@/db/types';
import { Button } from '@/ui/Button';
import { Plate } from '@/ui/Plate';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { haptics } from '@/ui/haptics';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  workouts: Workout[];
  details: Map<string, { setCount: number; exerciseCount: number }>;
  onResume: (workoutId: string) => void;
  onDiscard: (workoutId: string) => void;
  /** Dismiss without resolving (#111) — the sheet is no longer a trap. */
  onClose: () => void;
}

export function CollisionSheet({
  visible,
  workouts,
  details,
  onResume,
  onDiscard,
  onClose,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      variant="center"
      title="Resume which workout?"
      footer={<Button label="Not now" kind="ghost" size="row" onPress={onClose} />}
    >
      <Text variant="body" color={theme.color.inkSecondary} style={styles.body}>
        You have {workouts.length} unfinished workouts. Pick one to resume; the rest will be marked
        as finished and kept in history.
      </Text>
      <ScrollView style={styles.list}>
        {workouts.map((w) => {
          const d = details.get(w.id);
          return (
            <Plate key={w.id} tone="panel" style={styles.row} faceStyle={styles.rowFace}>
              <Text variant="card" color={theme.color.ink} style={styles.rowTitle}>
                {w.title || 'Workout'}
              </Text>
              <Text variant="strip" color={theme.color.inkTertiary} style={styles.rowMeta}>
                {metaStrip(w, d)}
              </Text>
              <View style={styles.rowActions}>
                <Button
                  label="Resume"
                  kind="primary"
                  size="row"
                  icon="arrow-right"
                  onPress={() => {
                    haptics.light();
                    onResume(w.id);
                  }}
                  style={styles.resumeBtn}
                />
                <Button
                  label="Discard"
                  kind="danger"
                  size="row"
                  onPress={() => {
                    haptics.medium();
                    onDiscard(w.id);
                  }}
                />
              </View>
            </Plate>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

function metaStrip(w: Workout, d: { setCount: number; exerciseCount: number } | undefined): string {
  const exercises = d?.exerciseCount ?? 0;
  const sets = d?.setCount ?? 0;
  return `${formatStartLabel(w.started_at)} · ${pluralize(exercises, 'exercise')} · ${pluralize(sets, 'set')}`;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      marginBottom: theme.space.s4,
    },
    list: {
      maxHeight: 400,
      flexGrow: 0,
    },
    row: {
      marginBottom: theme.space.s3,
    },
    rowFace: {
      paddingVertical: theme.space.s3,
      paddingHorizontal: theme.space.s4,
    },
    rowTitle: {
      marginBottom: theme.space.s1,
    },
    rowMeta: {
      marginBottom: theme.space.s3,
    },
    rowActions: {
      flexDirection: 'row',
      gap: theme.space.s2,
      alignItems: 'center',
    },
    resumeBtn: {
      flexShrink: 1,
    },
  });
