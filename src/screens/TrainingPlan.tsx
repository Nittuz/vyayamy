import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { useActivePlan } from '@/queries/plans';
import { Button } from '@/ui/Button';
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TrainingPlanScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const planQuery = useActivePlan(userId);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (planQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }

  const plan = planQuery.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="display" color={theme.color.ink}>
          Training Plan
        </Text>

        {!plan ? (
          <Plate faceStyle={styles.emptyFace}>
            <Text variant="title" color={theme.color.ink} style={styles.emptyTitle}>
              No training plan yet
            </Text>
            <Text variant="body" color={theme.color.inkSecondary} style={styles.emptyBody}>
              A plan schedules which template to run on which day, so Today can point you at the
              right workout without thinking.
            </Text>
            <Button
              label="Create plan"
              kind="primary"
              size="cta"
              onPress={() => router.push('/profile/plan/setup')}
              style={styles.emptyCta}
            />
          </Plate>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text variant="title" color={theme.color.ink}>
                  {plan.plan.name}
                </Text>
                <Text variant="meta" color={theme.color.inkSecondary} style={styles.planType}>
                  {plan.plan.plan_type === 'weekly' ? 'Weekly schedule' : 'Rotating cycle'}
                </Text>
              </View>
              <Button
                label="Edit"
                kind="secondary"
                size="row"
                onPress={() => router.push('/profile/plan/setup')}
              />
            </View>

            <View style={styles.slotList}>
              {plan.slots.map((slot) => {
                const label =
                  slot.label ??
                  (plan.plan.plan_type === 'weekly' && slot.day_of_week != null
                    ? (DAY_LABELS[slot.day_of_week] ?? '')
                    : `Day ${(slot.cycle_position ?? 0) + 1}`);
                const templateName = slot.template_id
                  ? (plan.templates.get(slot.template_id)?.name ?? '—')
                  : null;
                return (
                  <Plate key={slot.id} border="soft" offset="none" faceStyle={styles.slotFace}>
                    <Text variant="label" color={theme.color.inkTertiary} style={styles.slotDay}>
                      {label}
                    </Text>
                    {slot.is_rest_day ? (
                      <Text variant="body" color={theme.color.inkSecondary} style={styles.slotRest}>
                        Rest
                      </Text>
                    ) : (
                      <Text variant="card" color={theme.color.ink} style={styles.slotTemplate}>
                        {templateName}
                      </Text>
                    )}
                  </Plate>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: theme.space.page, gap: theme.space.s4 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s3 },
    headerText: { flex: 1 },
    planType: { marginTop: theme.space.half },
    slotList: { gap: theme.space.s2 },
    slotFace: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.space.s4,
      gap: theme.space.s3,
      minHeight: theme.touch.min,
    },
    slotDay: { width: 60 },
    slotTemplate: { flex: 1 },
    slotRest: { flex: 1, fontStyle: 'italic' },
    emptyFace: {
      padding: theme.space.s8,
      alignItems: 'center',
      gap: theme.space.s3,
    },
    emptyTitle: { textAlign: 'center' },
    emptyBody: { textAlign: 'center' },
    emptyCta: { marginTop: theme.space.s3, alignSelf: 'stretch' },
  });
