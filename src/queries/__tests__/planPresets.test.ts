import { getDb, initDb, resetDbForTests } from '@/db/client';
import { listPlanPresets } from '@/queries/planPresets';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

async function seedPreset(args: {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  deleted?: boolean;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO plan_presets (id, slug, name, tier, plan_type, sort_order, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      args.id,
      args.slug,
      args.name,
      'generic',
      'weekly',
      args.sortOrder,
      T,
      T,
      args.deleted ? T : null,
    ],
  );
}

test('returns an empty array when no presets are seeded', async () => {
  expect(await listPlanPresets()).toEqual([]);
});

test('hydrates presets with their templates, exercises, and slots', async () => {
  const db = await getDb();
  await seedPreset({ id: 'p1', slug: 'fb', name: 'Full Body', sortOrder: 0 });
  await db.runAsync(
    'INSERT INTO plan_preset_templates (id, preset_id, slug, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['pt1', 'p1', 'push', 'Push', 0, T, T],
  );
  await db.runAsync(
    'INSERT INTO plan_preset_exercises (id, preset_template_id, name, muscle_group, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['pe2', 'pt1', 'Incline Press', 'Chest', 1, T, T],
  );
  await db.runAsync(
    'INSERT INTO plan_preset_exercises (id, preset_template_id, name, muscle_group, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['pe1', 'pt1', 'Bench Press', 'Chest', 0, T, T],
  );
  await db.runAsync(
    'INSERT INTO plan_preset_slots (id, preset_id, preset_template_id, day_of_week, is_rest_day, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['ps1', 'p1', 'pt1', 1, 0, 'Mon', T, T],
  );

  const presets = await listPlanPresets();
  expect(presets).toHaveLength(1);
  const [preset] = presets;
  expect(preset!.preset.name).toBe('Full Body');
  expect(preset!.templates).toHaveLength(1);
  // exercises ordered by order_index ASC
  expect(preset!.templates[0]!.exercises.map((e) => e.name)).toEqual([
    'Bench Press',
    'Incline Press',
  ]);
  expect(preset!.slots.map((s) => s.label)).toEqual(['Mon']);
});

test('orders presets by sort_order then name and excludes soft-deleted ones', async () => {
  await seedPreset({ id: 'p-b', slug: 'b', name: 'Beta', sortOrder: 1 });
  await seedPreset({ id: 'p-a', slug: 'a', name: 'Alpha', sortOrder: 0 });
  await seedPreset({ id: 'p-del', slug: 'd', name: 'Deleted', sortOrder: 2, deleted: true });

  const presets = await listPlanPresets();
  expect(presets.map((p) => p.preset.name)).toEqual(['Alpha', 'Beta']);
});
