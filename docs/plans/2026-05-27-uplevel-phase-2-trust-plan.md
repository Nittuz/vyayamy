# Uplevel Phase 2 — Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five gym-trust gaps named in the 2026-05-26 audit — keypad autosave on 250ms debounce, cold-start Today snapshot, blocking sheet for multi-device workout collisions, after-24h banner for quarantined outbox rows, and persistent rest timer — without touching the local-first write path or the Phase 1 visual language.

**Architecture:** Presentation + a thin persistence sidecar (AsyncStorage) for ephemeral UI state. SQLite remains the data source of truth. New components compose into the existing `src/screens/Today.tsx` and `src/components/NumericStepperView.tsx`; new modules under `src/lib/`, `src/ui/`, `src/sync/`, and `src/queries/`.

**Tech Stack:** Expo 55, React Native 0.83, React 19, expo-router, expo-sqlite, expo-haptics, React Query 5.90, `@react-native-async-storage/async-storage` (already installed), Jest with ts-jest + better-sqlite3 mock.

**Spec:** [docs/specs/2026-05-27-uplevel-phase-2-trust-design.md](../specs/2026-05-27-uplevel-phase-2-trust-design.md)

**Testing note:** Same constraint as Phase 1 — `jest.setup.js` mocks `react-native` so JSX cannot be rendered in Jest. Logic that needs testing must live in pure hooks/helpers. The plan extracts each item's logic into a testable module and verifies UI on device.

**Branch:** `feat/phase-2-trust` (already checked out, branched off `feat/phase-1-signature`).

**Commit cadence:** One commit per task; Co-Authored-By footer required.

---

## File map

**New files:**
- `src/lib/kvStore.ts` — thin AsyncStorage wrapper with schema-version handling
- `src/lib/__tests__/kvStore.test.ts` — round-trip tests against an in-memory mock
- `src/ui/todaySnapshot.ts` — Today snapshot module
- `src/ui/__tests__/todaySnapshot.test.ts`
- `src/queries/activeWorkouts.ts` — collision detection query
- `src/queries/__tests__/activeWorkouts.test.ts`
- `src/components/CollisionSheet.tsx`
- `src/sync/quarantine.ts` — quarantined-row queries + retry/discard
- `src/sync/__tests__/quarantine.test.ts`
- `src/components/QuarantineBanner.tsx`
- `src/components/QuarantineSheet.tsx`
- `src/ui/hooks/restTimerPolicy.ts` — pure `shouldRestoreTimer` function
- `src/ui/hooks/__tests__/restTimerPolicy.test.ts`

**Modified files:**
- `src/components/numericStepper.ts` — add `useDebouncedCommit` hook + tests in existing test file
- `src/components/__tests__/numericStepper.test.ts` — extend
- `src/components/NumericStepperView.tsx` — wire debounce into keypad path
- `src/ui/hooks/useRestTimer.ts` — persist (startedAt, targetSeconds) via kvStore
- `src/screens/Today.tsx` — snapshot read/write, collision sheet, quarantine banner
- `app/_layout.tsx` — `hydrateSnapshot()` at boot
- `src/sync/engine.ts` — `clearAllKvState()` on sign-out + post-pull invalidation if missing
- `docs/specs/2026-05-27-uplevel-phase-2-trust-design.md` — flip to `implemented` at end
- `docs/specs/README.md` — index row update

**Untouched:**
- `src/db/*` (schema, migrations, mutations primitive, client)
- `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/state.ts` core
- All Phase 1 visual files (`ActiveSetCard`, `RepeatCard`, `RestProgressBar`, theme, motion, haptics, typography, colors)
- Non-Phase-1/2 screens (`History`, `HistoryDetail`, `Progress`, `Profile`, `TrainingPlan`, `Login`)

---

## Task 1: kvStore wrapper

**Files:**
- Create: `src/lib/kvStore.ts`
- Create: `src/lib/__tests__/kvStore.test.ts`

A small AsyncStorage wrapper that handles schema versioning, JSON encode/decode, and error swallowing. Future Phase 2 modules consume this rather than calling AsyncStorage directly so tests can mock once.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/kvStore.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getKv, setKv, removeKv } from '@/lib/kvStore';

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

interface SnapV1 {
  schemaVersion: 1;
  payload: string;
}

test('setKv round-trips through getKv with matching schemaVersion', async () => {
  await setKv<SnapV1>('test:key', { schemaVersion: 1, payload: 'hello' });
  const got = await getKv<SnapV1>('test:key', 1);
  expect(got).toEqual({ schemaVersion: 1, payload: 'hello' });
});

test('getKv returns null when key is missing', async () => {
  const got = await getKv<SnapV1>('test:missing', 1);
  expect(got).toBeNull();
});

test('getKv returns null and clears the key on schemaVersion mismatch', async () => {
  store['test:key'] = JSON.stringify({ schemaVersion: 0, payload: 'old' });
  const got = await getKv<SnapV1>('test:key', 1);
  expect(got).toBeNull();
  expect(store['test:key']).toBeUndefined();
});

test('getKv returns null on malformed JSON', async () => {
  store['test:key'] = '{not json';
  const got = await getKv<SnapV1>('test:key', 1);
  expect(got).toBeNull();
});

test('removeKv deletes the key', async () => {
  store['test:key'] = JSON.stringify({ schemaVersion: 1, payload: 'x' });
  await removeKv('test:key');
  expect(store['test:key']).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=kvStore`

Expected: FAIL with "Cannot find module '@/lib/kvStore'".

- [ ] **Step 3: Implement**

Create `src/lib/kvStore.ts`:

```ts
/**
 * Thin AsyncStorage wrapper with schema-version handling.
 *
 * Every stored value MUST include a `schemaVersion: number` field. Consumers
 * pass an expected version; mismatches return null AND clear the key (so old
 * data doesn't pollute future reads).
 *
 * All errors are swallowed and logged — KV is best-effort UX storage, never
 * a source of truth.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Versioned {
  schemaVersion: number;
}

export async function getKv<T extends Versioned>(
  key: string,
  expectedVersion: T['schemaVersion'],
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as T;
    if (parsed.schemaVersion !== expectedVersion) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // give up — KV is best-effort
    }
    return null;
  }
}

export async function setKv<T extends Versioned>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // give up — KV is best-effort
  }
}

export async function removeKv(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // give up — KV is best-effort
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=kvStore`

Expected: 5/5 pass.

- [ ] **Step 5: Type-check + lint + full suite**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: typecheck clean, same pre-existing lint count, all tests green (54+ — 49 from Phase 1 + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kvStore.ts src/lib/__tests__/kvStore.test.ts
git commit -m "$(cat <<'EOF'
add kvStore wrapper for schema-versioned AsyncStorage

Thin getKv/setKv/removeKv with schemaVersion mismatch handling
(clears the key on version drift) and best-effort error swallowing.
Foundation for Today snapshot and rest-timer persistence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Debounced autosave hook + wire-in

**Files:**
- Modify: `src/components/numericStepper.ts` (add `useDebouncedCommit`)
- Modify: `src/components/__tests__/numericStepper.test.ts` (add tests)
- Modify: `src/components/NumericStepperView.tsx` (wire in)

- [ ] **Step 1: Append failing tests for the new hook**

Open `src/components/__tests__/numericStepper.test.ts` and append at the end of the file:

```ts
import { renderHook, act } from '@testing-library/react-native';

import { useDebouncedCommit } from '@/components/numericStepper';

describe('useDebouncedCommit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not call onChange until debounce elapses', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('1'));
    act(() => result.current.bufferKeystroke('18'));
    act(() => result.current.bufferKeystroke('185'));
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(185);
  });

  test('restarts the timer on each keystroke', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('1'));
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => result.current.bufferKeystroke('18'));
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(onChange).not.toHaveBeenCalled(); // 400ms total, but reset at 200
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(18);
  });

  test('flushNow commits immediately and cancels pending timer', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('185'));
    act(() => result.current.flushNow());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(185);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1); // no double-fire
  });

  test('empty buffer commits null', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke(''));
    act(() => result.current.flushNow());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('invalid text does not commit', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('abc'));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('cancelPending clears the timer without committing', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('185'));
    act(() => result.current.cancelPending());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify failing test**

Run: `npm test -- --testPathPattern=numericStepper`

Expected: 6 new tests FAIL with "useDebouncedCommit is not a function" or "Cannot find module".

- [ ] **Step 3: Verify `@testing-library/react-native` is available**

Run: `npm ls @testing-library/react-native`

Expected: `@testing-library/react-native@13.x.x` resolved (it's already in `package.json` `devDependencies`).

If `renderHook` is not exported from `@testing-library/react-native@13`, fall back to manual hook testing — instantiate the hook by calling it inside a tiny test wrapper. Specifically, if `renderHook` is unavailable, replace test code with this alternative (extract pure logic that doesn't need React state):

Add an exported helper `createDebouncedCommit(onChange, debounceMs)` that returns the same shape but is plain JS (no React state — uses a closure variable). Test that. Keep the React hook (`useDebouncedCommit`) as a thin wrapper that mounts the plain helper into a `useRef` + `useEffect` for cleanup.

- [ ] **Step 4: Implement**

Open `src/components/numericStepper.ts` and append:

```ts
import { useEffect, useRef } from 'react';

/**
 * Debounced commit helper for NumericStepperView's keypad mode.
 *
 * Each call to bufferKeystroke restarts a timer. When the timer fires, the
 * buffered text is parsed via parseUserInput; valid numbers (and empty=null)
 * call onChange exactly once. flushNow cancels the pending timer and commits
 * the buffer immediately (called on blur). cancelPending clears the timer
 * without committing (called on unmount).
 *
 * Pure logic in TypeScript — the React hook is a thin wrapper that ensures
 * the closure dies with the component.
 */
export interface DebouncedCommit {
  bufferKeystroke: (rawText: string) => void;
  flushNow: () => void;
  cancelPending: () => void;
}

export function useDebouncedCommit(
  onChange: (next: number | null) => void,
  debounceMs: number,
): DebouncedCommit {
  const bufferRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange fresh without re-creating the hook contract every render
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const commit = () => {
    const text = bufferRef.current;
    if (text.trim() === '') {
      onChangeRef.current(null);
      return;
    }
    const n = Number(text.trim());
    if (Number.isFinite(n)) {
      onChangeRef.current(n);
    }
    // invalid → no-op
  };

  const bufferKeystroke = (rawText: string) => {
    bufferRef.current = rawText;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commit();
    }, debounceMs);
  };

  const flushNow = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commit();
  };

  const cancelPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { bufferKeystroke, flushNow, cancelPending };
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --testPathPattern=numericStepper`

Expected: all stepper tests pass (17 existing + 6 new = 23).

If `renderHook` is not available in `@testing-library/react-native@13`, simplify the tests by exporting `createDebouncedCommit` (plain TS, no React) and testing that instead. The `useDebouncedCommit` hook just wraps it for cleanup. Mark this in the report.

- [ ] **Step 6: Wire `useDebouncedCommit` into `NumericStepperView.tsx`**

Read `src/components/NumericStepperView.tsx`. Find the section where `editingText` is being managed (around the `commitEdit` function and the `TextInput` `onChangeText`/`onBlur` handlers).

Add the import:

```tsx
import { useDebouncedCommit } from './numericStepper';
```

Inside the component, near the existing `editingText` state declaration, add:

```tsx
const debounced = useDebouncedCommit(onChange, 250);
```

Modify the `TextInput`'s `onChangeText` handler to ALSO call `debounced.bufferKeystroke`:

```tsx
onChangeText={(text) => {
  setEditingText(text);
  debounced.bufferKeystroke(text);
}}
```

Replace the existing inline `commitEdit` (which is the blur handler) with a wrapper that flushes the debounced commit immediately:

```tsx
const commitEdit = useCallback(() => {
  debounced.flushNow();
  setEditingText(null);
}, [debounced]);
```

(Note: the new `commitEdit` no longer needs the `parseUserInput(editingText)` logic — that's now inside `debounced.flushNow`.)

Also unmount cleanup — already handled by `useDebouncedCommit`'s internal effect.

- [ ] **Step 7: Run full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: typecheck clean, same lint count, 55+ tests pass (49 Phase 1 + 5 kvStore + 6 stepper-debounce, plus the existing 17 stepper tests stay green).

- [ ] **Step 8: Commit**

```bash
git add src/components/numericStepper.ts src/components/__tests__/numericStepper.test.ts src/components/NumericStepperView.tsx
git commit -m "$(cat <<'EOF'
autosave keypad-mode typing on a 250ms debounce

Adds useDebouncedCommit hook to numericStepper.ts: bufferKeystroke
restarts a 250ms timer, flushNow commits immediately (on blur),
cancelPending clears without commit (on unmount). Wired into
NumericStepperView's TextInput edit mode so typed values save
~250ms after the final keystroke even before blur — closing the
'crash mid-typing' data loss gap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Today snapshot module + tests

**Files:**
- Create: `src/ui/todaySnapshot.ts`
- Create: `src/ui/__tests__/todaySnapshot.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/ui/__tests__/todaySnapshot.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSnapshot,
  getCachedSnapshot,
  hydrateSnapshot,
  persistSnapshot,
  TodaySnapshot,
  __resetCacheForTests,
} from '@/ui/todaySnapshot';

const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  __resetCacheForTests();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    store[k] = v;
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (k: string) => {
    delete store[k];
  });
});

const sample: TodaySnapshot = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  state: 'repeat',
  repeatTitle: 'Push',
  repeatDaysAgo: 2,
  repeatSeeds: [
    { exerciseId: 'ex-1', exerciseName: 'Bench', seedWeight: 185, seedReps: 5 },
  ],
  recentRows: [{ id: 'w-1', title: 'Pull', daysAgo: 4 }],
};

test('getCachedSnapshot returns null before hydrate', () => {
  expect(getCachedSnapshot()).toBeNull();
});

test('hydrateSnapshot loads a previously-persisted value into the cache', async () => {
  store['@flexyug/today-snapshot/v1'] = JSON.stringify(sample);
  await hydrateSnapshot();
  expect(getCachedSnapshot()).toEqual(sample);
});

test('persistSnapshot writes and updates the cache', async () => {
  await persistSnapshot(sample);
  expect(getCachedSnapshot()).toEqual(sample);
  expect(JSON.parse(store['@flexyug/today-snapshot/v1']!)).toEqual(sample);
});

test('clearSnapshot clears AsyncStorage and the cache', async () => {
  await persistSnapshot(sample);
  await clearSnapshot();
  expect(getCachedSnapshot()).toBeNull();
  expect(store['@flexyug/today-snapshot/v1']).toBeUndefined();
});

test('hydrateSnapshot discards snapshots older than 7 days', async () => {
  const stale: TodaySnapshot = {
    ...sample,
    capturedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  };
  store['@flexyug/today-snapshot/v1'] = JSON.stringify(stale);
  await hydrateSnapshot();
  expect(getCachedSnapshot()).toBeNull();
});

test('hydrateSnapshot ignores corrupt JSON', async () => {
  store['@flexyug/today-snapshot/v1'] = '{not json';
  await hydrateSnapshot();
  expect(getCachedSnapshot()).toBeNull();
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- --testPathPattern=todaySnapshot`

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/ui/todaySnapshot.ts`:

```ts
/**
 * Today screen snapshot — persists render-ready state to AsyncStorage on
 * change; rehydrates synchronously at first paint on cold start.
 *
 * Caching strategy:
 *   - `hydrateSnapshot()` runs on app boot alongside initDb()
 *   - getCachedSnapshot() returns the in-memory cache (synchronous, cheap)
 *   - persistSnapshot() updates both cache and AsyncStorage
 *   - clearSnapshot() runs on sign-out
 *
 * Staleness: snapshots older than 7 days are discarded on hydrate.
 */
import type { ExerciseSeed } from '@/queries/repeatLastWorkout';
import { getKv, removeKv, setKv } from '@/lib/kvStore';

const STORAGE_KEY = '@flexyug/today-snapshot/v1';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 1 as const;

export interface TodaySnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  capturedAt: string;
  state: 'active' | 'repeat' | 'empty';
  repeatTitle?: string;
  repeatDaysAgo?: number;
  repeatSeeds?: ExerciseSeed[];
  recentRows: { id: string; title: string; daysAgo: number }[];
}

let cached: TodaySnapshot | null = null;

export function getCachedSnapshot(): TodaySnapshot | null {
  return cached;
}

export async function hydrateSnapshot(): Promise<void> {
  const value = await getKv<TodaySnapshot>(STORAGE_KEY, SCHEMA_VERSION);
  if (!value) {
    cached = null;
    return;
  }
  const age = Date.now() - new Date(value.capturedAt).getTime();
  if (!Number.isFinite(age) || age > STALE_MS || age < 0) {
    cached = null;
    await removeKv(STORAGE_KEY);
    return;
  }
  cached = value;
}

export async function persistSnapshot(snap: TodaySnapshot): Promise<void> {
  cached = snap;
  await setKv(STORAGE_KEY, snap);
}

export async function clearSnapshot(): Promise<void> {
  cached = null;
  await removeKv(STORAGE_KEY);
}

// Test-only: reset the module-level cache between tests
export function __resetCacheForTests(): void {
  cached = null;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=todaySnapshot`

Expected: 6/6 pass.

- [ ] **Step 5: Type-check + lint + full suite**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: all green; ~61 tests now (55 from prior tasks + 6 new).

- [ ] **Step 6: Commit**

```bash
git add src/ui/todaySnapshot.ts src/ui/__tests__/todaySnapshot.test.ts
git commit -m "$(cat <<'EOF'
add Today screen snapshot module

Persists render-ready Today state to AsyncStorage on change;
rehydrates synchronously at first paint. 7-day staleness guard.
In-memory cache lets the screen read synchronously on first paint
without awaiting AsyncStorage. Schema-versioned to survive future
shape changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Today screen snapshot integration

**Files:**
- Modify: `app/_layout.tsx` (call `hydrateSnapshot()` at boot alongside `initDb()`)
- Modify: `src/screens/Today.tsx` (read snapshot at first paint, persist on query change)

- [ ] **Step 1: Wire `hydrateSnapshot()` into boot**

Read `app/_layout.tsx`. Find the `useEffect` that calls `initDb()` (currently wraps it in `Promise.race` with a timeout).

Add import at top:
```tsx
import { hydrateSnapshot } from '@/ui/todaySnapshot';
```

Inside the boot `useEffect`'s async IIFE, BEFORE the `await Promise.race([initDb(), ...])` line, add:

```tsx
// Hydrate the Today snapshot in parallel with SQLite init so the first paint
// has render-ready state. Don't await — initDb is the gate, hydrate races it.
void hydrateSnapshot();
```

- [ ] **Step 2: Read snapshot in Today screen, persist on query change**

Read current `src/screens/Today.tsx`.

Add imports at top:
```tsx
import {
  getCachedSnapshot,
  persistSnapshot,
  type TodaySnapshot,
} from '@/ui/todaySnapshot';
```

Near the top of the `TodayScreen` component (after the existing `useMemo` for greeting), add:

```tsx
// Read the snapshot synchronously at first paint. After live queries land
// they override the snapshot view via the normal rendering paths.
const initialSnapshot = useRef(getCachedSnapshot()).current;
```

Also add `import { useRef } from 'react';` if not already present.

Inside the rendering logic, where the screen currently reads `lastFinishedQuery.data` / `activeQuery.data` to decide which card to render, fall back to the snapshot when live data is still loading. Specifically, change the loading branch from:

```tsx
) : lastFinishedQuery.isLoading ? (
  <View style={styles.cardSkeleton}>
    <ActivityIndicator color={theme.color.inkSecondary} />
  </View>
) : lastFinishedQuery.data ? (
```

to:

```tsx
) : lastFinishedQuery.isLoading && !initialSnapshot ? (
  <View style={styles.cardSkeleton}>
    <ActivityIndicator color={theme.color.inkSecondary} />
  </View>
) : lastFinishedQuery.data ? (
```

Then ADD a sibling case for when `lastFinishedQuery.isLoading` but the snapshot has a `repeat` state:

```tsx
) : lastFinishedQuery.isLoading && initialSnapshot?.state === 'repeat' && initialSnapshot.repeatSeeds ? (
  <RepeatCard
    title={initialSnapshot.repeatTitle ?? 'Workout'}
    daysAgo={initialSnapshot.repeatDaysAgo ?? 0}
    seeds={initialSnapshot.repeatSeeds}
    loading
    onPress={() => {/* no-op until live data lands */}}
  />
) : lastFinishedQuery.data ? (
```

(The full conditional chain becomes: active → snapshot-while-loading → live repeat → empty-slot.)

Add a `useEffect` that persists the snapshot when all three source queries are settled:

```tsx
useEffect(() => {
  if (
    activeQuery.isLoading ||
    lastFinishedQuery.isLoading ||
    recentQuery.isLoading
  ) {
    return;
  }
  const state: TodaySnapshot['state'] = activeQuery.data
    ? 'active'
    : lastFinishedQuery.data
      ? 'repeat'
      : 'empty';
  const recent = (recentQuery.data ?? []).map((w) => ({
    id: w.id,
    title: w.title || 'Workout',
    daysAgo: daysSince(w.started_at),
  }));
  void persistSnapshot({
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    state,
    repeatTitle: lastFinishedQuery.data?.workout.title,
    repeatDaysAgo: lastFinishedQuery.data
      ? daysSince(lastFinishedQuery.data.workout.ended_at)
      : undefined,
    repeatSeeds: lastFinishedQuery.data?.seeds,
    recentRows: recent,
  });
}, [
  activeQuery.isLoading,
  activeQuery.data,
  lastFinishedQuery.isLoading,
  lastFinishedQuery.data,
  recentQuery.isLoading,
  recentQuery.data,
]);
```

Note: `daysSince` is the existing helper at the bottom of `Today.tsx` — already defined.

- [ ] **Step 3: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx src/screens/Today.tsx
git commit -m "$(cat <<'EOF'
wire Today snapshot hydration + persistence

Boot calls hydrateSnapshot in parallel with initDb so the
snapshot is in-memory by first paint. Today renders the cached
snapshot's repeat card during the live-query loading window
instead of a spinner. Persists a fresh snapshot whenever all
three source queries settle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Workout collision query + tests

**Files:**
- Create: `src/queries/activeWorkouts.ts`
- Create: `src/queries/__tests__/activeWorkouts.test.ts`

- [ ] **Step 1: Read existing query patterns for context**

Run: `cat src/queries/repeatLastWorkout.ts | head -40`

Confirm the `getDb()` import path, the `useQuery` pattern, and where `queryKeys` lives.

- [ ] **Step 2: Write failing tests**

Create `src/queries/__tests__/activeWorkouts.test.ts`:

```ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout, finishWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet } from '@/queries/sets';
import { getActiveWorkoutCollisions } from '@/queries/activeWorkouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'user-collision-test';
const EX_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_ID, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('returns single workout when only one is active', async () => {
  await createWorkout({ userId: USER_ID, title: 'Push' });
  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(1);
  expect(result.details.size).toBe(0); // details only populated on collision
});

test('returns empty when user has no active workouts', async () => {
  const w = await createWorkout({ userId: USER_ID, title: 'Push' });
  await finishWorkout(w);
  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(0);
});

test('detects 2 unfinished workouts with details', async () => {
  const w1 = await createWorkout({ userId: USER_ID, title: 'Push' });
  const we1 = await addExerciseToWorkout({ workoutId: w1, exerciseId: EX_ID });
  await addSet(we1);
  await addSet(we1);

  const w2 = await createWorkout({ userId: USER_ID, title: 'Pull' });
  const we2 = await addExerciseToWorkout({ workoutId: w2, exerciseId: EX_ID });
  await addSet(we2);

  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(2);
  expect(result.details.get(w1)).toEqual({ setCount: 2, exerciseCount: 1 });
  expect(result.details.get(w2)).toEqual({ setCount: 1, exerciseCount: 1 });
});

test('returns workouts ordered by started_at DESC', async () => {
  const w1 = await createWorkout({ userId: USER_ID, title: 'Older' });
  // Force a different started_at by direct DB update — createWorkout uses now()
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET started_at = ? WHERE id = ?', [
    '2026-05-25T08:00:00.000Z',
    w1,
  ]);
  const w2 = await createWorkout({ userId: USER_ID, title: 'Newer' });

  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts[0]!.id).toBe(w2);
  expect(result.workouts[1]!.id).toBe(w1);
});

test('ignores soft-deleted workouts', async () => {
  await createWorkout({ userId: USER_ID, title: 'Active' });
  const w2 = await createWorkout({ userId: USER_ID, title: 'Deleted' });
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET deleted_at = ? WHERE id = ?', [
    new Date().toISOString(),
    w2,
  ]);
  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(1);
  expect(result.workouts[0]!.title).toBe('Active');
});
```

- [ ] **Step 3: Run — expect fail**

Run: `npm test -- --testPathPattern=activeWorkouts`

Expected: FAIL ("Cannot find module").

- [ ] **Step 4: Implement**

Create `src/queries/activeWorkouts.ts`:

```ts
/**
 * Active-workout collision detection.
 *
 * When two devices both have unfinished workouts for the same user, the post-
 * pull state has multiple rows with ended_at IS NULL. This query surfaces
 * them so the UI can present an explicit choose-which-to-resume sheet.
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import type { Workout } from '@/db/types';

import { queryKeys } from './keys';

export interface ActiveWorkoutDetail {
  setCount: number;
  exerciseCount: number;
}

export interface ActiveWorkoutCollisions {
  workouts: Workout[];
  details: Map<string, ActiveWorkoutDetail>;
}

export async function getActiveWorkoutCollisions(
  userId: string,
): Promise<ActiveWorkoutCollisions> {
  const db = await getDb();
  const workouts = await db.getAllAsync<Workout>(
    `SELECT * FROM workouts
       WHERE user_id = ?
         AND ended_at IS NULL
         AND deleted_at IS NULL
       ORDER BY started_at DESC`,
    [userId],
  );
  if (workouts.length < 2) return { workouts, details: new Map() };

  const details = new Map<string, ActiveWorkoutDetail>();
  for (const w of workouts) {
    const r = await db.getFirstAsync<{ set_count: number; exercise_count: number }>(
      `SELECT
         COUNT(DISTINCT s.id) AS set_count,
         COUNT(DISTINCT we.id) AS exercise_count
       FROM workout_exercises we
       LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s.deleted_at IS NULL
       WHERE we.workout_id = ? AND we.deleted_at IS NULL`,
      [w.id],
    );
    details.set(w.id, {
      setCount: r?.set_count ?? 0,
      exerciseCount: r?.exercise_count ?? 0,
    });
  }
  return { workouts, details };
}

export function useActiveWorkoutCollisions(userId: string | undefined) {
  return useQuery({
    queryKey: userId
      ? [...queryKeys.workouts.all, 'collisions', userId]
      : ['workouts', 'collisions', 'none'],
    queryFn: () =>
      userId
        ? getActiveWorkoutCollisions(userId)
        : Promise.resolve({ workouts: [], details: new Map() } as ActiveWorkoutCollisions),
    enabled: !!userId,
  });
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- --testPathPattern=activeWorkouts`

Expected: 5/5 pass.

- [ ] **Step 6: Type-check + full suite**

Run: `npm run typecheck && npm test 2>&1 | tail -3`

Expected: green; ~66 tests.

- [ ] **Step 7: Commit**

```bash
git add src/queries/activeWorkouts.ts src/queries/__tests__/activeWorkouts.test.ts
git commit -m "$(cat <<'EOF'
add active-workout collision query

getActiveWorkoutCollisions returns all unfinished workouts for a
user with set + exercise counts per row. Drives the Phase 2
CollisionSheet when len >= 2. Details map is empty when no
collision (saves the count subqueries for the common case).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CollisionSheet component

**Files:**
- Create: `src/components/CollisionSheet.tsx`

- [ ] **Step 1: Build the component**

Create `src/components/CollisionSheet.tsx`:

```tsx
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Workout } from '@/db/types';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  workouts: Workout[];
  details: Map<string, { setCount: number; exerciseCount: number }>;
  onResume: (workoutId: string) => void;
  onDiscard: (workoutId: string) => void;
}

export function CollisionSheet({ visible, workouts, details, onResume, onDiscard }: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.backdrop, { backgroundColor: theme.color.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.color.bg }]}>
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
            Resume which workout?
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            We found {workouts.length} unfinished workouts. Pick one to resume;
            the others will be discarded.
          </Text>
          <ScrollView style={styles.list}>
            {workouts.map((w) => {
              const d = details.get(w.id);
              const startLabel = formatStartLabel(w.started_at);
              return (
                <View
                  key={w.id}
                  style={[styles.row, { borderColor: theme.color.border }]}
                >
                  <Text
                    style={[
                      styles.rowTitle,
                      {
                        color: theme.color.ink,
                        fontFamily: theme.font.family.sansSemibold,
                      },
                    ]}
                  >
                    {w.title || 'Workout'}
                  </Text>
                  <Text
                    style={[
                      styles.rowMeta,
                      { color: theme.color.inkTertiary, fontFamily: theme.font.family.mono },
                    ]}
                  >
                    {startLabel} · {d?.exerciseCount ?? 0} exercises · {d?.setCount ?? 0} sets
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => {
                        haptics.light();
                        onResume(w.id);
                      }}
                      style={({ pressed }) => [
                        styles.resumeBtn,
                        {
                          backgroundColor: theme.color.accent,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.resumeText,
                          {
                            color: theme.color.onAccent,
                            fontFamily: theme.font.family.sansSemibold,
                          },
                        ]}
                      >
                        → Resume
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        haptics.medium();
                        onDiscard(w.id);
                      }}
                      style={({ pressed }) => [
                        styles.discardBtn,
                        { opacity: pressed ? 0.5 : 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.discardText,
                          {
                            color: theme.color.danger,
                            fontFamily: theme.font.family.sansMedium,
                          },
                        ]}
                      >
                        Discard
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function formatStartLabel(iso: string): string {
  const d = new Date(iso);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const day = days[d.getDay()];
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${h}:${m}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxHeight: '80%',
  },
  title: {
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  list: {
    maxHeight: 400,
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  resumeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  resumeText: {
    fontSize: 13,
  },
  discardBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  discardText: {
    fontSize: 12,
  },
});
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: typecheck clean, no new lint warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/CollisionSheet.tsx
git commit -m "$(cat <<'EOF'
add CollisionSheet component for resolving multiple active workouts

Modal sheet renders each unfinished workout with title, started-at,
set count, and exercise count. Per-row Resume / Discard. No cancel
— sheet is blocking by design, the user must resolve before
continuing on Today.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Today screen collision integration + post-pull invalidation

**Files:**
- Modify: `src/screens/Today.tsx`
- Modify: `src/queries/repeatLastWorkout.ts` (add `discardWorkout` helper if not already present in queries layer)
- Verify: `src/sync/engine.ts` (confirm post-pull invalidation reaches workouts.all)

- [ ] **Step 1: Verify post-pull invalidation**

Run: `grep -n "syncInvalidationRoots\|invalidateAfterSync" src/sync/engine.ts`

Confirm `syncInvalidationRoots` includes the workouts key prefix (likely `queryKeys.workouts.all`). If `workouts` is not in there, add it:

Open `src/sync/engine.ts` and find the `syncInvalidationRoots` array (somewhere near top of file). Verify it includes the workouts prefix; if missing, add it with import `import { queryKeys } from '@/queries/keys'`:

```ts
const syncInvalidationRoots = [
  queryKeys.workouts.all,
  // ... existing entries
];
```

(Reading the existing file is the right starting move; only add if missing.)

- [ ] **Step 2: Add discardWorkout helper**

Open `src/queries/workouts.ts`. The file already has `deleteWorkoutLocal`. Verify it exists by:

```bash
grep -n "deleteWorkoutLocal" src/queries/workouts.ts
```

If present, use that. If not, add this function after `finishWorkout`:

```ts
export async function discardWorkoutLocal(workoutId: string): Promise<void> {
  // Soft-delete via the standard mutation path. Cascading delete of
  // workout_exercises and sets is handled by enqueueMutation when
  // table='workouts' op='delete'.
  await enqueueMutation({ table: 'workouts', op: 'delete', rowId: workoutId });
  void triggerPush();
}
```

(Reuse `deleteWorkoutLocal` if it already exists — same purpose.)

- [ ] **Step 3: Wire CollisionSheet into Today**

Open `src/screens/Today.tsx`. Add imports:

```tsx
import { CollisionSheet } from '@/components/CollisionSheet';
import { useActiveWorkoutCollisions } from '@/queries/activeWorkouts';
import { deleteWorkoutLocal } from '@/queries/workouts'; // or discardWorkoutLocal
```

Inside `TodayScreen`, near the other query hooks, add:

```tsx
const collisionsQuery = useActiveWorkoutCollisions(userId);
const hasCollision = (collisionsQuery.data?.workouts.length ?? 0) >= 2;

const onCollisionResume = useCallback(
  async (workoutId: string) => {
    if (!collisionsQuery.data) return;
    // Discard the others
    const toDiscard = collisionsQuery.data.workouts
      .map((w) => w.id)
      .filter((id) => id !== workoutId);
    for (const id of toDiscard) {
      // eslint-disable-next-line no-await-in-loop
      await deleteWorkoutLocal(id);
    }
    // Invalidate so collisionsQuery refetches and sheet disappears
    qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    router.push('/workout/active');
  },
  [collisionsQuery.data, qc],
);

const onCollisionDiscard = useCallback(
  async (workoutId: string) => {
    await deleteWorkoutLocal(workoutId);
    qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
  },
  [qc],
);
```

You'll need `useQueryClient` from `@tanstack/react-query` and `queryKeys` from `@/queries/keys`. Add the imports and:

```tsx
const qc = useQueryClient();
```

At the very end of the `TodayScreen` return (just before the closing `</SafeAreaView>`), add:

```tsx
<CollisionSheet
  visible={hasCollision}
  workouts={collisionsQuery.data?.workouts ?? []}
  details={collisionsQuery.data?.details ?? new Map()}
  onResume={onCollisionResume}
  onDiscard={onCollisionDiscard}
/>
```

- [ ] **Step 4: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. The collisions integration is reactive — when no collision exists, the modal's `visible={false}` keeps it dormant.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Today.tsx src/queries/workouts.ts src/sync/engine.ts
git commit -m "$(cat <<'EOF'
integrate workout-collision sheet into Today screen

CollisionSheet renders over Today whenever the user has 2+
unfinished workouts. Resume picks one and discards the rest;
Discard removes a single one. Verified sync engine's post-pull
invalidation reaches workouts.all so the collisions query
refetches automatically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Quarantine module + tests

**Files:**
- Create: `src/sync/quarantine.ts`
- Create: `src/sync/__tests__/quarantine.test.ts`

- [ ] **Step 1: Read MAX_ATTEMPTS source**

Run: `grep -n "MAX_ATTEMPTS" src/sync/push.ts`

Expected: a constant declaration like `const MAX_ATTEMPTS = 5;`. Note whether it's exported. If not, change it to `export const MAX_ATTEMPTS = 5;` (single-line edit). The quarantine module will import this rather than re-declaring.

- [ ] **Step 2: Write failing tests**

Create `src/sync/__tests__/quarantine.test.ts`:

```ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import {
  STALE_THRESHOLD_MS,
  discardQuarantinedRow,
  getQuarantined,
  retryQuarantinedRow,
} from '@/sync/quarantine';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
});

async function insertStuckRow(args: {
  table: string;
  op: string;
  rowId: string;
  payload: object;
  createdAt: string;
  attempts: number;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [
      args.table,
      args.op,
      args.rowId,
      JSON.stringify(args.payload),
      args.createdAt,
      args.attempts,
    ],
  );
}

test('getQuarantined returns only rows with attempts >= MAX_ATTEMPTS', async () => {
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-1',
    payload: { weight: 185 },
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    attempts: 5,
  });
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-2',
    payload: { weight: 100 },
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    attempts: 3,
  });
  const rows = await getQuarantined();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.row_id).toBe('set-1');
});

test('retryQuarantinedRow resets attempts to 0 and clears next_attempt_at', async () => {
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-1',
    payload: {},
    createdAt: new Date().toISOString(),
    attempts: 5,
  });
  const db = await getDb();
  const before = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ?',
    ['set-1'],
  );
  await retryQuarantinedRow(before!.id);
  const after = await db.getFirstAsync<{ attempts: number; next_attempt_at: string | null }>(
    'SELECT attempts, next_attempt_at FROM outbox WHERE row_id = ?',
    ['set-1'],
  );
  expect(after!.attempts).toBe(0);
  expect(after!.next_attempt_at).toBeNull();
});

test('discardQuarantinedRow removes the outbox row entirely', async () => {
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-1',
    payload: {},
    createdAt: new Date().toISOString(),
    attempts: 5,
  });
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ?',
    ['set-1'],
  );
  await discardQuarantinedRow(row!.id);
  const after = await db.getAllAsync('SELECT id FROM outbox WHERE row_id = ?', ['set-1']);
  expect(after).toHaveLength(0);
});

test('STALE_THRESHOLD_MS is 24 hours', () => {
  expect(STALE_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
});
```

- [ ] **Step 3: Run — expect fail**

Run: `npm test -- --testPathPattern=quarantine`

Expected: FAIL ("Cannot find module").

- [ ] **Step 4: Implement**

Create `src/sync/quarantine.ts`:

```ts
/**
 * Quarantined outbox rows — entries that have failed to push MAX_ATTEMPTS
 * times. They sit in the outbox forever until the user explicitly retries
 * or discards. The Phase 2 banner surfaces stale ones (>24h old).
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { MAX_ATTEMPTS } from '@/sync/push';
import { triggerPush } from '@/sync/engine';

export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface QuarantinedRow {
  id: number;
  table_name: string;
  op: string;
  row_id: string;
  payload_json: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export async function getQuarantined(): Promise<QuarantinedRow[]> {
  const db = await getDb();
  return db.getAllAsync<QuarantinedRow>(
    `SELECT id, table_name, op, row_id, payload_json, created_at, attempts, last_error
       FROM outbox
       WHERE attempts >= ?
       ORDER BY id ASC`,
    [MAX_ATTEMPTS],
  );
}

export function getStaleQuarantined(
  rows: QuarantinedRow[],
  now: number = Date.now(),
): QuarantinedRow[] {
  return rows.filter((r) => {
    const age = now - new Date(r.created_at).getTime();
    return Number.isFinite(age) && age >= STALE_THRESHOLD_MS;
  });
}

export function useQuarantined() {
  return useQuery({
    queryKey: ['outbox', 'quarantined'],
    queryFn: getQuarantined,
    staleTime: 5_000,
  });
}

export async function retryQuarantinedRow(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE outbox SET attempts = 0, next_attempt_at = NULL WHERE id = ?', [id]);
  void triggerPush();
}

export async function retryAllQuarantined(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE outbox SET attempts = 0, next_attempt_at = NULL WHERE attempts >= ?',
    [MAX_ATTEMPTS],
  );
  void triggerPush();
}

export async function discardQuarantinedRow(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
}

export async function discardAllQuarantined(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE attempts >= ?', [MAX_ATTEMPTS]);
}

export function summarizeRow(row: QuarantinedRow): string {
  try {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (row.table_name === 'sets' && payload.weight != null && payload.reps != null) {
      return `Set · ${String(payload.weight)} × ${String(payload.reps)}`;
    }
    if (row.table_name === 'workouts' && payload.title != null) {
      return `Workout · "${String(payload.title)}"`;
    }
    return `${row.table_name} · ${row.op}`;
  } catch {
    return `${row.table_name} · ${row.op}`;
  }
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- --testPathPattern=quarantine`

Expected: 4/4 pass.

- [ ] **Step 6: Type-check + suite**

Run: `npm run typecheck && npm test 2>&1 | tail -3`

Expected: green; ~71 tests.

- [ ] **Step 7: Commit**

```bash
git add src/sync/quarantine.ts src/sync/__tests__/quarantine.test.ts src/sync/push.ts
git commit -m "$(cat <<'EOF'
add quarantined-outbox module: query, retry, discard

getQuarantined returns rows with attempts >= MAX_ATTEMPTS.
retryQuarantinedRow resets attempts to 0 and pings sync.
discardQuarantinedRow removes the row entirely. STALE_THRESHOLD_MS
(24h) is the banner's visibility cutoff. Also exports MAX_ATTEMPTS
from push.ts as the single source of truth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: QuarantineBanner + QuarantineSheet components

**Files:**
- Create: `src/components/QuarantineBanner.tsx`
- Create: `src/components/QuarantineSheet.tsx`

- [ ] **Step 1: Build the banner**

Create `src/components/QuarantineBanner.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';

import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  staleCount: number;
  onPress: () => void;
}

export function QuarantineBanner({ staleCount, onPress }: Props) {
  const theme = useTheme();
  if (staleCount === 0) return null;
  const label = staleCount === 1 ? "1 item didn't sync" : `${staleCount} items didn't sync`;

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: theme.color.dangerSoft,
          borderColor: theme.color.danger,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.color.danger,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      >
        {label} · Tap to review
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
```

- [ ] **Step 2: Build the sheet**

Create `src/components/QuarantineSheet.tsx`:

```tsx
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  type QuarantinedRow,
  discardAllQuarantined,
  discardQuarantinedRow,
  retryAllQuarantined,
  retryQuarantinedRow,
  summarizeRow,
} from '@/sync/quarantine';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  rows: QuarantinedRow[];
  onClose: () => void;
  onChanged: () => void; // invalidate the query after a mutation
}

export function QuarantineSheet({ visible, rows, onClose, onChanged }: Props) {
  const theme = useTheme();

  const handleRetry = async (id: number) => {
    haptics.light();
    await retryQuarantinedRow(id);
    onChanged();
  };
  const handleDiscard = async (id: number) => {
    haptics.medium();
    await discardQuarantinedRow(id);
    onChanged();
  };
  const handleRetryAll = async () => {
    haptics.medium();
    await retryAllQuarantined();
    onChanged();
  };
  const handleDiscardAll = async () => {
    haptics.medium();
    await discardAllQuarantined();
    onChanged();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.color.overlay }]}
        onPress={onClose}
      >
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
            Stuck syncs
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            These changes haven't reached the server after multiple tries.
            Retry sends them back to the queue. Discard removes them locally
            without syncing.
          </Text>
          <ScrollView style={styles.list}>
            {rows.map((r) => (
              <View
                key={r.id}
                style={[styles.row, { borderColor: theme.color.border }]}
              >
                <Text
                  style={[
                    styles.rowSummary,
                    {
                      color: theme.color.ink,
                      fontFamily: theme.font.family.mono,
                    },
                  ]}
                >
                  {summarizeRow(r)}
                </Text>
                <Text
                  style={[
                    styles.rowMeta,
                    {
                      color: theme.color.inkTertiary,
                      fontFamily: theme.font.family.sansMedium,
                    },
                  ]}
                >
                  CREATED {ageLabel(r.created_at)} · {r.attempts} tries
                </Text>
                {r.last_error ? (
                  <Text
                    style={[
                      styles.rowError,
                      { color: theme.color.danger, fontFamily: theme.font.family.sans },
                    ]}
                  >
                    {r.last_error}
                  </Text>
                ) : null}
                <View style={styles.rowActions}>
                  <Pressable
                    onPress={() => void handleRetry(r.id)}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { borderColor: theme.color.borderStrong, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: theme.color.ink, fontFamily: theme.font.family.sansMedium }]}>
                      Retry
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDiscard(r.id)}
                    style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Text style={[styles.actionText, { color: theme.color.danger, fontFamily: theme.font.family.sansMedium }]}>
                      Discard
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={() => void handleRetryAll()}
              style={({ pressed }) => [
                styles.footerBtn,
                { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.footerText, { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold }]}>
                Retry all
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleDiscardAll()}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnDanger,
                { borderColor: theme.color.danger, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.footerText, { color: theme.color.danger, fontFamily: theme.font.family.sansSemibold }]}>
                Discard all
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sansMedium }]}>
              Close
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
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
  body: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  list: { maxHeight: 360 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowSummary: { fontSize: 14, marginBottom: 4 },
  rowMeta: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  rowError: { fontSize: 11, marginBottom: 8, fontStyle: 'italic' },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionText: { fontSize: 12 },
  footer: { flexDirection: 'row', gap: 8, marginTop: 16 },
  footerBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  footerBtnDanger: { backgroundColor: 'transparent', borderWidth: 1 },
  footerText: { fontSize: 13 },
  close: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  closeText: { fontSize: 12 },
});
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/QuarantineBanner.tsx src/components/QuarantineSheet.tsx
git commit -m "$(cat <<'EOF'
add QuarantineBanner + QuarantineSheet components

Banner is a danger-tinted pill on Today rendered when stale stuck
syncs exist. Sheet lists each row with a humanized summary,
per-row Retry/Discard, and footer Retry all / Discard all.
Tap-outside-to-close on backdrop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Today screen quarantine integration

**Files:**
- Modify: `src/screens/Today.tsx`

- [ ] **Step 1: Wire banner + sheet into Today**

Add imports:

```tsx
import { useState } from 'react';
import { QuarantineBanner } from '@/components/QuarantineBanner';
import { QuarantineSheet } from '@/components/QuarantineSheet';
import { getStaleQuarantined, useQuarantined } from '@/sync/quarantine';
```

Inside `TodayScreen`, near the other queries:

```tsx
const quarantinedQuery = useQuarantined();
const staleQuarantined = useMemo(
  () => (quarantinedQuery.data ? getStaleQuarantined(quarantinedQuery.data) : []),
  [quarantinedQuery.data],
);
const [quarantineSheetOpen, setQuarantineSheetOpen] = useState(false);
```

Add the banner just BELOW the `Ready to lift.` title (before the Repeat card / state cards):

```tsx
<QuarantineBanner
  staleCount={staleQuarantined.length}
  onPress={() => setQuarantineSheetOpen(true)}
/>
```

Add the sheet rendering at the bottom of the screen (alongside `<CollisionSheet ... />`):

```tsx
<QuarantineSheet
  visible={quarantineSheetOpen}
  rows={quarantinedQuery.data ?? []}
  onClose={() => setQuarantineSheetOpen(false)}
  onChanged={() => qc.invalidateQueries({ queryKey: ['outbox', 'quarantined'] })}
/>
```

- [ ] **Step 2: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/screens/Today.tsx
git commit -m "$(cat <<'EOF'
integrate quarantine banner + sheet into Today screen

Banner appears below the title when any outbox row is stuck
>24h. Tap opens the sheet listing all quarantined rows with
per-row Retry/Discard and footer Retry all/Discard all.
Mutation handlers invalidate the quarantined query so the
banner and sheet stay in sync.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rest timer policy + tests

**Files:**
- Create: `src/ui/hooks/restTimerPolicy.ts`
- Create: `src/ui/hooks/__tests__/restTimerPolicy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/ui/hooks/__tests__/restTimerPolicy.test.ts`:

```ts
import {
  shouldRestoreTimer,
  type PersistedTimer,
} from '@/ui/hooks/restTimerPolicy';

test('null persisted → do not restore, no clear', () => {
  expect(shouldRestoreTimer(null, Date.now())).toEqual({
    restore: false,
    clearStale: false,
  });
});

test('schema mismatch → do not restore, clear stale', () => {
  const persisted = {
    schemaVersion: 99,
    startedAt: Date.now() - 30_000,
    targetSeconds: 90,
  } as unknown as PersistedTimer;
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: false,
    clearStale: true,
  });
});

test('negative elapsed (clock skew) → do not restore, clear stale', () => {
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: Date.now() + 5_000,
    targetSeconds: 90,
  };
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: false,
    clearStale: true,
  });
});

test('elapsed > 2 × target → do not restore, clear stale', () => {
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: Date.now() - 200 * 1000, // 200s
    targetSeconds: 90, // 2 × 90 = 180s threshold
  };
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: false,
    clearStale: true,
  });
});

test('elapsed within threshold → restore', () => {
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: Date.now() - 30_000, // 30s
    targetSeconds: 90,
  };
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: true,
    clearStale: false,
  });
});

test('elapsed just under 2 × target → still restore', () => {
  const now = Date.now();
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: now - 179 * 1000, // 179s, just under 2*90
    targetSeconds: 90,
  };
  expect(shouldRestoreTimer(persisted, now)).toEqual({
    restore: true,
    clearStale: false,
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- --testPathPattern=restTimerPolicy`

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/ui/hooks/restTimerPolicy.ts`:

```ts
/**
 * Pure restore-policy for the persisted rest timer.
 *
 * Separated from useRestTimer.ts so it can be unit-tested in Jest
 * (the project mocks react-native, so component-level testing isn't
 * available here).
 *
 * Storage shape lives here too — single source of truth.
 */

export interface PersistedTimer {
  schemaVersion: 1;
  startedAt: number; // epoch ms
  targetSeconds: number;
}

export const REST_TIMER_KEY = '@flexyug/rest-timer/v1';
export const REST_TIMER_SCHEMA_VERSION = 1 as const;

export function shouldRestoreTimer(
  persisted: PersistedTimer | null,
  now: number,
): { restore: boolean; clearStale: boolean } {
  if (!persisted) return { restore: false, clearStale: false };
  if (persisted.schemaVersion !== REST_TIMER_SCHEMA_VERSION) {
    return { restore: false, clearStale: true };
  }
  const elapsed = now - persisted.startedAt;
  if (elapsed < 0) return { restore: false, clearStale: true };
  if (elapsed > 2 * persisted.targetSeconds * 1000) {
    return { restore: false, clearStale: true };
  }
  return { restore: true, clearStale: false };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- --testPathPattern=restTimerPolicy`

Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hooks/restTimerPolicy.ts src/ui/hooks/__tests__/restTimerPolicy.test.ts
git commit -m "$(cat <<'EOF'
add rest timer restore policy (pure logic + tests)

shouldRestoreTimer determines whether to resurrect a persisted
timer based on schema version, clock skew, and 2 × target staleness
threshold. Pure function, fully unit tested. The useRestTimer hook
will consume this in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Rest timer persistence wire-in

**Files:**
- Modify: `src/ui/hooks/useRestTimer.ts`

- [ ] **Step 1: Wire persistence**

Read `src/ui/hooks/useRestTimer.ts` end-to-end first.

Modify it:

1. Add imports at top:
```ts
import { useEffect, useRef, useState } from 'react';
import { getKv, removeKv, setKv } from '@/lib/kvStore';
import {
  PersistedTimer,
  REST_TIMER_KEY,
  REST_TIMER_SCHEMA_VERSION,
  shouldRestoreTimer,
} from './restTimerPolicy';
```

2. Inside `useRestTimer`, replace the existing `start` callback with a version that also writes to KV:

```ts
const start = useCallback(() => {
  firedRef.current = false;
  setElapsed(0);
  const now = Date.now();
  setStartedAt(now);
  void setKv<PersistedTimer>(REST_TIMER_KEY, {
    schemaVersion: REST_TIMER_SCHEMA_VERSION,
    startedAt: now,
    targetSeconds,
  });
  void cancelRest(notificationIdRef.current).then(() => {
    notificationIdRef.current = null;
    return scheduleRestDone(targetSeconds);
  }).then((id) => {
    notificationIdRef.current = id;
  });
}, [targetSeconds]);
```

3. Replace the existing `stop` callback:

```ts
const stop = useCallback(() => {
  setStartedAt(null);
  setElapsed(0);
  firedRef.current = false;
  void removeKv(REST_TIMER_KEY);
  void cancelRest(notificationIdRef.current);
  notificationIdRef.current = null;
}, []);
```

4. Add a mount-time hydration effect AFTER the existing state declarations:

```ts
const hydratedRef = useRef(false);

useEffect(() => {
  if (hydratedRef.current) return;
  hydratedRef.current = true;
  (async () => {
    const persisted = await getKv<PersistedTimer>(REST_TIMER_KEY, REST_TIMER_SCHEMA_VERSION);
    const decision = shouldRestoreTimer(persisted, Date.now());
    if (decision.clearStale) {
      void removeKv(REST_TIMER_KEY);
    }
    if (decision.restore && persisted) {
      // Resume the timer from where it was
      setStartedAt(persisted.startedAt);
    }
  })();
}, []);
```

- [ ] **Step 2: Type-check + lint + suite**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/hooks/useRestTimer.ts
git commit -m "$(cat <<'EOF'
persist rest timer state via kvStore

start writes {startedAt, targetSeconds} to AsyncStorage; stop
clears it. Mount hydrates the value through shouldRestoreTimer
which gates on schema version, clock skew, and 2× target
staleness. A backgrounded or crashed app resumes the timer from
the persisted startedAt.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Sign-out clears all KV state

**Files:**
- Modify: `src/sync/engine.ts` (extend `handleSignOut()`)

- [ ] **Step 1: Add KV clear to sign-out**

Read `src/sync/engine.ts`. Find the `handleSignOut()` function.

Add imports at top:
```ts
import { clearSnapshot } from '@/ui/todaySnapshot';
import { removeKv } from '@/lib/kvStore';
import { REST_TIMER_KEY } from '@/ui/hooks/restTimerPolicy';
```

Modify `handleSignOut()`. Append BEFORE `client?.clear()`:

```ts
// Clear Phase 2 KV state so a follow-up sign-in doesn't see the previous
// user's Today snapshot or active rest timer.
await Promise.all([
  clearSnapshot(),
  removeKv(REST_TIMER_KEY),
]);
```

- [ ] **Step 2: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/sync/engine.ts
git commit -m "$(cat <<'EOF'
clear Phase 2 KV state on sign-out

handleSignOut now also clears the Today snapshot and the persisted
rest timer key before resetting the local DB. Prevents the
previous user's render-ready state from leaking into a follow-up
sign-in session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Flip spec status to implemented

**Files:**
- Modify: `docs/specs/2026-05-27-uplevel-phase-2-trust-design.md`
- Modify: `docs/specs/README.md`

- [ ] **Step 1: Final verification**

Run:
```bash
npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3
git log --oneline main..HEAD | head -20
```

Expected:
- typecheck clean
- lint same pre-existing count
- tests all green (~76 total)
- 14 new commits on `feat/phase-2-trust` since the spec commit (plus the Phase 1 commits below it)

- [ ] **Step 2: Flip the spec status**

Edit `docs/specs/2026-05-27-uplevel-phase-2-trust-design.md` line 3:
```
- **Status:** implemented
```

Edit `docs/specs/README.md` Phase 2 row:
```
| [2026-05-27](2026-05-27-uplevel-phase-2-trust-design.md) | Uplevel Phase 2 — Trust | implemented |
```

- [ ] **Step 3: Final commit**

```bash
git add docs/specs/
git commit -m "$(cat <<'EOF'
flip Phase 2 Trust spec to implemented

All five Trust deliverables shipped on feat/phase-2-trust:
keypad-mode autosave (250ms debounce), Today cold-start snapshot,
workout-collision sheet, quarantined-outbox banner + sheet, and
rest-timer persistence. Plus kvStore foundation and sign-out
hygiene. 14 commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Manual device verification checklist**

Smoke test on iOS after rebase/reload:

- [ ] Open Today on a cold launch: Repeat card appears instantly (no skeleton flash) if a snapshot exists
- [ ] Type a number in keypad mode, wait ~300ms, swipe app away from app switcher, reopen: the value is committed
- [ ] Manually `INSERT INTO workouts ... ended_at NULL` a second row via SQLite shell or dev console, navigate to Today: CollisionSheet appears blocking the screen
- [ ] Resolve via Resume or Discard: sheet dismisses
- [ ] Manually `UPDATE outbox SET attempts = 5, created_at = ... 25h ago` on a real row, navigate to Today: banner appears
- [ ] Tap banner → sheet opens with the stuck row → Retry resets attempts; Discard removes the row
- [ ] Start a rest timer, background the app for 30s, return: timer shows ~30s + drift (within ~1s)
- [ ] Start timer, force-quit, relaunch: timer resumes if elapsed < 2 × target

---

## Self-review checklist (for the implementing engineer)

After all 14 tasks:

```bash
npm run typecheck && npm run lint && npm test
git log --oneline main..HEAD | head -25
```

Expected: 14 new commits on top of `feat/phase-1-signature`, all checks green.

Verify against the spec — each section maps to a task above. The spec calls out 5 Trust deliverables + cross-cutting concerns; all five plus kvStore foundation and sign-out hygiene are implemented.
