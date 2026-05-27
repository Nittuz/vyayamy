import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Workout } from '@/db/types';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  workouts: Workout[];
  details: Map<string, { setCount: number; exerciseCount: number }>;
  onResume: (workoutId: string) => void;
  onDiscard: (workoutId: string) => void;
}

export function CollisionSheet({ visible, workouts, details, onResume, onDiscard }: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.backdrop, { backgroundColor: theme.color.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.color.bg }]}>
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
            Resume which workout?
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            We found {workouts.length} unfinished workouts. Pick one to resume;
            the others will be discarded.
          </Text>
          <ScrollView style={styles.list}>
            {workouts.map((w) => {
              const d = details.get(w.id);
              const startLabel = formatStartLabel(w.started_at);
              return (
                <View
                  key={w.id}
                  style={[styles.row, { borderColor: theme.color.border }]}
                >
                  <Text
                    style={[
                      styles.rowTitle,
                      {
                        color: theme.color.ink,
                        fontFamily: theme.font.family.sansSemibold,
                      },
                    ]}
                  >
                    {w.title || 'Workout'}
                  </Text>
                  <Text
                    style={[
                      styles.rowMeta,
                      { color: theme.color.inkTertiary, fontFamily: theme.font.family.mono },
                    ]}
                  >
                    {startLabel} · {d?.exerciseCount ?? 0} exercises · {d?.setCount ?? 0} sets
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => {
                        haptics.light();
                        onResume(w.id);
                      }}
                      style={({ pressed }) => [
                        styles.resumeBtn,
                        {
                          backgroundColor: theme.color.accent,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.resumeText,
                          {
                            color: theme.color.onAccent,
                            fontFamily: theme.font.family.sansSemibold,
                          },
                        ]}
                      >
                        → Resume
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        haptics.medium();
                        onDiscard(w.id);
                      }}
                      style={({ pressed }) => [
                        styles.discardBtn,
                        { opacity: pressed ? 0.5 : 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.discardText,
                          {
                            color: theme.color.danger,
                            fontFamily: theme.font.family.sansMedium,
                          },
                        ]}
                      >
                        Discard
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function formatStartLabel(iso: string): string {
  const d = new Date(iso);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const day = days[d.getDay()];
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${h}:${m}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxHeight: '80%',
  },
  title: {
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  list: {
    maxHeight: 400,
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  resumeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  resumeText: {
    fontSize: 13,
  },
  discardBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  discardText: {
    fontSize: 12,
  },
});
