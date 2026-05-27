# Uplevel Phase 1 — Signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the brutalist-lifter look + Active-Set card + Repeat-Last-Workout home — the three highest-leverage moves identified in the 2026-05-26 design audit — so a screenshot of the active workout screen is unmistakably *this* app.

**Architecture:** Presentation/interaction only. The local-first write path (`src/db/`, `src/sync/`, mutation primitives) is untouched. Two screens are rebuilt (`Today`, `WorkoutActive`); two components are deleted (`SetsTable`, `ExerciseBlock`); a small design system is introduced under `src/ui/` (colors, typography, motion, haptics, useTheme). The existing `src/ui/theme.ts` is kept as a compatibility shim so non-Phase-1 screens keep working.

**Tech Stack:** Expo 55, React Native 0.83, React 19, expo-router, expo-sqlite, React Query 5.90, react-native-gesture-handler ~2.30, react-native-reanimated 4.2.1 (currently unused — Phase 1 puts it to work), expo-haptics, expo-font + @expo-google-fonts/geist + @expo-google-fonts/geist-mono. Jest with ts-jest + better-sqlite3 mock.

**Spec:** [docs/specs/2026-05-26-uplevel-phase-1-signature-design.md](../specs/2026-05-26-uplevel-phase-1-signature-design.md)

**Testing note:** Component JSX cannot be rendered in Jest (jest.setup.js mocks `react-native` to expose only `Platform`). The plan extracts component logic into pure hooks/helpers that *can* be tested, and verifies JSX-level interactions on device. This matches the existing project pattern (e.g. `src/core/pr-detection.ts` is pure-tested; UI is verified manually).

**Commit cadence:** One commit per completed task. Co-author footer is required per project convention.

---

## File map

**New files:**
- `src/ui/colors.ts` — light + dark palette token sets
- `src/ui/typography.ts` — font scale + family + tracking + line-height
- `src/ui/motion.ts` — spring configs + duration tokens
- `src/ui/haptics.ts` — wrapped expo-haptics calls
- `src/ui/useTheme.ts` — hook returning active theme based on system color scheme
- `src/components/RepeatCard.tsx` — Today's primary card
- `src/components/RestProgressBar.tsx` — 2px top-of-screen rest indicator
- `src/components/NumericStepper.tsx` — chevron stepper for weight/reps
- `src/components/numericStepper.ts` — pure logic for NumericStepper (testable)
- `src/components/ActiveSetCard.tsx` — the hero card
- `src/components/activeSet.ts` — pure state-machine helpers for active-set advance (testable)
- `src/queries/repeatLastWorkout.ts` — query + mutation for Repeat
- `src/queries/__tests__/repeatLastWorkout.test.ts` — integration test
- `src/components/__tests__/numericStepper.test.ts` — unit test for stepper logic
- `src/components/__tests__/activeSet.test.ts` — unit test for advance state machine

**Modified files:**
- `package.json` — add font deps
- `app/_layout.tsx` — load fonts before splash hide
- `src/ui/theme.ts` — refactor to compatibility shim over new tokens (no breaking changes to existing imports)
- `src/screens/Today.tsx` — full rebuild
- `src/screens/WorkoutActive.tsx` — full rebuild
- `docs/specs/2026-05-26-uplevel-phase-1-signature-design.md` — flip status to `implemented` at end

**Deleted files (last task):**
- `src/components/SetsTable.tsx`
- `src/components/ExerciseBlock.tsx`

---

## Task 1: Install Geist fonts and verify dependencies

**Files:**
- Modify: `package.json`
- Verify: `node_modules/react-native-gesture-handler`, `node_modules/react-native-reanimated`, `node_modules/expo-font`

- [ ] **Step 1: Verify existing deps are present**

Run: `npm ls react-native-gesture-handler react-native-reanimated expo-font expo-haptics`

Expected: all four resolve. If `expo-font` is missing, add it: `npx expo install expo-font`.

- [ ] **Step 2: Install Geist font packages**

Run: `npx expo install @expo-google-fonts/geist @expo-google-fonts/geist-mono`

Expected output: both packages added to `package.json` `dependencies`. Versions will be `^0.4.x` (or current).

- [ ] **Step 3: Verify type-check still passes**

Run: `npm run typecheck`

Expected: no errors. (Font packages export `useFonts` and font assets only; no API surface changes.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
add Geist + Geist Mono font packages

First step of Phase 1 (Signature) per
docs/plans/2026-05-26-uplevel-phase-1-signature-plan.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create new color tokens

**Files:**
- Create: `src/ui/colors.ts`

- [ ] **Step 1: Create the color token file**

Create `src/ui/colors.ts`:

```ts
/**
 * Brutalist-lifter color tokens.
 * Two coordinated palettes — dark (default-feeling) and light (warm-paper inverse).
 * Consumed via `src/ui/useTheme.ts` which selects based on system color scheme.
 *
 * Phase 1 introduces these; src/ui/theme.ts shims old token names onto them.
 */

export interface PaletteTokens {
  bg: string;
  surface: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkSecondary: string;
  inkTertiary: string;
  inkHero: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  onAccent: string;
  overlay: string;
}

export const darkPalette: PaletteTokens = {
  bg: '#0F1411',
  surface: '#161B18',
  border: '#1A2420',
  borderStrong: '#1F2925',
  ink: '#C9D4CC',
  inkSecondary: '#8C9A92',
  inkTertiary: '#5E6862',
  inkHero: '#E8F0EA',
  accent: '#6DA37E',
  accentSoft: 'rgba(109, 163, 126, 0.12)',
  success: '#6DA37E',
  successSoft: 'rgba(109, 163, 126, 0.12)',
  danger: '#C76B58',
  dangerSoft: 'rgba(199, 107, 88, 0.12)',
  onAccent: '#0F1411',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const lightPalette: PaletteTokens = {
  bg: '#F4F1EB',
  surface: '#FFFFFF',
  border: '#E5DFD3',
  borderStrong: '#D6CFC0',
  ink: '#1A1F1C',
  inkSecondary: '#5A625C',
  inkTertiary: '#9CA39E',
  inkHero: '#0A0E0B',
  accent: '#3D6E52',
  accentSoft: 'rgba(61, 110, 82, 0.10)',
  success: '#3D6E52',
  successSoft: 'rgba(61, 110, 82, 0.10)',
  danger: '#8A4030',
  dangerSoft: 'rgba(138, 64, 48, 0.10)',
  onAccent: '#FFFFFF',
  overlay: 'rgba(40, 30, 20, 0.30)',
};
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/colors.ts
git commit -m "$(cat <<'EOF'
add brutalist-lifter color tokens (dark + light)

Two coordinated palettes consumed by useTheme. Dark is the
default-feeling oxide near-black; light is the chalk-on-paper
inverse with a darker green accent for cream contrast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create typography tokens

**Files:**
- Create: `src/ui/typography.ts`

- [ ] **Step 1: Create the typography token file**

Create `src/ui/typography.ts`:

```ts
/**
 * Brutalist-lifter typography tokens.
 *
 * Family: Geist Sans for chrome/labels, Geist Mono for numerals + data.
 * Sizes are React Native `fontSize` (sp on Android, pt on iOS).
 * Tracking is in pt for `letterSpacing`.
 * Line-heights are multipliers (multiply by fontSize for RN `lineHeight`).
 */

export const fontFamily = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const fontSize = {
  hero: 82,
  display: 28,
  title: 20,
  card: 16,
  body: 14,
  meta: 12,
  micro: 10,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

export const tracking = {
  hero: -3.5,
  display: -0.5,
  title: -0.3,
  body: 0,
  micro: 1.5,
} as const;

export const lineHeightMul = {
  hero: 0.92,
  title: 1.2,
  body: 1.4,
  meta: 1.6,
} as const;

export const typography = {
  family: fontFamily,
  size: fontSize,
  weight: fontWeight,
  tracking,
  lineHeightMul,
};

export type Typography = typeof typography;
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/typography.ts
git commit -m "$(cat <<'EOF'
add typography tokens (Geist Sans + Geist Mono)

Defines the font family resolution, size scale (10–82pt),
tracking, and line-height multipliers used by Phase 1 screens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create motion and haptic wrappers

**Files:**
- Create: `src/ui/motion.ts`
- Create: `src/ui/haptics.ts`

- [ ] **Step 1: Create motion tokens**

Create `src/ui/motion.ts`:

```ts
/**
 * Motion tokens — spring configs for Reanimated and duration tokens for timing.
 *
 * Phase 1 uses motion in exactly three places (per spec):
 *   1. Set completion (snappy spring on lift, settle spring on next-set slide)
 *   2. Workout finish counter tally (timing)
 *   3. Exercise picker slide-up (settle spring)
 *
 * Springs do NOT take a `duration`. The damping/stiffness pair fixes feel.
 * Perceptual durations are ~250–350ms depending on values.
 */

export const spring = {
  snappy:  { damping: 22, stiffness: 240 },
  settle:  { damping: 22, stiffness: 200 },
  rebound: { damping: 18, stiffness: 280 },
} as const;

export const duration = {
  fast: 150,
  base: 220,
  slow: 320,
  counter: 600,
} as const;

export const motion = { spring, duration };
export type Motion = typeof motion;
```

- [ ] **Step 2: Create haptic wrapper**

Create `src/ui/haptics.ts`:

```ts
/**
 * Wrapped expo-haptics calls.
 * All swallow errors so callers can `void haptics.light()` safely.
 *
 * Trigger map (Phase 1 spec):
 *   - light:   stepper increment, routine set completion, skip-rest long-press
 *   - medium:  last set of exercise completion
 *   - rigid:   swipe-up crosses completion threshold
 *   - success: rest timer reaches target
 */
import * as Haptics from 'expo-haptics';

const safe = (fn: () => Promise<unknown>) => {
  fn().catch(() => {
    /* haptics unavailable — swallow */
  });
};

export const haptics = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  rigid: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`

Expected: no errors. (`ImpactFeedbackStyle.Rigid` exists in expo-haptics ~55.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/motion.ts src/ui/haptics.ts
git commit -m "$(cat <<'EOF'
add motion + haptic wrappers

Centralizes the spring configs (snappy/settle/rebound) and
the four haptic triggers used in Phase 1. Wrapped calls
swallow errors so consumers can fire-and-forget.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create useTheme hook and refactor theme.ts as compatibility shim

**Files:**
- Create: `src/ui/useTheme.ts`
- Modify: `src/ui/theme.ts` (full rewrite as shim)

**Context:** The existing `src/ui/theme.ts` exports a static `theme` object consumed everywhere (e.g. `theme.color.bg`, `theme.space.s4`). Many call sites use it inside `StyleSheet.create({...})`, which is evaluated once at module load — meaning a static theme can't dynamically react to dark/light mode at runtime.

Phase 1 resolution:
- **Static `theme.color` is pinned to the DARK palette** (since brutalist-lifter is fundamentally dark; non-Phase-1 screens render dark always until Phase 3 migrates them).
- **`useTheme()` hook returns dynamic theme** based on `useColorScheme()` for Phase 1 screens that want light-mode support.
- Old token names (`brand`, `pr`, `accentMuted`, etc.) are mapped to new tokens via an internal alias.

- [ ] **Step 1: Create the useTheme hook**

Create `src/ui/useTheme.ts`:

```ts
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type PaletteTokens } from './colors';
import { motion } from './motion';
import { typography } from './typography';

export const space = {
  half: 2,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  section: 32,
  page: 20,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
  card: 14,
  button: 8,
} as const;

export const touch = {
  min: 44,
  navHeight: 64,
  cta: 52,
  avatar: 56,
  avatarRadius: 28,
} as const;

export interface Theme {
  color: PaletteTokens;
  space: typeof space;
  radius: typeof radius;
  touch: typeof touch;
  font: typeof typography;
  motion: typeof motion;
  scheme: 'light' | 'dark';
}

export function useTheme(): Theme {
  const scheme = useColorScheme() ?? 'dark';
  const color = scheme === 'light' ? lightPalette : darkPalette;
  return { color, space, radius, touch, font: typography, motion, scheme };
}
```

- [ ] **Step 2: Replace src/ui/theme.ts with a compatibility shim**

Read the current file first to confirm the export shape:

```bash
cat src/ui/theme.ts | head -30
```

Then fully rewrite `src/ui/theme.ts`:

```ts
/**
 * Compatibility shim — Phase 1 of the brutalist-lifter uplevel.
 *
 * The new design system lives in:
 *   - src/ui/colors.ts       (light + dark palettes)
 *   - src/ui/typography.ts   (font tokens)
 *   - src/ui/motion.ts       (spring + duration)
 *   - src/ui/haptics.ts      (haptic wrappers)
 *   - src/ui/useTheme.ts     (hook for dynamic theming)
 *
 * This file remains as a STATIC export for non-Phase-1 screens that
 * still reference `theme.color.X` inside StyleSheet.create. It is
 * pinned to the DARK palette. Phase 3 (Restraint) migrates remaining
 * screens to useTheme() and this file is then deleted.
 *
 * Legacy color names (brand, pr, accentMuted, textSecondary, etc.)
 * are mapped to the closest new token so existing screens don't break.
 */
import { darkPalette } from './colors';
import { motion } from './motion';
import { space, radius, touch } from './useTheme';
import { typography } from './typography';

const legacyColors = {
  // New canonical names (so new code can also import from theme.color)
  bg: darkPalette.bg,
  surface: darkPalette.surface,
  border: darkPalette.border,
  borderStrong: darkPalette.borderStrong,
  ink: darkPalette.ink,
  inkSecondary: darkPalette.inkSecondary,
  inkTertiary: darkPalette.inkTertiary,
  inkHero: darkPalette.inkHero,
  accent: darkPalette.accent,
  accentSoft: darkPalette.accentSoft,
  success: darkPalette.success,
  successSoft: darkPalette.successSoft,
  danger: darkPalette.danger,
  dangerSoft: darkPalette.dangerSoft,
  onAccent: darkPalette.onAccent,
  overlay: darkPalette.overlay,

  // Legacy aliases (consumed by non-Phase-1 screens; resolve to closest new token)
  text: darkPalette.ink,
  textSecondary: darkPalette.inkSecondary,
  textTertiary: darkPalette.inkTertiary,
  textMuted: darkPalette.inkSecondary,
  accentMuted: darkPalette.inkSecondary,
  brand: darkPalette.accent,
  brandMuted: darkPalette.accent,
  brandSoft: darkPalette.accentSoft,
  onBrand: darkPalette.onAccent,
  pr: darkPalette.accent,
  prSoft: darkPalette.accentSoft,
  chartAxis: darkPalette.inkTertiary,
};

const legacyFont = {
  display: typography.size.display,
  title: typography.size.title,
  section: typography.size.title,
  card: typography.size.card,
  body: typography.size.body,
  meta: typography.size.meta,
  micro: typography.size.micro,
  weight: {
    medium: typography.weight.medium,
    semibold: typography.weight.semibold,
    bold: typography.weight.semibold,
  },
};

const legacyDuration = {
  fast: motion.duration.fast,
  normal: motion.duration.base,
  slow: motion.duration.slow,
};

export const theme = {
  color: legacyColors,
  space,
  radius,
  font: legacyFont,
  touch,
  duration: legacyDuration,
};

export type Theme = typeof theme;
```

- [ ] **Step 3: Type-check across the project**

Run: `npm run typecheck`

Expected: no errors. The shim preserves all old field names by mapping them onto the new palette. If you see errors mentioning `theme.color.X` for a name not in `legacyColors`, add an alias for it.

- [ ] **Step 4: Lint**

Run: `npm run lint`

Expected: no errors.

- [ ] **Step 5: Run existing tests**

Run: `npm test`

Expected: all existing tests pass. (Theme is not imported by tests but the shim affects every screen that imports it.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/useTheme.ts src/ui/theme.ts
git commit -m "$(cat <<'EOF'
add useTheme hook; refactor theme.ts as compat shim

useTheme reads useColorScheme and returns the live dark/light
palette for Phase 1 screens. theme.ts becomes a static compat
shim pinned to dark palette, mapping legacy color names
(brand, pr, accentMuted, etc.) onto the new tokens so
non-Phase-1 screens keep working without changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Load Geist fonts at app boot

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Read the current root layout**

Run: `cat app/_layout.tsx`

Note where `SplashScreen.hideAsync()` is called and where the providers wrap the navigator.

- [ ] **Step 2: Wire useFonts before splash hide**

Edit `app/_layout.tsx`. At the imports, add:

```ts
import { useFonts as useGeist, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
```

Inside the root component, before the `useEffect` that calls `initDb()`, add the font loader hook:

```tsx
const [fontsLoaded] = useGeist({
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  GeistMono_400Regular,
  GeistMono_500Medium,
});
```

In the existing readiness check (currently `if (!ready)`), expand to also gate on fontsLoaded:

```tsx
if (!ready || !fontsLoaded) {
  return null; // or whatever the existing loading affordance is
}
```

The existing `SplashScreen.hideAsync()` in the `finally` block keeps working — fonts that aren't loaded just block render; splash stays up until both are ready.

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 4: Manual device verification (note in commit message)**

Boot the app on simulator or device. Verify the splash screen stays up until fonts are loaded (briefly longer than before). Verify no blank-text flash.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx
git commit -m "$(cat <<'EOF'
load Geist + Geist Mono before hiding splash

Adds useGeist hook from @expo-google-fonts so fontFamily refs
in Phase 1 screens resolve. App stays on splash until both
SQLite init and font load complete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create the Repeat-Last-Workout query layer (with tests)

**Files:**
- Create: `src/queries/repeatLastWorkout.ts`
- Create: `src/queries/__tests__/repeatLastWorkout.test.ts`
- Modify: `src/queries/keys.ts` (if needed for new query key)

- [ ] **Step 1: Read the existing query signatures to anchor the test code**

Run:
```bash
grep -n "^export async function" src/queries/exercises.ts src/queries/sets.ts src/queries/workouts.ts
cat src/queries/keys.ts
```

Important shapes to confirm (these are what the test code below depends on):
- `addExerciseToWorkout({ workoutId, exerciseId }): Promise<string>` — returns the new workout_exercise id; order_index is computed internally
- `addSet(weId: string, args?: { weight?, reps? }): Promise<string>` — positional, returns the new set id
- `updateSet(setId: string, patch: { weight?, reps?, completed? }): Promise<void>` — positional
- `createWorkout({ userId, title?, templateId? }): Promise<string>` — returns the new workout id
- `finishWorkout(workoutId: string): Promise<void>`

If any of these differ from what's documented above, adjust the test code below before running.

- [ ] **Step 2: Write the failing test FIRST**

Create `src/queries/__tests__/repeatLastWorkout.test.ts`:

```ts
/**
 * Integration test: repeat-last-workout clones a previous workout's
 * exercises in order, each pre-seeded with one empty set whose
 * weight/reps come from the most-recent COMPLETED set of that exercise
 * in the source workout.
 *
 * Asserts directly against SQLite + outbox (no Supabase round-trip).
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout, finishWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import {
  getLastFinishedWorkoutWithSeeds,
  repeatLastWorkout,
} from '@/queries/repeatLastWorkout';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'user-repeat-test';
const EX_BENCH = '11111111-1111-1111-1111-111111111111';
const EX_OHP = '22222222-2222-2222-2222-222222222222';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });

  const db = await getDb();
  // Seed two exercises directly (not via outbox; these are catalog rows)
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_BENCH, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_OHP, 'OHP', 'Shoulders', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('getLastFinishedWorkoutWithSeeds returns null when user has no workouts', async () => {
  const result = await getLastFinishedWorkoutWithSeeds(USER_ID);
  expect(result).toBeNull();
});

test('getLastFinishedWorkoutWithSeeds returns seeded exercises in order', async () => {
  // Create + finish a workout with two exercises, three sets each.
  // addExerciseToWorkout / addSet auto-compute order_index inside their
  // own transactions — sequential awaits give us deterministic 0,1,2.
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const we1 = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_BENCH });
  const we2 = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_OHP });

  const s1a = await addSet(we1);
  await updateSet(s1a, { weight: 135, reps: 8, completed: true });
  const s1b = await addSet(we1);
  await updateSet(s1b, { weight: 175, reps: 5, completed: true });
  const s1c = await addSet(we1);
  await updateSet(s1c, { weight: 185, reps: 5, completed: true });

  const s2a = await addSet(we2);
  await updateSet(s2a, { weight: 95, reps: 8, completed: true });
  const s2b = await addSet(we2);
  await updateSet(s2b, { weight: 115, reps: 5, completed: true });

  await finishWorkout(wId);

  const result = await getLastFinishedWorkoutWithSeeds(USER_ID);
  expect(result).not.toBeNull();
  expect(result!.workout.title).toBe('Push');
  expect(result!.seeds).toHaveLength(2);
  expect(result!.seeds[0].exerciseId).toBe(EX_BENCH);
  expect(result!.seeds[0].exerciseName).toBe('Bench Press');
  expect(result!.seeds[0].seedWeight).toBe(185); // last completed
  expect(result!.seeds[0].seedReps).toBe(5);
  expect(result!.seeds[1].exerciseId).toBe(EX_OHP);
  expect(result!.seeds[1].seedWeight).toBe(115);
  expect(result!.seeds[1].seedReps).toBe(5);
});

test('repeatLastWorkout clones exercises in order with seeded sets', async () => {
  // Seed: previous workout with one exercise, two completed sets
  const wPrev = await createWorkout({ userId: USER_ID, title: 'Push' });
  const we = await addExerciseToWorkout({ workoutId: wPrev, exerciseId: EX_BENCH });
  const s1 = await addSet(we);
  await updateSet(s1, { weight: 135, reps: 8, completed: true });
  const s2 = await addSet(we);
  await updateSet(s2, { weight: 185, reps: 5, completed: true });
  await finishWorkout(wPrev);

  // Act: repeat
  const newWorkoutId = await repeatLastWorkout(USER_ID);
  expect(newWorkoutId).not.toBeNull();

  // Assert: new workout exists, has the same exercise in order 0, with one seeded set
  const db = await getDb();
  const newWorkout = await db.getFirstAsync<{ id: string; title: string; ended_at: string | null }>(
    'SELECT id, title, ended_at FROM workouts WHERE id = ?',
    [newWorkoutId],
  );
  expect(newWorkout).not.toBeNull();
  expect(newWorkout!.ended_at).toBeNull(); // active
  expect(newWorkout!.title).toBe('Push');

  const newWes = await db.getAllAsync<{ id: string; exercise_id: string; order_index: number }>(
    'SELECT id, exercise_id, order_index FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL ORDER BY order_index',
    [newWorkoutId],
  );
  expect(newWes).toHaveLength(1);
  expect(newWes[0].exercise_id).toBe(EX_BENCH);

  const newSets = await db.getAllAsync<{
    weight: number | null;
    reps: number | null;
    completed: number;
  }>(
    'SELECT weight, reps, completed FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY order_index',
    [newWes[0].id],
  );
  expect(newSets).toHaveLength(1);
  expect(newSets[0].weight).toBe(185);
  expect(newSets[0].reps).toBe(5);
  expect(newSets[0].completed).toBe(0); // not completed yet
});

test('repeatLastWorkout returns null when there is no last workout', async () => {
  const result = await repeatLastWorkout(USER_ID);
  expect(result).toBeNull();
});
```

- [ ] **Step 3: Run the test — expect failure**

Run: `npm test -- --testPathPattern=repeatLastWorkout`

Expected: FAIL with "Cannot find module '@/queries/repeatLastWorkout'".

- [ ] **Step 4: Implement the query + mutation**

Create `src/queries/repeatLastWorkout.ts`:

```ts
/**
 * Repeat-last-workout — reads the user's most recent finished workout
 * and produces (a) a summary for the Today Repeat card, and (b) a
 * mutation that clones the workout's exercises with one pre-seeded set
 * per exercise (weight + reps from the most recent COMPLETED set).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { nowIso, uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

import { queryKeys } from './keys';

export interface ExerciseSeed {
  exerciseId: string;
  exerciseName: string;
  seedWeight: number | null;
  seedReps: number | null;
}

export interface LastWorkoutWithSeeds {
  workout: {
    id: string;
    title: string;
    started_at: string;
    ended_at: string;
  };
  seeds: ExerciseSeed[];
}

export async function getLastFinishedWorkoutWithSeeds(
  userId: string,
): Promise<LastWorkoutWithSeeds | null> {
  const db = await getDb();
  const workout = await db.getFirstAsync<{
    id: string;
    title: string;
    started_at: string;
    ended_at: string;
  }>(
    `SELECT id, title, started_at, ended_at FROM workouts
       WHERE user_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY ended_at DESC LIMIT 1`,
    [userId],
  );
  if (!workout) return null;

  const exerciseRows = await db.getAllAsync<{
    we_id: string;
    exercise_id: string;
    exercise_name: string;
    order_index: number;
  }>(
    `SELECT we.id AS we_id, we.exercise_id, e.name AS exercise_name, we.order_index
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
      WHERE we.workout_id = ? AND we.deleted_at IS NULL
      ORDER BY we.order_index`,
    [workout.id],
  );

  const seeds: ExerciseSeed[] = [];
  for (const row of exerciseRows) {
    const lastSet = await db.getFirstAsync<{ weight: number | null; reps: number | null }>(
      `SELECT weight, reps FROM sets
         WHERE workout_exercise_id = ? AND completed = 1 AND deleted_at IS NULL
         ORDER BY order_index DESC LIMIT 1`,
      [row.we_id],
    );
    seeds.push({
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      seedWeight: lastSet?.weight ?? null,
      seedReps: lastSet?.reps ?? null,
    });
  }

  return { workout, seeds };
}

export function useLastFinishedWorkoutWithSeeds(userId: string | undefined) {
  return useQuery({
    queryKey: userId
      ? [...queryKeys.workouts.all, 'last-finished', userId]
      : ['workouts', 'last-finished', 'none'],
    queryFn: () => (userId ? getLastFinishedWorkoutWithSeeds(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}

export async function repeatLastWorkout(userId: string): Promise<string | null> {
  const source = await getLastFinishedWorkoutWithSeeds(userId);
  if (!source) return null;

  // 1. Create the new workout (active — ended_at: null)
  const newWorkoutId = uuidv4();
  const startedAt = nowIso();
  await enqueueMutation({
    table: 'workouts',
    op: 'insert',
    rowId: newWorkoutId,
    payload: {
      user_id: userId,
      started_at: startedAt,
      title: source.workout.title,
      template_id: null,
      ended_at: null,
    },
  });

  // 2. For each exercise seed, create workout_exercise + one seeded set
  for (let i = 0; i < source.seeds.length; i++) {
    const seed = source.seeds[i];
    const weId = uuidv4();
    await enqueueMutation({
      table: 'workout_exercises',
      op: 'insert',
      rowId: weId,
      payload: {
        workout_id: newWorkoutId,
        exercise_id: seed.exerciseId,
        order_index: i,
      },
    });

    const setId = uuidv4();
    await enqueueMutation({
      table: 'sets',
      op: 'insert',
      rowId: setId,
      payload: {
        workout_exercise_id: weId,
        order_index: 0,
        weight: seed.seedWeight,
        reps: seed.seedReps,
        completed: 0,
        completed_at: null,
      },
    });
  }

  void triggerPush();
  return newWorkoutId;
}

export function useRepeatLastWorkout(userId: string | undefined, onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('Not signed in');
      return repeatLastWorkout(userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to repeat workout'),
  });
}
```

- [ ] **Step 5: Run the test — expect pass**

Run: `npm test -- --testPathPattern=repeatLastWorkout`

Expected: 4 tests pass.

- [ ] **Step 6: Type-check + lint + full test suite**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/queries/repeatLastWorkout.ts src/queries/__tests__/repeatLastWorkout.test.ts
git commit -m "$(cat <<'EOF'
add repeat-last-workout query + mutation (+ tests)

getLastFinishedWorkoutWithSeeds reads the most-recent finished
workout with one seed per exercise (weight + reps from the most-
recent completed set). repeatLastWorkout clones the structure
into a new active workout. 4 integration tests assert the SQLite
+ outbox state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Create RepeatCard component

**Files:**
- Create: `src/components/RepeatCard.tsx`

- [ ] **Step 1: Create the RepeatCard component**

Create `src/components/RepeatCard.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExerciseSeed } from '@/queries/repeatLastWorkout';
import { useTheme } from '@/ui/useTheme';
import { haptics } from '@/ui/haptics';

interface Props {
  title: string;
  daysAgo: number;
  seeds: ExerciseSeed[];
  loading?: boolean;
  onPress: () => void;
}

export function RepeatCard({ title, daysAgo, seeds, loading, onPress }: Props) {
  const theme = useTheme();
  const displaySeeds = seeds.slice(0, 4);

  const handlePress = () => {
    haptics.light();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={`Repeat ${title} workout`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          opacity: pressed ? 0.85 : loading ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        {labelText(title, daysAgo)}
      </Text>
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
        {title || 'Workout'}
      </Text>
      <View style={styles.seedList}>
        {displaySeeds.map((seed) => (
          <View key={seed.exerciseId} style={styles.seedRow}>
            <Text
              style={[
                styles.seedName,
                { color: theme.color.ink, fontFamily: theme.font.family.sans },
              ]}
              numberOfLines={1}
            >
              {seed.exerciseName}
            </Text>
            <Text
              style={[
                styles.seedValue,
                {
                  color: theme.color.inkSecondary,
                  fontFamily: theme.font.family.mono,
                },
              ]}
            >
              {formatSeed(seed)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.ctaRow}>
        <Text
          style={[
            styles.cta,
            { color: theme.color.accent, fontFamily: theme.font.family.sansMedium },
          ]}
        >
          → Repeat workout
        </Text>
      </View>
    </Pressable>
  );
}

function labelText(title: string, daysAgo: number): string {
  const ago = daysAgo === 0 ? 'TODAY' : daysAgo === 1 ? '1 DAY AGO' : `${daysAgo} DAYS AGO`;
  return `LAST WORKOUT · ${ago}`;
}

function formatSeed(seed: ExerciseSeed): string {
  if (seed.seedWeight == null || seed.seedReps == null) return '– × –';
  return `${seed.seedWeight} × ${seed.seedReps}`;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    marginBottom: 14,
  },
  seedList: {
    gap: 6,
  },
  seedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  seedName: {
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  seedValue: {
    fontSize: 13,
  },
  ctaRow: {
    marginTop: 16,
  },
  cta: {
    fontSize: 13,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RepeatCard.tsx
git commit -m "$(cat <<'EOF'
add RepeatCard component for Today screen

Renders the last finished workout as a tappable card with up to
4 exercise seeds (name + last weight×reps in mono) and a
'Repeat workout' CTA. Theme-aware via useTheme().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Rebuild the Today screen

**Files:**
- Modify: `src/screens/Today.tsx` (full rewrite)

- [ ] **Step 1: Read the current Today.tsx for the imports / structure cues**

Run: `cat src/screens/Today.tsx`

Note the existing imports (auth, queries, router) — the rewrite reuses these.

- [ ] **Step 2: Rewrite Today.tsx**

Replace the contents of `src/screens/Today.tsx` with:

```tsx
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { RepeatCard } from '@/components/RepeatCard';
import {
  useLastFinishedWorkoutWithSeeds,
  useRepeatLastWorkout,
} from '@/queries/repeatLastWorkout';
import { useActiveWorkout, useRecentWorkouts, useCreateWorkout } from '@/queries/workouts';
import { useToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

export default function TodayScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const activeQuery = useActiveWorkout(userId);
  const lastFinishedQuery = useLastFinishedWorkoutWithSeeds(userId);
  const recentQuery = useRecentWorkouts(userId, 3);
  const repeat = useRepeatLastWorkout(userId, toastError);
  const createWorkout = useCreateWorkout(toastError);

  const greeting = useMemo(() => greetingFor(new Date()), []);

  const onRepeat = useCallback(async () => {
    const id = await repeat.mutateAsync();
    if (id) router.push('/workout/active');
  }, [repeat]);

  const onResume = useCallback(() => {
    router.push('/workout/active');
  }, []);

  const onBlankStart = useCallback(async () => {
    if (!userId) return;
    await createWorkout.mutateAsync({ userId, title: 'Workout' });
    router.push('/workout/active');
  }, [createWorkout, userId]);

  if (!userId) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text
          style={[
            styles.greet,
            {
              color: theme.color.inkTertiary,
              fontFamily: theme.font.family.sansMedium,
            },
          ]}
        >
          {greeting.toUpperCase()}
        </Text>
        <Text
          style={[
            styles.titleLine,
            {
              color: theme.color.inkHero,
              fontFamily: theme.font.family.sansSemibold,
              fontSize: theme.font.size.display,
              letterSpacing: theme.font.tracking.display,
            },
          ]}
        >
          {activeQuery.data ? 'Workout in progress.' : 'Ready to lift.'}
        </Text>

        {activeQuery.data ? (
          <ResumeCard onPress={onResume} />
        ) : lastFinishedQuery.isLoading ? (
          <View style={styles.cardSkeleton}>
            <ActivityIndicator color={theme.color.inkSecondary} />
          </View>
        ) : lastFinishedQuery.data ? (
          <RepeatCard
            title={lastFinishedQuery.data.workout.title}
            daysAgo={daysSince(lastFinishedQuery.data.workout.ended_at)}
            seeds={lastFinishedQuery.data.seeds}
            loading={repeat.isPending}
            onPress={onRepeat}
          />
        ) : (
          <EmptyRepeatSlot />
        )}

        <View style={styles.altRow}>
          <Pressable
            onPress={onBlankStart}
            disabled={createWorkout.isPending || !!activeQuery.data}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.altBtn,
              {
                borderColor: theme.color.borderStrong,
                opacity: pressed ? 0.7 : activeQuery.data ? 0.3 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.altBtnText,
                { color: theme.color.ink, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              + Blank
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/profile/plan')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.altBtn,
              {
                borderColor: theme.color.borderStrong,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.altBtnText,
                { color: theme.color.ink, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              Templates
            </Text>
          </Pressable>
        </View>

        <View style={styles.recentSection}>
          <View style={[styles.recentHeader, { borderBottomColor: theme.color.border }]}>
            <Text
              style={[
                styles.recentHeaderText,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              RECENT
            </Text>
          </View>
          {recentQuery.data?.length ? (
            recentQuery.data.map((w) => (
              <View
                key={w.id}
                style={[styles.recentRow, { borderBottomColor: theme.color.border }]}
              >
                <Text
                  style={[
                    styles.recentName,
                    { color: theme.color.ink, fontFamily: theme.font.family.sansMedium },
                  ]}
                >
                  {w.title || 'Workout'}
                </Text>
                <Text
                  style={[
                    styles.recentMeta,
                    { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
                  ]}
                >
                  {recentMeta(w)}
                </Text>
              </View>
            ))
          ) : (
            <Text
              style={[
                styles.recentEmpty,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sans },
              ]}
            >
              Nothing here yet.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ResumeCard({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.color.accentSoft,
          borderColor: theme.color.accent,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.cardLabel,
          { color: theme.color.accent, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        IN PROGRESS
      </Text>
      <Text
        style={[
          styles.cardTitle,
          {
            color: theme.color.inkHero,
            fontFamily: theme.font.family.sansSemibold,
            fontSize: theme.font.size.title,
            letterSpacing: theme.font.tracking.title,
          },
        ]}
      >
        Resume workout
      </Text>
      <Text
        style={[
          styles.cardCta,
          { color: theme.color.accent, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        → Resume
      </Text>
    </Pressable>
  );
}

function EmptyRepeatSlot() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.cardEmpty,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
        },
      ]}
    >
      <Text
        style={[
          styles.cardEmptyBody,
          { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
        ]}
      >
        Your first workout will live here.
      </Text>
    </View>
  );
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    now.getDay()
  ];
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `${day} ${part}`;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
}

function recentMeta(w: { started_at: string; ended_at: string | null }): string {
  const d = daysSince(w.started_at);
  const ago = d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
  return ago;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingTop: 8, paddingBottom: 64 },
  greet: {
    fontSize: 10,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  titleLine: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardSkeleton: {
    marginHorizontal: 16,
    paddingVertical: 40,
    alignItems: 'center',
  },
  cardEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  cardEmptyBody: {
    fontSize: 13,
    textAlign: 'center',
  },
  cardLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardTitle: {
    marginBottom: 14,
  },
  cardCta: {
    fontSize: 13,
    fontWeight: '500',
  },
  altRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  altBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  altBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  recentSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  recentHeader: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentHeaderText: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentName: {
    fontSize: 13,
  },
  recentMeta: {
    fontSize: 12,
  },
  recentEmpty: {
    fontSize: 13,
    paddingVertical: 14,
  },
});
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors. Templates routes to `/profile/plan` (the existing training-plan surface — not strictly "templates" but is the closest existing route; a dedicated Templates landing is Phase 4 polish). If typed-route inference complains, cast: `router.push('/profile/plan' as never)`.

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Today.tsx
git commit -m "$(cat <<'EOF'
rebuild Today screen with Repeat-Last-Workout primary

New layout: time-of-day greeting + 'Ready to lift.' display
title, then one of three states (active resume / repeat card /
empty slot). Secondary buttons (+ Blank, Templates) below.
Recent list (last 3 finished workouts) at bottom. Theme-aware
via useTheme().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: NumericStepper — pure logic + component

**Files:**
- Create: `src/components/numericStepper.ts` (pure logic, testable)
- Create: `src/components/__tests__/numericStepper.test.ts`
- Create: `src/components/NumericStepper.tsx` (JSX wrapper)

- [ ] **Step 1: Write failing tests for the pure logic FIRST**

Create `src/components/__tests__/numericStepper.test.ts`:

```ts
import {
  applyStep,
  clampValue,
  formatValue,
  parseUserInput,
} from '@/components/numericStepper';

describe('applyStep', () => {
  test('increments by step in positive direction', () => {
    expect(applyStep(185, 5, 1)).toBe(190);
  });
  test('decrements by step in negative direction', () => {
    expect(applyStep(185, 5, -1)).toBe(180);
  });
  test('handles null current as starting from 0', () => {
    expect(applyStep(null, 5, 1)).toBe(5);
  });
  test('handles fractional steps (kg)', () => {
    expect(applyStep(20, 2.5, 1)).toBe(22.5);
  });
  test('cannot go below zero by default', () => {
    expect(applyStep(2, 5, -1)).toBe(0);
  });
});

describe('clampValue', () => {
  test('clamps below min', () => {
    expect(clampValue(-5, 0, 1000)).toBe(0);
  });
  test('clamps above max', () => {
    expect(clampValue(2000, 0, 1000)).toBe(1000);
  });
  test('passes valid value through', () => {
    expect(clampValue(185, 0, 1000)).toBe(185);
  });
});

describe('formatValue', () => {
  test('returns en-dash for null', () => {
    expect(formatValue(null)).toBe('–');
  });
  test('returns integer without decimal', () => {
    expect(formatValue(185)).toBe('185');
  });
  test('returns one decimal for fractional', () => {
    expect(formatValue(22.5)).toBe('22.5');
  });
  test('drops trailing zeros', () => {
    expect(formatValue(22.0)).toBe('22');
  });
});

describe('parseUserInput', () => {
  test('parses valid integer', () => {
    expect(parseUserInput('185')).toBe(185);
  });
  test('parses valid decimal', () => {
    expect(parseUserInput('22.5')).toBe(22.5);
  });
  test('returns null for empty', () => {
    expect(parseUserInput('')).toBeNull();
  });
  test('returns null for non-numeric', () => {
    expect(parseUserInput('abc')).toBeNull();
  });
  test('handles leading + trailing whitespace', () => {
    expect(parseUserInput('  185  ')).toBe(185);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npm test -- --testPathPattern=numericStepper`

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement pure logic**

Create `src/components/numericStepper.ts`:

```ts
/**
 * Pure logic for NumericStepper — separated from the JSX wrapper so
 * it can be unit-tested in Jest (which cannot render React Native
 * components in this project's setup).
 */

export function applyStep(
  current: number | null,
  step: number,
  direction: 1 | -1,
  min: number = 0,
): number {
  const base = current ?? 0;
  const next = base + step * direction;
  if (next < min) return min;
  return roundToStep(next);
}

export function clampValue(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function formatValue(value: number | null): string {
  if (value == null) return '–';
  if (Number.isInteger(value)) return String(value);
  // Drop trailing zeros (22.50 → 22.5; 22.0 → 22)
  return parseFloat(value.toFixed(2)).toString();
}

export function parseUserInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function roundToStep(value: number): number {
  // Avoid floating-point dust from 0.5 increments (e.g. 22.5 + 2.5 → 25.0000001)
  return Math.round(value * 1000) / 1000;
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- --testPathPattern=numericStepper`

Expected: 14 tests pass.

- [ ] **Step 5: Build the JSX component**

Create `src/components/NumericStepper.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

import { applyStep, formatValue, parseUserInput } from './numericStepper';

interface Props {
  value: number | null;
  step: number; // 5 (lb) or 2.5 (kg) for weight; 1 for reps
  unit: string; // 'LB' | 'KG' | 'REPS'
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (next: number | null) => void;
  size?: 'hero' | 'inline';
  testID?: string;
}

const RAMP_DELAY_MS = 600;
const RAMP_INTERVAL_MS = 200;

export function NumericStepper({
  value,
  step,
  unit,
  focused,
  onFocus,
  onBlur,
  onChange,
  size = 'hero',
  testID,
}: Props) {
  const theme = useTheme();
  const [editingText, setEditingText] = useState<string | null>(null);
  const rampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rampIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync external value into local edit state when not editing
  useEffect(() => {
    if (editingText === null) {
      // No-op: we render formatValue(value) directly when not editing
    }
  }, [value, editingText]);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      const next = applyStep(value, step, direction);
      onChange(next);
    },
    [value, step, onChange],
  );

  const startRamp = useCallback(
    (direction: 1 | -1) => {
      handleStep(direction);
      rampTimerRef.current = setTimeout(() => {
        rampIntervalRef.current = setInterval(() => {
          haptics.light();
          onChange((currentVal) => {
            // React Native onChange doesn't support function — read latest via ref pattern
            // We use the closure value here; this is acceptable because ramp tickers run
            // on a fresh interval after each press-in event.
            return applyStep(value, step, direction);
          } as unknown as number); // type cast for the function-update fallback
        }, RAMP_INTERVAL_MS);
      }, RAMP_DELAY_MS);
    },
    [value, step, onChange, handleStep],
  );

  const stopRamp = useCallback(() => {
    if (rampTimerRef.current) {
      clearTimeout(rampTimerRef.current);
      rampTimerRef.current = null;
    }
    if (rampIntervalRef.current) {
      clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRamp(), [stopRamp]);

  const onPressNumber = useCallback(() => {
    if (focused) {
      // Enter edit (keypad) mode
      setEditingText(formatValue(value));
    } else {
      onFocus();
    }
  }, [focused, value, onFocus]);

  const commitEdit = useCallback(() => {
    if (editingText == null) return;
    const parsed = parseUserInput(editingText);
    onChange(parsed);
    setEditingText(null);
  }, [editingText, onChange]);

  const heroSize = size === 'hero' ? theme.font.size.hero : theme.font.size.title;
  const heroTracking = size === 'hero' ? theme.font.tracking.hero : theme.font.tracking.title;

  return (
    <View style={styles.container} testID={testID}>
      {focused ? (
        <View style={styles.chevColumn} accessible={false}>
          <Pressable
            onPress={() => handleStep(1)}
            onLongPress={() => startRamp(1)}
            onPressOut={stopRamp}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${unit.toLowerCase()} by ${step}`}
          >
            <Text style={[styles.chev, { color: theme.color.accent }]}>▲</Text>
          </Pressable>
          <Pressable
            onPress={() => handleStep(-1)}
            onLongPress={() => startRamp(-1)}
            onPressOut={stopRamp}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${unit.toLowerCase()} by ${step}`}
          >
            <Text style={[styles.chev, { color: theme.color.accent }]}>▼</Text>
          </Pressable>
        </View>
      ) : null}
      {editingText != null ? (
        <TextInput
          value={editingText}
          onChangeText={setEditingText}
          onBlur={commitEdit}
          onSubmitEditing={commitEdit}
          autoFocus
          keyboardType={Number.isInteger(step) ? 'number-pad' : 'decimal-pad'}
          style={[
            styles.number,
            {
              color: theme.color.inkHero,
              fontFamily: theme.font.family.mono,
              fontSize: heroSize,
              letterSpacing: heroTracking,
              lineHeight: heroSize * theme.font.lineHeightMul.hero,
            },
          ]}
        />
      ) : (
        <Pressable onPress={onPressNumber} accessibilityRole="button" accessibilityLabel={unit}>
          <Text
            style={[
              styles.number,
              {
                color: focused ? theme.color.inkHero : theme.color.ink,
                fontFamily: theme.font.family.mono,
                fontSize: heroSize,
                letterSpacing: heroTracking,
                lineHeight: heroSize * theme.font.lineHeightMul.hero,
              },
            ]}
          >
            {formatValue(value)}
          </Text>
        </Pressable>
      )}
      {focused && size === 'hero' ? (
        <Text
          style={[
            styles.unit,
            {
              color: theme.color.inkTertiary,
              fontFamily: theme.font.family.sansMedium,
            },
          ]}
        >
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  chevColumn: {
    justifyContent: 'space-between',
    paddingRight: 8,
    paddingBottom: 12,
  },
  chev: {
    fontSize: 14,
    paddingVertical: 4,
  },
  number: {
    paddingHorizontal: 0,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginLeft: 8,
    marginBottom: 12,
  },
});
```

- [ ] **Step 6: Type-check + lint + test**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green. If `onChange((currentVal) => ...)` syntax errors in TypeScript (it accepts only `number | null` not a function), simplify the ramp interval to recompute from the latest known value by passing `value` directly:

```ts
rampIntervalRef.current = setInterval(() => {
  haptics.light();
  // Use a ref to read the latest external value; or simplify: ramp from
  // the captured `value` at gesture start. Acceptable for Phase 1.
  onChange(applyStep(value, step, direction));
}, RAMP_INTERVAL_MS);
```

This means ramp computes from the value at gesture-start, not the live value. For Phase 1 this is acceptable (user can release and re-press for further increments). Document this limitation in a code comment.

- [ ] **Step 7: Commit**

```bash
git add src/components/NumericStepper.tsx src/components/numericStepper.ts src/components/__tests__/numericStepper.test.ts
git commit -m "$(cat <<'EOF'
add NumericStepper component + pure-logic tests

Chevron-based stepper (▲ +step / ▼ -step) with long-press ramp.
Tap the number when focused = system keypad. Pure logic
(applyStep, clampValue, formatValue, parseUserInput) is unit-
tested in Jest; the JSX wrapper is verified on device.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: RestProgressBar component

**Files:**
- Create: `src/components/RestProgressBar.tsx`
- Modify: `src/ui/hooks/useRestTimer.ts` (expose `elapsed` as a fraction helper if needed)

- [ ] **Step 1: Read the existing rest timer hook**

Run: `cat src/ui/hooks/useRestTimer.ts`

Confirm the hook returns `{ running, elapsed, targetSeconds, start, stop }`. (If not, add `targetSeconds` to the return; it already takes it as input.)

- [ ] **Step 2: Build RestProgressBar**

Create `src/components/RestProgressBar.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui/useTheme';

interface Props {
  running: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
  onSkip: () => void;
}

export function RestProgressBar({ running, elapsedSeconds, targetSeconds, onSkip }: Props) {
  const theme = useTheme();
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fraction = Math.min(elapsedSeconds / Math.max(targetSeconds, 1), 1);
    Animated.timing(widthAnim, {
      toValue: fraction,
      duration: 250,
      useNativeDriver: false, // width animations require layout
    }).start();
  }, [elapsedSeconds, targetSeconds, widthAnim]);

  if (!running) return null;

  return (
    <Pressable
      onLongPress={onSkip}
      delayLongPress={350}
      accessibilityLabel="Long-press to skip rest"
      style={styles.touch}
    >
      <View style={[styles.bar, { backgroundColor: theme.color.border }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: theme.color.accent,
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    height: 12, // larger hit area; bar is 2px inside
    justifyContent: 'flex-start',
  },
  bar: {
    height: 2,
    width: '100%',
  },
  fill: {
    height: 2,
  },
});
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/RestProgressBar.tsx
git commit -m "$(cat <<'EOF'
add RestProgressBar component

2px horizontal bar that fills with brand green as rest elapses,
hidden when not running. Long-press skips rest. Replaces the
existing dark timer pill in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: ActiveSet state machine — pure logic + tests

**Files:**
- Create: `src/components/activeSet.ts`
- Create: `src/components/__tests__/activeSet.test.ts`

- [ ] **Step 1: Write failing tests FIRST**

Create `src/components/__tests__/activeSet.test.ts`:

```ts
import {
  advanceCursor,
  type ActiveCursor,
  type ExerciseShape,
} from '@/components/activeSet';

const ex = (id: string, setIds: string[]): ExerciseShape => ({
  id,
  exerciseId: `ex-${id}`,
  exerciseName: `Exercise ${id}`,
  orderIndex: 0,
  sets: setIds.map((sid, i) => ({
    id: sid,
    weId: id,
    orderIndex: i,
    weight: 100,
    reps: 5,
    completed: false,
  })),
});

describe('advanceCursor', () => {
  test('advances to next set within same exercise', () => {
    const exercises = [ex('we1', ['s1', 's2', 's3'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's1' };
    expect(advanceCursor(exercises, cursor)).toEqual({ weId: 'we1', setId: 's2' });
  });

  test('advances to first set of next exercise when current is the last set', () => {
    const exercises = [ex('we1', ['s1', 's2']), ex('we2', ['s3', 's4'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's2' };
    expect(advanceCursor(exercises, cursor)).toEqual({ weId: 'we2', setId: 's3' });
  });

  test('returns null (finish workout) when on last set of last exercise', () => {
    const exercises = [ex('we1', ['s1', 's2'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's2' };
    expect(advanceCursor(exercises, cursor)).toBeNull();
  });

  test('skips empty exercises (zero sets)', () => {
    const exercises = [ex('we1', ['s1']), ex('we2', []), ex('we3', ['s2'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's1' };
    expect(advanceCursor(exercises, cursor)).toEqual({ weId: 'we3', setId: 's2' });
  });

  test('returns null when cursor refers to a set that does not exist', () => {
    const exercises = [ex('we1', ['s1'])];
    expect(advanceCursor(exercises, { weId: 'we1', setId: 'ghost' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npm test -- --testPathPattern=activeSet`

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/components/activeSet.ts`:

```ts
/**
 * Pure state-machine helpers for the Active-Set card flow.
 * Given the workout's exercises and the current cursor (which set is
 * being lifted), compute the next cursor on completion. Returns null
 * when the workout is finished (last set of last exercise).
 */

export interface SetShape {
  id: string;
  weId: string;
  orderIndex: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
}

export interface ExerciseShape {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: SetShape[];
}

export interface ActiveCursor {
  weId: string;
  setId: string;
}

export function advanceCursor(
  exercises: ExerciseShape[],
  cursor: ActiveCursor,
): ActiveCursor | null {
  const exIdx = exercises.findIndex((e) => e.id === cursor.weId);
  if (exIdx === -1) return null;
  const ex = exercises[exIdx];
  const setIdx = ex.sets.findIndex((s) => s.id === cursor.setId);
  if (setIdx === -1) return null;

  // Try next set in same exercise
  if (setIdx + 1 < ex.sets.length) {
    return { weId: ex.id, setId: ex.sets[setIdx + 1].id };
  }

  // Try first set of any subsequent exercise that has sets
  for (let i = exIdx + 1; i < exercises.length; i++) {
    if (exercises[i].sets.length > 0) {
      return { weId: exercises[i].id, setId: exercises[i].sets[0].id };
    }
  }

  // No more sets — finish workout
  return null;
}

export function findInitialCursor(exercises: ExerciseShape[]): ActiveCursor | null {
  for (const ex of exercises) {
    const next = ex.sets.find((s) => !s.completed);
    if (next) return { weId: ex.id, setId: next.id };
  }
  // No incomplete sets — fall back to the very first set if any
  for (const ex of exercises) {
    if (ex.sets.length > 0) return { weId: ex.id, setId: ex.sets[0].id };
  }
  return null;
}

export function findExercise(exercises: ExerciseShape[], weId: string): ExerciseShape | null {
  return exercises.find((e) => e.id === weId) ?? null;
}

export function findSet(ex: ExerciseShape, setId: string): SetShape | null {
  return ex.sets.find((s) => s.id === setId) ?? null;
}

export function completedSetsBeforeCursor(ex: ExerciseShape, cursor: ActiveCursor): SetShape[] {
  if (ex.id !== cursor.weId) return ex.sets.filter((s) => s.completed);
  const cursorIdx = ex.sets.findIndex((s) => s.id === cursor.setId);
  if (cursorIdx === -1) return ex.sets.filter((s) => s.completed);
  return ex.sets.slice(0, cursorIdx);
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- --testPathPattern=activeSet`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/activeSet.ts src/components/__tests__/activeSet.test.ts
git commit -m "$(cat <<'EOF'
add active-set cursor state machine + tests

Pure helpers: advanceCursor moves to next set within exercise,
then first set of next exercise, then null (finish). Plus
findInitialCursor, findExercise, findSet, completedSetsBeforeCursor.
5 unit tests cover advance edge cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: ActiveSetCard component (scaffold, tap-to-complete only)

**Files:**
- Create: `src/components/ActiveSetCard.tsx`

**Note:** This task ships the visual card with a tap-to-complete button as a placeholder for the swipe gesture (which lands in Task 15). One commit's worth of visual mismatch is acceptable.

- [ ] **Step 1: Create the ActiveSetCard component**

Create `src/components/ActiveSetCard.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExerciseShape, SetShape, ActiveCursor } from './activeSet';
import { NumericStepper } from './NumericStepper';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  exercise: ExerciseShape;
  set: SetShape;
  exerciseIndex: number; // 1-based for display
  totalExercises: number;
  setIndex: number; // 1-based for display
  totalSetsInExercise: number;
  weightStep: number; // 5 (lb) or 2.5 (kg)
  weightUnit: 'LB' | 'KG';
  isLastSetOfExercise: boolean;
  ghostSets: SetShape[]; // completed sets before this one in the same exercise
  onChangeWeight: (next: number | null) => void;
  onChangeReps: (next: number | null) => void;
  onComplete: () => void;
}

type FocusedField = 'weight' | 'reps' | null;

export function ActiveSetCard({
  exercise,
  set,
  exerciseIndex,
  totalExercises,
  setIndex,
  totalSetsInExercise,
  weightStep,
  weightUnit,
  isLastSetOfExercise,
  ghostSets,
  onChangeWeight,
  onChangeReps,
  onComplete,
}: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState<FocusedField>(null);

  const canComplete = set.weight != null && set.reps != null;

  const handleComplete = useCallback(() => {
    if (!canComplete) return;
    if (isLastSetOfExercise) haptics.medium();
    else haptics.light();
    onComplete();
  }, [canComplete, isLastSetOfExercise, onComplete]);

  const labelStyle = [
    styles.label,
    { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
  ];

  return (
    <View style={styles.container}>
      <Text style={labelStyle}>EXERCISE {exerciseIndex} OF {totalExercises}</Text>
      <Text
        style={[
          styles.exerciseName,
          {
            color: theme.color.inkHero,
            fontFamily: theme.font.family.sansSemibold,
            fontSize: theme.font.size.title,
            letterSpacing: theme.font.tracking.title,
          },
        ]}
      >
        {exercise.exerciseName}
      </Text>

      <Text style={labelStyle}>SET {setIndex} OF {totalSetsInExercise}</Text>

      <Pressable
        onPress={() => setFocused(null)} // tap empty area clears focus
        style={styles.heroRow}
      >
        <NumericStepper
          value={set.weight}
          step={weightStep}
          unit={weightUnit}
          focused={focused === 'weight'}
          onFocus={() => setFocused('weight')}
          onBlur={() => setFocused(null)}
          onChange={onChangeWeight}
          size="hero"
          testID="weight-stepper"
        />
        <Text
          style={[
            styles.heroX,
            {
              color: theme.color.inkTertiary,
              fontFamily: theme.font.family.mono,
              fontSize: theme.font.size.hero * 0.7,
              lineHeight: theme.font.size.hero * theme.font.lineHeightMul.hero,
            },
          ]}
        >
          ×
        </Text>
        <NumericStepper
          value={set.reps}
          step={1}
          unit="REPS"
          focused={focused === 'reps'}
          onFocus={() => setFocused('reps')}
          onBlur={() => setFocused(null)}
          onChange={onChangeReps}
          size="hero"
          testID="reps-stepper"
        />
      </Pressable>

      {ghostSets.length > 0 ? (
        <>
          <View style={[styles.divider, { borderTopColor: theme.color.border }]} />
          <View style={styles.ghostList}>
            {ghostSets.map((g, i) => (
              <View key={g.id} style={styles.ghostRow}>
                <View style={styles.ghostLeft}>
                  <Text
                    style={[
                      styles.ghostLabel,
                      { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
                    ]}
                  >
                    SET {i + 1}
                  </Text>
                  <Text
                    style={[
                      styles.ghostValue,
                      { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
                    ]}
                  >
                    {g.weight ?? '–'} × {g.reps ?? '–'}
                  </Text>
                </View>
                <Text style={[styles.ghostCheck, { color: theme.color.accent }]}>✓</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* TEMPORARY tap-to-complete button — replaced by swipe gesture in Task 15 */}
      <Pressable
        onPress={handleComplete}
        disabled={!canComplete}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.completeBtn,
          {
            backgroundColor: theme.color.accent,
            opacity: pressed ? 0.85 : canComplete ? 1 : 0.4,
          },
        ]}
      >
        <Text
          style={[
            styles.completeBtnText,
            { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold },
          ]}
        >
          Complete set
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 24, gap: 6 },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingTop: 8,
  },
  exerciseName: { marginBottom: 18 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 8,
  },
  heroX: {
    paddingHorizontal: 6,
    opacity: 0.4,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 18,
  },
  ghostList: { gap: 8 },
  ghostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ghostLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  ghostLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  ghostValue: {
    fontSize: 13,
  },
  ghostCheck: {
    fontSize: 14,
  },
  completeBtn: {
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  completeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ActiveSetCard.tsx
git commit -m "$(cat <<'EOF'
add ActiveSetCard component (tap-to-complete scaffold)

Hero card with exercise name + giant weight×reps + stepper +
ghost stack of completed sets. Tap-to-complete button is a
placeholder for the swipe gesture (added in next task pair).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Rebuild WorkoutActive screen with one-card-at-a-time state machine

**Files:**
- Modify: `src/screens/WorkoutActive.tsx` (full rewrite)
- Read-only: `src/queries/workoutDetail.ts` (to confirm shape of `useWorkoutDetail()` data)

- [ ] **Step 1: Read the existing workoutDetail query**

Run: `cat src/queries/workoutDetail.ts`

Confirm the shape returned. The new screen will map `data.exercises[].sets[]` into the `ExerciseShape` type from `activeSet.ts`.

- [ ] **Step 2: Read the existing useAuth/profile path to find the user's `units`**

Run: `grep -rn "profiles" src/queries src/auth 2>/dev/null | head -10`

If there's already a profile query, use it. If not, default `unit = 'LB'` and `step = 5` for Phase 1; a per-user unit setting is Phase 3.

- [ ] **Step 3: Rewrite WorkoutActive.tsx**

Replace `src/screens/WorkoutActive.tsx` with:

```tsx
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ActiveSetCard } from '@/components/ActiveSetCard';
import {
  advanceCursor,
  type ActiveCursor,
  completedSetsBeforeCursor,
  type ExerciseShape,
  findExercise,
  findInitialCursor,
  findSet,
} from '@/components/activeSet';
import { ExercisePicker } from '@/components/ExercisePicker';
import { RestProgressBar } from '@/components/RestProgressBar';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { useAddSet, useUpdateSet } from '@/queries/sets';
import { useActiveWorkout, useFinishWorkout } from '@/queries/workouts';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { useRestTimer } from '@/ui/hooks/useRestTimer';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { useToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

export default function WorkoutActiveScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const activeQuery = useActiveWorkout(userId);
  const detail = useWorkoutDetail(activeQuery.data?.id);

  const addExercise = useAddExerciseToWorkout(toastError);
  const addSet = useAddSet(toastError);
  const updateSet = useUpdateSet(toastError);
  const finishWorkout = useFinishWorkout(userId, toastError);

  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRestTimer({ targetSeconds: 90 });
  const [cursor, setCursor] = useState<ActiveCursor | null>(null);

  // Map query data into the ExerciseShape used by the state machine
  const exercises: ExerciseShape[] = useMemo(() => {
    if (!detail.data) return [];
    return detail.data.exercises.map((we) => ({
      id: we.id,
      exerciseId: we.exercise_id,
      exerciseName: we.exercise?.name ?? 'Unknown exercise',
      orderIndex: we.order_index,
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

  // Initialize cursor when exercises first load, or reposition when external
  // state changes (e.g. new set added)
  useEffect(() => {
    if (exercises.length === 0) {
      setCursor(null);
      return;
    }
    if (cursor) {
      const ex = findExercise(exercises, cursor.weId);
      const set = ex ? findSet(ex, cursor.setId) : null;
      if (ex && set && !set.completed) return; // current cursor still valid
    }
    setCursor(findInitialCursor(exercises));
  }, [exercises, cursor]);

  const onChangeWeight = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { weight: next } });
    },
    [cursor, updateSet],
  );

  const onChangeReps = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { reps: next } });
    },
    [cursor, updateSet],
  );

  const onComplete = useCallback(async () => {
    if (!cursor) return;
    updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { completed: true } });
    timer.start();
    const next = advanceCursor(exercises, cursor);
    if (next === null) {
      // Workout done — keep user on screen with a Finish CTA (no auto-finish)
      setCursor(null);
    } else {
      setCursor(next);
    }
  }, [cursor, exercises, updateSet, timer]);

  const onFinish = useCallback(async () => {
    if (!activeQuery.data) return;
    await finishWorkout.mutateAsync(activeQuery.data.id);
    timer.stop();
    router.replace('/today');
  }, [activeQuery.data, finishWorkout, timer]);

  const onAddExercise = useCallback(
    async (exerciseId: string) => {
      if (!activeQuery.data) return;
      setPickerOpen(false);
      await addExercise.mutateAsync({ workoutId: activeQuery.data.id, exerciseId });
    },
    [activeQuery.data, addExercise],
  );

  const onAddSet = useCallback(async () => {
    if (!cursor) return;
    await addSet.mutateAsync({ weId: cursor.weId });
  }, [cursor, addSet]);

  const screenOptions = useMemo(
    () => ({
      title: (activeQuery.data?.title || 'Workout').toLowerCase(),
      headerRight: () => <SyncIndicator />,
    }),
    [activeQuery.data?.title],
  );

  if (!userId) return null;

  if (activeQuery.isLoading || detail.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }

  if (!activeQuery.data || !detail.data) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <Text style={[styles.empty, { color: theme.color.inkSecondary }]}>No active workout.</Text>
        <Pressable onPress={() => router.replace('/today')} style={styles.linkButton}>
          <Text style={[styles.linkText, { color: theme.color.accent }]}>Back to Today</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // No exercises yet
  if (exercises.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View style={[styles.center, { flex: 1, gap: theme.space.s4 }]}>
          <Text style={[styles.empty, { color: theme.color.inkSecondary }]}>
            Add your first exercise to begin.
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.primaryBtnText, { color: theme.color.onAccent }]}>
              + Add exercise
            </Text>
          </Pressable>
        </View>
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onAddExercise}
        />
      </SafeAreaView>
    );
  }

  // Cursor is null → all exercises complete → show Finish summary
  if (!cursor) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View style={[styles.center, { flex: 1, gap: theme.space.s4, paddingHorizontal: 20 }]}>
          <Text
            style={[
              styles.finishTitle,
              { color: theme.color.inkHero, fontFamily: theme.font.family.sansSemibold },
            ]}
          >
            Workout complete.
          </Text>
          <Text
            style={[
              styles.finishBody,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            {totalSetsCompleted(exercises)} sets · {totalVolume(exercises)} lb total volume
          </Text>
          <Pressable
            onPress={onFinish}
            disabled={finishWorkout.isPending}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {finishWorkout.isPending ? (
              <ActivityIndicator color={theme.color.onAccent} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: theme.color.onAccent }]}>
                → Finish workout
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                borderColor: theme.color.borderStrong,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.color.ink }]}>
              + Add exercise
            </Text>
          </Pressable>
        </View>
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onAddExercise}
        />
      </SafeAreaView>
    );
  }

  const currentEx = findExercise(exercises, cursor.weId)!;
  const currentSet = findSet(currentEx, cursor.setId)!;
  const currentExIdx = exercises.findIndex((e) => e.id === currentEx.id);
  const currentSetIdx = currentEx.sets.findIndex((s) => s.id === currentSet.id);
  const isLastSetOfExercise = currentSetIdx === currentEx.sets.length - 1;
  const ghostSets = completedSetsBeforeCursor(currentEx, cursor);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <Stack.Screen options={screenOptions} />
      <RestProgressBar
        running={timer.running}
        elapsedSeconds={timer.elapsed}
        targetSeconds={timer.targetSeconds}
        onSkip={timer.stop}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ActiveSetCard
          exercise={currentEx}
          set={currentSet}
          exerciseIndex={currentExIdx + 1}
          totalExercises={exercises.length}
          setIndex={currentSetIdx + 1}
          totalSetsInExercise={currentEx.sets.length}
          weightStep={5}
          weightUnit="LB"
          isLastSetOfExercise={isLastSetOfExercise}
          ghostSets={ghostSets}
          onChangeWeight={onChangeWeight}
          onChangeReps={onChangeReps}
          onComplete={onComplete}
        />
        <View style={styles.footerActions}>
          <Pressable
            onPress={onAddSet}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: theme.color.borderStrong, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.color.ink }]}>+ Add set</Text>
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: theme.color.borderStrong, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.color.ink }]}>+ Add exercise</Text>
          </Pressable>
        </View>
      </ScrollView>
      <ExercisePicker
        userId={userId}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onAddExercise}
      />
    </SafeAreaView>
  );
}

function totalSetsCompleted(exs: ExerciseShape[]): number {
  return exs.reduce((acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0);
}

function totalVolume(exs: ExerciseShape[]): number {
  return exs.reduce(
    (acc, ex) =>
      acc +
      ex.sets.reduce(
        (a2, s) => (s.completed && s.weight != null && s.reps != null ? a2 + s.weight * s.reps : a2),
        0,
      ),
    0,
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  scroll: { paddingBottom: 64 },
  empty: { fontSize: 14 },
  linkButton: { padding: 12 },
  linkText: { fontSize: 14 },
  primaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '500' },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 24,
  },
  finishTitle: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  finishBody: {
    fontSize: 14,
    textAlign: 'center',
  },
});
```

- [ ] **Step 4: Type-check + lint + test**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green. The cursor `useEffect` may trigger a React-warning lint rule about including/excluding deps — if so, add `// eslint-disable-next-line react-hooks/exhaustive-deps` next to the dependency array with a one-line comment about why cursor self-reference is intentional.

- [ ] **Step 5: Manual device verification (note in commit)**

Boot the app. Verify:
- Today screen renders the Repeat card if you have a finished workout (or empty slot if not).
- Tapping Repeat (or + Blank) lands you on the active screen.
- Active screen shows one exercise/set at a time with the hero number.
- Tap weight number to focus → chevrons appear → tap chevron to increment.
- Tap "Complete set" → advances to next set.
- Adding an exercise opens picker → tap exercise → new card.

- [ ] **Step 6: Commit**

```bash
git add src/screens/WorkoutActive.tsx
git commit -m "$(cat <<'EOF'
rebuild WorkoutActive screen with single-card state machine

One ActiveSetCard at a time, driven by the cursor state machine.
Completion advances to next set, then next exercise, then a
finish summary card. RestProgressBar at top of screen. + Blank
fallback for ad-hoc workouts; + Add set / + Add exercise as
secondary footer actions. Tap-to-complete still in place;
swipe gesture lands next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Swipe-up completion gesture + spring animations

**Files:**
- Modify: `src/components/ActiveSetCard.tsx`

- [ ] **Step 1: Replace the tap-to-complete button with a swipe-up handler**

Edit `src/components/ActiveSetCard.tsx`. At the top of the imports, add:

```tsx
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion } from '@/ui/motion';
```

Inside the `ActiveSetCard` component, BEFORE the existing `handleComplete`, add the gesture wiring:

```tsx
const translateY = useSharedValue(0);
const thresholdCrossed = useSharedValue(false);
const COMPLETION_THRESHOLD = 60;

const fireThresholdHaptic = useCallback(() => {
  haptics.rigid();
}, []);

const fireCompletion = useCallback(() => {
  handleComplete();
}, [handleComplete]);

const pan = Gesture.Pan()
  .activeOffsetY([-10, 10])
  .onUpdate((event) => {
    if (!canComplete) return;
    // Track finger upward (negative translationY). Below threshold = follow 1:1;
    // beyond threshold = rubber-band (logarithmic dampening).
    const ty = event.translationY;
    if (ty < -COMPLETION_THRESHOLD) {
      const excess = -ty - COMPLETION_THRESHOLD;
      translateY.value = -COMPLETION_THRESHOLD - Math.log(1 + excess) * 8;
      if (!thresholdCrossed.value) {
        thresholdCrossed.value = true;
        runOnJS(fireThresholdHaptic)();
      }
    } else {
      translateY.value = Math.min(0, ty);
      thresholdCrossed.value = false;
    }
  })
  .onEnd(() => {
    if (thresholdCrossed.value) {
      // Commit
      translateY.value = withSpring(-600, motion.spring.snappy);
      thresholdCrossed.value = false;
      runOnJS(fireCompletion)();
    } else {
      // Rebound to rest
      translateY.value = withSpring(0, motion.spring.rebound);
    }
  });

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: translateY.value }],
}));
```

Wrap the existing top-level `View style={styles.container}` in a `GestureDetector` and animated wrapper. Replace:

```tsx
return (
  <View style={styles.container}>
    {/* ...current content... */}
  </View>
);
```

With:

```tsx
return (
  <GestureDetector gesture={pan}>
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* ...current content (without the tap-to-complete button)... */}
      <View style={styles.swipeHintRow}>
        <Text
          style={[
            styles.swipeHint,
            { color: theme.color.inkTertiary, fontFamily: theme.font.family.sans },
          ]}
        >
          {canComplete ? '↑ Swipe up to complete' : 'Set weight and reps to continue'}
        </Text>
      </View>
    </Animated.View>
  </GestureDetector>
);
```

Remove the `<Pressable ... styles.completeBtn ...>` block and its `styles.completeBtn` / `styles.completeBtnText` entries.

Add to `styles`:

```tsx
swipeHintRow: { marginTop: 28, alignItems: 'center' },
swipeHint: { fontSize: 13 },
```

- [ ] **Step 2: Ensure the root layout's GestureHandlerRootView wraps the app**

Run: `grep -n GestureHandlerRootView app/_layout.tsx`

If missing, add `import 'react-native-gesture-handler';` at the very top of `app/_layout.tsx` (must be the first line in the file). For Expo Router with `react-native-gesture-handler` 2.30, this side-effect import is sufficient.

- [ ] **Step 3: Type-check + lint + test**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green.

- [ ] **Step 4: Device verification (note in commit)**

Boot the app. Open an active workout. Verify:
- Card follows finger on upward drag.
- At ~60px lift, a rigid haptic fires and the dampening kicks in (the card barely moves further).
- Release above threshold = card flies up off-screen, set is marked complete, next-set card appears.
- Release below threshold = card springs back to rest, no completion.
- Tap-to-complete button is gone.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActiveSetCard.tsx app/_layout.tsx
git commit -m "$(cat <<'EOF'
add swipe-up completion gesture to ActiveSetCard

Pan handler follows finger 1:1 up to 60px; rubber-bands beyond.
Crossing threshold fires Haptics.Rigid. Release above = snappy
spring off-screen + mutation + next-set. Release below = rebound.
Removes the tap-to-complete fallback button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Next-set slide-in animation

**Files:**
- Modify: `src/components/ActiveSetCard.tsx`

**Context:** The Active screen currently re-renders the card on cursor change without animation. To get the spec's "next-set slides in from below" feel, the new card should mount at `translateY = screenHeight` and animate to 0.

- [ ] **Step 1: Add a mount animation to the card**

Edit `src/components/ActiveSetCard.tsx`. Add to imports:

```tsx
import { useEffect } from 'react';
import { Dimensions } from 'react-native';
```

Inside the component, near the existing `useSharedValue` calls, add a mount value that starts at the screen height and animates to 0:

```tsx
const screenHeight = Dimensions.get('window').height;
const entryY = useSharedValue(screenHeight);

useEffect(() => {
  entryY.value = withSpring(0, motion.spring.settle);
  // Reset translateY whenever a new set mounts
  translateY.value = 0;
}, [set.id, entryY, translateY]);
```

Update `animatedStyle` to compose both:

```tsx
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: translateY.value + entryY.value }],
}));
```

- [ ] **Step 2: Use `set.id` as the `key` on `ActiveSetCard` in WorkoutActive**

Edit `src/screens/WorkoutActive.tsx`. Change the `<ActiveSetCard ... />` invocation to add `key={currentSet.id}`:

```tsx
<ActiveSetCard
  key={currentSet.id}
  exercise={currentEx}
  /* ...rest unchanged... */
/>
```

This forces a fresh mount per set, which triggers the entry animation.

- [ ] **Step 3: Type-check + lint + test**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green.

- [ ] **Step 4: Device verification**

Boot, complete a set, verify the next-set card slides in from below with the settle spring. Should feel tactile, not bouncy.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActiveSetCard.tsx src/screens/WorkoutActive.tsx
git commit -m "$(cat <<'EOF'
animate next-set card sliding in from below

New ActiveSetCard mounts at translateY = screenHeight and
springs to 0 via motion.spring.settle. WorkoutActive keys
the card by set.id so each new set gets a fresh mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Workout finish counter tally animation

**Files:**
- Modify: `src/screens/WorkoutActive.tsx` (just the Finish summary card section)

- [ ] **Step 1: Add a counter component for the volume/sets numbers**

Inside `src/screens/WorkoutActive.tsx`, add (above the `default export` function):

```tsx
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { motion as motionTokens } from '@/ui/motion';

const AnimatedText = Animated.createAnimatedComponent(Text);

function AnimatedCounter({
  toValue,
  suffix,
  style,
}: {
  toValue: number;
  suffix?: string;
  style: any;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(toValue, {
      duration: motionTokens.duration.counter,
      easing: Easing.out(Easing.cubic),
    });
  }, [toValue, v]);
  const props = useAnimatedProps(() => ({
    text: `${Math.round(v.value)}${suffix ?? ''}`,
  })) as any;
  return <AnimatedText style={style} animatedProps={props} />;
}
```

- [ ] **Step 2: Use AnimatedCounter in the Finish summary card**

Replace the `{totalSetsCompleted(exercises)} sets · {totalVolume(exercises)} lb total volume` line with two AnimatedCounter elements:

```tsx
<View style={{ flexDirection: 'row', gap: theme.space.s4 }}>
  <AnimatedCounter
    toValue={totalSetsCompleted(exercises)}
    suffix=" sets"
    style={[
      styles.finishBody,
      { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
    ]}
  />
  <AnimatedCounter
    toValue={totalVolume(exercises)}
    suffix=" lb"
    style={[
      styles.finishBody,
      { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
    ]}
  />
</View>
```

- [ ] **Step 3: Type-check + lint + test**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green. (TypeScript may complain about the `style: any` type; tighten if desired or leave with a one-line `// AnimatedText style prop is loosely typed in Reanimated 4` comment.)

- [ ] **Step 4: Device verification**

Complete a workout (run through all sets). Verify the finish summary card numbers tally from 0 to the final value over ~600ms with ease-out. No confetti, just the tally.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WorkoutActive.tsx
git commit -m "$(cat <<'EOF'
add finish summary counter tally animation

When user reaches the Finish summary card, sets and volume
counters tally from 0 to final values over 600ms with
ease-out. Restrained — no confetti, no streak fireworks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Exercise picker slide-up spring polish

**Files:**
- Modify: `src/components/ExercisePicker.tsx`

- [ ] **Step 1: Read the current ExercisePicker**

Run: `cat src/components/ExercisePicker.tsx`

Identify how the modal is presented (likely `<Modal animationType="slide">` or a custom Animated.View).

- [ ] **Step 2: If using <Modal animationType="slide">**

The system slide is good but stock. Replace with a custom spring animation:

```tsx
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '@/ui/motion';
```

Inside the component, manage the `translateY` for the sheet content. On `visible` change:

```tsx
const screenHeight = Dimensions.get('window').height;
const sheetY = useSharedValue(screenHeight);

useEffect(() => {
  if (visible) {
    sheetY.value = withSpring(0, motion.spring.settle);
  } else {
    sheetY.value = withTiming(screenHeight, { duration: 220 });
  }
}, [visible, sheetY, screenHeight]);

const sheetStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: sheetY.value }],
}));
```

Change `<Modal animationType="slide">` to `<Modal animationType="none" transparent>`. Wrap the existing sheet content in:

```tsx
<Animated.View style={[styles.sheet, sheetStyle]}>
  {/* existing content */}
</Animated.View>
```

(Adjust styles to anchor the sheet to the bottom of the screen.)

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 4: Device verification**

Tap "+ Add exercise". Verify the picker slides up with the settle spring — tactile, not bouncy. Closing slides down with timing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExercisePicker.tsx
git commit -m "$(cat <<'EOF'
replace ExercisePicker stock slide with settle spring

Custom Reanimated translateY with motion.spring.settle on open,
timing on close. Tactile rather than bouncy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Delete obsolete components; flip spec status to implemented

**Files:**
- Delete: `src/components/SetsTable.tsx`
- Delete: `src/components/ExerciseBlock.tsx`
- Modify: `docs/specs/2026-05-26-uplevel-phase-1-signature-design.md` (status: implemented)

- [ ] **Step 1: Verify no imports remain**

Run: `grep -rn "from '@/components/SetsTable'" src/ app/ 2>/dev/null; grep -rn "from '@/components/ExerciseBlock'" src/ app/ 2>/dev/null`

Expected: empty output (no consumers).

If any imports remain, fix them (the new WorkoutActive should be the only consumer and it doesn't use either).

- [ ] **Step 2: Delete the obsolete files**

Run:
```bash
git rm src/components/SetsTable.tsx src/components/ExerciseBlock.tsx
```

- [ ] **Step 3: Run the full test suite + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green.

- [ ] **Step 4: Flip the spec status**

Edit `docs/specs/2026-05-26-uplevel-phase-1-signature-design.md`:

Change line 3 from:
```
- **Status:** approved
```
To:
```
- **Status:** implemented
```

Also update the index `docs/specs/README.md` for the Phase 1 row:
```
| [2026-05-26](2026-05-26-uplevel-phase-1-signature-design.md) | Uplevel Phase 1 — Signature | implemented |
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
remove obsolete SetsTable + ExerciseBlock; flip Phase 1 to implemented

The single-card ActiveSetCard with swipe-up completion has
replaced the SetsTable spreadsheet model entirely. No remaining
consumers. Spec status flips from approved → implemented.

Phase 1 (Signature) ships: brutalist-lifter visual language,
Geist + Geist Mono typography, dark/light token sets, Today
screen with Repeat-Last-Workout primary, single-card Active
screen with swipe-up gesture, rest progress bar, finish
counter tally, refined motion + haptic discipline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Final verification — manual checklist**

End-to-end smoke test on device:

- [ ] Cold start → Today renders within ~1s with the Repeat card
- [ ] Tap Repeat → land on Active screen with first exercise pre-filled
- [ ] Tap weight number → chevrons appear, +5 lb haptic on tap
- [ ] Long-press chevron → ramp acceleration
- [ ] Tap number a second time → system keypad opens
- [ ] Swipe card up → 60px threshold haptic, release above = complete + next-set slides in
- [ ] Swipe card up partway → rebound to rest
- [ ] Rest progress bar fills along the top during rest
- [ ] Last set of last exercise → finish summary with counter tally → tap Finish → routes to Today
- [ ] Toggle iOS dark/light mode → Today + Active reflect (other screens stay dark)
- [ ] Existing screens (History, Progress, Profile) still render and don't crash

---

## Self-review checklist (for the implementing engineer)

After completing all tasks, run:

```bash
npm run typecheck && npm run lint && npm test
git log --oneline main..HEAD
```

Expected: 19 commits (one per task), all checks pass.

Verify against the spec — for each section of `docs/specs/2026-05-26-uplevel-phase-1-signature-design.md`, find the task that implemented it. If anything is missing, add a follow-up commit before declaring Phase 1 done.
