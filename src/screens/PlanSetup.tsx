import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { buildDayChoiceOptions, dayChoicePatch, dayChoiceValue } from '@/core/dayChoice';
import type { SlotDraft } from '@/core/domain';
import {
  type ActivePlan,
  useActivePlan,
  useApplyPresetAndSavePlan,
  useSaveActivePlan,
  useTemplates,
} from '@/queries/plans';
import { type HydratedPreset, useListPlanPresets } from '@/queries/planPresets';
import { Button } from '@/ui/Button';
import { Plate } from '@/ui/Plate';
import { Segment } from '@/ui/Segment';
import { SettleSlam } from '@/ui/SettleSlam';
import { Text } from '@/ui/Text';
import { useToast } from '@/ui/ToastContext';
import { useTheme, type Theme } from '@/ui/useTheme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Top inset is the nav header's job on this pushed screen (WorkoutActive
// precedent) — the deprecated RN SafeAreaView this replaces added none here.
const SCREEN_EDGES: Edge[] = ['left', 'right', 'bottom'];

export default function PlanSetupScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const existing = useActivePlan(userId);
  const templates = useTemplates(userId);
  const presets = useListPlanPresets();
  const save = useSaveActivePlan(toastError);
  const apply = useApplyPresetAndSavePlan(toastError);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [name, setName] = useState('My plan');
  const [planType, setPlanType] = useState<'weekly' | 'cycle'>('weekly');
  const [slots, setSlots] = useState<SlotDraft[]>(() => buildWeeklyDraft());
  const [stagedPreset, setStagedPreset] = useState<HydratedPreset | null>(null);

  const lastHydratedKeyRef = useRef<string | null>(null);
  // While the user is staging a preset, background invalidations of `existing`
  // must not reset the in-progress edits. Without this guard, a sync-driven
  // refetch of plans clobbers the user's staged-preset state.
  const stagedPresetRef = useRef<HydratedPreset | null>(null);
  stagedPresetRef.current = stagedPreset;

  useEffect(() => {
    const p = existing.data;
    if (!p) {
      lastHydratedKeyRef.current = null;
      return;
    }
    if (stagedPresetRef.current) return;
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

  const templateOptions = useMemo(() => {
    if (stagedPreset) {
      return stagedPreset.templates.map((t) => ({ id: t.template.id, name: t.template.name }));
    }
    return (templates.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  }, [stagedPreset, templates.data]);

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
    setStagedPreset(null);
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

  function stagePreset(preset: HydratedPreset) {
    setStagedPreset(preset);
    setName(preset.preset.name);
    setPlanType(preset.preset.plan_type);
    if (preset.preset.plan_type === 'weekly') {
      const byDay = new Map<number, (typeof preset.slots)[number]>();
      for (const s of preset.slots) if (s.day_of_week != null) byDay.set(s.day_of_week, s);
      setSlots(
        Array.from({ length: 7 }, (_, day): SlotDraft => {
          const s = byDay.get(day);
          return {
            key: `weekly-${day}`,
            templateId: s?.preset_template_id ?? null,
            isRestDay: s ? Boolean(s.is_rest_day) : true,
            label: s?.label ?? '',
            dayOfWeek: day,
          };
        }),
      );
    } else {
      const ordered = [...preset.slots]
        .filter((s) => s.cycle_position != null)
        .sort((a, b) => (a.cycle_position ?? 0) - (b.cycle_position ?? 0));
      setSlots(
        ordered.map(
          (s, idx): SlotDraft => ({
            key: `cycle-${idx}`,
            templateId: s.preset_template_id,
            isRestDay: Boolean(s.is_rest_day),
            label: s.label ?? '',
            cyclePosition: s.cycle_position ?? idx,
          }),
        ),
      );
    }
  }

  function clearPreset() {
    setStagedPreset(null);
    setName('My plan');
    setPlanType('weekly');
    setSlots(buildWeeklyDraft());
  }

  async function onSave() {
    if (!userId) return;
    try {
      if (stagedPreset) {
        await apply.mutateAsync({
          userId,
          preset: stagedPreset,
          name,
          slots: slots.map((s) => ({
            presetTemplateId: s.isRestDay ? null : s.templateId,
            isRestDay: s.isRestDay,
            label: s.label || null,
            ...(planType === 'weekly'
              ? { dayOfWeek: s.dayOfWeek }
              : { cyclePosition: s.cyclePosition }),
          })),
        });
      } else {
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
      }
    } catch {
      // The mutation's onError already surfaced a toast; stay on the form.
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/profile/plan');
  }

  if (!userId) return null;

  const showPresetPicker = !existing.data && !stagedPreset;
  const isSaving = save.isPending || apply.isPending;

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.container}>
      {/* Keyboard avoidance mirrors Login — the plan-name field must not hide
          behind the keyboard (impeccable batch 4). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Chrome title moved in-screen (Anton display, matching Progress/
              Profile) — the nav header now carries only the back chevron
              (impeccable batch 5). */}
          <SettleSlam>
            <Text variant="displayXL" color={theme.color.inkHero}>
              Plan setup
            </Text>
          </SettleSlam>

          {showPresetPicker ? (
            <PresetPicker
              isLoading={presets.isLoading}
              presets={presets.data ?? []}
              onPick={stagePreset}
            />
          ) : null}

          {stagedPreset ? (
            <Plate border="strong" faceStyle={styles.stagedFace}>
              <View style={styles.stagedText}>
                <Text variant="meta" color={theme.color.inkTertiary}>
                  Starting from preset
                </Text>
                <Text variant="card" color={theme.color.ink} style={styles.stagedName}>
                  {stagedPreset.preset.name}
                </Text>
              </View>
              <Button label="Clear" kind="secondary" size="row" onPress={clearPreset} />
            </Plate>
          ) : null}

          <Plate faceStyle={styles.cardFace}>
            <Text variant="meta" color={theme.color.inkTertiary}>
              Plan name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="My plan"
              placeholderTextColor={theme.color.inkTertiary}
              accessibilityLabel="Plan name"
              style={styles.input}
            />
          </Plate>

          <Plate faceStyle={styles.cardFace}>
            <Text variant="meta" color={theme.color.inkTertiary}>
              Schedule type
            </Text>
            <Segment
              options={[
                { value: 'weekly', label: 'Weekly', accessibilityLabel: 'Weekly schedule' },
                { value: 'cycle', label: 'Cycle', accessibilityLabel: 'Rotating cycle' },
              ]}
              value={planType}
              onChange={setPlanTypeAndReset}
            />
          </Plate>

          <View style={styles.section}>
            <Text variant="label" color={theme.color.inkTertiary} style={styles.sectionTitle}>
              Days
            </Text>
            {slots.map((slot, idx) => {
              const dayLabel =
                planType === 'weekly'
                  ? (DAY_LABELS[slot.dayOfWeek ?? idx] ?? '')
                  : `Day ${(slot.cyclePosition ?? idx) + 1}`;
              return (
                // One choice, one control: Rest / None / a template used to be
                // a top-right toggle chip plus a separate pill row underneath
                // (impeccable polish A). A uniform quiet ground here — instead
                // of the overview's alternating rest/training chalk-slab fill —
                // means the Segment's own inversion (its selected/unselected
                // contrast) never fights a same-toned row underneath it; the
                // overview keeps its chalk hierarchy since it has no control to
                // clash with.
                <Plate key={slot.key} tone="ghost" border="soft" faceStyle={styles.slotFace}>
                  <Text variant="card" color={theme.color.ink}>
                    {dayLabel}
                  </Text>
                  <Segment
                    options={buildDayChoiceOptions(dayLabel, templateOptions)}
                    value={dayChoiceValue(slot)}
                    onChange={(value) => setSlotAt(idx, dayChoicePatch(value))}
                  />
                </Plate>
              );
            })}

            {planType === 'cycle' ? (
              <Button
                label="Add day"
                kind="ghost"
                size="row"
                icon="plus"
                onPress={addCycleDay}
                style={styles.addDay}
              />
            ) : null}
          </View>

          <Button
            label="Save plan"
            kind="primary"
            size="cta"
            loading={isSaving}
            disabled={isSaving}
            onPress={() => void onSave()}
            style={styles.saveBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PresetPicker({
  isLoading,
  presets,
  onPick,
}: {
  isLoading: boolean;
  presets: HydratedPreset[];
  onPick: (p: HydratedPreset) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const generic = presets.filter((p) => p.preset.tier === 'generic');
  const programs = presets.filter((p) => p.preset.tier === 'program');

  if (isLoading) {
    return (
      <Plate faceStyle={styles.presetLoading}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </Plate>
    );
  }
  if (presets.length === 0) return null;

  return (
    <View style={styles.presetSection}>
      <Text variant="card" color={theme.color.ink}>
        Start from a preset
      </Text>
      <Text variant="meta" color={theme.color.inkSecondary}>
        Pick a template plan to start from, or scroll down to build your own.
      </Text>

      {generic.length > 0 ? <PresetGroup title="Splits" items={generic} onPick={onPick} /> : null}
      {programs.length > 0 ? (
        <PresetGroup title="Programs" items={programs} onPick={onPick} />
      ) : null}
    </View>
  );
}

function PresetGroup({
  title,
  items,
  onPick,
}: {
  title: string;
  items: HydratedPreset[];
  onPick: (p: HydratedPreset) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.presetGroup}>
      <Text variant="meta" color={theme.color.inkTertiary}>
        {title}
      </Text>
      {items.map((p) => (
        <Plate key={p.preset.id} onPress={() => onPick(p)} faceStyle={styles.presetFace}>
          <Text variant="card" color={theme.color.ink}>
            {p.preset.name}
          </Text>
          {p.preset.blurb ? (
            <Text variant="meta" color={theme.color.inkSecondary}>
              {p.preset.blurb}
            </Text>
          ) : null}
          <Text
            variant="strip"
            color={theme.color.inkTertiary}
            numberOfLines={2}
            style={styles.presetPreview}
          >
            {summarizeSlots(p)}
          </Text>
        </Plate>
      ))}
    </View>
  );
}

function summarizeSlots(p: HydratedPreset): string {
  const tplName = new Map(p.templates.map((t) => [t.template.id, t.template.name]));
  if (p.preset.plan_type === 'weekly') {
    const byDay = new Map<number, string>();
    for (const s of p.slots) {
      if (s.day_of_week == null) continue;
      byDay.set(
        s.day_of_week,
        s.is_rest_day
          ? 'Rest'
          : (s.preset_template_id && tplName.get(s.preset_template_id)) || 'None',
      );
    }
    return DAY_LABELS.map((d, i) => `${d}: ${byDay.get(i) ?? 'Rest'}`).join(' · ');
  }
  return p.slots
    .filter((s) => s.cycle_position != null)
    .sort((a, b) => (a.cycle_position ?? 0) - (b.cycle_position ?? 0))
    .map(
      (s, i) =>
        `D${i + 1}: ${
          s.is_rest_day
            ? 'Rest'
            : (s.preset_template_id && tplName.get(s.preset_template_id)) || 'None'
        }`,
    )
    .join(' · ');
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
  return Array.from(
    { length: 7 },
    (_, i): SlotDraft => ({
      key: `weekly-${i}`,
      templateId: null,
      isRestDay: true,
      label: '',
      dayOfWeek: i,
    }),
  );
}

function buildCycleDraft(n: number): SlotDraft[] {
  return Array.from(
    { length: n },
    (_, i): SlotDraft => ({
      key: `cycle-${i}`,
      templateId: null,
      isRestDay: false,
      label: '',
      cyclePosition: i,
    }),
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    kav: { flex: 1 },
    scroll: { padding: theme.space.page, gap: theme.space.s4, paddingBottom: theme.space.s12 },
    cardFace: { padding: theme.space.s4, gap: theme.space.s2 },
    input: {
      height: theme.touch.min,
      paddingHorizontal: theme.space.s3,
      borderWidth: theme.depth.hairline,
      borderColor: theme.color.border,
      backgroundColor: theme.color.bg,
      fontSize: theme.font.size.body,
      color: theme.color.ink,
      fontFamily: theme.font.family.sans,
    },
    section: { gap: theme.space.s2 },
    sectionTitle: { marginTop: theme.space.s2 },
    presetSection: { gap: theme.space.s2 },
    presetLoading: { alignItems: 'center', paddingVertical: theme.space.s6 },
    presetGroup: { gap: theme.space.s2, marginTop: theme.space.s2 },
    presetFace: { padding: theme.space.s4, gap: theme.space.s1 },
    // Slot summaries are metadata: the strip variant carries the treatment.
    presetPreview: { marginTop: theme.space.s1 },
    stagedFace: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.space.s4,
      gap: theme.space.s3,
    },
    stagedText: { flex: 1 },
    stagedName: { marginTop: theme.space.half },
    slotFace: { padding: theme.space.s4, gap: theme.space.s3 },
    addDay: { alignSelf: 'flex-start' },
    saveBtn: { marginTop: theme.space.s3 },
  });
