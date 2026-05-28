# Uplevel Phase 4 — Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five dev-phase-helpful items — sync diagnostics sheet, per-exercise rest override, composition-derived workout title, line-height tokens wired into body prose, and a near-real-time sync error stripe — without touching SQLite schema, mutation primitives, or Phase 1-3 visual language.

**Architecture:** Three pure logic modules (`compositionTitle`, `restOverrides`, `outboxPreview`) drive three new UI sheets/components (`SyncDiagnosticsSheet`, `RestOverrideSheet`, `SyncErrorStripe`). Existing `SyncIndicator` becomes pressable; `RestProgressBar` gesture model changes (long-press → override, short-press → skip). One small `SyncState` extension (`lastErrorAt`) + engine wiring. One `useAddExerciseToWorkout.onSuccess` hook for the auto-title computation.

**Tech Stack:** Expo 55, React Native 0.83, React 19, expo-router, expo-sqlite, expo-haptics, React Query 5.90, `@react-native-async-storage/async-storage`. Jest with ts-jest + better-sqlite3 mock.

**Spec:** [docs/specs/2026-05-28-uplevel-phase-4-dimensions-design.md](../specs/2026-05-28-uplevel-phase-4-dimensions-design.md)

**Testing note:** Same constraint as Phases 1-3 — `jest.setup.js` mocks `react-native`. Logic in pure modules; UI components verified on device.

**Branch:** `feat/phase-4-dimensions` (off `main` which already contains Phases 1-3).

**Baseline:** 137 tests on `main`.

**Commit cadence:** One commit per task. Co-Authored-By footer required.

---

## File map

**New files:**
- `src/lib/compositionTitle.ts` + tests
- `src/ui/restOverrides.ts` + tests
- `src/sync/outboxPreview.ts` + tests
- `src/components/SyncDiagnosticsSheet.tsx`
- `src/components/RestOverrideSheet.tsx`
- `src/components/SyncErrorStripe.tsx`

**Modified files:**
- `src/sync/state.ts` — add `lastErrorAt: string | null`
- `src/sync/engine.ts` — set/clear `lastErrorAt` on push/pull outcomes; export `useSyncStateLive` (or new file `src/sync/useSyncStateLive.ts`)
- `src/ui/SyncIndicator.tsx` — wrap in Pressable; open SyncDiagnosticsSheet
- `src/components/RestProgressBar.tsx` — long-press → override sheet; short-press → skip
- `src/screens/Today.tsx` — render SyncErrorStripe at top + line-height tokens
- `src/screens/WorkoutActive.tsx` — effective rest via overrides, sync stripe, override sheet wiring, line-height tokens
- `src/components/CollisionSheet.tsx` — line-height tokens
- `src/components/QuarantineSheet.tsx` — line-height tokens
- `src/components/RepeatCard.tsx` — line-height tokens
- `src/ui/ToastContext.tsx` — line-height tokens on toast body
- `src/queries/workouts.ts` — `maybeUpdateAutoTitle` helper
- `src/queries/exercises.ts` — call `maybeUpdateAutoTitle` from `useAddExerciseToWorkout.onSuccess`
- `docs/specs/2026-05-28-uplevel-phase-4-dimensions-design.md` — status flip
- `docs/specs/README.md` — index update

**Untouched:**
- SQLite schema, mutation primitives (`enqueueMutation`), `src/db/*`
- `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/quarantine.ts` (consumed)
- All Phase 1-3 design tokens (colors, typography, motion, haptics, useTheme)
- Non-Phase-4 screens (`Progress`, `Profile`, `Login`, `TrainingPlan`, `History`, `HistoryDetail`)

---

## Task 1: compositionTitle pure module (TDD)

**Files:**
- Create: `src/lib/compositionTitle.ts`
- Create: `src/lib/__tests__/compositionTitle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/compositionTitle.test.ts`:

```ts
import { compositionTitle } from '@/lib/compositionTitle';

describe('compositionTitle', () => {
  test('empty array → empty string', () => {
    expect(compositionTitle([])).toBe('');
  });

  test('single muscle group', () => {
    expect(compositionTitle(['Chest'])).toBe('Chest');
  });

  test('multiple unique muscle groups joined with " + "', () => {
    expect(compositionTitle(['Chest', 'Triceps', 'Shoulders'])).toBe('Chest + Triceps + Shoulders');
  });

  test('deduplicates case-insensitively', () => {
    expect(compositionTitle(['Chest', 'chest', 'CHEST'])).toBe('Chest');
  });

  test('preserves first-seen casing on dedupe', () => {
    expect(compositionTitle(['CHEST', 'chest', 'Chest'])).toBe('CHEST');
  });

  test('filters out null and undefined entries', () => {
    expect(compositionTitle(['Chest', null, 'Triceps', undefined])).toBe('Chest + Triceps');
  });

  test('filters out empty strings and whitespace-only', () => {
    expect(compositionTitle(['Chest', '', '   ', 'Triceps'])).toBe('Chest + Triceps');
  });

  test('preserves insertion order', () => {
    expect(compositionTitle(['Legs', 'Back', 'Chest'])).toBe('Legs + Back + Chest');
  });

  test('all null/empty input → empty string', () => {
    expect(compositionTitle([null, undefined, '', '   '])).toBe('');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- --testPathPattern=compositionTitle`

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/lib/compositionTitle.ts`:

```ts
/**
 * Compose a workout title from a list of exercise muscle groups.
 *
 * Phase 4: triggered on the 3rd-exercise add to a workout whose title
 * is still the day-of-week default. Dedupes case-insensitively but
 * preserves the first-seen casing.
 */
export function compositionTitle(
  exerciseMuscleGroups: (string | null | undefined)[],
): string {
  const seenLower = new Set<string>();
  const result: string[] = [];
  for (const raw of exerciseMuscleGroups) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const lower = trimmed.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    result.push(trimmed);
  }
  return result.join(' + ');
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=compositionTitle`

Expected: 9/9 pass.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: typecheck clean, same pre-existing lint count, ~146 tests (137 + 9).

- [ ] **Step 6: Commit**

```bash
git add src/lib/compositionTitle.ts src/lib/__tests__/compositionTitle.test.ts
git commit -m "$(cat <<'EOF'
add compositionTitle helper for derived workout titles

Pure: dedupes case-insensitively, preserves first-seen casing
and insertion order. Filters null/empty/whitespace. Used by the
Phase 4 maybe-update-auto-title hook when the 3rd exercise is
added to a workout whose title is still the default day name.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: restOverrides module + effectiveRest + tests

**Files:**
- Create: `src/ui/restOverrides.ts`
- Create: `src/ui/__tests__/restOverrides.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/ui/__tests__/restOverrides.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearOverride,
  effectiveRest,
  getOverrides,
  setOverride,
} from '@/ui/restOverrides';

const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    store[k] = v;
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (k: string) => {
    delete store[k];
  });
});

describe('getOverrides / setOverride / clearOverride', () => {
  test('getOverrides returns empty map when nothing stored', async () => {
    expect(await getOverrides()).toEqual({});
  });

  test('setOverride then getOverrides round-trips', async () => {
    await setOverride('ex-1', 120);
    expect(await getOverrides()).toEqual({ 'ex-1': 120 });
  });

  test('setOverride merges with existing', async () => {
    await setOverride('ex-1', 120);
    await setOverride('ex-2', 180);
    expect(await getOverrides()).toEqual({ 'ex-1': 120, 'ex-2': 180 });
  });

  test('setOverride overwrites existing value for same id', async () => {
    await setOverride('ex-1', 120);
    await setOverride('ex-1', 90);
    expect(await getOverrides()).toEqual({ 'ex-1': 90 });
  });

  test('clearOverride removes one entry, leaves others', async () => {
    await setOverride('ex-1', 120);
    await setOverride('ex-2', 180);
    await clearOverride('ex-1');
    expect(await getOverrides()).toEqual({ 'ex-2': 180 });
  });

  test('clearOverride on missing entry is no-op', async () => {
    await setOverride('ex-1', 120);
    await clearOverride('ghost');
    expect(await getOverrides()).toEqual({ 'ex-1': 120 });
  });

  test('schema mismatch clears the key on read', async () => {
    store['@flexyug/rest-overrides/v1'] = JSON.stringify({
      schemaVersion: 99,
      overrides: { 'ex-1': 120 },
    });
    expect(await getOverrides()).toEqual({});
  });

  test('malformed JSON returns empty', async () => {
    store['@flexyug/rest-overrides/v1'] = '{not json';
    expect(await getOverrides()).toEqual({});
  });
});

describe('effectiveRest', () => {
  test('returns override if present', () => {
    expect(effectiveRest({ 'ex-1': 120 }, 'ex-1', 'Chest')).toBe(120);
  });

  test('falls back to muscle-group default when no override', () => {
    // Chest = 180 per restDefaults
    expect(effectiveRest({}, 'ex-1', 'Chest')).toBe(180);
  });

  test('falls back when override is for a different exercise', () => {
    expect(effectiveRest({ 'ex-2': 120 }, 'ex-1', 'Chest')).toBe(180);
  });

  test('falls back to 90s for null muscle group', () => {
    expect(effectiveRest({}, 'ex-1', null)).toBe(90);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- --testPathPattern=restOverrides`

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/ui/restOverrides.ts`:

```ts
/**
 * Per-exercise rest override map, persisted via kvStore.
 *
 * Phase 4: long-press on the RestProgressBar lets the user set a custom
 * rest target for the current exercise. Overrides take precedence over
 * the muscle-group defaults from restDefaults.ts.
 */
import { getKv, setKv } from '@/lib/kvStore';

import { restForMuscleGroup } from './restDefaults';

const STORAGE_KEY = '@flexyug/rest-overrides/v1';
const SCHEMA_VERSION = 1 as const;

interface PersistedOverrides {
  schemaVersion: typeof SCHEMA_VERSION;
  overrides: Record<string, number>;
}

export async function getOverrides(): Promise<Record<string, number>> {
  const value = await getKv<PersistedOverrides>(STORAGE_KEY, SCHEMA_VERSION);
  return value?.overrides ?? {};
}

export async function setOverride(exerciseId: string, seconds: number): Promise<void> {
  const current = await getOverrides();
  current[exerciseId] = seconds;
  await setKv<PersistedOverrides>(STORAGE_KEY, {
    schemaVersion: SCHEMA_VERSION,
    overrides: current,
  });
}

export async function clearOverride(exerciseId: string): Promise<void> {
  const current = await getOverrides();
  if (!(exerciseId in current)) return;
  delete current[exerciseId];
  await setKv<PersistedOverrides>(STORAGE_KEY, {
    schemaVersion: SCHEMA_VERSION,
    overrides: current,
  });
}

export function effectiveRest(
  overrides: Record<string, number>,
  exerciseId: string,
  muscleGroup: string | null | undefined,
): number {
  const override = overrides[exerciseId];
  if (typeof override === 'number') return override;
  return restForMuscleGroup(muscleGroup);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=restOverrides`

Expected: 12/12 pass (8 storage + 4 effectiveRest).

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~158 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/restOverrides.ts src/ui/__tests__/restOverrides.test.ts
git commit -m "$(cat <<'EOF'
add per-exercise rest override storage + effectiveRest fallback

Persists exercise_id → seconds map via kvStore (schema v1).
setOverride/clearOverride/getOverrides for CRUD; effectiveRest
returns override if present, else muscle-group default from
restDefaults. The UI sheet that calls these lands in Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: outboxPreview module + tests

**Files:**
- Create: `src/sync/outboxPreview.ts`
- Create: `src/sync/__tests__/outboxPreview.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/sync/__tests__/outboxPreview.test.ts`:

```ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getOutboxPreview } from '@/sync/outboxPreview';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
});

async function insertOutbox(args: {
  table: string;
  op: string;
  rowId: string;
  createdAt: string;
  attempts?: number;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [args.table, args.op, args.rowId, '{}', args.createdAt, args.attempts ?? 0],
  );
}

test('returns empty when outbox is empty', async () => {
  expect(await getOutboxPreview()).toEqual([]);
});

test('returns up to default limit (5) most-recent entries by id DESC', async () => {
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    await insertOutbox({
      table: 'sets',
      op: 'update',
      rowId: `set-${i}`,
      createdAt: new Date(now - (7 - i) * 1000).toISOString(),
    });
  }
  const preview = await getOutboxPreview();
  expect(preview).toHaveLength(5);
  // most recent (latest id) first
  expect(preview[0]!.row_id).toBe('set-6');
  expect(preview[4]!.row_id).toBe('set-2');
});

test('respects custom limit', async () => {
  await insertOutbox({ table: 'sets', op: 'update', rowId: 'a', createdAt: new Date().toISOString() });
  await insertOutbox({ table: 'sets', op: 'update', rowId: 'b', createdAt: new Date().toISOString() });
  await insertOutbox({ table: 'sets', op: 'update', rowId: 'c', createdAt: new Date().toISOString() });
  expect(await getOutboxPreview(2)).toHaveLength(2);
});

test('excludes quarantined entries (attempts >= MAX_ATTEMPTS)', async () => {
  await insertOutbox({ table: 'sets', op: 'update', rowId: 'a', createdAt: new Date().toISOString(), attempts: 5 });
  await insertOutbox({ table: 'sets', op: 'update', rowId: 'b', createdAt: new Date().toISOString(), attempts: 0 });
  const preview = await getOutboxPreview();
  expect(preview).toHaveLength(1);
  expect(preview[0]!.row_id).toBe('b');
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- --testPathPattern=outboxPreview`

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/sync/outboxPreview.ts`:

```ts
/**
 * Read-only preview of the most-recent pending outbox entries.
 * Used by the Phase 4 SyncDiagnosticsSheet.
 */
import { getDb } from '@/db/client';

import { MAX_ATTEMPTS } from './push';

export interface OutboxPreviewRow {
  id: number;
  table_name: string;
  op: string;
  row_id: string;
  created_at: string;
  attempts: number;
}

export async function getOutboxPreview(limit = 5): Promise<OutboxPreviewRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxPreviewRow>(
    `SELECT id, table_name, op, row_id, created_at, attempts
       FROM outbox
       WHERE attempts < ?
       ORDER BY id DESC
       LIMIT ?`,
    [MAX_ATTEMPTS, limit],
  );
}

export function relativeAge(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=outboxPreview`

Expected: 4/4 pass.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~162 tests.

- [ ] **Step 6: Commit**

```bash
git add src/sync/outboxPreview.ts src/sync/__tests__/outboxPreview.test.ts
git commit -m "$(cat <<'EOF'
add outbox preview query + relativeAge helper

getOutboxPreview returns the N most-recent pending (non-quarantined)
outbox entries, ordered by id DESC. relativeAge formats an ISO
timestamp as 'Ns ago' / 'Nm ago' / 'Nh ago' / 'Nd ago'. Both
consumed by the Phase 4 SyncDiagnosticsSheet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: lastErrorAt on SyncState + engine wiring + useSyncStateLive hook

**Files:**
- Modify: `src/sync/state.ts` — add `lastErrorAt: string | null`
- Modify: `src/sync/engine.ts` — set `lastErrorAt: nowIso()` on error, clear on success
- Create: `src/sync/useSyncStateLive.ts` — React hook subscribing to the pub/sub

- [ ] **Step 1: Extend SyncState**

Read `src/sync/state.ts`. Add `lastErrorAt: string | null` to the `SyncState` interface. Add `lastErrorAt: null` to the initial state object.

Final file structure should look like:

```ts
export interface SyncState {
  online: boolean;
  pushInFlight: boolean;
  pullInFlight: boolean;
  pendingOutbox: number;
  quarantinedOutbox: number;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null; // NEW: Phase 4
}
```

And the initial `let state: SyncState = { ... lastErrorAt: null }`.

- [ ] **Step 2: Wire engine to set/clear lastErrorAt**

Read `src/sync/engine.ts`. Find the four call sites of `setSyncState({ lastError: ... })` (two on push, two on pull — line 116/119, 131/134 per the grep earlier).

For each error setter (`setSyncState({ lastError: errorMessage(err) })`), add `lastErrorAt: new Date().toISOString()`:

```ts
setSyncState({ lastError: errorMessage(err), lastErrorAt: new Date().toISOString() });
```

For each success setter (`setSyncState({ lastError: null })`), also clear lastErrorAt:

```ts
setSyncState({ lastError: null, lastErrorAt: null });
```

Also update `handleSignOut`'s setSyncState call to include `lastErrorAt: null` in the reset object.

- [ ] **Step 3: Create useSyncStateLive hook**

Create `src/sync/useSyncStateLive.ts`:

```ts
import { useEffect, useState } from 'react';

import { getSyncState, subscribeSync, type SyncState } from './state';

/**
 * React hook that subscribes to sync state changes and returns the
 * current snapshot. Components re-render automatically when state
 * pub/sub fires.
 */
export function useSyncStateLive(): SyncState {
  const [snapshot, setSnapshot] = useState<SyncState>(() => getSyncState());
  useEffect(() => {
    const unsub = subscribeSync(setSnapshot);
    // Sync once immediately in case state changed between mount and subscribe
    setSnapshot(getSyncState());
    return unsub;
  }, []);
  return snapshot;
}
```

- [ ] **Step 4: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: typecheck clean. Existing tests may need to update `setSyncState` calls if any pass partial state expecting all fields — check `src/__tests__/sync-state.test.ts` and `src/__tests__/offline-workout.test.ts`. The interface change (`lastErrorAt: string | null`) is additive with a `null` default in initial state, so consumers won't break.

If any test fails because it deep-equals the entire SyncState, add `lastErrorAt: null` to the expected value.

Expected: ~162 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/sync/state.ts src/sync/engine.ts src/sync/useSyncStateLive.ts
git commit -m "$(cat <<'EOF'
add lastErrorAt to SyncState + useSyncStateLive hook

lastErrorAt captures the ISO timestamp of the most recent sync
failure (push or pull). Engine sets it on every error path and
clears it on every success. useSyncStateLive subscribes via the
existing pub/sub and re-renders consumers on change. Powers the
Phase 4 SyncErrorStripe's 30s pulse window and the
SyncDiagnosticsSheet's live state display.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: RestOverrideSheet component

**Files:**
- Create: `src/components/RestOverrideSheet.tsx`

- [ ] **Step 1: Build the component**

Create `src/components/RestOverrideSheet.tsx`:

```tsx
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { restForMuscleGroup } from '@/ui/restDefaults';
import { clearOverride, setOverride } from '@/ui/restOverrides';
import { useTheme } from '@/ui/useTheme';
import { haptics } from '@/ui/haptics';

interface Props {
  visible: boolean;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  currentOverride: number | null; // null = no override (using default)
  onClose: () => void;
  onChanged: () => void; // invalidate / refresh after save
}

const PRESETS = [30, 60, 90, 120, 180, 240, 300];

export function RestOverrideSheet({
  visible,
  exerciseId,
  exerciseName,
  muscleGroup,
  currentOverride,
  onClose,
  onChanged,
}: Props) {
  const theme = useTheme();
  const defaultSeconds = restForMuscleGroup(muscleGroup);
  const [selected, setSelected] = useState<number>(currentOverride ?? defaultSeconds);
  const [customText, setCustomText] = useState<string>('');

  const handleSave = async () => {
    haptics.light();
    const fromCustom = customText.trim() === '' ? null : Number(customText);
    const valueToSave = fromCustom != null && Number.isFinite(fromCustom) && fromCustom > 0
      ? Math.floor(fromCustom)
      : selected;
    await setOverride(exerciseId, valueToSave);
    onChanged();
    onClose();
  };

  const handleReset = async () => {
    haptics.medium();
    await clearOverride(exerciseId);
    onChanged();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.color.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.color.bg }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={[
              styles.title,
              {
                color: theme.color.inkHero,
                fontFamily: theme.font.family.sansSemibold,
                fontSize: theme.font.size.title,
                letterSpacing: theme.font.tracking.title,
              },
            ]}
          >
            Rest for {exerciseName}
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            Default for {muscleGroup ?? 'this'}: {defaultSeconds}s
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PRESETS.map((preset) => {
              const isSelected = selected === preset && customText.trim() === '';
              return (
                <Pressable
                  key={preset}
                  onPress={() => {
                    haptics.light();
                    setSelected(preset);
                    setCustomText('');
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.color.accent : 'transparent',
                      borderColor: isSelected ? theme.color.accent : theme.color.borderStrong,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isSelected ? theme.color.onAccent : theme.color.ink,
                        fontFamily: theme.font.family.mono,
                      },
                    ]}
                  >
                    {preset}s
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.customRow}>
            <Text
              style={[
                styles.label,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              CUSTOM
            </Text>
            <TextInput
              value={customText}
              onChangeText={setCustomText}
              keyboardType="number-pad"
              placeholder="seconds"
              placeholderTextColor={theme.color.inkTertiary}
              style={[
                styles.input,
                {
                  borderColor: theme.color.borderStrong,
                  color: theme.color.ink,
                  fontFamily: theme.font.family.mono,
                },
              ]}
            />
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold },
                ]}
              >
                Save
              </Text>
            </Pressable>
            {currentOverride != null ? (
              <Pressable
                onPress={() => void handleReset()}
                style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text
                  style={[
                    styles.resetText,
                    { color: theme.color.danger, fontFamily: theme.font.family.sansMedium },
                  ]}
                >
                  Reset to default
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sansMedium }]}>
                Close
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: { marginBottom: 8 },
  body: { fontSize: 13, marginBottom: 16, lineHeight: 19 },
  chipRow: { gap: 8, paddingVertical: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 13 },
  customRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  actions: { marginTop: 20, gap: 8 },
  saveBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveText: { fontSize: 14 },
  resetBtn: { paddingVertical: 12, alignItems: 'center' },
  resetText: { fontSize: 12 },
  closeBtn: { paddingVertical: 10, alignItems: 'center' },
  closeText: { fontSize: 12 },
});
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: typecheck clean, no new lint warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/RestOverrideSheet.tsx
git commit -m "$(cat <<'EOF'
add RestOverrideSheet component

Bottom sheet with preset chips (30/60/90/120/180/240/300s) and
a custom seconds input. Save persists via setOverride; Reset
removes the override (shown only when one exists). Tap-outside
or Close to dismiss. Wired into RestProgressBar in Task 9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: SyncDiagnosticsSheet component

**Files:**
- Create: `src/components/SyncDiagnosticsSheet.tsx`

- [ ] **Step 1: Build the component**

Create `src/components/SyncDiagnosticsSheet.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useQuarantined } from '@/sync/quarantine';
import { runSyncCycle } from '@/sync/engine';
import { getOutboxPreview, relativeAge, type OutboxPreviewRow } from '@/sync/outboxPreview';
import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenQuarantine: () => void;
}

export function SyncDiagnosticsSheet({ visible, onClose, onOpenQuarantine }: Props) {
  const theme = useTheme();
  const sync = useSyncStateLive();
  const quarantined = useQuarantined();
  const [preview, setPreview] = useState<OutboxPreviewRow[]>([]);
  const [syncingNow, setSyncingNow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void getOutboxPreview().then(setPreview);
  }, [visible, sync.pendingOutbox, sync.lastPushedAt, sync.lastPulledAt]);

  const handleForceSync = async () => {
    if (syncingNow) return;
    haptics.light();
    setSyncingNow(true);
    try {
      await runSyncCycle();
    } finally {
      setTimeout(() => setSyncingNow(false), 2000);
    }
  };

  const statusLabel = sync.online
    ? sync.pushInFlight || sync.pullInFlight
      ? 'syncing'
      : 'idle'
    : 'offline';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.color.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.color.bg }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={[
              styles.title,
              {
                color: theme.color.inkHero,
                fontFamily: theme.font.family.sansSemibold,
                fontSize: theme.font.size.title,
                letterSpacing: theme.font.tracking.title,
              },
            ]}
          >
            Sync diagnostics
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            Read-only view of the sync engine's state.
          </Text>

          <ScrollView style={styles.content}>
            <Section label="STATUS" theme={theme}>
              <Row k="State" v={statusLabel} theme={theme} mono />
              <Row k="Last error" v={sync.lastError ?? 'none'} theme={theme} mono />
            </Section>

            <Section label="OUTBOX" theme={theme}>
              <Row k="Pending" v={String(sync.pendingOutbox)} theme={theme} mono />
              <Row k="Quarantined" v={String(quarantined.data?.length ?? 0)} theme={theme} mono />
              {preview.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={[
                      styles.smallLabel,
                      { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
                    ]}
                  >
                    MOST RECENT
                  </Text>
                  {preview.map((row) => (
                    <Text
                      key={row.id}
                      style={[
                        styles.previewRow,
                        { color: theme.color.ink, fontFamily: theme.font.family.mono },
                      ]}
                    >
                      {row.table_name} · {row.op} · {relativeAge(row.created_at)}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Section>

            <Section label="LAST SYNC" theme={theme}>
              <Row k="Pushed" v={sync.lastPushedAt ? relativeAge(sync.lastPushedAt) : 'never'} theme={theme} mono />
              <Row k="Pulled" v={sync.lastPulledAt ? relativeAge(sync.lastPulledAt) : 'never'} theme={theme} mono />
            </Section>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleForceSync()}
              disabled={syncingNow}
              style={({ pressed }) => [
                styles.forceBtn,
                {
                  backgroundColor: theme.color.accent,
                  opacity: pressed ? 0.85 : syncingNow ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.forceText, { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold }]}>
                {syncingNow ? 'Syncing…' : 'Force sync now'}
              </Text>
            </Pressable>
            {(quarantined.data?.length ?? 0) > 0 ? (
              <Pressable
                onPress={onOpenQuarantine}
                style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.linkText, { color: theme.color.danger, fontFamily: theme.font.family.sansMedium }]}>
                  Review quarantined ({quarantined.data?.length ?? 0})
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sansMedium }]}>
                Close
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ label, theme, children }: { label: string; theme: ReturnType<typeof useTheme>; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { borderColor: theme.color.border }]}>
      <Text
        style={[
          styles.sectionLabel,
          { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Row({ k, v, theme, mono }: { k: string; v: string; theme: ReturnType<typeof useTheme>; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowKey, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans }]}>
        {k}
      </Text>
      <Text
        style={[
          styles.rowValue,
          {
            color: theme.color.ink,
            fontFamily: mono ? theme.font.family.mono : theme.font.family.sans,
          },
        ]}
      >
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  title: { marginBottom: 8 },
  body: { fontSize: 13, marginBottom: 16, lineHeight: 19 },
  content: { maxHeight: 380 },
  section: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  smallLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowKey: { fontSize: 12 },
  rowValue: { fontSize: 12 },
  previewRow: { fontSize: 11, paddingVertical: 2 },
  actions: { marginTop: 16, gap: 8 },
  forceBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  forceText: { fontSize: 14 },
  linkBtn: { paddingVertical: 12, alignItems: 'center' },
  linkText: { fontSize: 13 },
  closeBtn: { paddingVertical: 10, alignItems: 'center' },
  closeText: { fontSize: 12 },
});
```

- [ ] **Step 2: Verify `runSyncCycle` export**

Run: `grep -n "export.*runSyncCycle\|^export.*function runSyncCycle" src/sync/engine.ts`

If `runSyncCycle` is not exported, export it. Open `src/sync/engine.ts` and change `async function runSyncCycle` to `export async function runSyncCycle`. (If it's already exported, no change.)

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: typecheck clean. No new lint warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/SyncDiagnosticsSheet.tsx src/sync/engine.ts
git commit -m "$(cat <<'EOF'
add SyncDiagnosticsSheet component

Read-only inspector that surfaces sync state (online/idle/error),
outbox counts (pending + quarantined + most-recent 5 preview),
last push/pull times, with a Force sync now button and a link
to Phase 2's QuarantineSheet when stuck rows exist. Powered by
useSyncStateLive + useQuarantined + getOutboxPreview.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: SyncErrorStripe component

**Files:**
- Create: `src/components/SyncErrorStripe.tsx`

- [ ] **Step 1: Build the component**

Create `src/components/SyncErrorStripe.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { useTheme } from '@/ui/useTheme';

const PULSE_WINDOW_MS = 30_000;
const PERSISTENT_AGE_MS = 5 * 60_000;

export function SyncErrorStripe() {
  const theme = useTheme();
  const sync = useSyncStateLive();
  const opacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const now = Date.now();
    const lastErrorMs = sync.lastErrorAt ? new Date(sync.lastErrorAt).getTime() : null;
    const isRecentError = lastErrorMs !== null && now - lastErrorMs < PULSE_WINDOW_MS;
    const isPersistent = sync.pendingOutbox > 0 && lastErrorMs !== null && now - lastErrorMs > PERSISTENT_AGE_MS;

    // Stop existing loop
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }

    if (isRecentError) {
      // Pulse 0.3 ↔ 0.7
      opacity.setValue(0.3);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.7, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      loopRef.current = loop;
      // Re-evaluate after the pulse window expires
      const t = setTimeout(() => {
        // Force re-render via state read on next tick
        opacity.setValue(0);
      }, PULSE_WINDOW_MS - (now - (lastErrorMs ?? now)));
      return () => clearTimeout(t);
    }

    if (isPersistent) {
      Animated.timing(opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }).start();
      return;
    }

    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [sync.lastErrorAt, sync.pendingOutbox, opacity]);

  useEffect(() => {
    return () => {
      if (loopRef.current) loopRef.current.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.stripe,
        {
          backgroundColor: theme.color.danger,
          opacity,
        },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 100,
  },
});
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: typecheck clean, no new lint warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/SyncErrorStripe.tsx
git commit -m "$(cat <<'EOF'
add SyncErrorStripe component

1px stripe at the top of the screen that pulses danger-colored
(0.3 ↔ 0.7 opacity, 1s cycle) for 30 seconds after a sync error
fires, and stays solid 0.7 opacity when there's a pending outbox
AND the last error is older than 5 minutes. Otherwise hidden.
Complements Phase 2's 24h quarantine banner with an in-the-
moment signal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: SyncIndicator → pressable + open diagnostics

**Files:**
- Modify: `src/ui/SyncIndicator.tsx`

- [ ] **Step 1: Read current SyncIndicator**

Run: `cat src/ui/SyncIndicator.tsx`

- [ ] **Step 2: Wrap in Pressable + render SyncDiagnosticsSheet**

Open `src/ui/SyncIndicator.tsx`. Modify to:

1. Add a `useState` for sheet visibility
2. Wrap the existing pill `<View>` (or whatever the root rendered element is) in a `<Pressable onPress={() => setSheetOpen(true)}>`
3. Render `<SyncDiagnosticsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onOpenQuarantine={...} />` as a sibling

The quarantine open hand-off: when the user taps "Review quarantined" inside the diagnostics sheet, the diagnostics sheet closes AND the QuarantineSheet should open. Coordinate via local state — when `onOpenQuarantine` fires, close the diagnostics sheet AND open the quarantine sheet.

To keep the SyncIndicator self-contained AND avoid recreating the QuarantineSheet in two places, the cleanest approach is to ALSO render the QuarantineSheet from SyncIndicator itself when this path is taken. So SyncIndicator manages two pieces of state: `diagOpen` and `quarOpenFromDiag`.

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';

import { QuarantineSheet } from '@/components/QuarantineSheet';
import { SyncDiagnosticsSheet } from '@/components/SyncDiagnosticsSheet';
import { useQuarantined } from '@/sync/quarantine';
import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { useTheme } from '@/ui/useTheme';

export function SyncIndicator() {
  const theme = useTheme();
  const sync = useSyncStateLive();
  const quarantined = useQuarantined();
  const [diagOpen, setDiagOpen] = useState(false);
  const [quarOpen, setQuarOpen] = useState(false);

  // Existing dot color logic — preserve whatever Phase 1 had
  const dotColor = !sync.online
    ? theme.color.inkTertiary
    : sync.lastError
      ? theme.color.danger
      : theme.color.accent;

  return (
    <>
      <Pressable
        onPress={() => setDiagOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open sync diagnostics"
        style={styles.pill}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      </Pressable>
      <SyncDiagnosticsSheet
        visible={diagOpen}
        onClose={() => setDiagOpen(false)}
        onOpenQuarantine={() => {
          setDiagOpen(false);
          setQuarOpen(true);
        }}
      />
      <QuarantineSheet
        visible={quarOpen}
        rows={quarantined.data ?? []}
        onClose={() => setQuarOpen(false)}
        onChanged={() => {
          // QuarantineSheet's onChanged from Phase 2 expects invalidation.
          // Local refetch is sufficient since useQuarantined refetches on
          // staleTime expiry; force-refetch by re-render.
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
```

(Adjust the pill styling to match whatever the current SyncIndicator renders — preserve the existing visual.)

The `onChanged` for QuarantineSheet typically passes a queryClient invalidator (as Today does it). To keep the indicator self-contained, we can pass an empty function and let `useQuarantined`'s 5s staleTime handle refresh. If that's noticeably slow, expose a refetch via React Query's `quarantined.refetch()`.

Update the onChanged to `() => void quarantined.refetch()`.

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/SyncIndicator.tsx
git commit -m "$(cat <<'EOF'
SyncIndicator now opens sync diagnostics on tap

Wrap the existing dot pill in a Pressable; tap opens
SyncDiagnosticsSheet. The diagnostics sheet's 'Review
quarantined' link closes itself and opens the
QuarantineSheet (also rendered from here for self-
containment). useSyncStateLive subscribes to live state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: RestProgressBar — long-press = override; short-press = skip

**Files:**
- Modify: `src/components/RestProgressBar.tsx`

- [ ] **Step 1: Read current component**

Run: `cat src/components/RestProgressBar.tsx`

Phase 2/3 had `onLongPress = onSkip`. We're flipping that.

- [ ] **Step 2: Add new props and gesture model**

Open `src/components/RestProgressBar.tsx`. Update the `Props` interface to include `onOpenOverride: () => void` and keep `onSkip`.

Change the existing `<Pressable onLongPress={onSkip}>` wrapper to:

```tsx
<Pressable
  onPress={onSkip}
  onLongPress={onOpenOverride}
  delayLongPress={350}
  accessibilityLabel="Tap to skip rest, long-press for rest options"
  style={styles.touch}
>
```

Also fire `haptics.light()` on tap and `haptics.medium()` on long-press to give clear gestural feedback. Add `import { haptics } from '@/ui/haptics';` if not already imported.

Wrap the existing onSkip / onOpenOverride to fire haptics:

```tsx
const handleTap = () => {
  haptics.light();
  onSkip();
};
const handleLongPress = () => {
  haptics.medium();
  onOpenOverride();
};
```

And wire those into the Pressable:
```tsx
<Pressable
  onPress={handleTap}
  onLongPress={handleLongPress}
  ...
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: typecheck FAILS for the WorkoutActive consumer — it doesn't yet pass `onOpenOverride`. That's fixed in Task 10.

To avoid red gates here, make `onOpenOverride` optional in the props:

```tsx
onOpenOverride?: () => void;
```

And in the long-press handler:

```tsx
const handleLongPress = () => {
  if (!onOpenOverride) return;
  haptics.medium();
  onOpenOverride();
};
```

This way the build stays green between Task 9 and Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/components/RestProgressBar.tsx
git commit -m "$(cat <<'EOF'
RestProgressBar: tap to skip, long-press for rest override

Flips Phase 2's gesture model: short tap now skips rest
(was unwired); long-press opens the RestOverrideSheet via
the new onOpenOverride prop (optional for back-compat).
Haptics light on tap, medium on long-press. Wired into
WorkoutActive in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: WorkoutActive — effective rest + override sheet + sync stripe + line-height

**Files:**
- Modify: `src/screens/WorkoutActive.tsx`

This is the integration task — wires together rest overrides, override sheet, sync stripe, and applies line-height tokens.

- [ ] **Step 1: Add imports**

Open `src/screens/WorkoutActive.tsx`. Add at top alongside existing imports:

```tsx
import { useState } from 'react';
import { RestOverrideSheet } from '@/components/RestOverrideSheet';
import { SyncErrorStripe } from '@/components/SyncErrorStripe';
import { effectiveRest, useRestOverrides } from '@/ui/restOverrides';
```

Wait — `useRestOverrides` isn't in the plan. Let me check Task 2... No, Task 2 only exposes `getOverrides`, `setOverride`, `clearOverride`, `effectiveRest`. There's no hook. We need one for WorkoutActive to read live.

Going simpler: WorkoutActive reads overrides on each render via a small useEffect that pulls fresh on focus, stored in local state. Pattern:

```tsx
const [overrides, setOverridesState] = useState<Record<string, number>>({});
useEffect(() => {
  void getOverrides().then(setOverridesState);
}, []); // initial load only
```

When the user saves an override, the RestOverrideSheet calls `onChanged` which re-runs `getOverrides`:

```tsx
const reloadOverrides = useCallback(async () => {
  setOverridesState(await getOverrides());
}, []);
```

- [ ] **Step 2: Wire override state + effective rest**

Inside `WorkoutActiveScreen`, near the other queries, add:

```tsx
const [overrides, setOverridesState] = useState<Record<string, number>>({});
const [overrideSheetOpen, setOverrideSheetOpen] = useState(false);

useEffect(() => {
  void getOverrides().then(setOverridesState);
}, []);

const reloadOverrides = useCallback(async () => {
  setOverridesState(await getOverrides());
}, []);
```

(Add `import { getOverrides } from '@/ui/restOverrides';` to the imports.)

Replace the Phase 3 rest computation:

```tsx
const restSeconds = useMemo(
  () => restForMuscleGroup(currentEx?.muscleGroup ?? null),
  [currentEx?.muscleGroup],
);
```

With:

```tsx
const restSeconds = useMemo(
  () => effectiveRest(overrides, currentEx?.exerciseId ?? '', currentEx?.muscleGroup ?? null),
  [overrides, currentEx?.exerciseId, currentEx?.muscleGroup],
);
```

(The `restForMuscleGroup` import can stay or be removed — `effectiveRest` calls it internally.)

- [ ] **Step 3: Wire onOpenOverride on RestProgressBar**

Find the `<RestProgressBar ... />` invocation. Add `onOpenOverride={() => setOverrideSheetOpen(true)}` prop.

- [ ] **Step 4: Render the RestOverrideSheet**

Near where `<ExercisePicker>` is rendered at the end of the screen, also render:

```tsx
{currentEx ? (
  <RestOverrideSheet
    visible={overrideSheetOpen}
    exerciseId={currentEx.exerciseId}
    exerciseName={currentEx.exerciseName}
    muscleGroup={currentEx.muscleGroup ?? null}
    currentOverride={overrides[currentEx.exerciseId] ?? null}
    onClose={() => setOverrideSheetOpen(false)}
    onChanged={() => void reloadOverrides()}
  />
) : null}
```

- [ ] **Step 5: Render the SyncErrorStripe**

At the very top of the screen's return (inside the `<SafeAreaView>`, before the `<RestProgressBar>`), add:

```tsx
<SyncErrorStripe />
```

The stripe is `position: absolute` with `top: 0`, so it overlays everything. It does NOT push layout.

- [ ] **Step 6: Apply line-height tokens to body prose**

Audit the styles in WorkoutActive.tsx. For any `<Text>` that renders prose (e.g. the "No active workout." empty state, the finish-summary subtitle, error messages), add `lineHeight: theme.font.size.body * theme.font.lineHeightMul.body` to its style. Don't touch micro labels, hero numerals, or single-word buttons.

Specifically update:
- `styles.empty` — add `lineHeight: 20` (body 14 × 1.4)
- `styles.finishBody` — add `lineHeight: 20`
- The "Add your first exercise to begin." text inside the no-exercises block — add `lineHeight: 20`

- [ ] **Step 7: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~162 tests still passing.

- [ ] **Step 8: Commit**

```bash
git add src/screens/WorkoutActive.tsx
git commit -m "$(cat <<'EOF'
WorkoutActive: rest overrides, sync stripe, line-height

Reads override map on mount via getOverrides; restSeconds now
flows through effectiveRest so a per-exercise override wins
over the muscle-group default. Long-press on RestProgressBar
opens RestOverrideSheet; save reloads the override state.
SyncErrorStripe renders at top of screen for in-the-moment
error signal. Body prose now uses theme.font.lineHeightMul.body
for explicit lineHeight.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Today — sync stripe + line-height tokens

**Files:**
- Modify: `src/screens/Today.tsx`

- [ ] **Step 1: Render SyncErrorStripe**

Add `import { SyncErrorStripe } from '@/components/SyncErrorStripe';` to the imports.

Inside the `TodayScreen` return, at the very top of the `<SafeAreaView>` (before all existing content), add:

```tsx
<SyncErrorStripe />
```

- [ ] **Step 2: Apply line-height tokens to body prose**

Audit styles. Add `lineHeight` to body-prose `<Text>` styles where missing:

- `styles.cardEmptyBody` — `lineHeight: 19` (meta 13 × 1.46 ≈ 19)
- `styles.recentEmpty` — `lineHeight: 19`
- Any other body-prose without explicit lineHeight

- [ ] **Step 3: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Today.tsx
git commit -m "$(cat <<'EOF'
Today: SyncErrorStripe at top + line-height tokens on body prose

Renders SyncErrorStripe above all content for in-the-moment
sync error signal. Empty-state bodies and recent-empty messages
now use explicit lineHeight (size × theme.font.lineHeightMul)
instead of RN default 1.2×.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: maybeUpdateAutoTitle + wire into useAddExerciseToWorkout

**Files:**
- Modify: `src/queries/workouts.ts` (add `maybeUpdateAutoTitle` helper)
- Modify: `src/queries/exercises.ts` (call it from `useAddExerciseToWorkout.onSuccess`)

- [ ] **Step 1: Add `maybeUpdateAutoTitle` to workouts.ts**

Open `src/queries/workouts.ts`. Add import:

```ts
import { compositionTitle } from '@/lib/compositionTitle';
```

Add this function (after `updateWorkoutTitle`):

```ts
/**
 * Phase 4: when a workout reaches 3+ exercises and the title is still the
 * default day-of-week, derive a composition title from the exercises'
 * muscle groups and update once. After this, the title is no longer the
 * default so subsequent adds short-circuit and never overwrite.
 */
export async function maybeUpdateAutoTitle(workoutId: string): Promise<void> {
  const db = await getDb();
  const workout = await db.getFirstAsync<{ title: string; started_at: string }>(
    'SELECT title, started_at FROM workouts WHERE id = ? AND deleted_at IS NULL',
    [workoutId],
  );
  if (!workout) return;

  // Only auto-update when title is still the day-of-week default
  if (workout.title !== dayOfWeek(workout.started_at)) return;

  const rows = await db.getAllAsync<{ muscle_group: string | null }>(
    `SELECT e.muscle_group
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       WHERE we.workout_id = ? AND we.deleted_at IS NULL
       ORDER BY we.order_index ASC`,
    [workoutId],
  );

  if (rows.length < 3) return;

  const composed = compositionTitle(rows.map((r) => r.muscle_group));
  if (composed === '' || composed === workout.title) return;

  await updateWorkoutTitle(workoutId, composed);
}
```

(Reuses `dayOfWeek` from `@/lib/dayOfWeek` — already imported from Phase 3.)

- [ ] **Step 2: Wire into useAddExerciseToWorkout**

Open `src/queries/exercises.ts`. Find `useAddExerciseToWorkout`. Update the `onSuccess` callback:

```ts
export function useAddExerciseToWorkout(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addExerciseToWorkout,
    onSuccess: async (_id, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.workouts.withExercises(vars.workoutId) });
      // Phase 4: maybe-update title once we have 3+ exercises and the
      // title is still the day-of-week default
      await maybeUpdateAutoTitle(vars.workoutId);
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to add exercise'),
  });
}
```

Add import: `import { maybeUpdateAutoTitle } from './workouts';`.

- [ ] **Step 3: Add integration test**

Create `src/queries/__tests__/autoTitle.test.ts`:

```ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { addExerciseToWorkout } from '@/queries/exercises';
import { createWorkout, maybeUpdateAutoTitle } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'auto-title-user';
const EX1 = '11111111-1111-1111-1111-111111111111';
const EX2 = '22222222-2222-2222-2222-222222222222';
const EX3 = '33333333-3333-3333-3333-333333333333';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX1, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX2, 'Tricep Pushdown', 'Triceps', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX3, 'Lateral Raise', 'Shoulders', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('maybeUpdateAutoTitle does nothing with fewer than 3 exercises', async () => {
  const wId = await createWorkout({ userId: USER_ID });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX1 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX2 });
  await maybeUpdateAutoTitle(wId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM workouts WHERE id = ?', [wId]);
  // Title is still the day-of-week (unmodified)
  expect(row!.title).not.toContain('+');
});

test('maybeUpdateAutoTitle composes title at 3+ exercises when title is default', async () => {
  const wId = await createWorkout({ userId: USER_ID });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX1 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX2 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX3 });
  await maybeUpdateAutoTitle(wId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM workouts WHERE id = ?', [wId]);
  expect(row!.title).toBe('Chest + Triceps + Shoulders');
});

test('maybeUpdateAutoTitle does not overwrite a user-set title', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'My custom title' });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX1 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX2 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX3 });
  await maybeUpdateAutoTitle(wId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM workouts WHERE id = ?', [wId]);
  expect(row!.title).toBe('My custom title');
});
```

- [ ] **Step 4: Run tests + full gates**

Run: `npm test -- --testPathPattern=autoTitle`

Expected: 3/3 pass.

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~165 tests.

- [ ] **Step 5: Commit**

```bash
git add src/queries/workouts.ts src/queries/exercises.ts src/queries/__tests__/autoTitle.test.ts
git commit -m "$(cat <<'EOF'
auto-compose workout title from exercises at 3rd add

maybeUpdateAutoTitle queries the workout's exercises'
muscle_groups, composes a 'Chest + Triceps + Shoulders'
string, and updates the title IF the title is still the
default day-of-week (i.e. user hasn't edited it). Wired
into useAddExerciseToWorkout.onSuccess so it fires
automatically. 3 integration tests cover the cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Line-height token sweep — remaining files

**Files:**
- Modify: `src/components/CollisionSheet.tsx`
- Modify: `src/components/QuarantineSheet.tsx`
- Modify: `src/components/RepeatCard.tsx`
- Modify: `src/ui/ToastContext.tsx`

- [ ] **Step 1: Apply lineHeight tokens to body prose in each file**

For each of the four files, audit `<Text>` elements that render prose (body, meta sized) and add `lineHeight: size * lineHeightMul.body` (or `.meta`).

Specifically:

**`src/components/CollisionSheet.tsx`**:
- `styles.body` — add `lineHeight: 19` (body 13 × ~1.5 from Phase 3 spec)

**`src/components/QuarantineSheet.tsx`**:
- `styles.body` — add `lineHeight: 19`
- `styles.rowMeta` — already has letter-spacing; add `lineHeight: 14` for readability

**`src/components/RepeatCard.tsx`**:
- `styles.title` — already body-sized; no change needed if it's a single line
- The card's seed list rows — each is short; skip

**`src/ui/ToastContext.tsx`**:
- The toast `Text` style — add `lineHeight: 20` (body 14 × 1.4)

(Read each file first to find the exact style names; apply only where prose is rendered.)

- [ ] **Step 2: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/CollisionSheet.tsx src/components/QuarantineSheet.tsx src/components/RepeatCard.tsx src/ui/ToastContext.tsx
git commit -m "$(cat <<'EOF'
apply line-height tokens to remaining body prose

Sweep across CollisionSheet, QuarantineSheet, RepeatCard,
ToastContext — body-prose <Text> now uses explicit
lineHeight from theme.font.lineHeightMul, replacing RN's
default 1.2×. Phase 4 line-height task complete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Flip spec status to implemented

**Files:**
- Modify: `docs/specs/2026-05-28-uplevel-phase-4-dimensions-design.md`
- Modify: `docs/specs/README.md`

- [ ] **Step 1: Final verification**

Run:
```bash
npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3
git log --oneline main..HEAD | head -20
```

Expected: typecheck clean, lint same baseline, ~165 tests, 13 commits on the branch since `main`.

- [ ] **Step 2: Flip the spec status**

Edit `docs/specs/2026-05-28-uplevel-phase-4-dimensions-design.md` line 3:
`- **Status:** implemented`

Edit `docs/specs/README.md` Phase 4 row:
`| [2026-05-28](2026-05-28-uplevel-phase-4-dimensions-design.md) | Uplevel Phase 4 — Dimensions | implemented |`

- [ ] **Step 3: Final commit**

```bash
git add docs/specs/
git commit -m "$(cat <<'EOF'
flip Phase 4 Dimensions spec to implemented

All five dev-phase-helpful items shipped: SyncDiagnosticsSheet,
per-exercise rest override sheet, composition-derived workout
title, line-height tokens wired into body prose, sync error
stripe. 13 commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Device verification checklist**

- [ ] Tap the SyncIndicator dot → diagnostics sheet opens with current state
- [ ] Force sync now → triggers a cycle, button disabled briefly
- [ ] If quarantined > 0, "Review quarantined" link appears → opens QuarantineSheet
- [ ] During active workout: long-press rest bar → override sheet opens
- [ ] Pick 120s → save → next rest fills over 120s instead of muscle-group default
- [ ] Reset to default → next rest reverts
- [ ] Add a third exercise to a fresh workout → title updates to e.g. "Chest + Triceps + Shoulders"
- [ ] Edit title manually → never auto-overwritten
- [ ] Disable network mid-set, mutate → red stripe pulses at top of screen for ~30s
- [ ] Body prose (empty states, sheets) reads more comfortably (looser line-height)

---

## Self-review checklist (for the implementing engineer)

After all 14 tasks:

```bash
npm run typecheck && npm run lint && npm test
git log --oneline main..HEAD | head -20
```

Expected: 14 commits on `feat/phase-4-dimensions`, all checks green.

Each spec section maps to a task above. The spec calls out 5 deliverables + cross-cutting; all implemented.
