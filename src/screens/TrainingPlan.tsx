import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { useActivePlan } from '@/queries/plans';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { staggerDelay } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
import { resolvePlateStyles } from '@/ui/plateStyles';
import { SettleSlam } from '@/ui/SettleSlam';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TrainingPlanScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const planQuery = useActivePlan(userId);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Recommended foreground for the inverted (training-day) plates.
  const invertedInk = resolvePlateStyles(theme, { tone: 'inverted' }).ink;

  const plan = planQuery.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Chrome title moved in-screen (Anton display, matching Progress/
            Profile) — the nav header now carries only the back chevron
            (impeccable batch 5). Rendered above the loading branch below so
            the screen is never titleless while the plan query is in flight
            (final review F5). */}
        <SettleSlam>
          <Text variant="displayXL" color={theme.color.inkHero}>
            Training plan
          </Text>
        </SettleSlam>

        {planQuery.isLoading ? (
          <ActivityIndicator color={theme.color.inkSecondary} style={styles.loading} />
        ) : !plan ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title="No training plan yet."
              hint="A plan schedules which template to run on which day, so Today can point you at the right workout without thinking."
              cta={{ label: 'Create plan', onPress: () => router.push('/profile/plan/setup') }}
            />
          </View>
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
              {plan.slots.map((slot, i) => {
                const label =
                  slot.label ??
                  (plan.plan.plan_type === 'weekly' && slot.day_of_week != null
                    ? (DAY_LABELS[slot.day_of_week] ?? '')
                    : `Day ${(slot.cycle_position ?? 0) + 1}`);
                const templateName = slot.template_id
                  ? (plan.templates.get(slot.template_id)?.name ?? 'No template')
                  : 'No template';
                return (
                  <FadeInView key={slot.id} delay={staggerDelay(i)}>
                    {slot.is_rest_day ? (
                      // Rest is the quiet state: ghost text, no fill, no border.
                      <View style={styles.restRow}>
                        <Text
                          variant="strip"
                          color={theme.color.inkTertiary}
                          style={styles.slotDay}
                        >
                          {label}
                        </Text>
                        <Text
                          variant="body"
                          color={theme.color.inkTertiary}
                          style={styles.slotBody}
                        >
                          Rest
                        </Text>
                      </View>
                    ) : (
                      // Training days carry the emphasis: inverted plates. The
                      // strip keeps the panel ink at 0.65 (inverted exception).
                      <Plate tone="inverted" faceStyle={styles.slotFace}>
                        <Text
                          variant="strip"
                          color={invertedInk}
                          style={[styles.slotDay, styles.slotDaySoft]}
                        >
                          {label}
                        </Text>
                        <Text variant="card" color={invertedInk} style={styles.slotBody}>
                          {templateName}
                        </Text>
                      </Plate>
                    )}
                  </FadeInView>
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
    loading: { marginTop: theme.space.s8 },
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
    restRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s2,
      gap: theme.space.s3,
      minHeight: theme.touch.min,
    },
    // Day labels are metadata: the strip variant carries the treatment.
    slotDay: { width: 64 },
    slotDaySoft: { opacity: 0.65 },
    slotBody: { flex: 1 },
    emptyWrap: { marginTop: theme.space.s8 },
  });
