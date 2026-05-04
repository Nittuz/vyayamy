import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import type { SlotDraft } from '@/core/domain';
import { type ActivePlan, useActivePlan, useSaveActivePlan, useTemplates } from '@/queries/plans';
import { theme } from '@/ui/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PlanSetupScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const existing = useActivePlan(userId);
  const templates = useTemplates(userId);
  const save = useSaveActivePlan();

  const [name, setName] = useState('My plan');
  const [planType, setPlanType] = useState<'weekly' | 'cycle'>('weekly');
  const [slots, setSlots] = useState<SlotDraft[]>(() => buildWeeklyDraft());

  const lastHydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const p = existing.data;
    if (!p) {
      lastHydratedKeyRef.current = null;
      return;
    }
    const key = activePlanHydrationKey(p);
    if (lastHydratedKeyRef.current === key) return;
    lastHydratedKeyRef.current = key;
    setName(p.plan.name);
    setPlanType(p.plan.plan_type);
    setSlots(
      p.slots.map(
        (s, idx): SlotDraft => ({
          key: s.id,
          templateId: s.template_id,
          isRestDay: Boolean(s.is_rest_day),
          label: s.label ?? '',
          ...(p.plan.plan_type === 'weekly'
            ? { dayOfWeek: s.day_of_week ?? idx }
            : { cyclePosition: s.cycle_position ?? idx }),
        }),
      ),
    );
  }, [existing.data]);

  const templateOptions = useMemo(() => templates.data ?? [], [templates.data]);

  function setSlotAt(idx: number, patch: Partial<SlotDraft>) {
    setSlots((prev) => {
      const next = [...prev];
      const slot = next[idx];
      if (!slot) return prev;
      next[idx] = { ...slot, ...patch };
      return next;
    });
  }

  function setPlanTypeAndReset(t: 'weekly' | 'cycle') {
    setPlanType(t);
    setSlots(t === 'weekly' ? buildWeeklyDraft() : buildCycleDraft(4));
  }

  function addCycleDay() {
    setSlots((prev) => [
      ...prev,
      {
        key: `cycle-${prev.length}`,
        templateId: null,
        isRestDay: false,
        label: '',
        cyclePosition: prev.length,
      },
    ]);
  }

  async function onSave() {
    if (!userId) return;
    await save.mutateAsync({
      userId,
      planId: existing.data?.plan.id,
      name,
      planType,
      slots: slots.map((s) => ({
        templateId: s.isRestDay ? null : s.templateId,
        isRestDay: s.isRestDay,
        label: s.label || null,
        ...(planType === 'weekly'
          ? { dayOfWeek: s.dayOfWeek }
          : { cyclePosition: s.cyclePosition }),
      })),
    });
    router.back();
  }

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.label}>Plan name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="My plan"
            placeholderTextColor={theme.color.textTertiary}
            style={styles.input}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Schedule type</Text>
          <View style={styles.segment}>
            {(['weekly', 'cycle'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setPlanTypeAndReset(t)}
                style={[styles.segmentButton, planType === t && styles.segmentButtonActive]}
              >
                <Text
                  style={[styles.segmentText, planType === t && styles.segmentTextActive]}
                >
                  {t === 'weekly' ? 'Weekly' : 'Cycle'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Days</Text>
          {slots.map((slot, idx) => (
            <View key={slot.key} style={styles.slotCard}>
              <View style={styles.slotHeader}>
                <Text style={styles.slotHeaderText}>
                  {planType === 'weekly'
                    ? DAY_LABELS[slot.dayOfWeek ?? idx]
                    : `Day ${(slot.cyclePosition ?? idx) + 1}`}
                </Text>
                <Pressable
                  onPress={() => setSlotAt(idx, { isRestDay: !slot.isRestDay })}
                  style={[styles.toggle, slot.isRestDay && styles.toggleOn]}
                >
                  <Text style={[styles.toggleText, slot.isRestDay && styles.toggleTextOn]}>
                    Rest day
                  </Text>
                </Pressable>
              </View>
              {!slot.isRestDay ? (
                <View style={styles.templatePicker}>
                  <Pressable
                    onPress={() => setSlotAt(idx, { templateId: null })}
                    style={[
                      styles.templatePill,
                      slot.templateId === null && styles.templatePillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.templatePillText,
                        slot.templateId === null && styles.templatePillTextActive,
                      ]}
                    >
                      —
                    </Text>
                  </Pressable>
                  {templateOptions.map((tpl) => (
                    <Pressable
                      key={tpl.id}
                      onPress={() => setSlotAt(idx, { templateId: tpl.id })}
                      style={[
                        styles.templatePill,
                        slot.templateId === tpl.id && styles.templatePillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.templatePillText,
                          slot.templateId === tpl.id && styles.templatePillTextActive,
                        ]}
                      >
                        {tpl.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          {planType === 'cycle' ? (
            <Pressable onPress={addCycleDay} style={styles.addDay}>
              <Text style={styles.addDayText}>+ Add day</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={onSave}
          disabled={save.isPending}
          style={[styles.saveBtn, save.isPending && { opacity: 0.5 }]}
        >
          {save.isPending ? (
            <ActivityIndicator color={theme.color.onAccent} />
          ) : (
            <Text style={styles.saveBtnText}>Save plan</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Stable fingerprint for plan + slots so refetches with new object identity do not re-hydrate. */
function activePlanHydrationKey(p: NonNullable<ActivePlan>): string {
  const slotPart = p.slots
    .map(
      (s) =>
        `${s.id}:${s.template_id ?? ''}:${s.day_of_week ?? ''}:${s.cycle_position ?? ''}:${s.is_rest_day ? 1 : 0}:${s.label ?? ''}`,
    )
    .join('|');
  return `${p.plan.id}:${p.plan.name}:${p.plan.plan_type}:${slotPart}`;
}

function buildWeeklyDraft(): SlotDraft[] {
  return Array.from({ length: 7 }, (_, i): SlotDraft => ({
    key: `weekly-${i}`,
    templateId: null,
    isRestDay: true,
    label: '',
    dayOfWeek: i,
  }));
}

function buildCycleDraft(n: number): SlotDraft[] {
  return Array.from({ length: n }, (_, i): SlotDraft => ({
    key: `cycle-${i}`,
    templateId: null,
    isRestDay: false,
    label: '',
    cyclePosition: i,
  }));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space.page, gap: theme.space.s4, paddingBottom: theme.space.s12 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    gap: theme.space.s2,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  label: {
    fontSize: theme.font.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: theme.color.textTertiary,
    fontWeight: theme.font.weight.medium,
  },
  input: {
    height: 44,
    paddingHorizontal: theme.space.s3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.body,
    color: theme.color.text,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.sm,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.space.s2,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  segmentButtonActive: { backgroundColor: theme.color.surface },
  segmentText: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    fontWeight: theme.font.weight.medium,
  },
  segmentTextActive: { color: theme.color.text },
  section: { gap: theme.space.s2 },
  sectionTitle: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
    marginTop: theme.space.s2,
  },
  slotCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.space.s3,
  },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s3 },
  slotHeaderText: {
    flex: 1,
    fontSize: theme.font.body,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  toggle: {
    paddingHorizontal: theme.space.s3,
    paddingVertical: theme.space.s1,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  toggleOn: { borderColor: theme.color.accent, backgroundColor: theme.color.accent },
  toggleText: { fontSize: theme.font.meta, color: theme.color.textSecondary },
  toggleTextOn: { color: theme.color.onAccent },
  templatePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 },
  templatePill: {
    paddingHorizontal: theme.space.s3,
    paddingVertical: theme.space.s1,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.bg,
  },
  templatePillActive: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  templatePillText: { fontSize: theme.font.meta, color: theme.color.textSecondary },
  templatePillTextActive: { color: theme.color.onAccent },
  addDay: {
    padding: theme.space.s3,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.color.borderStrong,
    alignItems: 'center',
  },
  addDayText: {
    fontSize: theme.font.meta,
    color: theme.color.accentMuted,
    fontWeight: theme.font.weight.medium,
  },
  saveBtn: {
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space.s3,
  },
  saveBtnText: {
    color: theme.color.onAccent,
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
  },
});
