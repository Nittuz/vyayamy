import { getDb, initDb, resetDbForTests } from '@/db/client';
import {
  getActivePlan,
  listTemplates,
  saveActivePlan,
  applyPresetAndSavePlan,
} from '@/queries/plans';
import type { HydratedPreset } from '@/queries/planPresets';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'plan-user';
const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

async function outboxFor(table: string) {
  const db = await getDb();
  return db.getAllAsync<{ op: string; row_id: string; payload_json: string }>(
    'SELECT op, row_id, payload_json FROM outbox WHERE table_name = ? ORDER BY id ASC',
    [table],
  );
}

describe('getActivePlan', () => {
  test('returns null when the user has no active plan', async () => {
    expect(await getActivePlan(USER)).toBeNull();
  });

  test('returns the active plan with slots ordered and templates hydrated', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO templates (id, user_id, name, exercise_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['tpl1', USER, 'Push Day', JSON.stringify(['ex1']), T, T],
    );
    await db.runAsync(
      'INSERT INTO training_plans (id, user_id, name, plan_type, is_active, cycle_cursor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['plan1', USER, 'My Plan', 'weekly', 1, 0, T, T],
    );
    // insert out of order; query should order by day_of_week
    await db.runAsync(
      'INSERT INTO training_plan_slots (id, plan_id, template_id, day_of_week, is_rest_day, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['slot-wed', 'plan1', 'tpl1', 3, 0, 'Wed', T, T],
    );
    await db.runAsync(
      'INSERT INTO training_plan_slots (id, plan_id, template_id, day_of_week, is_rest_day, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['slot-mon', 'plan1', 'tpl1', 1, 0, 'Mon', T, T],
    );

    const active = await getActivePlan(USER);
    expect(active!.plan.id).toBe('plan1');
    expect(active!.slots.map((s) => s.id)).toEqual(['slot-mon', 'slot-wed']);
    expect(active!.templates.get('tpl1')!.name).toBe('Push Day');
  });

  test('ignores inactive and soft-deleted plans', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO training_plans (id, user_id, name, plan_type, is_active, cycle_cursor, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['inactive', USER, 'Old', 'weekly', 0, 0, T, T, null],
    );
    await db.runAsync(
      'INSERT INTO training_plans (id, user_id, name, plan_type, is_active, cycle_cursor, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['deleted', USER, 'Gone', 'weekly', 1, 0, T, T, T],
    );
    expect(await getActivePlan(USER)).toBeNull();
  });
});

describe('listTemplates', () => {
  test('parses the JSON-encoded exercise_order into a string array', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO templates (id, user_id, name, exercise_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['t1', USER, 'A', JSON.stringify(['ex1', 'ex2']), T, T],
    );
    await db.runAsync(
      'INSERT INTO templates (id, user_id, name, exercise_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['t2', USER, 'B', 'not-json', T, T],
    );

    const templates = await listTemplates(USER);
    expect(templates.map((t) => t.name)).toEqual(['A', 'B']);
    expect(templates[0]!.exercise_order).toEqual(['ex1', 'ex2']);
    // malformed JSON degrades to an empty array rather than throwing
    expect(templates[1]!.exercise_order).toEqual([]);
  });
});

describe('saveActivePlan', () => {
  test('creates a new plan and its slots locally and in the outbox', async () => {
    const planId = await saveActivePlan({
      userId: USER,
      name: 'Weekly Split',
      planType: 'weekly',
      slots: [
        { templateId: null, dayOfWeek: 1, isRestDay: false, label: 'Mon' },
        { templateId: null, dayOfWeek: 2, isRestDay: true, label: 'Rest' },
      ],
    });

    const active = await getActivePlan(USER);
    expect(active!.plan.id).toBe(planId);
    expect(active!.plan.name).toBe('Weekly Split');
    expect(active!.slots).toHaveLength(2);

    const planOutbox = await outboxFor('training_plans');
    expect(planOutbox.some((r) => r.op === 'upsert' && r.row_id === planId)).toBe(true);
    const slotOutbox = await outboxFor('training_plan_slots');
    expect(slotOutbox.filter((r) => r.op === 'insert')).toHaveLength(2);
  });

  test('deactivates a previously active plan when creating a new one', async () => {
    const firstId = await saveActivePlan({
      userId: USER,
      name: 'First',
      planType: 'weekly',
      slots: [{ templateId: null, dayOfWeek: 1, isRestDay: true, label: 'Rest' }],
    });
    const secondId = await saveActivePlan({
      userId: USER,
      name: 'Second',
      planType: 'weekly',
      slots: [{ templateId: null, dayOfWeek: 1, isRestDay: true, label: 'Rest' }],
    });

    expect(secondId).not.toBe(firstId);
    const active = await getActivePlan(USER);
    expect(active!.plan.id).toBe(secondId);

    const db = await getDb();
    const first = await db.getFirstAsync<{ is_active: number }>(
      'SELECT is_active FROM training_plans WHERE id = ?',
      [firstId],
    );
    expect(first!.is_active).toBe(0);
  });

  test('replaces slots when editing an existing plan (planId provided)', async () => {
    const planId = await saveActivePlan({
      userId: USER,
      name: 'Plan',
      planType: 'weekly',
      slots: [
        { templateId: null, dayOfWeek: 1, isRestDay: false, label: 'Mon' },
        { templateId: null, dayOfWeek: 2, isRestDay: false, label: 'Tue' },
      ],
    });

    await saveActivePlan({
      userId: USER,
      planId,
      name: 'Plan v2',
      planType: 'weekly',
      slots: [{ templateId: null, dayOfWeek: 3, isRestDay: false, label: 'Wed' }],
    });

    const active = await getActivePlan(USER);
    expect(active!.plan.id).toBe(planId);
    expect(active!.slots).toHaveLength(1);
    expect(active!.slots[0]!.label).toBe('Wed');

    const slotOutbox = await outboxFor('training_plan_slots');
    expect(slotOutbox.some((r) => r.op === 'delete')).toBe(true);
  });
});

describe('applyPresetAndSavePlan', () => {
  function buildPreset(): HydratedPreset {
    return {
      preset: {
        id: 'preset1',
        slug: 'full-body',
        name: 'Full Body',
        tier: 'generic',
        blurb: null,
        plan_type: 'weekly',
        cycle_length: null,
        sort_order: 0,
        created_at: T,
        updated_at: T,
        deleted_at: null,
      },
      templates: [
        {
          template: {
            id: 'ptpl1',
            preset_id: 'preset1',
            slug: 'push',
            name: 'Push',
            sort_order: 0,
            created_at: T,
            updated_at: T,
            deleted_at: null,
          },
          exercises: [
            {
              id: 'pe1',
              preset_template_id: 'ptpl1',
              name: 'Bench Press',
              muscle_group: 'Chest',
              order_index: 0,
              created_at: T,
              updated_at: T,
              deleted_at: null,
            },
          ],
        },
      ],
      slots: [],
    };
  }

  test('reuses an existing global exercise instead of creating a duplicate', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['global-bench', 'Bench Press', 'Chest', null, T, T],
    );

    await applyPresetAndSavePlan({
      userId: USER,
      preset: buildPreset(),
      name: 'My Plan',
      slots: [{ presetTemplateId: 'ptpl1', dayOfWeek: 1, isRestDay: false, label: 'Push' }],
    });

    // No new exercise should have been enqueued.
    const exerciseOutbox = await outboxFor('exercises');
    expect(exerciseOutbox).toHaveLength(0);

    // The cloned template references the existing global exercise id.
    const templates = await listTemplates(USER);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.name).toBe('Push');
    expect(templates[0]!.exercise_order).toEqual(['global-bench']);
  });

  test('creates a user-scoped exercise when no match exists, and wires up the plan', async () => {
    const newTemplateIds: string[] = [];

    await applyPresetAndSavePlan({
      userId: USER,
      preset: buildPreset(),
      name: 'My Plan',
      slots: [
        { presetTemplateId: 'ptpl1', dayOfWeek: 1, isRestDay: false, label: 'Push' },
        { presetTemplateId: null, dayOfWeek: 2, isRestDay: true, label: 'Rest' },
      ],
    });

    const exerciseOutbox = await outboxFor('exercises');
    expect(exerciseOutbox).toHaveLength(1);
    expect(JSON.parse(exerciseOutbox[0]!.payload_json)).toMatchObject({
      name: 'Bench Press',
      user_id: USER,
    });

    const templates = await listTemplates(USER);
    newTemplateIds.push(templates[0]!.id);
    expect(templates[0]!.exercise_order).toEqual([exerciseOutbox[0]!.row_id]);

    const active = await getActivePlan(USER);
    expect(active!.plan.name).toBe('My Plan');
    expect(active!.slots).toHaveLength(2);
    const pushSlot = active!.slots.find((s) => s.label === 'Push')!;
    const restSlot = active!.slots.find((s) => s.label === 'Rest')!;
    expect(pushSlot.template_id).toBe(newTemplateIds[0]);
    expect(restSlot.template_id).toBeNull();
    expect(restSlot.is_rest_day).toBe(1);
  });
});
