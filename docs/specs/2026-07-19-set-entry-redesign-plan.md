# Set-Entry Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved never-empty set-entry redesign (spec: `docs/specs/2026-07-19-set-entry-redesign-spec.md`): single-commit edit sessions, history prefill with provenance, a thumb-zone LOG SET button, and bodyweight sets.

**Architecture:** The debounce-buffer commit model in `NumericStepper` is replaced by a pure edit-session state machine (seed → text → one resolved commit). Staging a first set consults local history via a new query + pure planner. `ActiveSetCard` exposes an imperative `flushEdits()` so every consumer (LOG SET, swipe, voice, navigation) commits open edits before reading values. `canComplete` becomes reps-only; null weight displays as `BW`.

**Tech Stack:** React Native (Expo), TypeScript, expo-sqlite (offline-first, outbox sync), TanStack Query, Reanimated/Gesture Handler, Jest (`ts-jest`, node env — RN is mocked to `{ Platform }`, so component JSX is NOT unit-testable; pure logic and hooks via `renderHook` are).

**Conventions:** Blacktop tokens via `useTheme()`; text via `<Text variant>`; haptics via `src/ui/haptics`; every set write through `src/queries/sets.ts`. Run all commands from the repo root. Full gates: `npx tsc --noEmit` and `npx jest` must pass before every commit.

---

### Task 1: Edit-session pure logic (replaces the debounce buffer)

**Files:**
- Modify: `src/components/numericStepper.ts`
- Test: `src/components/__tests__/numericStepper.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/__tests__/numericStepper.test.ts` (import `beginEditSession`, `resolveEditCommit` alongside the existing imports from `../numericStepper`):

```ts
describe('edit session (spec §1 — one edit session, one write)', () => {
  const sanitize = (n: number) => Math.min(Math.max(n, 0), 1500);

  test('beginEditSession seeds from the value; empty value seeds empty text', () => {
    expect(beginEditSession(60)).toEqual({ seedText: '60', text: '60' });
    expect(beginEditSession(22.5)).toEqual({ seedText: '22.5', text: '22.5' });
    expect(beginEditSession(null)).toEqual({ seedText: '', text: '' });
  });

  test('untouched session is a no-op — the wipe-on-blur fix', () => {
    const s = beginEditSession(60); // open keypad, type nothing, dismiss
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'noop' });
  });

  test('untouched EMPTY session is also a no-op (not a null commit)', () => {
    const s = beginEditSession(null);
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'noop' });
  });

  test('deliberately cleared text commits null', () => {
    const s = { ...beginEditSession(60), text: '' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'commit', value: null });
  });

  test('typed number commits sanitized', () => {
    const s = { ...beginEditSession(null), text: '9999' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'commit', value: 1500 });
  });

  test('locale comma parses as a decimal separator (defect: 62,5 silently dropped)', () => {
    const s = { ...beginEditSession(60), text: '62,5' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'commit', value: 62.5 });
  });

  test('garbage text is a no-op, not a wipe', () => {
    const s = { ...beginEditSession(60), text: '6.2.5' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'noop' });
  });
});

describe('parseUserInput — comma decimals', () => {
  test('accepts comma as decimal separator', () => {
    expect(parseUserInput('62,5')).toBe(62.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/__tests__/numericStepper.test.ts -t "edit session" -t "comma"`
Expected: FAIL — `beginEditSession is not defined` (TS compile error on the import).

- [ ] **Step 3: Implement in `src/components/numericStepper.ts`**

Update `parseUserInput` (replace the existing function):

```ts
export function parseUserInput(input: string): number | null {
  // Accept ',' as a decimal separator — several locales' decimal-pads emit it.
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}
```

Add below `parseUserInput`:

```ts
/**
 * One keypad edit = one session = at most ONE write (spec §1).
 * Replaces the debounce buffer whose empty/stale state caused the
 * wipe-on-blur and partial-value-banking defects.
 */
export interface EditSession {
  /** Text the keypad opened with — '' for an empty field. */
  seedText: string;
  /** Current text in the input. */
  text: string;
}

export function beginEditSession(value: number | null): EditSession {
  const seedText = value == null ? '' : formatValue(value);
  return { seedText, text: seedText };
}

export type EditCommit = { kind: 'noop' } | { kind: 'commit'; value: number | null };

/**
 * Resolve a finished edit session:
 * - untouched (text === seedText) → noop: dismissing an inspected field never changes it
 * - cleared → commit null (deliberate clear)
 * - parseable ('.' or ',' decimals) → commit sanitized
 * - garbage → noop
 */
export function resolveEditCommit(
  session: EditSession,
  sanitize: (n: number) => number,
): EditCommit {
  if (session.text === session.seedText) return { kind: 'noop' };
  if (session.text.trim() === '') return { kind: 'commit', value: null };
  const parsed = parseUserInput(session.text);
  if (parsed == null) return { kind: 'noop' };
  return { kind: 'commit', value: sanitize(parsed) };
}
```

Do NOT remove `useDebouncedCommit` yet — the view still uses it until Task 3; it is deleted in Task 11.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/numericStepper.test.ts`
Expected: PASS (new suites green; existing suites untouched).

- [ ] **Step 5: Commit**

```bash
git add src/components/numericStepper.ts src/components/__tests__/numericStepper.test.ts
git commit -m "feat(set-entry): edit-session commit logic — one session, one write"
```

---

### Task 2: `minus` icon + `inverted` Button kind

**Files:**
- Modify: `src/ui/icons.tsx`
- Modify: `src/ui/Button.tsx`

No unit test — RN components aren't renderable in this jest setup; `npx tsc --noEmit` is the gate.

- [ ] **Step 1: Add `minus` to the icon registry**

In `src/ui/icons.tsx`: add `'minus'` to the `IconName` union, and register the glyph next to `'plus'`. The registry draws 24-grid strokes; `plus` is two lines — `minus` is its horizontal line only:

```tsx
minus: (
  <Line x1="5" y1="12" x2="19" y2="12" />
),
```

(Match the exact JSX shape of the existing `plus` entry — same `Line` component and props style used there.)

- [ ] **Step 2: Add the `inverted` Button kind**

In `src/ui/Button.tsx`:

```ts
export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverted';
```

Extend the tone map:

```ts
const TONE_FOR_KIND: Record<ButtonKind, PlateTone> = {
  primary: 'volt',
  secondary: 'panel',
  ghost: 'ghost',
  danger: 'ghost',
  inverted: 'inverted',
};
```

Text color: the `inverted` plate face is `theme.color.ink` (chalk in dark), so its label uses `theme.color.bg`. Extend the existing `textColor` resolution:

```ts
const textColor =
  kind === 'primary'
    ? theme.color.onAccent
    : kind === 'inverted'
      ? theme.color.bg
      : kind === 'danger'
        ? theme.color.danger
        : theme.color.ink;
```

Include `inverted` in the stamped-label set (uppercase, like primary/secondary): `const stamped = kind === 'primary' || kind === 'secondary' || kind === 'inverted';`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/icons.tsx src/ui/Button.tsx
git commit -m "feat(ui): minus icon + inverted Button kind for the LOG SET bar"
```

---

### Task 3: Rewrite `NumericStepperView`

**Files:**
- Modify: `src/components/NumericStepperView.tsx` (full rewrite)

The component is not unit-testable (RN mocked); its logic lives in Task 1's tested functions. Gate: `npx tsc --noEmit` + `npx jest` (Task 4/5 wire consumers; the app builds again after Task 6).

Interface changes: `focused`/`onFocus`/`onBlur` props are REMOVED (no more two-stage focus — tap the number → keypad, always; steppers are always visible). New imperative handle for flush-before-consume. **Every consumer updates in Tasks 6–9; `npx tsc --noEmit` will fail between Task 3 and Task 6 — that is expected; run the FULL typecheck gate at the end of Task 6, then before every commit.** Commit Tasks 3–6 together if a clean-tsc-per-commit policy matters more than granular commits; otherwise commit per task with the note below.

- [ ] **Step 1: Replace the file with the new component**

```tsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { PRESS_DIP_OPACITY } from '@/ui/plateStyles';
import { Text } from '@/ui/Text';
import { resolveMaxFontSizeMultiplier, resolveTextStyle } from '@/ui/textVariants';
import { useTheme, type Theme } from '@/ui/useTheme';

import {
  applyStep,
  beginEditSession,
  type EditSession,
  formatValue,
  resolveEditCommit,
  sanitizeNumber,
} from './numericStepper';

const RAMP_DELAY_MS = 600;
const RAMP_INTERVAL_MS = 200;

export interface NumericStepperHandle {
  /**
   * Commit any open keypad edit NOW (flush-before-consume, spec §1/§3) and
   * return the effective value: the just-committed value, or the current prop
   * value when no edit was open / the edit was a no-op. Idempotent — a later
   * blur finds no session and does nothing.
   */
  flushEdit: () => number | null;
  /** Open the keypad on this field (the accessory bar's NEXT hand-off). */
  openKeypad: () => void;
}

interface Props {
  value: number | null;
  step: number; // 5 (lb) or 2.5 (kg) for weight; 1 for reps
  unit: string; // 'LB' | 'KG' | 'REPS'
  onChange: (next: number | null) => void;
  /** iOS keyboard-accessory action: NEXT (weight → reps) or DONE (dismiss). */
  accessoryLabel: string;
  onAccessoryPress?: () => void;
  size?: 'hero' | 'inline';
  testID?: string;
}

export const NumericStepper = forwardRef<NumericStepperHandle, Props>(function NumericStepper(
  { value, step, unit, onChange, accessoryLabel, onAccessoryPress, size = 'hero', testID },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Reps are whole numbers capped at 200; weight keeps decimals capped at 1500.
  // Sanitizing here is the single choke point for keypad AND steppers (#19).
  const isReps = unit === 'REPS';
  const sanitize = useCallback(
    (n: number) => sanitizeNumber(n, { min: 0, max: isReps ? 200 : 1500, integer: isReps }),
    [isReps],
  );

  // Session state drives the TextInput; the ref gives flushEdit synchronous
  // access (imperative callers can't wait a render).
  const [session, setSession] = useState<EditSession | null>(null);
  const sessionRef = useRef<EditSession | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commitSession = useCallback((): number | null => {
    const s = sessionRef.current;
    if (!s) return valueRef.current;
    sessionRef.current = null;
    setSession(null);
    const res = resolveEditCommit(s, sanitize);
    if (res.kind === 'commit') {
      onChangeRef.current(res.value);
      return res.value;
    }
    return valueRef.current;
  }, [sanitize]);

  const openKeypad = useCallback(() => {
    const s = beginEditSession(valueRef.current);
    sessionRef.current = s;
    setSession(s);
  }, []);

  useImperativeHandle(ref, () => ({ flushEdit: commitSession, openKeypad }), [
    commitSession,
    openKeypad,
  ]);

  // ——— stepper ± with the #14 ramp (accumulate from a ref; stop at bounds) ———
  const rampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rampIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampAccRef = useRef<number | null>(null);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      onChange(sanitize(applyStep(valueRef.current, step, direction)));
    },
    [step, onChange, sanitize],
  );

  const startRamp = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      const first = sanitize(applyStep(valueRef.current, step, direction));
      rampAccRef.current = first;
      onChange(first);
      rampTimerRef.current = setTimeout(() => {
        rampIntervalRef.current = setInterval(() => {
          const prev = rampAccRef.current ?? valueRef.current ?? 0;
          const next = sanitize(applyStep(prev, step, direction));
          if (next === prev) return; // hit a bound — don't spam onChange/haptics
          rampAccRef.current = next;
          haptics.light();
          onChange(next);
        }, RAMP_INTERVAL_MS);
      }, RAMP_DELAY_MS);
    },
    [step, onChange, sanitize],
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

  const editing = session != null;
  const numeralVariant = size === 'hero' ? 'hero' : 'numeralLg';
  const numeralStyle = resolveTextStyle(numeralVariant);
  const accessoryID = `${testID ?? unit}-accessory`;

  const onDone = useCallback(() => {
    commitSession();
    if (onAccessoryPress) onAccessoryPress();
    else Keyboard.dismiss();
  }, [commitSession, onAccessoryPress]);

  return (
    <View style={size === 'hero' ? styles.containerHero : styles.containerInline} testID={testID}>
      <View style={styles.numeralRow}>
        {editing ? (
          <>
            <TextInput
              value={session.text}
              onChangeText={(text) => {
                const next = { ...sessionRef.current!, text };
                sessionRef.current = next;
                setSession(next);
              }}
              onBlur={commitSession}
              onSubmitEditing={onDone}
              autoFocus
              selectTextOnFocus
              // Weight always takes decimals — lb plates come in 2.5s even
              // though the lb step is 5 (spec §1; NOT derived from the step).
              keyboardType={isReps ? 'number-pad' : 'decimal-pad'}
              inputAccessoryViewID={Platform.OS === 'ios' ? accessoryID : undefined}
              accessibilityLabel={`${unit} input`}
              placeholder="0"
              placeholderTextColor={theme.color.inkTertiary}
              maxFontSizeMultiplier={resolveMaxFontSizeMultiplier(numeralVariant) ?? 1.2}
              style={[
                numeralStyle,
                styles.numeral,
                { color: theme.color.inkHero, minWidth: numeralStyle.fontSize! * 0.62 },
              ]}
            />
            {Platform.OS === 'ios' ? (
              <InputAccessoryView nativeID={accessoryID}>
                <View
                  style={[
                    styles.accessoryBar,
                    { backgroundColor: theme.color.surface, borderTopColor: theme.color.border },
                  ]}
                >
                  <Pressable
                    onPress={onDone}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={accessoryLabel}
                    style={({ pressed }) => [
                      styles.accessoryKey,
                      pressed && { opacity: PRESS_DIP_OPACITY },
                    ]}
                  >
                    <Text variant="label" color={theme.color.ink}>
                      {accessoryLabel}
                    </Text>
                  </Pressable>
                </View>
              </InputAccessoryView>
            ) : null}
          </>
        ) : (
          <Pressable
            onPress={openKeypad}
            accessibilityRole="button"
            accessibilityLabel={
              value == null ? `${unit}: empty. Tap to enter.` : `${unit}: ${formatValue(value)}. Tap to edit.`
            }
            style={({ pressed }) => [pressed && { opacity: PRESS_DIP_OPACITY }]}
          >
            {value == null ? (
              // Never a bare '-': ghosted 0 over a 2px underline marks the
              // input slot (spec §2). '-' stays read-only-metadata-only.
              <Text
                variant={numeralVariant}
                color={theme.color.inkTertiary}
                style={[styles.numeral, styles.emptyUnderline, { borderBottomColor: theme.color.borderStrong }]}
              >
                0
              </Text>
            ) : (
              <Text variant={numeralVariant} color={theme.color.inkHero} style={styles.numeral}>
                {formatValue(value)}
              </Text>
            )}
          </Pressable>
        )}
        {size === 'hero' ? (
          // Always visible at hero size — never focus-dependent (1.10/#136).
          <Text variant="strip" color={theme.color.inkTertiary} style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {/* Always-visible ± at ≥44pt (closes 9.3/#27) — hidden only while the
          keypad is open so nothing can step a value the user can't see. */}
      {!editing ? (
        <View style={styles.stepRow}>
          <Pressable
            onPress={() => handleStep(-1)}
            onLongPress={() => startRamp(-1)}
            onPressOut={stopRamp}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${unit.toLowerCase()} by ${step}`}
            style={({ pressed }) => [
              styles.stepKey,
              { borderColor: theme.color.border, minWidth: theme.touch.min, minHeight: theme.touch.min },
              pressed && { opacity: PRESS_DIP_OPACITY },
            ]}
          >
            <Icon name="minus" size={18} color={theme.color.ink} />
          </Pressable>
          <Pressable
            onPress={() => handleStep(1)}
            onLongPress={() => startRamp(1)}
            onPressOut={stopRamp}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${unit.toLowerCase()} by ${step}`}
            style={({ pressed }) => [
              styles.stepKey,
              { borderColor: theme.color.border, minWidth: theme.touch.min, minHeight: theme.touch.min },
              pressed && { opacity: PRESS_DIP_OPACITY },
            ]}
          >
            <Icon name="plus" size={18} color={theme.color.ink} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    containerHero: { gap: theme.space.s3 },
    containerInline: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s3 },
    numeralRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.s2 },
    numeral: { fontVariant: ['tabular-nums'], paddingHorizontal: 0 },
    emptyUnderline: { borderBottomWidth: theme.depth.rule },
    unit: { marginLeft: theme.space.s1 },
    stepRow: { flexDirection: 'row', gap: theme.space.s2 },
    stepKey: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.depth.hairline,
    },
    accessoryBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      borderTopWidth: theme.depth.hairline,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s2,
    },
    accessoryKey: { minHeight: 36, justifyContent: 'center', paddingHorizontal: theme.space.s3 },
  });
```

Notes for the implementer:
- `theme.depth.rule` / `theme.depth.hairline`: if `depth.rule` does not exist post-Blacktop, use the token the codebase uses for 2px structural rules (grep `depth.` in `src/ui/useTheme.ts` and match; `ActiveSetCard` uses `theme.depth.hairline` for 1.5px). The underline wants the 2px rule token.
- If `resolveTextStyle('numeralLg').fontSize` is typed optional, the `minWidth` computation already guards with `!`. Keep it.

- [ ] **Step 2: Typecheck expectation**

Run: `npx tsc --noEmit`
Expected: errors ONLY in the not-yet-migrated consumers (`ActiveSetCard.tsx`, `EditSetSheet.tsx`). No errors inside `NumericStepperView.tsx` itself. Do not commit yet if following clean-tsc policy — otherwise:

```bash
git add src/components/NumericStepperView.tsx
git commit -m "feat(set-entry): session-commit NumericStepper — always-visible steppers, accessory bar, ghost-0 empty state"
```

---

### Task 4: Pure helpers — `canCompleteSet`, BW labels, `planFirstSet`

**Files:**
- Modify: `src/components/activeSet.ts`
- Test: `src/components/__tests__/activeSetCursor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/__tests__/activeSetCursor.test.ts` (extend the existing import from `@/components/activeSet` with `canCompleteSet`, `setValuesLabel`, `planFirstSet`):

```ts
describe('canCompleteSet — reps required, weight optional (spec §4)', () => {
  test('reps present, weight null → loggable (bodyweight)', () => {
    expect(canCompleteSet({ reps: 8 })).toBe(true);
  });
  test('reps null → not loggable', () => {
    expect(canCompleteSet({ reps: null })).toBe(false);
  });
  test('null set → not loggable', () => {
    expect(canCompleteSet(null)).toBe(false);
  });
});

describe('setValuesLabel — BW display (spec §4)', () => {
  test('weighted set', () => {
    expect(setValuesLabel(60, 8)).toBe('60 × 8');
  });
  test('bodyweight set', () => {
    expect(setValuesLabel(null, 12)).toBe('BW × 12');
  });
  test('legacy missing reps keeps the read-only dash', () => {
    expect(setValuesLabel(60, null)).toBe('60 × -');
  });
});

describe('planFirstSet — never-empty prefill (spec §2)', () => {
  const lastKg = [
    { orderIndex: 0, weight: 60, reps: 8, units: 'kg' as const },
    { orderIndex: 1, weight: 80, reps: 5, units: 'kg' as const },
  ];

  test('seeds from last session set 1, same unit', () => {
    expect(planFirstSet(lastKg, 'kg', 2.5)).toEqual({ weight: 60, reps: 8, units: 'kg' });
  });

  test('converts units and rounds to the current step (60 kg → lb, step 5)', () => {
    const plan = planFirstSet(lastKg, 'lb', 5);
    // 60 kg = 132.28 lb → nearest 5 = 130
    expect(plan).toEqual({ weight: 130, reps: 8, units: 'lb' });
  });

  test('falls back to the top set when set 1 carries no values', () => {
    const last = [
      { orderIndex: 0, weight: null, reps: null, units: null },
      { orderIndex: 1, weight: 80, reps: 5, units: 'kg' as const },
    ];
    expect(planFirstSet(last, 'kg', 2.5)).toEqual({ weight: 80, reps: 5, units: 'kg' });
  });

  test('bodyweight history seeds reps without a unit stamp (#131)', () => {
    const last = [{ orderIndex: 0, weight: null, reps: 12, units: null }];
    expect(planFirstSet(last, 'kg', 2.5)).toEqual({ weight: null, reps: 12, units: null });
  });

  test('no history → truly empty stage', () => {
    expect(planFirstSet([], 'kg', 2.5)).toEqual({ weight: null, reps: null, units: null });
  });
});

describe('ghostSetStrip — BW (spec §4)', () => {
  test('bodyweight ghost row', () => {
    expect(ghostSetStrip(1, { weight: null, reps: 12 })).toBe('SET 1 · BW × 12');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/__tests__/activeSetCursor.test.ts`
Expected: FAIL — `canCompleteSet` etc. not exported.

- [ ] **Step 3: Implement in `src/components/activeSet.ts`**

Add import at the top:

```ts
import { convertWeight, DEFAULT_UNITS } from '@/core/units';
```

Add the helpers (place after `planStagedSet`):

```ts
/** Reps make a set loggable; weight is optional — bodyweight (spec §4). */
export function canCompleteSet(set: Pick<SetShape, 'reps'> | null): boolean {
  return set?.reps != null;
}

/** `60 × 8` / `BW × 12` — the LOG SET echo and every logged-set value text. */
export function setValuesLabel(weight: number | null, reps: number | null): string {
  return `${weight ?? 'BW'} × ${reps ?? '-'}`;
}

/** A completed set from the previous session of the same exercise. */
export interface LastSessionSet {
  orderIndex: number;
  weight: number | null;
  reps: number | null;
  units: 'kg' | 'lb' | null;
}

/**
 * Prefill for the FIRST set of an exercise (spec §2): last session's first
 * set, falling back to its top set; weight converted to the current unit and
 * rounded to the current step. Empty history → truly empty stage.
 */
export function planFirstSet(
  lastSets: LastSessionSet[],
  units: 'kg' | 'lb',
  weightStep: number,
): StagedSetPlan {
  const first = lastSets[0] ?? null;
  const pick =
    first && (first.weight != null || first.reps != null) ? first : topLastSessionSet(lastSets);
  if (!pick) return { weight: null, reps: null, units: null };
  let weight: number | null = null;
  if (pick.weight != null) {
    const converted = convertWeight(pick.weight, pick.units ?? DEFAULT_UNITS, units);
    weight = roundToNearest(converted, weightStep);
  }
  return { weight, reps: pick.reps ?? null, units: weight != null ? units : null };
}

function topLastSessionSet(lastSets: LastSessionSet[]): LastSessionSet | null {
  let top: LastSessionSet | null = null;
  let topKg = -Infinity;
  for (const s of lastSets) {
    if (s.weight == null) {
      if (top == null && s.reps != null) top = s; // bodyweight history still seeds reps
      continue;
    }
    const kg = convertWeight(s.weight, s.units ?? DEFAULT_UNITS, 'kg');
    if (kg > topKg) {
      topKg = kg;
      top = s;
    }
  }
  return top;
}

function roundToNearest(value: number, step: number): number {
  // Kill FP dust the same way roundToStep does in numericStepper.ts.
  return Math.round((Math.round(value / step) * step) * 1000) / 1000;
}
```

Update `ghostSetStrip` to route through the shared label:

```ts
/** Mono strip for a banked (ghost) set row: `SET 1 · 60 × 8` / `SET 1 · BW × 12`. */
export function ghostSetStrip(
  displayIndex: number,
  set: Pick<SetShape, 'weight' | 'reps'>,
): string {
  return `SET ${displayIndex} · ${setValuesLabel(set.weight, set.reps)}`;
}
```

Extend `AutoStagedSet` (the leave-confirm comparison ignores extra fields, so this is compatible):

```ts
/** Identity + pre-filled values of the speculative set staged on completion. */
export interface AutoStagedSet {
  id: string;
  weight: number | null;
  reps: number | null;
  /** 'carry' = copied from the just-completed set; 'history' = last-session prefill (shows LAST TIME). */
  source?: 'carry' | 'history';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/activeSetCursor.test.ts`
Expected: PASS. Note: if an existing characterization test asserts `ghostSetStrip` renders `-` for null weight, UPDATE that expectation to `BW` and cite spec §4 in the test name.

- [ ] **Step 5: Commit**

```bash
git add src/components/activeSet.ts src/components/__tests__/activeSetCursor.test.ts
git commit -m "feat(set-entry): canCompleteSet (BW), setValuesLabel, planFirstSet prefill planner"
```

---

### Task 5: History query + staging function

**Files:**
- Modify: `src/queries/sets.ts`

The SQL layer has no jest harness for real queries (expo-sqlite is mocked); the planner it feeds is tested in Task 4. Gate: `npx tsc --noEmit` + device QA (Task 12).

- [ ] **Step 1: Add the query + staging function to `src/queries/sets.ts`**

Add to the imports: `import { planFirstSet, type StagedSetPlan } from '@/components/activeSet';`

Append:

```ts
interface LastSessionSetRow {
  order_index: number;
  weight: number | null;
  reps: number | null;
  units: 'kg' | 'lb' | null;
}

/**
 * Completed sets of the most recent FINISHED workout containing this exercise,
 * in performed order — the never-empty prefill source (spec §2). Pattern
 * follows getHeaviestWeightHistory in personalRecords.ts.
 */
export async function getLastSessionSets(
  userId: string,
  exerciseId: string,
): Promise<LastSessionSetRow[]> {
  const db = await getDb();
  const last = await db.getFirstAsync<{ workout_id: string }>(
    `SELECT w.id AS workout_id
       FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN sets s ON s.workout_exercise_id = we.id
      WHERE w.user_id = ? AND we.exercise_id = ?
        AND w.ended_at IS NOT NULL AND s.completed = 1
        AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
      ORDER BY w.ended_at DESC
      LIMIT 1`,
    [userId, exerciseId],
  );
  if (!last) return [];
  return db.getAllAsync<LastSessionSetRow>(
    `SELECT s.order_index, s.weight, s.reps, s.units
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
      WHERE we.workout_id = ? AND we.exercise_id = ?
        AND s.completed = 1 AND s.deleted_at IS NULL AND we.deleted_at IS NULL
      ORDER BY s.order_index ASC`,
    [last.workout_id, exerciseId],
  );
}

export interface FirstSetStage {
  setId: string;
  plan: StagedSetPlan;
  /** True when the plan carries last-session values (drives LAST TIME + autoStaged). */
  fromHistory: boolean;
}

/**
 * Stage the FIRST set of an exercise, prefixed from history (spec §2).
 * History lookup failures degrade to an empty stage — staging must never
 * block on a bad read.
 */
export async function stageFirstSet(
  weId: string,
  exerciseId: string,
  ctx: { userId: string; units: 'kg' | 'lb'; weightStep: number },
): Promise<FirstSetStage> {
  let plan: StagedSetPlan = { weight: null, reps: null, units: null };
  try {
    const rows = await getLastSessionSets(ctx.userId, exerciseId);
    plan = planFirstSet(
      rows.map((r) => ({
        orderIndex: r.order_index,
        weight: r.weight,
        reps: r.reps,
        units: r.units,
      })),
      ctx.units,
      ctx.weightStep,
    );
  } catch {
    // fall through to the empty stage
  }
  const setId = await addSet(weId, plan);
  return { setId, plan, fromHistory: plan.weight != null || plan.reps != null };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors beyond the known Task-3 consumer errors.

- [ ] **Step 3: Commit**

```bash
git add src/queries/sets.ts
git commit -m "feat(set-entry): last-session query + stageFirstSet prefill staging"
```

---

### Task 6: `ActiveSetCard` — flush handle, LOG SET-era card, rubber-band, LAST TIME

**Files:**
- Modify: `src/components/ActiveSetCard.tsx`

Gate: `npx tsc --noEmit` clean for this file once Task 8 updates `WorkoutActive` (they change in lockstep; commit together with Task 8 if needed).

- [ ] **Step 1: Update the interface and internals**

Changes to `src/components/ActiveSetCard.tsx` (keep everything not mentioned — entry spring, reduced-motion gate, voice strip, ghost list, a11y action):

1. New imports/exports:

```tsx
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
```

```tsx
import { NumericStepper, type NumericStepperHandle } from '@/components/NumericStepperView';
import { canCompleteSet, exerciseSetStrip, ghostSetStrip, setValuesLabel, type ExerciseShape, type SetShape } from './activeSet';
```

```tsx
export interface ActiveSetCardHandle {
  /** Commit any open keypad edits and return the effective weight × reps. */
  flushEdits: () => { weight: number | null; reps: number | null };
}
```

2. Props changes: `onComplete` now receives the flushed values; add the LAST TIME strip; drop nothing else:

```tsx
onComplete: (values: { weight: number | null; reps: number | null }) => void;
/** Last-session provenance — non-null only while an untouched history prefill is showing (spec §2). */
lastTime?: { weight: number | null; reps: number | null } | null;
```

3. Convert to `forwardRef` and wire the handle + stepper refs; DELETE the `focused` state, the `FocusedField` type, and the `heroRow` `Pressable` wrapper (replace with a plain `View`):

```tsx
export const ActiveSetCard = forwardRef<ActiveSetCardHandle, Props>(function ActiveSetCard(
  { exercise, set, exerciseIndex, totalExercises, setIndex, weightStep, weightUnit, ghostSets,
    onChangeWeight, onChangeReps, onComplete, onEditSet, lastTime, voice },
  ref,
) {
  // ...
  const weightRef = useRef<NumericStepperHandle>(null);
  const repsRef = useRef<NumericStepperHandle>(null);

  const flushEdits = useCallback(() => ({
    weight: weightRef.current?.flushEdit() ?? set.weight,
    reps: repsRef.current?.flushEdit() ?? set.reps,
  }), [set.weight, set.reps]);

  useImperativeHandle(ref, () => ({ flushEdits }), [flushEdits]);
```

4. Completion gate becomes reps-only, and completion flushes first:

```tsx
  const canComplete = canCompleteSet(set);

  const handleComplete = useCallback(() => {
    const values = flushEdits();
    if (!canCompleteSet({ reps: values.reps })) return;
    // Medium = "set banked" — the signature complete-set moment's haptic half.
    haptics.medium();
    onComplete(values);
  }, [flushEdits, onComplete]);
```

5. Rubber-band on the gated swipe (replace the early-return in `pan.onUpdate`). Capture `reduceMotion` for the worklet via a shared value updated in the existing reduced-motion effect (`const reduceMotionSV = useSharedValue(false);` set alongside `setReduceMotion`):

```tsx
    .onUpdate((event) => {
      const ty = event.translationY;
      if (!canComplete) {
        // Gated: a damped tug that says "the gesture exists but is locked",
        // instead of a dead card. Reduce Motion: stay still.
        translateY.value = reduceMotionSV.value ? 0 : Math.max(-24, Math.min(0, ty * 0.2));
        return;
      }
      // ...existing threshold logic unchanged
    })
```

`onEnd` gains, before the existing logic: `if (!canComplete) { translateY.value = withSpring(0, motion.spring.rebound); return; }`

6. Hero row: steppers get refs, accessory labels, and the NEXT hand-off; the LAST TIME strip renders beneath:

```tsx
        <View style={styles.heroRow}>
          <NumericStepper
            ref={weightRef}
            value={set.weight}
            step={weightStep}
            unit={weightUnit}
            onChange={onChangeWeight}
            accessoryLabel="NEXT → REPS"
            onAccessoryPress={() => repsRef.current?.openKeypad()}
            size="hero"
            testID="weight-stepper"
          />
          <Text style={[styles.heroX, { color: theme.color.inkTertiary, fontFamily: theme.font.family.mono, fontSize: theme.font.size.hero * 0.7, lineHeight: theme.font.size.hero * theme.font.lineHeightMul.hero }]}>
            ×
          </Text>
          <NumericStepper
            ref={repsRef}
            value={set.reps}
            step={1}
            unit="REPS"
            onChange={onChangeReps}
            accessoryLabel="DONE"
            size="hero"
            testID="reps-stepper"
          />
        </View>
        {lastTime ? (
          <Text variant="strip" color={theme.color.inkTertiary}>
            {`LAST TIME · ${setValuesLabel(lastTime.weight, lastTime.reps)}`}
          </Text>
        ) : null}
```

7. Copy + a11y updates:
- Card `accessibilityLabel`: `` `Set ${setIndex}, ${set.weight ?? 'bodyweight'} by ${set.reps ?? 'no reps'} reps. Swipe up to complete.` ``
- Hint line: `{canComplete ? '↑ Swipe up to log' : 'Enter reps to log this set'}`
- `styles.heroRow` keeps `flexDirection: 'row'`, `alignItems: 'baseline'` — it is a `View` now, not a `Pressable`.

- [ ] **Step 2: Typecheck (with Task 8, below)** — the two files migrate together.

---

### Task 7: `EditSetSheet` — new stepper API + flush-before-save

**Files:**
- Modify: `src/components/EditSetSheet.tsx`

- [ ] **Step 1: Migrate**

1. Drop the `FocusedField` type and `focused` state entirely.
2. Add refs and flush both steppers at the top of `handleSave`, using the returned effective values for the patch (fixes the save race):

```tsx
  const weightRef = useRef<NumericStepperHandle>(null);
  const repsRef = useRef<NumericStepperHandle>(null);

  const handleSave = () => {
    haptics.light();
    const weight = weightRef.current?.flushEdit() ?? null;
    const reps = repsRef.current?.flushEdit() ?? null;
    setWeight(weight);
    setReps(reps);
    updateSet.mutate(
      {
        setId: set.id,
        weId: set.weId,
        // Unit stamped only when a weight is present (per-set provenance, #131).
        patch: { weight, reps, units: weight != null ? units : set.units },
      },
      { onSuccess: () => { recompute(); onClose(); } },
    );
  };
```

Note: `flushEdit()` returns the current prop value when no edit is open — and the stepper's `value` prop here is the local draft state, so `?? null` never actually masks a value; it only satisfies the ref's nullability.

3. Stepper JSX (both fields — weight shown; reps mirrors with `step={1}` `unit="REPS"` `accessoryLabel="DONE"` and no `onAccessoryPress`):

```tsx
        <NumericStepper
          ref={weightRef}
          value={weight}
          step={weightStep}
          unit={weightUnit}
          onChange={setWeight}
          accessoryLabel="NEXT → REPS"
          onAccessoryPress={() => repsRef.current?.openKeypad()}
          size="inline"
          testID="edit-weight-stepper"
        />
```

4. Delete the now-unused `noop` function. Update imports: `import { NumericStepper, type NumericStepperHandle } from '@/components/NumericStepperView';` and add `useRef` to the react import.

- [ ] **Step 2: Commit** (with Tasks 6/8 if tsc requires; otherwise alone)

```bash
git add src/components/EditSetSheet.tsx
git commit -m "fix(set-entry): EditSetSheet saves flushed values — kills the save race"
```

---

### Task 8: `WorkoutActive` + `useWorkoutCursor` — bottom bar, wiring, prefill call sites

**Files:**
- Modify: `src/screens/WorkoutActive.tsx`
- Modify: `src/screens/workoutActive/useWorkoutCursor.ts`
- Modify: `src/queries/exercises.ts:119-121`

- [ ] **Step 1: `useWorkoutCursor` — prefill staging + flushed-values overlay**

1. Hook params gain the prefill context:

```ts
export function useWorkoutCursor({
  exercises,
  refreshDetail,
  userId,
  units,
  weightStep,
}: {
  exercises: ExerciseShape[];
  refreshDetail: () => void;
  userId: string | undefined;
  units: 'kg' | 'lb';
  weightStep: number;
}) {
```

2. Replace `import { addSet } from '@/queries/sets';` with `import { stageFirstSet } from '@/queries/sets';`.

3. `onNextExercise` and `onPrevExercise` accept the flushed values and stage with prefill. Full new `onNextExercise` (apply the same two changes to `onPrevExercise`):

```ts
  const onNextExercise = useCallback(
    (flushed?: { weight: number | null; reps: number | null } | null) => {
      if (!cursor || !currentExercise) return;
      const nextEx = findNextExercise(exercises, cursor.weId);
      const rawSet = findSet(currentExercise, cursor.setId);
      // Overlay just-flushed keypad edits — query data may be a tick stale.
      const currentSet = rawSet && flushed ? { ...rawSet, ...flushed } : rawSet;
      const needsConfirm = shouldConfirmLeavingSet(currentSet, autoStaged.current);
      const advance = async () => {
        if (nextEx) {
          let nextSetId = firstIncompleteSet(nextEx)?.id;
          if (!nextSetId) {
            if (userId) {
              // First set of this exercise → never-empty prefill (spec §2).
              const staged = await stageFirstSet(nextEx.id, nextEx.exerciseId, {
                userId,
                units,
                weightStep,
              });
              nextSetId = staged.setId;
              autoStaged.current = {
                id: staged.setId,
                weight: staged.plan.weight,
                reps: staged.plan.reps,
                source: staged.fromHistory ? 'history' : 'carry',
              };
            } else {
              nextSetId = await addSet(nextEx.id);
            }
            refreshDetail();
          }
          setCursor({ weId: nextEx.id, setId: nextSetId });
          haptics.medium();
        } else {
          setCursor(null); // → finish summary
          haptics.medium();
        }
      };
      if (!needsConfirm) void advance();
      else setLeaveConfirm(() => () => void advance());
    },
    [cursor, currentExercise, exercises, refreshDetail, userId, units, weightStep],
  );
```

(Keep the `addSet` import too — the `userId`-missing fallback uses it. `firstIncompleteSet` short-circuits staging when the exercise already has an open set, exactly as today.)

- [ ] **Step 2: `addExerciseToWorkout` prefill (the picker-add path)**

In `src/queries/exercises.ts`, extend the signature and replace the trailing `await addSet(id);`:

```ts
export async function addExerciseToWorkout(args: {
  workoutId: string;
  exerciseId: string;
  /** When present, the staged first set prefills from last session (spec §2). */
  prefill?: { userId: string; units: 'kg' | 'lb'; weightStep: number };
}): Promise<{ weId: string; staged: FirstSetStage | null }> {
```

```ts
  // Phase 3: every exercise starts with one set staged so the user never
  // sees an empty card — now prefilled from history (spec §2).
  let staged: FirstSetStage | null = null;
  if (args.prefill) {
    staged = await stageFirstSet(id, args.exerciseId, args.prefill);
  } else {
    await addSet(id);
  }
  return { weId: id, staged };
```

Import `stageFirstSet, type FirstSetStage` from `@/queries/sets`. Update ALL call sites of `addExerciseToWorkout` / `useAddExerciseToWorkout` to the new return shape (`grep -rn addExerciseToWorkout src/` — known: `WorkoutActive.onAddExercise`, the mutation hook in `exercises.ts`, possibly `PlanSetup`). The mutation hook's `mutationFn` passes through unchanged; callers that only need the id use `.weId`.

- [ ] **Step 3: `WorkoutActive` wiring**

1. Hook call:

```ts
  const { cursor, setCursor, currentExercise: currentExForRest, autoStaged, targetExercise,
    onNextExercise, onPrevExercise, leaveConfirm, setLeaveConfirm } = useWorkoutCursor({
    exercises, refreshDetail, userId, units, weightStep,
  });
```

2. Card ref + flush-then-gate log action (place after `onComplete`):

```ts
  const cardRef = useRef<ActiveSetCardHandle>(null);

  const onLogSet = useCallback(() => {
    const values = cardRef.current?.flushEdits() ?? null;
    if (!values || !canCompleteSet({ reps: values.reps })) return;
    void onComplete(values);
  }, [onComplete]);
```

3. `onComplete` receives the flushed values and overlays them for staging/PRs (signature `async (values?: { weight: number | null; reps: number | null })`); inside, replace the `currentSetData` usage:

```ts
      const rawSetData = currentExForRest && findSet(currentExForRest, cursor.setId);
      const currentSetData = rawSetData ? { ...rawSetData, ...(values ?? {}) } : null;
```

…and stamp the staged marker's source:

```ts
      autoStaged.current = { id: newSetId, weight: staged.weight, reps: staged.reps, source: 'carry' };
```

4. Unit provenance on clear (spec §5 / #131): in `onChangeWeight`, the patch becomes

```ts
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { weight: next, units: next != null ? units : null } });
```

5. Voice: `onCompleteSet: () => onLogSet(),` — voice `done` now flushes and respects the reps gate.

6. Navigation flush: the bottom-bar next control and any `onNextExercise`/`onPrevExercise` invocation (voice included) go through wrappers:

```ts
  const onNextExercisePress = useCallback(() => {
    onNextExercise(cardRef.current?.flushEdits() ?? null);
  }, [onNextExercise]);
  const onPrevExercisePress = useCallback(() => {
    onPrevExercise(cardRef.current?.flushEdits() ?? null);
  }, [onPrevExercise]);
```

Voice session props: `onNextExercise: onNextExercisePress, onPrevExercise: onPrevExercisePress`.

7. LAST TIME provenance for the card (computed above the JSX return, after `currentSet` resolves):

```ts
  const staged = autoStaged.current;
  const lastTime =
    staged && staged.source === 'history' && staged.id === currentSet.id &&
    currentSet.weight === staged.weight && currentSet.reps === staged.reps
      ? { weight: staged.weight, reps: staged.reps }
      : null;
```

8. Card JSX: `ref={cardRef}`, `lastTime={lastTime}`, `onComplete={(values) => void onComplete(values)}`.

9. ScrollView: `keyboardShouldPersistTaps="handled"` so field hand-offs land on the first tap.

10. The bottom bar (replace the current single-Button bar):

```tsx
      <View style={styles.bottomBar}>
        <Button
          label={hasNextExercise ? 'Next ›' : 'Finish ›'}
          kind="ghost"
          size="cta"
          onPress={onNextExercisePress}
          accessibilityLabel={hasNextExercise ? 'Next exercise' : 'Go to workout summary'}
          accessibilityHint={hasNextExercise ? 'Move to the next exercise' : 'Shows the finish summary'}
        />
        <Button
          label={
            canCompleteSet(currentSet)
              ? `Log set · ${setValuesLabel(currentSet.weight, currentSet.reps)}`
              : 'Enter reps'
          }
          kind="inverted"
          size="cta"
          disabled={!canCompleteSet(currentSet)}
          onPress={onLogSet}
          accessibilityLabel={`Log set ${currentSetIdx + 1}`}
          accessibilityHint="Completes this set and stages the next one"
          style={styles.logBtn}
        />
      </View>
```

Styles: `bottomBar` becomes `{ flexDirection: 'row', gap: theme.space.s2, ... }` (keep its existing padding), add `logBtn: { flex: 1 }`. The recap screen's volt `Finish workout` CTA is unchanged — volt stays reserved (spec §3).

11. Imports to add: `canCompleteSet, setValuesLabel` from `@/components/activeSet`; `type ActiveSetCardHandle` from `@/components/ActiveSetCard`.

- [ ] **Step 4: Full gates**

Run: `npx tsc --noEmit` → clean (all consumers migrated).
Run: `npx jest` → all suites pass.
Run: `npx eslint src --ext .ts,.tsx` (or `npm run lint` if defined) → clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WorkoutActive.tsx src/screens/workoutActive/useWorkoutCursor.ts src/queries/exercises.ts src/components/ActiveSetCard.tsx src/components/NumericStepperView.tsx
git commit -m "feat(set-entry): LOG SET bar, flush-before-consume, history prefill staging, reps-only gate"
```

---

### Task 9: Voice values through the sanitize choke point (backlog 2.2/#137)

**Files:**
- Modify: `src/voice/dispatch.ts:28-57` (the `setValues` case)

- [ ] **Step 1: Clamp parsed numbers**

Add import: `import { sanitizeNumber } from '@/components/numericStepper';`

In the `setValues` case, replace the patch assembly:

```ts
      const patch: { weight?: number; reps?: number; units?: 'kg' | 'lb' } = {};
      if (command.weight != null) {
        // Same clamp as the keypad/steppers (#19) — a misheard "bench 9999"
        // must not write an unbounded value (backlog 2.2/#137).
        patch.weight = sanitizeNumber(command.weight, { min: 0, max: 1500 });
        patch.units = command.unit ?? ctx.units; // spoken unit overrides profile pref (#133)
      }
      if (command.reps != null) {
        patch.reps = sanitizeNumber(command.reps, { min: 0, max: 200, integer: true });
      }
```

If `src/voice/__tests__/` has a dispatch test file, add a case asserting `setValues` with `weight: 9999` patches `1500`; if none exists, `sanitizeNumber` itself is already covered — do not build a new harness for this.

- [ ] **Step 2: Gates + commit**

Run: `npx tsc --noEmit && npx jest`
Expected: clean/pass.

```bash
git add src/voice/dispatch.ts
git commit -m "fix(voice): route spoken weight/reps through sanitizeNumber (backlog 2.2/#137)"
```

---

### Task 10: BW in history

**Files:**
- Modify: `src/screens/HistoryDetail.tsx:62-82` (the set row)

- [ ] **Step 1: Render completed weightless sets as BW**

The set-row value text becomes (imports unchanged; `formatWeight` keeps its `'-'` for incomplete rows):

```tsx
              <Text variant="numeral" color={theme.color.ink} style={styles.setCell}>
                {/* Each set shows the unit it was logged in (#131/#135); a
                    completed weightless set is bodyweight (spec §4). */}
                {s.completed && s.weight == null
                  ? 'BW'
                  : formatWeight(s.weight, s.units ?? DEFAULT_UNITS)}{' '}
                × {s.reps != null ? s.reps : '-'}
              </Text>
```

- [ ] **Step 2: Gates + commit**

Run: `npx tsc --noEmit && npx jest`

```bash
git add src/screens/HistoryDetail.tsx
git commit -m "feat(set-entry): bodyweight sets display as BW in history (spec §4)"
```

---

### Task 11: Delete the debounce buffer

**Files:**
- Modify: `src/components/numericStepper.ts` (remove `useDebouncedCommit`, `DebouncedCommit`, and the now-unused `react` import if nothing else needs it)
- Modify: `src/components/__tests__/numericStepper.test.ts` (remove the `useDebouncedCommit` describe block and its `renderHook` import if unused elsewhere)

- [ ] **Step 1: Remove** — delete the hook, its interface, and its tests. `grep -rn useDebouncedCommit src/` must return nothing.

- [ ] **Step 2: Gates + commit**

Run: `npx tsc --noEmit && npx jest`
Expected: clean; the numericStepper suite runs only pure-logic tests now.

```bash
git add src/components/numericStepper.ts src/components/__tests__/numericStepper.test.ts
git commit -m "refactor(set-entry): retire useDebouncedCommit — the session model replaced it"
```

---

### Task 12: Backlog bookkeeping + device QA checklist

**Files:**
- Modify: `docs/UX_POLISH_BACKLOG.md`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: Backlog** — in the resolved-summary section at the top of `docs/UX_POLISH_BACKLOG.md`, append a line:

```markdown
- **Resolved by the set-entry redesign (2026-07-19 spec, this branch):** 9.3/#27 (stepper touch targets now ≥44pt), 7.5/#30 (▲▼ glyphs → Icon registry ±), 9.2/#117 (stepper Dynamic Type via Text variants), 2.2/#137 (voice values clamped), plus the new-in-review set-entry defects (wipe-on-blur, mid-typing commits, lb decimals, locale comma, voice empty-set completion, EditSetSheet save race). Bodyweight sets are now loggable (reps-only gate).
```

- [ ] **Step 2: Device QA rider** — append to the QA checklist in `docs/TESTING.md`:

```markdown
### Set-entry redesign QA (2026-07-19)

- [ ] Tap a prefilled weight, dismiss the keyboard without typing → value unchanged (no wipe to “-”)
- [ ] Type reps “12”, swipe up within a beat → banks ×12, never ×1
- [ ] NEXT → REPS accessory hand-off; DONE dismisses (iOS)
- [ ] lb profile: type 2.5 (decimal pad present); type “62,5” → 62.5
- [ ] New exercise with history → seeded values + LAST TIME strip; swipe = repeat of last session
- [ ] New exercise, no history → ghosted 0 + underline; first tap opens the keypad
- [ ] Pull-ups: enter reps only → LOG SET · BW × n; ghost strip + history show BW
- [ ] LOG SET while the keypad is open with fresh digits → logs the typed value
- [ ] Voice “done” with empty reps → does NOT complete the set
- [ ] Gated swipe rubber-bands (Reduce Motion: stays still); hint reads “Enter reps to log this set”
- [ ] Edit a banked set, change weight, tap Save immediately → saved value matches the screen
- [ ] Airplane mode: log several sets → all present after relaunch; sync clean on reconnect
```

- [ ] **Step 3: Final gates + commit**

Run: `npx tsc --noEmit && npx jest`

```bash
git add docs/UX_POLISH_BACKLOG.md docs/TESTING.md
git commit -m "docs: backlog closures + device-QA rider for the set-entry redesign"
```

---

## Self-review notes (kept for the executor)

- **Spec coverage:** §1 → Tasks 1, 3 (session model, accessory, decimal-pad, comma, select-on-focus, min-width, steppers hidden while editing, `keyboardShouldPersistTaps` in Task 8.9); §2 → Tasks 4, 5, 8 (planner, query, staging call sites, ghost-0 underline in Task 3, LAST TIME in Tasks 6/8); §3 → Tasks 6, 8 (LOG SET inverted, next demoted, rubber-band, voice gate, flush-before-consume); §4 → Tasks 4, 6, 8, 10 (reps-only gate, BW labels everywhere); §5 → Tasks 2, 3, 7, 9 (modernization, EditSetSheet, voice clamp). `finishWorkout` pruning already keys on `completed = 0` (verified `workouts.ts:96-108`) — completed BW sets survive; no change needed.
- **Known accepted edges:** the LOG SET label shows pre-flush values while a keypad is open (commit lands on press — QA item); the swipe gesture stays gated on committed reps while typing (LOG SET is the primary path); the `theme.depth.rule` token name in Task 3 must be confirmed against `useTheme.ts` at execution time.
- **Type consistency:** `NumericStepperHandle { flushEdit(): number | null; openKeypad(): void }` (Tasks 3, 6, 7); `ActiveSetCardHandle { flushEdits(): { weight, reps } }` (Tasks 6, 8); `AutoStagedSet.source?: 'carry' | 'history'` (Tasks 4, 8); `FirstSetStage { setId, plan, fromHistory }` (Tasks 5, 8); `onComplete(values)` / `onNextExercise(flushed?)` (Tasks 6, 8).
