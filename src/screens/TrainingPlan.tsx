import { router } from 'expo-router';
import { safeRoute } from '@/lib/safeRoute';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { useActivePlan } from '@/queries/plans';
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
        {!plan ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No training plan yet</Text>
            <Text style={styles.emptyBody}>
              A plan schedules which template to run on which day, so Today can point you at the
              right workout without thinking.
            </Text>
            <Pressable
              onPress={() => router.push(safeRoute('/profile/plan/setup'))}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Create plan</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{plan.plan.name}</Text>
                <Text style={styles.planType}>
                  {plan.plan.plan_type === 'weekly' ? 'Weekly schedule' : 'Rotating cycle'}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push(safeRoute('/profile/plan/setup'))}
                style={styles.editBtn}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>

            <View style={styles.slotList}>
              {plan.slots.map((slot) => {
                const label =
                  slot.label ??
                  (plan.plan.plan_type === 'weekly' && slot.day_of_week != null
                    ? DAY_LABELS[slot.day_of_week] ?? ''
                    : `Day ${(slot.cycle_position ?? 0) + 1}`);
                const templateName = slot.template_id
                  ? plan.templates.get(slot.template_id)?.name ?? '—'
                  : null;
                return (
                  <View key={slot.id} style={styles.slotRow}>
                    <Text style={styles.slotDay}>{label}</Text>
                    {slot.is_rest_day ? (
                      <Text style={styles.slotRest}>Rest</Text>
                    ) : (
                      <Text style={styles.slotTemplate}>{templateName}</Text>
                    )}
                  </View>
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
  planName: {
    fontFamily: theme.font.family.sansSemibold,
    fontSize: theme.font.size.title,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
  },
  planType: {
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.meta,
    color: theme.color.inkSecondary,
    marginTop: 2,
  },
  editBtn: {
    paddingHorizontal: theme.space.s4,
    paddingVertical: theme.space.s3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    minHeight: theme.touch.min,
    justifyContent: 'center',
  },
  editBtnText: {
    fontFamily: theme.font.family.sansMedium,
    fontSize: theme.font.size.meta,
    fontWeight: theme.font.weight.medium,
    color: theme.color.ink,
  },
  slotList: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.space.s4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    gap: theme.space.s3,
  },
  slotDay: {
    width: 60,
    fontFamily: theme.font.family.sansMedium,
    fontSize: theme.font.size.meta,
    color: theme.color.inkSecondary,
    fontWeight: theme.font.weight.medium,
  },
  slotTemplate: {
    flex: 1,
    fontFamily: theme.font.family.sansMedium,
    fontSize: theme.font.size.body,
    color: theme.color.ink,
    fontWeight: theme.font.weight.medium,
  },
  slotRest: {
    flex: 1,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.body,
    color: theme.color.inkSecondary,
    fontStyle: 'italic',
  },
  emptyCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s8,
    alignItems: 'center',
    gap: theme.space.s3,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  emptyTitle: {
    fontFamily: theme.font.family.sansSemibold,
    fontSize: theme.font.size.title,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
  },
  emptyBody: {
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.meta,
    color: theme.color.inkSecondary,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: theme.space.s3,
    backgroundColor: theme.color.accent,
    paddingHorizontal: theme.space.s6,
    paddingVertical: theme.space.s3,
    borderRadius: theme.radius.sm,
  },
  primaryBtnText: {
    fontFamily: theme.font.family.sansSemibold,
    color: theme.color.onAccent,
    fontSize: theme.font.size.body,
    fontWeight: theme.font.weight.semibold,
  },
  });
