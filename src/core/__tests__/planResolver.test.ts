import { resolveTodaySlot } from '@/core/planResolver';
import type { TrainingPlanSlot } from '@/db/types';

const T = '2026-01-01T00:00:00.000Z';

function slot(over: Partial<TrainingPlanSlot>): TrainingPlanSlot {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    plan_id: 'plan',
    template_id: null,
    day_of_week: null,
    cycle_position: null,
    is_rest_day: false,
    label: null,
    created_at: T,
    updated_at: T,
    deleted_at: null,
    ...over,
  };
}

const weekly = { plan_type: 'weekly' as const, cycle_cursor: 0 };
const cycle = (cursor: number) => ({ plan_type: 'cycle' as const, cycle_cursor: cursor });

describe('resolveTodaySlot — weekly', () => {
  test('matches the slot for the device-local weekday (Sunday = 0)', () => {
    const slots = [
      slot({ day_of_week: 0, template_id: 'tpl-sun' }),
      slot({ day_of_week: 3, template_id: 'tpl-wed' }),
    ];
    expect(resolveTodaySlot(weekly, slots, 3)).toEqual({
      kind: 'workout',
      slot: slots[1],
      templateId: 'tpl-wed',
    });
    expect(resolveTodaySlot(weekly, slots, 0)).toEqual({
      kind: 'workout',
      slot: slots[0],
      templateId: 'tpl-sun',
    });
  });

  test('a day with no slot resolves to none', () => {
    const slots = [slot({ day_of_week: 1, template_id: 'tpl' })];
    expect(resolveTodaySlot(weekly, slots, 2)).toEqual({ kind: 'none' });
  });

  test('an explicit rest day resolves to rest', () => {
    const rest = slot({ day_of_week: 5, is_rest_day: true });
    expect(resolveTodaySlot(weekly, [rest], 5)).toEqual({ kind: 'rest', slot: rest });
  });

  test('SQLite 0/1 booleans are honored', () => {
    const rest = slot({ day_of_week: 4, is_rest_day: 1 as unknown as boolean });
    expect(resolveTodaySlot(weekly, [rest], 4)).toEqual({ kind: 'rest', slot: rest });
  });

  test('a non-rest slot with no template resolves to unconfigured', () => {
    const empty = slot({ day_of_week: 6, template_id: null });
    expect(resolveTodaySlot(weekly, [empty], 6)).toEqual({ kind: 'unconfigured', slot: empty });
  });
});

describe('resolveTodaySlot — cycle', () => {
  test('takes the slot at the cursor position (ordered by cycle_position)', () => {
    const slots = [
      slot({ cycle_position: 1, template_id: 'tpl-b' }),
      slot({ cycle_position: 0, template_id: 'tpl-a' }),
    ];
    expect(resolveTodaySlot(cycle(0), slots, 2)).toMatchObject({
      kind: 'workout',
      templateId: 'tpl-a',
    });
    expect(resolveTodaySlot(cycle(1), slots, 2)).toMatchObject({
      kind: 'workout',
      templateId: 'tpl-b',
    });
  });

  test('the cursor wraps modulo the slot count', () => {
    const slots = [
      slot({ cycle_position: 0, template_id: 'tpl-a' }),
      slot({ cycle_position: 1, template_id: 'tpl-b' }),
    ];
    expect(resolveTodaySlot(cycle(4), slots, 2)).toMatchObject({
      kind: 'workout',
      templateId: 'tpl-a',
    });
    expect(resolveTodaySlot(cycle(5), slots, 2)).toMatchObject({
      kind: 'workout',
      templateId: 'tpl-b',
    });
  });

  test('a cycle rest slot resolves to rest', () => {
    const rest = slot({ cycle_position: 0, is_rest_day: true });
    expect(resolveTodaySlot(cycle(0), [rest], 2)).toEqual({ kind: 'rest', slot: rest });
  });

  test('an empty slot list resolves to none', () => {
    expect(resolveTodaySlot(cycle(0), [], 2)).toEqual({ kind: 'none' });
  });

  test('weekly slots mixed in are ignored by cycle resolution', () => {
    const slots = [
      slot({ day_of_week: 2, template_id: 'tpl-weekly' }),
      slot({ cycle_position: 0, template_id: 'tpl-cycle' }),
    ];
    expect(resolveTodaySlot(cycle(0), slots, 2)).toMatchObject({
      kind: 'workout',
      templateId: 'tpl-cycle',
    });
  });
});
