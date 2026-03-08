import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useToast } from '../lib/useToast';
import { useActivePlan, useCreatePlan, useUpdatePlan, dayOfWeekName } from '../lib/queries/plans';
import { useTemplates } from '../lib/queries/templates';
import { BackLink } from '../components/BackLink';
import { PlusIcon, XIcon } from '../components/Icons';
import type { Template } from '../types/database';
import './PlanSetup.css';

type PlanType = 'weekly' | 'cycle';

type SlotDraft = {
  key: string;
  templateId: string | null;
  isRestDay: boolean;
  label: string;
  dayOfWeek?: number;
  cyclePosition?: number;
};

function makeWeeklySlots(templates: Template[], existing?: SlotDraft[]): SlotDraft[] {
  return Array.from({ length: 7 }, (_, dow) => {
    const prev = existing?.find((s) => s.dayOfWeek === dow);
    return prev ?? {
      key: `weekly-${dow}`,
      templateId: null,
      isRestDay: false,
      label: '',
      dayOfWeek: dow,
    };
  });
}

function makeCycleSlots(existing?: SlotDraft[]): SlotDraft[] {
  if (existing && existing.length > 0) return existing;
  return [{ key: 'cycle-0', templateId: null, isRestDay: false, label: '', cyclePosition: 0 }];
}

export function PlanSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: activePlan } = useActivePlan(user?.id);
  const { data: templates } = useTemplates(user?.id);
  const createPlan = useCreatePlan(user?.id);
  const updatePlan = useUpdatePlan(user?.id);

  const isEditing = activePlan != null;

  const [step, setStep] = useState<'type' | 'schedule'>(isEditing ? 'schedule' : 'type');
  const [planName, setPlanName] = useState(activePlan?.name ?? '');
  const [planType, setPlanType] = useState<PlanType>(activePlan?.plan_type ?? 'weekly');

  const initialSlots = isEditing
    ? activePlan.slots.map((s) => ({
        key: s.id,
        templateId: s.template_id,
        isRestDay: s.is_rest_day,
        label: s.label ?? '',
        dayOfWeek: s.day_of_week ?? undefined,
        cyclePosition: s.cycle_position ?? undefined,
      }))
    : undefined;

  const [weeklySlots, setWeeklySlots] = useState<SlotDraft[]>(() =>
    makeWeeklySlots(templates ?? [], planType === 'weekly' ? initialSlots : undefined),
  );
  const [cycleSlots, setCycleSlots] = useState<SlotDraft[]>(() =>
    makeCycleSlots(planType === 'cycle' ? initialSlots : undefined),
  );

  const slots = planType === 'weekly' ? weeklySlots : cycleSlots;

  function handleSelectType(type: PlanType) {
    setPlanType(type);
    setStep('schedule');
  }

  function handleWeeklySlotChange(dow: number, field: 'templateId' | 'isRestDay', value: string | boolean) {
    setWeeklySlots((prev) =>
      prev.map((s) => {
        if (s.dayOfWeek !== dow) return s;
        if (field === 'isRestDay') {
          return { ...s, isRestDay: value as boolean, templateId: value ? null : s.templateId };
        }
        return { ...s, templateId: value as string || null, isRestDay: false };
      }),
    );
  }

  function handleCycleSlotChange(index: number, field: 'templateId' | 'isRestDay', value: string | boolean) {
    setCycleSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (field === 'isRestDay') {
          return { ...s, isRestDay: value as boolean, templateId: value ? null : s.templateId };
        }
        return { ...s, templateId: value as string || null, isRestDay: false };
      }),
    );
  }

  function addCycleSlot() {
    setCycleSlots((prev) => [
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

  function removeCycleSlot(index: number) {
    setCycleSlots((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, cyclePosition: i })),
    );
  }

  async function handleSave() {
    const name = planName.trim() || (planType === 'weekly' ? 'Weekly Plan' : 'Training Cycle');

    const slotInputs = slots.map((s) => ({
      template_id: s.templateId,
      day_of_week: planType === 'weekly' ? (s.dayOfWeek ?? null) : null,
      cycle_position: planType === 'cycle' ? (s.cyclePosition ?? null) : null,
      is_rest_day: s.isRestDay,
      label: s.label || null,
    }));

    try {
      if (isEditing) {
        await updatePlan.mutateAsync({
          id: activePlan.id,
          name,
          slots: slotInputs,
        });
        toast('Plan updated', 'success');
      } else {
        await createPlan.mutateAsync({
          name,
          plan_type: planType,
          slots: slotInputs,
        });
        toast('Plan created', 'success');
      }
      navigate('/profile/plan');
    } catch {
      toast('Failed to save plan', 'error');
    }
  }

  const isSaving = createPlan.isPending || updatePlan.isPending;

  return (
    <div className="ps">
      <BackLink to="/profile/plan" label="Training Plan" />

      <h1 className="page-title ps-title">
        {isEditing ? 'Edit Plan' : 'New Plan'}
      </h1>

      {/* Step 1: choose plan type */}
      {step === 'type' && (
        <section className="ps-type-section">
          <p className="meta ps-desc">How do you want to organize your training?</p>
          <div className="ps-type-cards">
            <button
              type="button"
              className="card ps-type-card"
              onClick={() => handleSelectType('weekly')}
            >
              <span className="ps-type-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="22" height="18" rx="3" />
                  <line x1="3" y1="11" x2="25" y2="11" />
                  <line x1="10" y1="5" x2="10" y2="11" />
                  <line x1="18" y1="5" x2="18" y2="11" />
                </svg>
              </span>
              <span className="ps-type-name">Weekly Schedule</span>
              <span className="meta">Assign workouts to specific days of the week</span>
            </button>
            <button
              type="button"
              className="card ps-type-card"
              onClick={() => handleSelectType('cycle')}
            >
              <span className="ps-type-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 8l3-3-3-3" />
                  <path d="M4 14a10 10 0 0118-6" />
                  <path d="M7 20l-3 3 3 3" />
                  <path d="M24 14A10 10 0 016 20" />
                </svg>
              </span>
              <span className="ps-type-name">Rotating Cycle</span>
              <span className="meta">Workouts repeat in order as you complete them</span>
            </button>
          </div>
        </section>
      )}

      {/* Step 2: build the schedule */}
      {step === 'schedule' && (
        <section className="ps-schedule-section">
          {!isEditing && (
            <button
              type="button"
              className="btn-ghost ps-back-step"
              onClick={() => setStep('type')}
            >
              ← Change type
            </button>
          )}

          <div className="ps-name-row">
            <input
              type="text"
              className="input input--md"
              placeholder={planType === 'weekly' ? 'e.g. PPL Split' : 'e.g. Upper/Lower Cycle'}
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
            />
          </div>

          <div className="ps-type-badge">
            <span className="tag">
              {planType === 'weekly' ? 'Weekly Schedule' : 'Rotating Cycle'}
            </span>
          </div>

          {planType === 'weekly' && (
            <div className="ps-slots">
              {weeklySlots.map((slot) => (
                <WeeklySlotRow
                  key={slot.key}
                  slot={slot}
                  templates={templates ?? []}
                  onChange={handleWeeklySlotChange}
                />
              ))}
            </div>
          )}

          {planType === 'cycle' && (
            <div className="ps-slots">
              {cycleSlots.map((slot, i) => (
                <CycleSlotRow
                  key={slot.key}
                  index={i}
                  slot={slot}
                  templates={templates ?? []}
                  removable={cycleSlots.length > 1}
                  onChange={handleCycleSlotChange}
                  onRemove={removeCycleSlot}
                />
              ))}
              <button
                type="button"
                className="btn-ghost ps-add-day"
                onClick={addCycleSlot}
              >
                <PlusIcon size={14} /> Add day
              </button>
            </div>
          )}

          {templates != null && templates.length === 0 && (
            <p className="meta ps-no-templates">
              No templates yet. Create templates on the Training Plan page first, then assign them here.
            </p>
          )}

          <button
            type="button"
            className="btn-primary ps-save-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : isEditing
                ? 'Update plan'
                : 'Activate plan'}
          </button>
        </section>
      )}
    </div>
  );
}

function WeeklySlotRow({
  slot,
  templates,
  onChange,
}: {
  slot: SlotDraft;
  templates: Template[];
  onChange: (dow: number, field: 'templateId' | 'isRestDay', value: string | boolean) => void;
}) {
  const dow = slot.dayOfWeek ?? 0;
  return (
    <div className={'ps-slot-row' + (slot.isRestDay ? ' ps-slot-row--rest' : '')}>
      <span className="ps-slot-day">{dayOfWeekName(dow, true)}</span>
      <div className="ps-slot-controls">
        <select
          className="ps-slot-select"
          value={slot.isRestDay ? '__rest__' : (slot.templateId ?? '')}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '__rest__') {
              onChange(dow, 'isRestDay', true);
            } else {
              onChange(dow, 'templateId', val);
            }
          }}
        >
          <option value="">— None —</option>
          <option value="__rest__">Rest Day</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CycleSlotRow({
  index,
  slot,
  templates,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  slot: SlotDraft;
  templates: Template[];
  removable: boolean;
  onChange: (index: number, field: 'templateId' | 'isRestDay', value: string | boolean) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className={'ps-slot-row' + (slot.isRestDay ? ' ps-slot-row--rest' : '')}>
      <span className="ps-slot-day">Day {index + 1}</span>
      <div className="ps-slot-controls">
        <select
          className="ps-slot-select"
          value={slot.isRestDay ? '__rest__' : (slot.templateId ?? '')}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '__rest__') {
              onChange(index, 'isRestDay', true);
            } else {
              onChange(index, 'templateId', val);
            }
          }}
        >
          <option value="">— None —</option>
          <option value="__rest__">Rest Day</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {removable && (
          <button
            type="button"
            className="btn-ghost ps-slot-remove"
            onClick={() => onRemove(index)}
            aria-label="Remove day"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
