# Uplevel Phase 3 — Restraint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut nine items the audit named as scaffolding/leftover idioms — `+ Add set` button (replaced by auto-stage on completion), 90s hardcoded rest (replaced by muscle-group lookup), `'Workout'` default title (replaced by day-of-week), History tab (demoted to Today header link), dashed border, `SafeAreaView` deprecation, 10pt micro size, low-contrast tertiary ink, and mid-set sync error toasts.

**Architecture:** Pure subtraction + small additive hooks. No schema migrations. No new screens. All changes touch existing files in `src/components/`, `src/screens/`, `src/queries/`, `src/ui/`, and `app/(tabs)/_layout.tsx`. Two new tiny modules (`restDefaults.ts`, `dayOfWeek.ts`, `EditableTitle.tsx`) and one small hook (`useSyncAwareErrorToast`).

**Tech Stack:** Expo 55, React Native 0.83, React 19, expo-router, expo-sqlite, expo-haptics, React Query 5.90, Jest with ts-jest + better-sqlite3 mock.

**Spec:** [docs/specs/2026-05-27-uplevel-phase-3-restraint-design.md](../specs/2026-05-27-uplevel-phase-3-restraint-design.md)

**Testing note:** Same constraint as Phases 1+2 — `jest.setup.js` mocks `react-native`, so JSX cannot be rendered. Logic in pure modules; UI verified on device.

**Branch:** `feat/phase-3-restraint` (already checked out, off `feat/phase-2-trust`).

**Baseline:** 81 tests on Phase 2.

**Commit cadence:** One commit per task. Co-Authored-By footer required.

---

## File map

**New files:**
- `src/ui/restDefaults.ts` — muscle-group → rest seconds lookup
- `src/ui/__tests__/restDefaults.test.ts`
- `src/lib/dayOfWeek.ts` — pure day-name helper
- `src/lib/__tests__/dayOfWeek.test.ts`
- `src/components/EditableTitle.tsx` — tap-to-edit text component
- `src/ui/__tests__/contrast.test.ts` — WCAG audit
- `app/history/index.tsx` — new index route (moved from tabs)

**Modified files:**
- `src/components/activeSet.ts` — add `muscleGroup` field, `findNextExercise` helper
- `src/components/__tests__/activeSet.test.ts` — extend
- `src/ui/typography.ts` — micro 10 → 12
- `src/ui/colors.ts` — bump `inkTertiary` if contrast fails
- `src/queries/exercises.ts` — `addExerciseToWorkout` auto-stages one set
- `src/queries/workouts.ts` — `createWorkout` default title; new `updateWorkoutTitle`
- `src/ui/ToastContext.tsx` — add `useSyncAwareErrorToast`
- `src/components/ActiveSetCard.tsx` — remove `totalSetsInExercise` prop, label change
- `src/screens/WorkoutActive.tsx` — auto-stage on completion, `→ next` header, per-exercise rest, EditableTitle, sync-aware error, SafeAreaView fix, dashed border cut
- `src/screens/Today.tsx` — `→ history` header link, SafeAreaView fix
- `app/(tabs)/_layout.tsx` — remove History tab
- `src/ui/TabIcon.tsx` — remove `history` icon case
- `docs/specs/2026-05-27-uplevel-phase-3-restraint-design.md` — status `implemented`
- `docs/specs/README.md` — index update

**Deleted files:**
- `app/(tabs)/history.tsx` (moved to `app/history/index.tsx`)

---

## Task 1: restForMuscleGroup module + tests (TDD)

**Files:**
- Create: `src/ui/restDefaults.ts`
- Create: `src/ui/__tests__/restDefaults.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/ui/__tests__/restDefaults.test.ts`:

```ts
import { restForMuscleGroup } from '@/ui/restDefaults';

describe('restForMuscleGroup', () => {
  test('compound: chest → 180', () => {
    expect(restForMuscleGroup('Chest')).toBe(180);
  });
  test('compound: back → 180', () => {
    expect(restForMuscleGroup('Back')).toBe(180);
  });
  test('compound: legs → 180', () => {
    expect(restForMuscleGroup('Legs')).toBe(180);
  });
  test('compound: hamstrings → 180', () => {
    expect(restForMuscleGroup('Hamstrings')).toBe(180);
  });
  test('compound: glutes → 180', () => {
    expect(restForMuscleGroup('Glutes')).toBe(180);
  });
  test('medium: shoulders → 90', () => {
    expect(restForMuscleGroup('Shoulders')).toBe(90);
  });
  test('medium: arms → 90', () => {
    expect(restForMuscleGroup('Arms')).toBe(90);
  });
  test('medium: triceps → 90', () => {
    expect(restForMuscleGroup('Triceps')).toBe(90);
  });
  test('medium: calves → 90', () => {
    expect(restForMuscleGroup('Calves')).toBe(90);
  });
  test('isolation: core → 60', () => {
    expect(restForMuscleGroup('Core')).toBe(60);
  });
  test('isolation: abs → 60', () => {
    expect(restForMuscleGroup('Abs')).toBe(60);
  });
  test('isolation: forearms → 60', () => {
    expect(restForMuscleGroup('Forearms')).toBe(60);
  });
  test('case-insensitive: CHEST → 180', () => {
    expect(restForMuscleGroup('CHEST')).toBe(180);
  });
  test('case-insensitive: lEgS → 180', () => {
    expect(restForMuscleGroup('lEgS')).toBe(180);
  });
  test('trimmed: "  chest  " → 180', () => {
    expect(restForMuscleGroup('  chest  ')).toBe(180);
  });
  test('null → 90 (medium default)', () => {
    expect(restForMuscleGroup(null)).toBe(90);
  });
  test('undefined → 90', () => {
    expect(restForMuscleGroup(undefined)).toBe(90);
  });
  test('empty string → 90', () => {
    expect(restForMuscleGroup('')).toBe(90);
  });
  test('unknown muscle group → 90', () => {
    expect(restForMuscleGroup('Earlobe')).toBe(90);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm test -- --testPathPattern=restDefaults`

Expected: FAIL with "Cannot find module '@/ui/restDefaults'".

- [ ] **Step 3: Implement**

Create `src/ui/restDefaults.ts`:

```ts
/**
 * Muscle-group → default rest seconds lookup.
 *
 * Three tiers (Phase 3 — no per-user override yet, no schema column):
 *   180s — compound, larger muscle groups
 *   90s  — medium / generic fallback
 *   60s  — isolation
 *
 * Lookup is case-insensitive and trimmed. Null/empty/unknown falls back to 90s.
 */

const COMPOUND = new Set([
  'chest',
  'back',
  'legs',
  'quads',
  'quadriceps',
  'hamstrings',
  'glutes',
  'posterior',
]);

const ISOLATION = new Set([
  'core',
  'abs',
  'obliques',
  'forearms',
  'grip',
]);

const MEDIUM_DEFAULT = 90;

export function restForMuscleGroup(muscleGroup: string | null | undefined): number {
  if (muscleGroup == null) return MEDIUM_DEFAULT;
  const key = muscleGroup.trim().toLowerCase();
  if (key === '') return MEDIUM_DEFAULT;
  if (COMPOUND.has(key)) return 180;
  if (ISOLATION.has(key)) return 60;
  return MEDIUM_DEFAULT;
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- --testPathPattern=restDefaults`

Expected: 19/19 pass.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: typecheck clean, same pre-existing lint count, ~100 tests (81 baseline + 19 new).

- [ ] **Step 6: Commit**

```bash
git add src/ui/restDefaults.ts src/ui/__tests__/restDefaults.test.ts
git commit -m "$(cat <<'EOF'
add per-exercise rest duration by muscle group

restForMuscleGroup maps Chest/Back/Legs/Hamstrings/Glutes → 180s
(compound), Shoulders/Arms/Calves and friends → 90s (medium /
generic fallback), Core/Abs/Forearms → 60s (isolation). Case-
insensitive, trimmed. No schema change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: dayOfWeek helper + tests (TDD)

**Files:**
- Create: `src/lib/dayOfWeek.ts`
- Create: `src/lib/__tests__/dayOfWeek.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/dayOfWeek.test.ts`:

```ts
import { dayOfWeek } from '@/lib/dayOfWeek';

describe('dayOfWeek', () => {
  // 2026-05-25 is a Monday (verified via JS Date)
  test('Monday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-25T12:00:00Z'))).toBe('Monday');
  });
  test('Tuesday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-26T12:00:00Z'))).toBe('Tuesday');
  });
  test('Wednesday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-27T12:00:00Z'))).toBe('Wednesday');
  });
  test('Thursday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-28T12:00:00Z'))).toBe('Thursday');
  });
  test('Friday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-29T12:00:00Z'))).toBe('Friday');
  });
  test('Saturday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-30T12:00:00Z'))).toBe('Saturday');
  });
  test('Sunday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-31T12:00:00Z'))).toBe('Sunday');
  });
  test('from ISO string', () => {
    expect(dayOfWeek('2026-05-26T12:00:00Z')).toBe('Tuesday');
  });
  test('from epoch ms', () => {
    const tuesdayMs = new Date('2026-05-26T12:00:00Z').getTime();
    expect(dayOfWeek(tuesdayMs)).toBe('Tuesday');
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm test -- --testPathPattern=dayOfWeek`

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/lib/dayOfWeek.ts`:

```ts
/**
 * Day-of-week name for a date input.
 * Used as the default workout title (e.g. "Tuesday") when the user
 * doesn't supply one.
 */
const NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function dayOfWeek(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  const index = d.getDay();
  return NAMES[index]!;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=dayOfWeek`

Expected: 9/9 pass.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~109 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dayOfWeek.ts src/lib/__tests__/dayOfWeek.test.ts
git commit -m "$(cat <<'EOF'
add dayOfWeek helper for default workout titles

Pure function: Date | ISO string | epoch ms → 'Tuesday'.
Used by createWorkout's default title in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: findNextExercise helper + ExerciseShape muscleGroup field

**Files:**
- Modify: `src/components/activeSet.ts`
- Modify: `src/components/__tests__/activeSet.test.ts`

- [ ] **Step 1: Append failing tests**

Open `src/components/__tests__/activeSet.test.ts` and append at end:

```ts
import { findNextExercise } from '@/components/activeSet';

const exWithGroup = (id: string, group: string | null, setIds: string[] = []): ExerciseShape => ({
  id,
  exerciseId: `ex-${id}`,
  exerciseName: `Exercise ${id}`,
  orderIndex: 0,
  muscleGroup: group,
  sets: setIds.map((sid, i) => ({
    id: sid,
    weId: id,
    orderIndex: i,
    weight: 100,
    reps: 5,
    completed: false,
  })),
});

describe('findNextExercise', () => {
  test('returns next exercise', () => {
    const exercises = [exWithGroup('we1', 'Chest'), exWithGroup('we2', 'Back')];
    expect(findNextExercise(exercises, 'we1')).toEqual(exercises[1]);
  });
  test('returns null when on last exercise', () => {
    const exercises = [exWithGroup('we1', 'Chest')];
    expect(findNextExercise(exercises, 'we1')).toBeNull();
  });
  test('returns null when current weId is not found', () => {
    const exercises = [exWithGroup('we1', 'Chest')];
    expect(findNextExercise(exercises, 'ghost')).toBeNull();
  });
  test('skips no exercises (all returned)', () => {
    const exercises = [
      exWithGroup('we1', 'Chest'),
      exWithGroup('we2', 'Back'),
      exWithGroup('we3', 'Legs'),
    ];
    expect(findNextExercise(exercises, 'we1')?.id).toBe('we2');
    expect(findNextExercise(exercises, 'we2')?.id).toBe('we3');
    expect(findNextExercise(exercises, 'we3')).toBeNull();
  });
});

describe('ExerciseShape includes muscleGroup', () => {
  test('muscleGroup field is part of the shape', () => {
    const ex = exWithGroup('we1', 'Chest');
    expect(ex.muscleGroup).toBe('Chest');
  });
  test('muscleGroup can be null', () => {
    const ex = exWithGroup('we1', null);
    expect(ex.muscleGroup).toBeNull();
  });
});
```

(The existing `ex()` helper at the top of the file does NOT set `muscleGroup` — that's fine; the helper is used in older tests and `muscleGroup` can be optional in those, or we add `muscleGroup: null` to the existing helper. To avoid touching existing tests, the implementation should accept `muscleGroup` as optional on the type and the helper omits it.)

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- --testPathPattern=activeSet`

Expected: existing 5 tests pass; new tests FAIL ("findNextExercise is not a function" + "Property 'muscleGroup' does not exist on type 'ExerciseShape'").

- [ ] **Step 3: Implement**

Read current `src/components/activeSet.ts`. Find the `ExerciseShape` interface (~line 18) and add:

```ts
export interface ExerciseShape {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  muscleGroup?: string | null; // optional for backwards-compat; Phase 3+ populates it
  sets: SetShape[];
}
```

At the end of the file, append:

```ts
export function findNextExercise(
  exercises: ExerciseShape[],
  currentWeId: string,
): ExerciseShape | null {
  const idx = exercises.findIndex((e) => e.id === currentWeId);
  if (idx === -1) return null;
  if (idx + 1 >= exercises.length) return null;
  return exercises[idx + 1] ?? null;
}
```

Also update the existing `ex()` test helper at the top of `activeSet.test.ts` to include `muscleGroup: null` (so the existing tests still typecheck cleanly):

Open `src/components/__tests__/activeSet.test.ts` and change the `ex` helper's return object to:

```ts
const ex = (id: string, setIds: string[]): ExerciseShape => ({
  id,
  exerciseId: `ex-${id}`,
  exerciseName: `Exercise ${id}`,
  orderIndex: 0,
  muscleGroup: null,
  sets: setIds.map((sid, i) => ({
    id: sid,
    weId: id,
    orderIndex: i,
    weight: 100,
    reps: 5,
    completed: false,
  })),
});
```

(Since `muscleGroup` is optional, technically existing tests don't need the change. But explicit is better.)

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=activeSet`

Expected: all existing + new tests pass (5 existing + 6 new = 11 total in this file).

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. **Important:** the `ExerciseShape` change ripples to `WorkoutActive.tsx`'s mapper. Verify by running typecheck — the mapper destructures `exercise?.name` and similar; `muscleGroup` is optional so existing code keeps compiling. The mapper UPDATE to pass `muscleGroup: we.exercise?.muscle_group ?? null` happens in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/components/activeSet.ts src/components/__tests__/activeSet.test.ts
git commit -m "$(cat <<'EOF'
add findNextExercise + muscleGroup field to ExerciseShape

findNextExercise returns the exercise immediately after a given
weId in the list, or null. Used by Task 10's '→ next' button.
muscleGroup field on ExerciseShape (optional for back-compat)
will be wired to exercise.muscle_group in Task 10 and consumed
by the per-exercise rest timer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Contrast audit test + bump inkTertiary if needed

**Files:**
- Create: `src/ui/__tests__/contrast.test.ts`
- Possibly modify: `src/ui/colors.ts`

- [ ] **Step 1: Write the audit test**

Create `src/ui/__tests__/contrast.test.ts`:

```ts
import { darkPalette, lightPalette, type PaletteTokens } from '@/ui/colors';

// WCAG relative luminance — sRGB
function luminance(hex: string): number {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const adj = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * adj(r) + 0.7152 * adj(g) + 0.0722 * adj(b);
}

function contrast(a: string, b: string): number {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

interface Pair {
  paletteName: string;
  ink: keyof PaletteTokens;
  bg: keyof PaletteTokens;
  minRatio: number;
}

const palettes: { name: string; tokens: PaletteTokens }[] = [
  { name: 'dark', tokens: darkPalette },
  { name: 'light', tokens: lightPalette },
];

// Body-sized text (normal) requires 4.5:1.
// Large text (18pt+ regular, or 14pt+ bold) requires 3.0:1.
// inkTertiary is used for hints / micro labels; we hold it to 3.0 (treats as large).
const BODY_RATIO = 4.5;
const LARGE_RATIO = 3.0;

const pairs: Pair[] = palettes.flatMap(({ name, tokens: _ }) => [
  { paletteName: name, ink: 'ink', bg: 'bg', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'ink', bg: 'surface', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkSecondary', bg: 'bg', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkSecondary', bg: 'surface', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkTertiary', bg: 'bg', minRatio: LARGE_RATIO },
  { paletteName: name, ink: 'inkTertiary', bg: 'surface', minRatio: LARGE_RATIO },
  { paletteName: name, ink: 'inkHero', bg: 'bg', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkHero', bg: 'surface', minRatio: BODY_RATIO },
]);

describe('palette contrast (WCAG)', () => {
  for (const p of pairs) {
    const tokens = palettes.find((x) => x.name === p.paletteName)!.tokens;
    const ratio = contrast(tokens[p.ink], tokens[p.bg]);
    test(`${p.paletteName}: ${p.ink} on ${p.bg} >= ${p.minRatio}`, () => {
      expect(ratio).toBeGreaterThanOrEqual(p.minRatio);
    });
  }
});
```

- [ ] **Step 2: Run — see which fail**

Run: `npm test -- --testPathPattern=contrast`

Expected: most pairs pass; some may fail. Capture the failures.

Likely failures (based on Phase 1 audit prediction):
- `dark: inkTertiary on bg` — `#5E6862` on `#0F1411` is ~4.4:1. Held to 3.0:1 → PASS.
- `light: inkTertiary on bg` — `#9CA39E` on `#F4F1EB` is ~3.0:1. Held to 3.0 → MARGINAL.

Run and see. If all pass, skip to Step 4. If any fail, continue to Step 3.

- [ ] **Step 3: Bump failing tokens**

If `light: inkTertiary on bg` (or any other pair) fails, open `src/ui/colors.ts` and bump the failing token.

For `lightPalette.inkTertiary`: bump from `#9CA39E` to `#7E847F` (darker, more contrast). Test calc: contrast(`#7E847F`, `#F4F1EB`) ≈ 4.0:1. Passes 3.0 with margin.

For `darkPalette.inkTertiary`: if it's failing 3.0 on `#0F1411`, bump from `#5E6862` to `#727B75` (lighter, more contrast).

Apply only the bumps needed. Re-run `npm test -- --testPathPattern=contrast` until all pass.

- [ ] **Step 4: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; tests ~126.

- [ ] **Step 5: Commit**

```bash
git add src/ui/__tests__/contrast.test.ts src/ui/colors.ts
git commit -m "$(cat <<'EOF'
add WCAG contrast audit; bump inkTertiary if needed

Programmatic check of every (ink × bg) pair in both palettes.
Body-text tokens held to 4.5:1, tertiary (hint/micro) tokens
held to 3.0:1. Any failing tokens are bumped inline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Bump micro size 10 → 12

**Files:**
- Modify: `src/ui/typography.ts`

- [ ] **Step 1: Apply the bump**

Open `src/ui/typography.ts`. Find the `fontSize` object:

```ts
export const fontSize = {
  hero: 82,
  display: 28,
  title: 20,
  card: 16,
  body: 14,
  meta: 12,
  micro: 10,
} as const;
```

Change `micro: 10` → `micro: 12`:

```ts
export const fontSize = {
  hero: 82,
  display: 28,
  title: 20,
  card: 16,
  body: 14,
  meta: 12,
  micro: 12,
} as const;
```

(Yes, `meta` and `micro` are now both 12. They're used for different semantic purposes — keep both for the typography contract.)

- [ ] **Step 2: Run full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. No tests reference micro size; no consumer breakage.

- [ ] **Step 3: Commit**

```bash
git add src/ui/typography.ts
git commit -m "$(cat <<'EOF'
bump micro size 10 → 12 for one-handed gym legibility

10pt was too small to glance-read at arm's length. Cascades
to every UPPERCASE micro label across the app (EXERCISE,
SET N, RECENT, LAST WORKOUT, etc.).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: addExerciseToWorkout auto-stages one set

**Files:**
- Modify: `src/queries/exercises.ts`

- [ ] **Step 1: Read current `addExerciseToWorkout`**

Run: `cat src/queries/exercises.ts | head -120`

Confirm `addExerciseToWorkout({ workoutId, exerciseId })` returns `Promise<string>` (the new weId) and uses an internal transaction.

- [ ] **Step 2: Modify to also stage one empty set**

Open `src/queries/exercises.ts`. At the top, add an import for `addSet`:

```ts
import { addSet } from '@/queries/sets';
```

Find the `addExerciseToWorkout` function. AFTER the `void triggerPush();` line at the end of the function, BEFORE the `return id;`, add:

```ts
  // Phase 3: every exercise starts with one empty set staged so the user
  // never sees an empty card. Auto-stage on completion handles subsequent.
  await addSet(id);
```

The return remains `return id;` (the workout_exercise id, NOT the set id).

Final function tail looks like:

```ts
  void triggerPush();
  // Phase 3: every exercise starts with one empty set staged so the user
  // never sees an empty card. Auto-stage on completion handles subsequent.
  await addSet(id);
  return id;
}
```

- [ ] **Step 3: Run full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. The `repeatLastWorkout` integration test already exercises `addExerciseToWorkout` indirectly via creating + finishing a workout; verify it still passes.

If any existing test now fails because it expected `addExerciseToWorkout` to NOT create a set (e.g. asserting set count == 0 after only adding an exercise), update the test to assert `== 1`. This is expected behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/queries/exercises.ts
git commit -m "$(cat <<'EOF'
auto-stage one set when adding an exercise to a workout

Every exercise now starts with one empty set ready to log.
Eliminates the 'empty exercise card' state and supports the
Phase 3 auto-stage-on-completion model — the user never has
to think about row creation, just lifting.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: createWorkout default title = dayOfWeek

**Files:**
- Modify: `src/queries/workouts.ts`

- [ ] **Step 1: Read current `createWorkout`**

Run: `grep -A 20 "export async function createWorkout" src/queries/workouts.ts | head -25`

Confirm the default `title: args.title ?? 'Workout'` line.

- [ ] **Step 2: Change default to dayOfWeek**

Open `src/queries/workouts.ts`. Add import:

```ts
import { dayOfWeek } from '@/lib/dayOfWeek';
```

Find the `createWorkout` function. Change the `title` line in the payload from:

```ts
title: args.title ?? 'Workout',
```

To:

```ts
title: args.title ?? dayOfWeek(startedAt),
```

(`startedAt` is already declared above as `nowIso()`.)

- [ ] **Step 3: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. The existing `offline-workout.test.ts` uses `createWorkout({ userId: USER_ID })` (no title) — that test now sees a day name instead of 'Workout'. Verify the test doesn't assert against the title value; if it does, update.

Run: `grep -n "title" src/__tests__/offline-workout.test.ts`

If a test asserts `title === 'Workout'`, change to a less strict check (assert title is non-empty, or `expect(workout.title).toMatch(/^[A-Z][a-z]+/)`).

- [ ] **Step 4: Commit**

```bash
git add src/queries/workouts.ts src/__tests__/offline-workout.test.ts
git commit -m "$(cat <<'EOF'
default workout title to day name instead of 'Workout'

createWorkout without explicit title now uses dayOfWeek(startedAt)
('Tuesday', 'Wednesday', etc.) instead of the generic 'Workout'.
User can override by passing title explicitly or editing via the
EditableTitle component (next task).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Only stage `offline-workout.test.ts` if you actually had to update it.)

---

## Task 8: updateWorkoutTitle mutation + EditableTitle component

**Files:**
- Modify: `src/queries/workouts.ts` (add `updateWorkoutTitle`)
- Create: `src/components/EditableTitle.tsx`

- [ ] **Step 1: Add `updateWorkoutTitle` mutation**

Open `src/queries/workouts.ts`. After `finishWorkout`, add:

```ts
export async function updateWorkoutTitle(workoutId: string, title: string): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'update',
    rowId: workoutId,
    payload: { title },
  });
  void triggerPush();
}

export function useUpdateWorkoutTitle(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { workoutId: string; title: string }) =>
      updateWorkoutTitle(args.workoutId, args.title),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to rename workout'),
  });
}
```

- [ ] **Step 2: Build EditableTitle component**

Create `src/components/EditableTitle.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { useTheme } from '@/ui/useTheme';

interface Props {
  value: string;
  onCommit: (next: string) => void;
}

export function EditableTitle({ value, onCommit }: Props) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== '' && trimmed !== value) {
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        autoFocus
        returnKeyType="done"
        style={[
          styles.input,
          {
            color: theme.color.ink,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      />
    );
  }

  return (
    <Pressable onPress={start} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit title">
      <Text
        style={[
          styles.text,
          {
            color: theme.color.ink,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      >
        {value.toLowerCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  input: {
    fontSize: 14,
    letterSpacing: -0.1,
    minWidth: 100,
    paddingVertical: 0,
  },
});
```

(The lowercase rendering matches the brutalist-lifter chrome — Today's nav title is also lowercase in Phase 1's design.)

- [ ] **Step 3: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/queries/workouts.ts src/components/EditableTitle.tsx
git commit -m "$(cat <<'EOF'
add updateWorkoutTitle mutation + EditableTitle component

updateWorkoutTitle goes through the standard enqueueMutation +
triggerPush path. EditableTitle renders the title in nav-style
chrome with tap-to-edit; commit on blur/submit. Wires into the
WorkoutActive header in Task 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: useSyncAwareErrorToast hook + isSyncError helper

**Files:**
- Modify: `src/ui/ToastContext.tsx`

- [ ] **Step 1: Read current ToastContext**

Run: `cat src/ui/ToastContext.tsx`

Find `useToast()` and the toast type. Confirm `showToast(msg, severity)` signature.

- [ ] **Step 2: Add hook and helper**

Open `src/ui/ToastContext.tsx`. At the end of the file (after the existing exports), add:

```ts
// Phase 3: pattern-match common transient sync/network failures.
// These are surfaced via the SyncIndicator pill; toasting them during
// active workout flow is noise that pulls attention off the lift.
const SYNC_ERROR_PATTERNS = [
  'network',
  'timeout',
  'fetch',
  'failed to fetch',
  'pushoutbox',
  'pulloutbox',
  'econn',
  'enotfound',
  'jwt',
];

export function isSyncError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return SYNC_ERROR_PATTERNS.some((p) => lower.includes(p));
}

export function useSyncAwareErrorToast() {
  const { showToast } = useToast();
  return useCallback(
    (msg: string) => {
      if (isSyncError(msg)) return;
      showToast(msg, 'error');
    },
    [showToast],
  );
}
```

You'll need `useCallback` from React; add to imports if not present.

Optional: write a quick unit test for `isSyncError` to document expected matching. Add to `src/ui/__tests__/syncErrors.test.ts`:

```ts
import { isSyncError } from '@/ui/ToastContext';

describe('isSyncError', () => {
  test('network error', () => {
    expect(isSyncError('Network request failed')).toBe(true);
  });
  test('fetch error', () => {
    expect(isSyncError('Failed to fetch')).toBe(true);
  });
  test('econn error', () => {
    expect(isSyncError('ECONNREFUSED')).toBe(true);
  });
  test('case-insensitive', () => {
    expect(isSyncError('TIMEOUT')).toBe(true);
  });
  test('user-facing validation NOT a sync error', () => {
    expect(isSyncError('Failed to add exercise')).toBe(false);
  });
  test('exercise-not-found NOT a sync error', () => {
    expect(isSyncError('Exercise not found')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --testPathPattern=syncErrors`

Expected: 6/6 pass.

Full gates: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: ~132 tests.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ToastContext.tsx src/ui/__tests__/syncErrors.test.ts
git commit -m "$(cat <<'EOF'
add isSyncError + useSyncAwareErrorToast for active-workout flow

Pattern-matches common transient network/sync errors against a
short allow-list. useSyncAwareErrorToast returns an onError
callback that silently drops sync-class errors (SyncIndicator
already shows them) while letting user-facing errors through.

Today screen keeps using the unfiltered toastError; only the
active workout flow switches in Task 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: WorkoutActive integration — the big one

**Files:**
- Modify: `src/components/ActiveSetCard.tsx`
- Modify: `src/screens/WorkoutActive.tsx`

This task combines:
- Remove `totalSetsInExercise` from ActiveSetCard prop interface; change label from `SET N OF M` → `SET N`
- Map `muscleGroup` into `ExerciseShape` mapper
- Per-exercise rest target via `restForMuscleGroup`
- Auto-stage next set on completion (mutation: insert a new set with copied weight/reps; advance cursor)
- `→ next` header button (next exercise / finish workout)
- `EditableTitle` in the header
- Remove `+ Add set` button from footer
- Cut dashed border on `+ Add exercise`
- Switch `useToast` → `useSyncAwareErrorToast` for the active screen
- Fix `SafeAreaView` import

- [ ] **Step 1: Update ActiveSetCard**

Read current `src/components/ActiveSetCard.tsx`. Apply these changes:

a. Remove `totalSetsInExercise` from the `Props` interface and destructuring:

```tsx
interface Props {
  exercise: ExerciseShape;
  set: SetShape;
  exerciseIndex: number;
  totalExercises: number;
  setIndex: number;
  // REMOVE: totalSetsInExercise: number;
  weightStep: number;
  weightUnit: 'LB' | 'KG';
  isLastSetOfExercise: boolean;
  ghostSets: SetShape[];
  onChangeWeight: (next: number | null) => void;
  onChangeReps: (next: number | null) => void;
  onComplete: () => void;
}
```

b. Find the set label text rendering (probably `<Text style={labelStyle}>SET {setIndex} OF {totalSetsInExercise}</Text>`) and change to:

```tsx
<Text style={labelStyle}>SET {setIndex}</Text>
```

c. Also remove `isLastSetOfExercise` parameter handling for haptics if it's no longer meaningful. Actually the auto-stage model still uses it — `medium` haptic when we're crossing to next exercise. But with auto-stage that distinction blurs. Resolution: drop the `isLastSetOfExercise` prop entirely; always fire `haptics.light()` on completion. The `→ next` button when explicitly used fires `haptics.medium()`.

Remove `isLastSetOfExercise` from Props and from `handleComplete`'s haptic branch:

```tsx
const handleComplete = useCallback(() => {
  if (!canComplete) return;
  haptics.light();
  onComplete();
}, [canComplete, onComplete]);
```

- [ ] **Step 2: Read current WorkoutActive.tsx end-to-end**

Run: `cat src/screens/WorkoutActive.tsx`

- [ ] **Step 3: Apply integration changes to WorkoutActive.tsx**

Update imports — add:

```tsx
import { SafeAreaView } from 'react-native-safe-area-context'; // moved from react-native
import { Alert } from 'react-native'; // ensure Alert is imported

import { EditableTitle } from '@/components/EditableTitle';
import { findNextExercise } from '@/components/activeSet';
import { restForMuscleGroup } from '@/ui/restDefaults';
import { useSyncAwareErrorToast } from '@/ui/ToastContext';
import { addSet } from '@/queries/sets';
import { useUpdateWorkoutTitle } from '@/queries/workouts';
```

Remove the existing `import { SafeAreaView } from 'react-native'` if present.

Inside `WorkoutActiveScreen`:

a. Replace `const toastError = useCallback(...)` (the `useToast`-based one) with:

```tsx
const syncAwareError = useSyncAwareErrorToast();
const toastError = useCallback((msg: string) => syncAwareError(msg), [syncAwareError]);
```

(Existing mutations consume `toastError`; this change makes them sync-aware silently.)

b. Add the title update mutation:

```tsx
const updateTitle = useUpdateWorkoutTitle(toastError);
```

c. Update the `ExerciseShape` mapper to include `muscleGroup`:

Find the `exercises = useMemo(...)` block. Update each mapped item:

```tsx
const exercises: ExerciseShape[] = useMemo(() => {
  if (!detail.data) return [];
  return detail.data.exercises.map((we) => ({
    id: we.id,
    exerciseId: we.exercise_id,
    exerciseName: we.exercise?.name ?? 'Unknown exercise',
    orderIndex: we.order_index,
    muscleGroup: we.exercise?.muscle_group ?? null,
    sets: (we.sets ?? []).map((s) => ({
      id: s.id,
      weId: we.id,
      orderIndex: s.order_index,
      weight: s.weight,
      reps: s.reps,
      completed: Boolean(s.completed),
    })),
  }));
}, [detail.data]);
```

d. Add per-exercise rest derivation:

```tsx
const currentEx = cursor ? findExercise(exercises, cursor.weId) : null;
const restSeconds = useMemo(
  () => restForMuscleGroup(currentEx?.muscleGroup ?? null),
  [currentEx?.muscleGroup],
);
const timer = useRestTimer({ targetSeconds: restSeconds });
```

(Replace the existing `const timer = useRestTimer({ targetSeconds: 90 });`.)

e. Update `onComplete` to auto-stage instead of `advanceCursor`:

```tsx
const onComplete = useCallback(async () => {
  if (!cursor) return;
  // Mark the current set complete
  updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { completed: true } });
  timer.start();
  // Auto-stage the next set with the same weight × reps (Phase 3)
  const currentSetData = currentEx && findSet(currentEx, cursor.setId);
  const newSetId = await addSet(cursor.weId, {
    weight: currentSetData?.weight ?? null,
    reps: currentSetData?.reps ?? null,
  });
  setCursor({ weId: cursor.weId, setId: newSetId });
}, [cursor, currentEx, updateSet, timer]);
```

Note: `addSet(weId, { weight, reps })` — confirm the signature in `src/queries/sets.ts` accepts these (it does — Phase 1 verified this).

f. Add `→ next` / `finish →` header button. In the existing `screenOptions` useMemo, change:

```tsx
const onNextExercise = useCallback(() => {
  if (!cursor || !currentEx) return;
  const nextEx = findNextExercise(exercises, cursor.weId);
  const currentSet = findSet(currentEx, cursor.setId);
  const isUnmodified = !currentSet || (currentSet.weight == null && currentSet.reps == null);
  const advance = async () => {
    if (nextEx) {
      // Find or stage first set of next exercise
      let nextSetId = nextEx.sets[0]?.id;
      if (!nextSetId) {
        nextSetId = await addSet(nextEx.id);
      }
      setCursor({ weId: nextEx.id, setId: nextSetId });
      haptics.medium();
    } else {
      setCursor(null); // → finish summary
      haptics.medium();
    }
  };
  if (isUnmodified) {
    void advance();
  } else {
    Alert.alert('Skip this set?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Skip', style: 'destructive', onPress: () => void advance() },
    ]);
  }
}, [cursor, currentEx, exercises]);

const hasNextExercise = currentEx ? findNextExercise(exercises, currentEx.id) !== null : false;
const nextLabel = hasNextExercise ? 'next →' : 'finish →';

const screenOptions = useMemo(
  () => ({
    headerTitle: () => (
      <EditableTitle
        value={(activeQuery.data?.title || dayOfWeek(new Date())).toString()}
        onCommit={(next) => {
          if (activeQuery.data) {
            updateTitle.mutate({ workoutId: activeQuery.data.id, title: next });
          }
        }}
      />
    ),
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {cursor ? (
          <Pressable onPress={onNextExercise} hitSlop={8} accessibilityRole="button">
            <Text
              style={{
                color: theme.color.accent,
                fontFamily: theme.font.family.sansMedium,
                fontSize: 13,
              }}
            >
              {nextLabel}
            </Text>
          </Pressable>
        ) : null}
        <SyncIndicator />
      </View>
    ),
  }),
  [activeQuery.data, cursor, nextLabel, onNextExercise, theme, updateTitle],
);
```

Add the import `import { haptics } from '@/ui/haptics';` and `import { dayOfWeek } from '@/lib/dayOfWeek';` if not present.

g. Remove the `+ Add set` button from the footer. Find:

```tsx
<View style={styles.footerActions}>
  <Pressable onPress={onAddSet} ...>
    <Text>+ Add set</Text>
  </Pressable>
  <Pressable onPress={() => setPickerOpen(true)} ...>
    <Text>+ Add exercise</Text>
  </Pressable>
</View>
```

Replace with just the `+ Add exercise` link (no dashed border, plain text):

```tsx
<View style={styles.footerActions}>
  <Pressable
    onPress={() => setPickerOpen(true)}
    style={({ pressed }) => [styles.addExercise, { opacity: pressed ? 0.7 : 1 }]}
  >
    <Text
      style={{
        color: theme.color.accent,
        fontFamily: theme.font.family.sansMedium,
        fontSize: theme.font.size.body,
      }}
    >
      + Add exercise
    </Text>
  </Pressable>
</View>
```

Update `styles.addExercise` to remove `borderStyle: 'dashed'`:

```tsx
addExercise: {
  paddingVertical: theme.space.s3,
  alignItems: 'center',
},
```

Remove `styles.footerActions`'s `flexDirection: 'row'` / `gap: 8` if it was setup for two buttons — make it a column with just one. Actually simplest: drop the wrapper:

```tsx
<Pressable
  onPress={() => setPickerOpen(true)}
  style={({ pressed }) => [styles.addExercise, { opacity: pressed ? 0.7 : 1, marginTop: theme.space.s4 }]}
>
  <Text ...>+ Add exercise</Text>
</Pressable>
```

Remove the now-unused `onAddSet` callback declaration entirely (it's no longer wired).

h. Update the props passed to `<ActiveSetCard />`:

```tsx
<ActiveSetCard
  key={currentSet.id}
  exercise={currentEx}
  set={currentSet}
  exerciseIndex={currentExIdx + 1}
  totalExercises={exercises.length}
  setIndex={currentSetIdx + 1}
  // REMOVED: totalSetsInExercise={currentEx.sets.length}
  // REMOVED: isLastSetOfExercise={isLastSetOfExercise}
  weightStep={5}
  weightUnit="LB"
  ghostSets={ghostSets}
  onChangeWeight={onChangeWeight}
  onChangeReps={onChangeReps}
  onComplete={onComplete}
/>
```

i. Remove the `isLastSetOfExercise` local variable if it's only used here.

- [ ] **Step 4: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. The test count stays the same (~132). No tests in `src/__tests__/` directly poke ActiveSetCard JSX; the cursor advance machinery still works via `findInitialCursor` + `findNextExercise`.

If typecheck complains about the `EditableTitle` value type (string vs string | undefined), use `?? ''` or similar safe fallback.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActiveSetCard.tsx src/screens/WorkoutActive.tsx
git commit -m "$(cat <<'EOF'
auto-stage on completion, per-exercise rest, editable title

The big Phase 3 integration. Replaces the linear-with-pre-staging
model with auto-stage-on-completion: completing a set inserts a
new empty set (same weight × reps) and advances the cursor.
Removes + Add set button entirely. New '→ next' header button
explicitly advances exercises (Alert if current set unmodified).
Per-exercise rest seconds derived from exercise.muscle_group via
the Phase 3 lookup. Workout title is editable via EditableTitle
in the header (tap-to-edit; defaults to day-of-week from
createWorkout). Drops the dashed border on + Add exercise. Sync
errors no longer toast during active workout (use SyncAware
hook). SafeAreaView migrated to react-native-safe-area-context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Today header `→ history` link + SafeAreaView fix

**Files:**
- Modify: `src/screens/Today.tsx`

- [ ] **Step 1: Apply changes**

Open `src/screens/Today.tsx`.

a. Fix `SafeAreaView` import. Change:
```ts
import { SafeAreaView, ScrollView, ... } from 'react-native';
```
to:
```ts
import { ScrollView, ... } from 'react-native'; // (without SafeAreaView)
import { SafeAreaView } from 'react-native-safe-area-context';
```

b. Add a `→ history` link in the top of the Today screen. Find the greeting + title block at the top of the scroll content. ABOVE the greeting `<Text>`, add a small right-aligned row:

```tsx
<View style={styles.topRow}>
  <Pressable onPress={() => router.push('/history')} hitSlop={8} accessibilityRole="button">
    <Text
      style={[
        styles.historyLink,
        { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
      ]}
    >
      history →
    </Text>
  </Pressable>
</View>
```

Add to `styles`:

```ts
topRow: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  paddingHorizontal: theme.space.page,
  paddingTop: theme.space.s2,
},
historyLink: {
  fontSize: 12,
  letterSpacing: 0.2,
},
```

(Note `router.push('/history')` — this route is created in Task 12.)

- [ ] **Step 2: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. Typed routes may complain about `'/history'` since the file doesn't exist yet (Task 12 creates it). Cast as a workaround: `router.push('/history' as never)`. We'll revert the cast at the end of Phase 3 once typed routes regenerate.

- [ ] **Step 3: Commit**

```bash
git add src/screens/Today.tsx
git commit -m "$(cat <<'EOF'
add → history link to Today header; fix SafeAreaView import

Small right-aligned link 'history →' at the top of Today routes
to /history (created in next task). Replaces the History tab as
the discovery surface. SafeAreaView import migrated from
react-native to react-native-safe-area-context (deprecation
cleanup).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Remove History tab; move history.tsx → app/history/index.tsx

**Files:**
- Delete: `app/(tabs)/history.tsx`
- Create: `app/history/index.tsx`
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `src/ui/TabIcon.tsx`
- Modify: `src/screens/Today.tsx` (remove the `as never` cast if added in Task 11)

- [ ] **Step 1: Read current `app/(tabs)/history.tsx`**

Run: `cat 'app/(tabs)/history.tsx'`

- [ ] **Step 2: Move the file**

```bash
mkdir -p app/history
git mv 'app/(tabs)/history.tsx' app/history/index.tsx
```

(`git mv` preserves history.)

- [ ] **Step 3: Update `app/(tabs)/_layout.tsx`**

Read it first: `cat 'app/(tabs)/_layout.tsx'`

Remove the History tab declaration. The exact code depends on the file structure, but it'll be a `<Tabs.Screen name="history" ... />` line. Delete it.

If `TabIcon` cases include `'history'`, that's handled in Step 4.

- [ ] **Step 4: Update `src/ui/TabIcon.tsx`**

Read it: `cat src/ui/TabIcon.tsx`

Remove the `case 'history':` branch from the switch. The branch is the three-lines list icon.

- [ ] **Step 5: Remove the `as never` cast in Today.tsx (if added)**

If Task 11 used `router.push('/history' as never)`, revert to `router.push('/history')`. Typed routes should now resolve to the new `app/history/index.tsx`.

If it still complains, leave the cast — typed routes regenerate on next build.

- [ ] **Step 6: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. Existing `app/history/[id].tsx` still works for detail.

- [ ] **Step 7: Commit**

```bash
git add app/ src/ui/TabIcon.tsx src/screens/Today.tsx
git commit -m "$(cat <<'EOF'
demote History from primary tab nav to /history route

Move app/(tabs)/history.tsx to app/history/index.tsx (preserved
via git mv). Remove the History tab from (tabs)/_layout.tsx and
the 'history' case from TabIcon. Nav drops from 4 to 3 tabs
(today, progress, profile). History is accessed via Today's
new '→ history' header link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Flip spec status to implemented

**Files:**
- Modify: `docs/specs/2026-05-27-uplevel-phase-3-restraint-design.md`
- Modify: `docs/specs/README.md`

- [ ] **Step 1: Final verification**

Run:
```bash
npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3
git log --oneline main..HEAD | head -25
```

Expected:
- typecheck clean
- lint count same as pre-Phase-3 baseline (no new warnings from our files)
- ~132 tests pass
- Phase 3's 12 commits visible on top of Phase 2's commits

- [ ] **Step 2: Flip the spec status**

Edit `docs/specs/2026-05-27-uplevel-phase-3-restraint-design.md` line 3:
```
- **Status:** implemented
```

Edit `docs/specs/README.md` Phase 3 row:
```
| [2026-05-27](2026-05-27-uplevel-phase-3-restraint-design.md) | Uplevel Phase 3 — Restraint | implemented |
```

- [ ] **Step 3: Final commit**

```bash
git add docs/specs/
git commit -m "$(cat <<'EOF'
flip Phase 3 Restraint spec to implemented

All nine cuts shipped: auto-stage on completion (no +Add set),
per-exercise rest by muscle group, day-of-week default title,
History tab demoted to Today header link, dashed border removed,
SafeAreaView migrated, micro size bumped, contrast audit + ink
fixes, sync error toasts suppressed during active workout. 12
commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Manual device verification checklist**

Smoke test after reload:

- [ ] New workout (no title) → header shows the day name (e.g. "tuesday")
- [ ] Tap the title → enters edit mode → blur commits
- [ ] Add an exercise → card immediately has one empty set ready
- [ ] Swipe-up-complete a set → cursor advances to a new empty set with same weight × reps
- [ ] Tap "→ next" header button on an unmodified set → advances to next exercise
- [ ] Tap "→ next" on a modified-but-not-completed set → Alert confirms
- [ ] Exercise with muscle_group "Chest" → rest bar fills over 180s; "Triceps" → 90s; "Core" → 60s
- [ ] "+ Add exercise" link is plain saffron text, no dashed border
- [ ] Today header shows "history →" link → tap routes to history index
- [ ] No History tab in bottom nav
- [ ] Micro labels (EXERCISE, SET N, RECENT) noticeably larger and more legible
- [ ] Disable network mid-set → no error toast (SyncIndicator shows offline pill instead)

---

## Self-review checklist (for the implementing engineer)

After all 13 tasks:

```bash
npm run typecheck && npm run lint && npm test
git log --oneline main..HEAD | head -45
```

Expected: ~45 commits total since `main` (Phase 1's 19 + Phase 2's 14 + Phase 3's 13). All checks green.

Verify against the spec — each section maps to a task above. The spec calls out 9 cuts + cross-cutting items; all implemented.
