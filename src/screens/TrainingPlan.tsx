import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { pluralize } from '@/core/format';
import { resolveTodaySlot } from '@/core/planResolver';
import { parseExerciseOrder, useActivePlan } from '@/queries/plans';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { staggerDelay } from '@/ui/motion';
import { SettleSlam } from '@/ui/SettleSlam';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Top inset is the nav header's job on this pushed screen (WorkoutActive
// precedent) — the deprecated RN SafeAreaView this replaces added none here.
const SCREEN_EDGES: Edge[] = ['left', 'right', 'bottom'];

export default function TrainingPlanScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const planQuery = useActivePlan(userId);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const plan = planQuery.data;
  // Today's slot per the same resolver Today/plannedWorkout use (spec
  // 2026-08-10 day semantics: device-local weekday, Sunday = 0) — not
  // reimplemented here, just reused to find which row to tag (impeccable
  // polish C).
  const todayResolution = plan
    ? resolveTodaySlot(plan.plan, plan.slots, new Date().getDay())
    : null;

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.container}>
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
                const template = slot.template_id
                  ? plan.templates.get(slot.template_id)
                  : undefined;
                // Matches PlanSetup's own "None" display for this state
                // (copy review Batch C) — the control the user set, not a
                // developer-ish "No template". template is already undefined
                // when there's no template_id, so this single fallback covers
                // both the unset and deleted-template cases.
                const templateName = template?.name ?? 'Free day';
                const exerciseCount = template
                  ? parseExerciseOrder(template.exercise_order).length
                  : 0;
                // Same slot the resolver picked for today, by identity — covers
                // rest/workout/unconfigured alike (impeccable polish C).
                const isToday =
                  todayResolution != null &&
                  todayResolution.kind !== 'none' &&
                  todayResolution.slot.id === slot.id;
                return (
                  <FadeInView key={slot.id} delay={staggerDelay(i)}>
                    {/* Every day is a ruled row (HIG review 2026-10-04,
                        finding 6): the filled training-day plates used the
                        same treatment as Today's tappable Repeat card and
                        read as buttons, but nothing here is tappable. The
                        hierarchy now lives in the type: training days in
                        ink with the template name, rest days in tertiary. */}
                    <View style={[styles.slotRow, i > 0 && styles.slotRowRule]}>
                      <Text variant="strip" color={theme.color.inkTertiary} style={styles.slotDay}>
                        {label}
                      </Text>
                      {slot.is_rest_day ? (
                        <Text
                          variant="body"
                          color={theme.color.inkTertiary}
                          style={styles.slotBody}
                        >
                          Rest
                        </Text>
                      ) : (
                        <View style={styles.slotBody}>
                          <Text variant="card" color={theme.color.ink}>
                            {templateName}
                          </Text>
                          {exerciseCount > 0 ? (
                            <Text
                              variant="strip"
                              color={theme.color.inkTertiary}
                              style={styles.slotMeta}
                            >
                              {pluralize(exerciseCount, 'exercise')}
                            </Text>
                          ) : null}
                        </View>
                      )}
                      {isToday ? (
                        <Text variant="strip" color={theme.color.accent} style={styles.todayTag}>
                          Today
                        </Text>
                      ) : null}
                    </View>
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
    slotList: {},
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.space.s3,
      gap: theme.space.s3,
      minHeight: theme.touch.min,
    },
    slotRowRule: {
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    // Day labels are metadata: the strip variant carries the treatment.
    slotDay: { width: 64 },
    slotBody: { flex: 1 },
    slotMeta: { marginTop: theme.space.half },
    // Right-aligned, mirroring History's row-date idiom; never lets a long
    // day/template pairing squeeze the tag down to nothing.
    todayTag: { flexShrink: 0 },
    emptyWrap: { marginTop: theme.space.s8 },
  });
