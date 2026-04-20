import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useToast } from '../lib/useToast';
import {
  useActivePlan,
  useWeekCompletions,
  useDeletePlan,
  useAdvanceCycle,
  getTodaySlot,
  getUpcomingSlots,
  isSlotCompletedOnDate,
  getMissedWeeklySlots,
  dayOfWeekName,
} from '../lib/queries/plans';
import type { PlanWithSlots, MissedSlotInfo } from '../lib/queries/plans';
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '../lib/queries/templates';
import {
  useExercisesByIds,
  useGlobalExercises,
  useRecentExerciseIds,
} from '../lib/queries/exercises';
import { useCreateWorkout } from '../lib/queries/workouts';
import { Sheet } from '../components/Sheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, CalendarIllustration, DumbbellIllustration } from '../components/EmptyState';
import { PlayIcon, CheckIcon, ChevronRightIcon } from '../components/Icons';
import { STARTER_PRESETS, resolveExerciseIds } from '../lib/starterTemplates';
import { track } from '../lib/analytics';
import type { Exercise, Workout, TrainingPlanSlot, Template } from '../types/database';
import './TrainingPlan.css';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function TrainingPlan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: plan, isLoading: planLoading } = useActivePlan(user?.id);
  const { data: weekWorkouts } = useWeekCompletions(user?.id);
  const { data: templates } = useTemplates(user?.id);
  const createWorkout = useCreateWorkout(user?.id);
  const deletePlan = useDeletePlan(user?.id);
  const advanceCycle = useAdvanceCycle(user?.id);
  const createTemplate = useCreateTemplate(user?.id);
  const updateTemplate = useUpdateTemplate(user?.id);
  const deleteTemplate = useDeleteTemplate(user?.id);

  const [deletePlanConfirm, setDeletePlanConfirm] = useState(false);
  const [exercisePickerForId, setExercisePickerForId] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  const editingTemplate = templates?.find((t) => t.id === exercisePickerForId);
  const templateExerciseIds = editingTemplate?.exercise_order ?? [];
  const templateExercises = useExercisesByIds(templateExerciseIds);
  const recentIds = useRecentExerciseIds(user?.id, 10);
  const recentExercises = useExercisesByIds(recentIds.data ?? []);
  const globalExercises = useGlobalExercises(20);

  const availableExercises: Exercise[] = [];
  const seen = new Set(templateExerciseIds);
  for (const e of [...(recentExercises.data ?? []), ...(globalExercises.data ?? [])]) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      availableExercises.push(e);
    }
  }

  const todaySlot = plan ? getTodaySlot(plan) : null;
  const upcomingSlots = plan ? getUpcomingSlots(plan, 3) : [];
  const todayCompleted = todaySlot && weekWorkouts
    ? isSlotCompletedOnDate(todaySlot, weekWorkouts, new Date())
    : false;
  const missedSlots = plan && weekWorkouts ? getMissedWeeklySlots(plan, weekWorkouts) : [];

  const templateMap = new Map<string, Template>();
  templates?.forEach((t) => templateMap.set(t.id, t));

  function getSlotTemplateName(slot: TrainingPlanSlot): string {
    if (slot.is_rest_day) return slot.label ?? 'Rest';
    if (slot.label) return slot.label;
    if (slot.template_id) return templateMap.get(slot.template_id)?.name ?? 'Workout';
    return 'Workout';
  }

  function getSlotExerciseCount(slot: TrainingPlanSlot): number {
    if (!slot.template_id) return 0;
    return templateMap.get(slot.template_id)?.exercise_order.length ?? 0;
  }

  async function handleStartSlotWorkout(slot: TrainingPlanSlot) {
    if (!slot.template_id) return;
    const template = templateMap.get(slot.template_id);
    if (!template) return;
    await createWorkout.mutateAsync({
      title: template.name,
      templateId: template.id,
      exerciseIds: template.exercise_order,
    });
    navigate('/workout/active');
  }

  async function handleStartTodayWorkout() {
    if (!todaySlot) return;
    await handleStartSlotWorkout(todaySlot);
  }

  async function handleSkipRestDay() {
    if (!plan || plan.plan_type !== 'cycle') return;
    await advanceCycle.mutateAsync({ planId: plan.id, totalSlots: plan.slots.length });
    toast('Rest day skipped', 'success');
  }

  function handleDeletePlan() {
    if (!plan) return;
    deletePlan.mutate(plan.id, {
      onSuccess: () => toast('Plan deleted', 'success'),
      onError: () => toast('Failed to delete plan', 'error'),
    });
    setDeletePlanConfirm(false);
  }

  async function handleCreateTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;
    await createTemplate.mutateAsync({ name, exercise_order: [] });
    track({ name: 'template_created' });
    setNewTemplateName('');
    setShowNewTemplate(false);
  }

  async function handleUsePreset(presetId: string) {
    const preset = STARTER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const globals = globalExercises.data ?? [];
    try {
      for (const tpl of preset.templates) {
        const ids = resolveExerciseIds(tpl.exerciseNames, globals);
        await createTemplate.mutateAsync({ name: tpl.name, exercise_order: ids });
      }
      track({ name: 'starter_template_used', properties: { preset_id: presetId } });
      toast(`${preset.label} templates created`, 'success');
    } catch {
      toast('Failed to create templates. Please try again.', 'error');
    }
  }

  async function handleSaveTemplateEdit() {
    if (!editingId || !editingName.trim()) return;
    await updateTemplate.mutateAsync({ id: editingId, name: editingName.trim() });
    setEditingId(null);
    setEditingName('');
  }

  function handleDeleteTemplate() {
    if (!deleteTemplateId) return;
    deleteTemplate.mutate(deleteTemplateId, {
      onSuccess: () => toast('Template deleted', 'success'),
      onError: () => toast('Failed to delete', 'error'),
    });
    setDeleteTemplateId(null);
  }

  function handleAddExercise(exerciseId: string) {
    if (!exercisePickerForId || !editingTemplate) return;
    updateTemplate.mutate({
      id: exercisePickerForId,
      exercise_order: [...templateExerciseIds, exerciseId],
    });
  }

  function handleRemoveExercise(exerciseId: string) {
    if (!exercisePickerForId || !editingTemplate) return;
    updateTemplate.mutate({
      id: exercisePickerForId,
      exercise_order: templateExerciseIds.filter((id) => id !== exerciseId),
    });
  }

  if (planLoading) {
    return (
      <div className="tp">
        <div className="tp-loading" aria-hidden="true">
          <div className="tp-loading-shimmer" />
          <div className="tp-loading-shimmer tp-loading-shimmer--short" />
        </div>
      </div>
    );
  }

  return (
    <div className="tp">
      <header className="tp-header">
        <h1 className="page-title">Training Plan</h1>
        {plan && (
          <span className="tp-plan-name meta">{plan.name}</span>
        )}
      </header>

      {/* No plan state */}
      {!plan && (
        <EmptyState
          icon={<CalendarIllustration />}
          message="Create a training plan to schedule your workouts."
          secondaryMessage="Plans help you stay consistent. You can also train without one."
          actionLabel="Create plan"
          actionTo="/plan/setup"
        />
      )}

      {/* Today hero card */}
      {plan && (
        <section className="tp-today card">
          <div className="tp-today-header">
            <span className="tp-today-label">
              {plan.plan_type === 'weekly'
                ? dayOfWeekName((new Date().getDay() + 6) % 7)
                : `Day ${plan.cycle_cursor + 1}`}
            </span>
            {todayCompleted && (
              <span className="tp-today-badge tp-today-badge--done">
                <CheckIcon size={12} /> Done
              </span>
            )}
          </div>

          {todaySlot == null && (
            <div className="tp-today-body">
              <p className="tp-today-title">No workout scheduled</p>
              <p className="meta">This slot has no assignment.</p>
            </div>
          )}

          {todaySlot != null && todaySlot.is_rest_day && (
            <div className="tp-today-body">
              <p className="tp-today-title">Rest Day</p>
              <p className="meta">{todaySlot.label ?? 'Recovery and restoration'}</p>
              {plan.plan_type === 'cycle' && (
                <button
                  type="button"
                  className="btn-ghost tp-today-skip"
                  onClick={handleSkipRestDay}
                  disabled={advanceCycle.isPending}
                >
                  Skip to next
                </button>
              )}
            </div>
          )}

          {todaySlot != null && !todaySlot.is_rest_day && !todayCompleted && (
            <div className="tp-today-body">
              <p className="tp-today-title">{getSlotTemplateName(todaySlot)}</p>
              {getSlotExerciseCount(todaySlot) > 0 && (
                <p className="meta">
                  {getSlotExerciseCount(todaySlot)} exercise{getSlotExerciseCount(todaySlot) !== 1 ? 's' : ''}
                </p>
              )}
              <button
                type="button"
                className="btn-primary tp-today-cta"
                onClick={handleStartTodayWorkout}
                disabled={createWorkout.isPending}
              >
                <PlayIcon size={16} />
                <span>Start workout</span>
              </button>
            </div>
          )}

          {todaySlot != null && !todaySlot.is_rest_day && todayCompleted && (
            <div className="tp-today-body">
              <p className="tp-today-title">{getSlotTemplateName(todaySlot)}</p>
              <p className="meta tp-today-complete-msg">Great work today.</p>
            </div>
          )}
        </section>
      )}

      {/* Schedule visualization */}
      {plan && plan.plan_type === 'weekly' && (
        <WeeklyScheduleView
          plan={plan}
          weekWorkouts={weekWorkouts ?? []}
          templateMap={templateMap}
          missedSlots={missedSlots}
          onStartMissed={handleStartSlotWorkout}
          isStarting={createWorkout.isPending}
        />
      )}

      {plan && plan.plan_type === 'cycle' && (
        <CycleScheduleView
          plan={plan}
          templateMap={templateMap}
        />
      )}

      {/* Upcoming */}
      {plan && upcomingSlots.length > 0 && (
        <section className="tp-section">
          <h2 className="section-title">Up next</h2>
          <div className="card tp-upcoming-card">
            <ul className="tp-upcoming-list">
              {upcomingSlots.map((slot) => (
                <li key={slot.id} className="tp-upcoming-item">
                  <div className="tp-upcoming-info">
                    <span className="card-title">{getSlotTemplateName(slot)}</span>
                    <span className="meta">
                      {plan.plan_type === 'weekly' && slot.day_of_week != null
                        ? dayOfWeekName(slot.day_of_week, true)
                        : `Day ${(slot.cycle_position ?? 0) + 1}`}
                      {getSlotExerciseCount(slot) > 0 && (
                        <> &middot; {getSlotExerciseCount(slot)} exercises</>
                      )}
                    </span>
                  </div>
                  <ChevronRightIcon size={14} className="tp-upcoming-chevron" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Plan actions */}
      {plan && (
        <section className="tp-section tp-plan-actions">
          <Link to="/plan/setup" className="btn-secondary tp-edit-btn">
            Edit plan
          </Link>
          <button
            type="button"
            className="btn-ghost btn-ghost--danger"
            onClick={() => setDeletePlanConfirm(true)}
          >
            Delete plan
          </button>
        </section>
      )}

      {/* Templates section */}
      <section className="tp-section">
        <div className="tp-section-header">
          <h2 className="section-title">Templates</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowNewTemplate((v) => !v)}
          >
            {showNewTemplate ? 'Cancel' : '+ New'}
          </button>
        </div>
        <p className="meta tp-section-desc">Reusable workout building blocks.</p>

        {showNewTemplate && (
          <div className="tp-new-template">
            <input
              type="text"
              placeholder="e.g. Push Day, Upper Body..."
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="input input--md input--bg"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTemplate();
                if (e.key === 'Escape') {
                  setShowNewTemplate(false);
                  setNewTemplateName('');
                }
              }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={handleCreateTemplate}
              disabled={!newTemplateName.trim() || createTemplate.isPending}
            >
              {createTemplate.isPending ? 'Adding...' : 'Create'}
            </button>
          </div>
        )}

        {templates != null && templates.length > 0 && (
          <ul className="tp-template-list">
            {templates.map((t) => (
              <li key={t.id} className="tp-template-item">
                {editingId === t.id ? (
                  <div className="tp-template-edit">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="input input--md input--bg"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTemplateEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button type="button" className="btn-ghost" onClick={handleSaveTemplateEdit}>
                      Save
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="tp-template-info">
                      <span className="tp-template-name">{t.name}</span>
                      {t.exercise_order.length > 0 && (
                        <span className="tag tag--muted">
                          {t.exercise_order.length} exercise{t.exercise_order.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="tp-template-actions">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setExercisePickerForId(t.id)}
                      >
                        Exercises
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => { setEditingId(t.id); setEditingName(t.name); }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--danger"
                        onClick={() => setDeleteTemplateId(t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {templates != null && templates.length === 0 && !showNewTemplate && (
          <EmptyState
            icon={<DumbbellIllustration />}
            message="Templates are reusable workout structures."
            secondaryMessage="Create one to build your training plan, or use a quick-start preset below."
            actionLabel="Create template"
            onAction={() => setShowNewTemplate(true)}
          />
        )}
      </section>

      {/* Quick-start presets (shown when no templates exist) */}
      {templates != null && templates.length === 0 && (
        <section className="tp-section">
          <h2 className="section-title">Quick start</h2>
          <p className="meta tp-section-desc">
            Common training structures to get you started. You can customize them later.
          </p>
          <div className="tp-presets">
            {STARTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="card tp-preset-card"
                onClick={() => handleUsePreset(preset.id)}
                disabled={createTemplate.isPending}
              >
                <span className="tp-preset-label">{preset.label}</span>
                <span className="meta">{preset.description}</span>
              </button>
            ))}
          </div>
          <p className="meta tp-preset-hint">
            Switching from another app? Start with a preset and adjust exercises to match your routine.
          </p>
        </section>
      )}

      {/* Exercise picker sheet */}
      <Sheet
        open={exercisePickerForId !== null}
        onClose={() => setExercisePickerForId(null)}
        title={editingTemplate ? `${editingTemplate.name} — Exercises` : 'Exercises'}
      >
        {templateExercises.data && templateExercises.data.length > 0 && (
          <div className="tp-picker-section">
            <p className="meta tp-picker-label">Current exercises</p>
            <ul className="tp-picker-list">
              {templateExercises.data.map((e) => (
                <li key={e.id} className="tp-picker-item">
                  <span className="card-title">{e.name}</span>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--danger"
                    onClick={() => handleRemoveExercise(e.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="meta tp-picker-label">Add exercises</p>
        <ul className="tp-picker-list">
          {availableExercises.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="tp-picker-add-btn"
                onClick={() => handleAddExercise(e.id)}
              >
                <span className="card-title">{e.name}</span>
                {e.muscle_group && <span className="meta">{e.muscle_group}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* Delete template confirm */}
      <ConfirmDialog
        open={deleteTemplateId !== null}
        title="Delete template"
        message="This template will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteTemplate}
        onCancel={() => setDeleteTemplateId(null)}
      />

      {/* Delete plan confirm */}
      <ConfirmDialog
        open={deletePlanConfirm}
        title="Delete plan"
        message="Your training plan and schedule will be permanently deleted. Templates will be kept."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeletePlan}
        onCancel={() => setDeletePlanConfirm(false)}
      />
    </div>
  );
}

/* ── Weekly schedule visualization ── */
function WeeklyScheduleView({
  plan,
  weekWorkouts,
  templateMap,
  missedSlots,
  onStartMissed,
  isStarting,
}: {
  plan: PlanWithSlots;
  weekWorkouts: Workout[];
  templateMap: Map<string, Template>;
  missedSlots: MissedSlotInfo[];
  onStartMissed: (slot: TrainingPlanSlot) => void;
  isStarting: boolean;
}) {
  const now = new Date();
  const todayDow = (now.getDay() + 6) % 7;

  const weekDays = getWeekDates();

  return (
    <section className="tp-schedule card">
      <div className="tp-schedule-header">
        <span className="tp-schedule-label">This week</span>
      </div>
      <div className="tp-week-grid">
        {Array.from({ length: 7 }, (_, dow) => {
          const slot = plan.slots.find((s) => s.day_of_week === dow);
          const isToday = dow === todayDow;
          const isPast = dow < todayDow;
          const completed = slot && !slot.is_rest_day
            ? isSlotCompletedOnDate(slot, weekWorkouts, weekDays[dow])
            : false;
          const missed = isPast && slot && !slot.is_rest_day && !completed;
          const isRest = slot?.is_rest_day ?? false;
          const name = slot
            ? (slot.is_rest_day
              ? 'Rest'
              : (slot.template_id ? (templateMap.get(slot.template_id)?.name ?? '') : ''))
            : '';

          return (
            <div
              key={dow}
              className={
                'tp-week-day' +
                (isToday ? ' tp-week-day--today' : '') +
                (completed ? ' tp-week-day--done' : '') +
                (missed ? ' tp-week-day--missed' : '') +
                (isRest ? ' tp-week-day--rest' : '')
              }
            >
              <span className="tp-week-day-label">{DAY_LABELS[dow]}</span>
              <span className="tp-week-day-indicator">
                {completed && <CheckIcon size={12} />}
                {missed && <span className="tp-week-day-missed-dot" />}
              </span>
              <span className="tp-week-day-name">{name}</span>
            </div>
          );
        })}
      </div>
      {missedSlots.length > 0 && (
        <div className="tp-missed-section">
          <span className="tp-missed-label">Missed</span>
          <ul className="tp-missed-list">
            {missedSlots.map(({ slot, dayOfWeek }) => {
              const name = slot.template_id
                ? (templateMap.get(slot.template_id)?.name ?? 'Workout')
                : 'Workout';
              return (
                <li key={slot.id} className="tp-missed-item">
                  <div className="tp-missed-info">
                    <span className="tp-missed-day">{dayOfWeekName(dayOfWeek, true)}</span>
                    <span className="tp-missed-name">{name}</span>
                  </div>
                  {slot.template_id && (
                    <button
                      type="button"
                      className="btn-ghost tp-missed-action"
                      onClick={() => onStartMissed(slot)}
                      disabled={isStarting}
                    >
                      Do now
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function getWeekDates(): Date[] {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/* ── Cycle schedule visualization ── */
function CycleScheduleView({
  plan,
  templateMap,
}: {
  plan: PlanWithSlots;
  templateMap: Map<string, Template>;
}) {
  const sorted = [...plan.slots].sort(
    (a, b) => (a.cycle_position ?? 0) - (b.cycle_position ?? 0),
  );

  return (
    <section className="tp-schedule card">
      <div className="tp-schedule-header">
        <span className="tp-schedule-label">Cycle</span>
        <span className="meta">{sorted.length} days</span>
      </div>
      <div className="tp-cycle-track">
        {sorted.map((slot) => {
          const pos = slot.cycle_position ?? 0;
          const isCurrent = pos === plan.cycle_cursor;
          const isPast = pos < plan.cycle_cursor;
          const name = slot.is_rest_day
            ? 'Rest'
            : (slot.template_id ? (templateMap.get(slot.template_id)?.name ?? 'Workout') : 'Workout');

          return (
            <div
              key={slot.id}
              className={
                'tp-cycle-slot' +
                (isCurrent ? ' tp-cycle-slot--current' : '') +
                (isPast ? ' tp-cycle-slot--past' : '') +
                (slot.is_rest_day ? ' tp-cycle-slot--rest' : '')
              }
            >
              <span className="tp-cycle-slot-pos">{pos + 1}</span>
              <span className="tp-cycle-slot-name">{name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
