import { router } from 'expo-router';
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
import { theme } from '@/ui/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TrainingPlanScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const planQuery = useActivePlan(userId);

  if (planQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.color.textSecondary} />
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
              onPress={() => router.push('/profile/plan/setup' as never)}
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
                onPress={() => router.push('/profile/plan/setup' as never)}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.space.page, gap: theme.space.s4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s3 },
  planName: {
    fontSize: theme.font.title,
    fontWeight: theme.font.weight.bold,
    color: theme.color.text,
  },
  planType: { fontSize: theme.font.meta, color: theme.color.textSecondary, marginTop: 2 },
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
    fontSize: theme.font.meta,
    fontWeight: theme.font.weight.medium,
    color: theme.color.text,
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
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    fontWeight: theme.font.weight.medium,
  },
  slotTemplate: {
    flex: 1,
    fontSize: theme.font.body,
    color: theme.color.text,
    fontWeight: theme.font.weight.medium,
  },
  slotRest: {
    flex: 1,
    fontSize: theme.font.body,
    color: theme.color.textTertiary,
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
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  emptyBody: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
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
    color: theme.color.onAccent,
    fontSize: theme.font.body,
    fontWeight: theme.font.weight.semibold,
  },
});
