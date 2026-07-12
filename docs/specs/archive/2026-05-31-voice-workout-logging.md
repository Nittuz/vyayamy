# Voice Workout Logging (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hands-free voice control to run a workout — log sets, complete them, add exercises, control the rest timer, finish — built on the app's existing local-first mutations.

**Architecture:** Voice is a thin input layer. A tap opens a listening session; on-device speech recognition yields a transcript; a **pure grammar parser** turns it into a `Command`; a **dispatch** layer maps data commands onto existing query functions (`addSet`, `updateSet`, `addExerciseToWorkout`, `finishWorkout`). The pure core (number words, commands, grammar, dispatch) is fully unit-tested in the existing ts-jest + better-sqlite3 harness. The native speech adapter, the session hook, and the card-morph UI need an Expo dev build and on-device QA — they are specified here but not unit-tested in this harness.

**Tech Stack:** TypeScript, React Native (Expo), `expo-speech-recognition` (on-device STT), Jest (ts-jest), better-sqlite3 mock of expo-sqlite.

---

## File Structure

| File                                        | Responsibility                                                              | Tested in harness?    |
| ------------------------------------------- | --------------------------------------------------------------------------- | --------------------- |
| `src/voice/numberWords.ts`                  | Spoken-numeral + digit → number                                             | ✅ unit               |
| `src/voice/commands.ts`                     | `Command`, `Confidence`, `ParseResult`, `VoiceContext`, `VoiceParser` types | type-only             |
| `src/voice/grammar.ts`                      | `GrammarParser.parse(transcript, ctx)` → `ParseResult \| null` (pure)       | ✅ unit               |
| `src/voice/dispatch.ts`                     | Data `Command` → existing mutations; returns feedback + undo                | ✅ unit (SQLite mock) |
| `src/voice/speechEngine.ts`                 | `SpeechEngine` interface + `expo-speech-recognition` adapter                | ❌ device QA          |
| `src/voice/useVoiceSession.ts`              | Listening lifecycle, confidence→apply/confirm/undo, timer/nav, UI state     | ❌ device QA          |
| `src/components/VoiceMicButton.tsx`         | Mic control + listening/disabled states                                     | ❌ device QA          |
| `src/components/ActiveSetCard.tsx` (modify) | Inline-morph listening UI                                                   | ❌ device QA          |
| `src/screens/WorkoutActive.tsx` (modify)    | Wire session to the active-set cursor                                       | ❌ device QA          |
| `app.config.ts` (modify)                    | Mic + speech permissions, plugin                                            | ❌ build config       |

Convention reminders (match existing tests): every DB-touching test does `await resetDbForTests(); await initDb();` in `beforeEach`, sets `setSyncState({ online: false })`, and mocks `@/auth/supabase`. Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## Task 1: Spoken-number parsing (`numberWords.ts`)

**Files:**

- Create: `src/voice/numberWords.ts`
- Test: `src/voice/__tests__/numberWords.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/voice/__tests__/numberWords.test.ts
import { wordsToNumber } from '@/voice/numberWords';

describe('wordsToNumber', () => {
  test('parses plain digits', () => {
    expect(wordsToNumber('185')).toBe(185);
    expect(wordsToNumber('5')).toBe(5);
  });

  test('parses single number words', () => {
    expect(wordsToNumber('five')).toBe(5);
    expect(wordsToNumber('ninety')).toBe(90);
    expect(wordsToNumber('fifteen')).toBe(15);
  });

  test('parses colloquial gym numbers', () => {
    expect(wordsToNumber('one eighty five')).toBe(185);
    expect(wordsToNumber('two twenty five')).toBe(225);
    expect(wordsToNumber('one thirty five')).toBe(135);
    expect(wordsToNumber('two seventy')).toBe(270);
    expect(wordsToNumber('one fifteen')).toBe(115);
    expect(wordsToNumber('eighty five')).toBe(85);
  });

  test('parses hyphenated and standard forms', () => {
    expect(wordsToNumber('one-eighty-five')).toBe(185);
    expect(wordsToNumber('a hundred and five')).toBe(105);
    expect(wordsToNumber('one hundred eighty five')).toBe(185);
  });

  test('returns null for non-numeric input', () => {
    expect(wordsToNumber('bench press')).toBeNull();
    expect(wordsToNumber('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/voice/__tests__/numberWords.test.ts`
Expected: FAIL — cannot find module `@/voice/numberWords`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/voice/numberWords.ts
const SMALL: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const isUnit = (n: number) => n >= 1 && n <= 9;
const isTens = (n: number) => n >= 20 && n <= 90 && n % 10 === 0;
const isTeen = (n: number) => n >= 10 && n <= 19;

/** Parse a spoken or written number ("one eighty five" -> 185). Null if not a number. */
export function wordsToNumber(input: string): number | null {
  const cleaned = input
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);

  const tokens = cleaned.split(' ');

  if (tokens.includes('hundred') || tokens.includes('thousand')) {
    let result = 0;
    let current = 0;
    let any = false;
    for (const t of tokens) {
      if (t === 'a') {
        current += 1;
        any = true;
        continue;
      }
      if (t === 'hundred') {
        current = (current === 0 ? 1 : current) * 100;
        any = true;
        continue;
      }
      if (t === 'thousand') {
        result += (current === 0 ? 1 : current) * 1000;
        current = 0;
        any = true;
        continue;
      }
      if (t in SMALL) {
        current += SMALL[t]!;
        any = true;
        continue;
      }
      if (t in TENS) {
        current += TENS[t]!;
        any = true;
        continue;
      }
      return null;
    }
    return any ? result + current : null;
  }

  const vals: number[] = [];
  for (const t of tokens) {
    if (t === 'a') {
      vals.push(1);
      continue;
    }
    if (t in SMALL) {
      vals.push(SMALL[t]!);
      continue;
    }
    if (t in TENS) {
      vals.push(TENS[t]!);
      continue;
    }
    return null;
  }
  if (vals.length === 0) return null;
  if (vals.length === 1) return vals[0]!;

  const [a, b, c] = vals as [number, number, number?];
  if (vals.length === 3 && isUnit(a) && isTens(b) && c !== undefined && isUnit(c))
    return a * 100 + b + c;
  if (vals.length === 2 && isUnit(a) && (isTens(b) || isTeen(b))) return a * 100 + b;
  if (vals.length === 2 && isTens(a) && isUnit(b)) return a + b;
  return vals.reduce((s, n) => s + n, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/voice/__tests__/numberWords.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voice/numberWords.ts src/voice/__tests__/numberWords.test.ts
git commit -m "feat(voice): spoken-number parsing for set values

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Command model (`commands.ts`)

**Files:**

- Create: `src/voice/commands.ts`

No test (types only). It is consumed and thereby type-checked by Tasks 3–4.

- [ ] **Step 1: Write the types**

```ts
// src/voice/commands.ts
export type Unit = 'kg' | 'lb';

export type Command =
  | { kind: 'setValues'; weight?: number; reps?: number; unit?: Unit }
  | { kind: 'completeSet' }
  | { kind: 'addSet' }
  | { kind: 'addExercise'; name: string }
  | { kind: 'nextExercise' }
  | { kind: 'prevExercise' }
  | { kind: 'startRest'; seconds?: number }
  | { kind: 'finishWorkout' }
  | { kind: 'undo' }
  | { kind: 'stop' };

export type Confidence = 'high' | 'low';

export interface ParseResult {
  command: Command;
  confidence: Confidence;
  transcript: string;
}

/** Context the parser needs to disambiguate. */
export interface VoiceContext {
  units: Unit;
  hasActiveExercise: boolean;
}

export interface VoiceParser {
  parse(transcript: string, ctx: VoiceContext): ParseResult | null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/voice/commands.ts
git commit -m "feat(voice): command model and parser interface

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Grammar parser — control & flow commands

**Files:**

- Create: `src/voice/grammar.ts`
- Test: `src/voice/__tests__/grammar.control.test.ts`

This task implements the parser shell plus the non-numeric commands (stop, undo, finish, rest, next/prev, add set, complete, add exercise). Task 4 adds set-value parsing to the same file.

- [ ] **Step 1: Write the failing test**

```ts
// src/voice/__tests__/grammar.control.test.ts
import { GrammarParser } from '@/voice/grammar';
import type { VoiceContext } from '@/voice/commands';

const ctx: VoiceContext = { units: 'lb', hasActiveExercise: true };
const parse = (t: string) => GrammarParser.parse(t, ctx);

describe('GrammarParser — control & flow', () => {
  test('stop / undo', () => {
    expect(parse('stop')!.command).toEqual({ kind: 'stop' });
    expect(parse('scratch that')!.command).toEqual({ kind: 'undo' });
    expect(parse('undo')!.command).toEqual({ kind: 'undo' });
  });

  test('complete set', () => {
    expect(parse('done')!.command).toEqual({ kind: 'completeSet' });
    expect(parse('got it')!.command).toEqual({ kind: 'completeSet' });
    expect(parse('complete')!.command).toEqual({ kind: 'completeSet' });
  });

  test('add set vs add exercise (order matters)', () => {
    expect(parse('add a set')!.command).toEqual({ kind: 'addSet' });
    expect(parse('one more')!.command).toEqual({ kind: 'addSet' });
    expect(parse('add bench press')!.command).toEqual({ kind: 'addExercise', name: 'bench press' });
    expect(parse('add incline dumbbell press')!.command).toEqual({
      kind: 'addExercise',
      name: 'incline dumbbell press',
    });
  });

  test('navigation', () => {
    expect(parse('next exercise')!.command).toEqual({ kind: 'nextExercise' });
    expect(parse('previous exercise')!.command).toEqual({ kind: 'prevExercise' });
  });

  test('rest timer with and without duration', () => {
    expect(parse('start rest timer')!.command).toEqual({ kind: 'startRest' });
    expect(parse('two minute rest')!.command).toEqual({ kind: 'startRest', seconds: 120 });
    expect(parse('rest for ninety seconds')!.command).toEqual({ kind: 'startRest', seconds: 90 });
  });

  test('finish workout is high confidence (UI confirms separately)', () => {
    const r = parse('finish workout');
    expect(r!.command).toEqual({ kind: 'finishWorkout' });
    expect(r!.confidence).toBe('high');
  });

  test('unrecognized chatter returns null', () => {
    expect(parse('yeah bro nice lift')).toBeNull();
    expect(parse('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/voice/__tests__/grammar.control.test.ts`
Expected: FAIL — cannot find module `@/voice/grammar`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/voice/grammar.ts
import type { Command, ParseResult, VoiceContext, VoiceParser } from './commands';
import { wordsToNumber } from './numberWords';

function normalize(t: string): string {
  return t
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a leading/standalone duration phrase like "two minute" / "ninety seconds". */
function parseDuration(s: string): number | undefined {
  const min = s.match(/(\b[\w\s-]+?\b)\s*(?:minute|min)s?\b/);
  if (min) {
    const n = wordsToNumber(min[1]!.trim());
    if (n != null) return n * 60;
  }
  const sec = s.match(/(\b[\w\s-]+?\b)\s*(?:second|sec)s?\b/);
  if (sec) {
    const n = wordsToNumber(sec[1]!.trim());
    if (n != null) return n;
  }
  return undefined;
}

function high(command: Command, transcript: string): ParseResult {
  return { command, confidence: 'high', transcript };
}

export const GrammarParser: VoiceParser = {
  parse(transcript: string, _ctx: VoiceContext): ParseResult | null {
    const t = normalize(transcript);
    if (t === '') return null;

    if (/\b(stop|stop listening|cancel)\b/.test(t)) return high({ kind: 'stop' }, transcript);
    if (/\b(undo|scratch that|never mind|delete that)\b/.test(t))
      return high({ kind: 'undo' }, transcript);
    if (/\b(finish|end)\b.*\bworkout\b|\bend session\b/.test(t))
      return high({ kind: 'finishWorkout' }, transcript);

    if (/\b(rest|timer)\b/.test(t) && /\b(start|rest|timer|take)\b/.test(t)) {
      return high(
        { kind: 'startRest', ...(parseDuration(t) != null ? { seconds: parseDuration(t) } : {}) },
        transcript,
      );
    }

    if (/\bnext exercise\b/.test(t)) return high({ kind: 'nextExercise' }, transcript);
    if (/\b(previous|prior|last) exercise\b/.test(t))
      return high({ kind: 'prevExercise' }, transcript);

    // add a set / another set / one more  — MUST come before "add <exercise>"
    if (/\b(add (a )?set|another set|one more( set)?)\b/.test(t))
      return high({ kind: 'addSet' }, transcript);

    if (/\b(done|complete|completed|got it|logged|next set|mark (it )?done)\b/.test(t)) {
      return high({ kind: 'completeSet' }, transcript);
    }

    const add = t.match(/^add (.+)$/);
    if (add) return high({ kind: 'addExercise', name: add[1]!.trim() }, transcript);

    return null;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/voice/__tests__/grammar.control.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voice/grammar.ts src/voice/__tests__/grammar.control.test.ts
git commit -m "feat(voice): grammar parser for control and flow commands

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Grammar parser — set-value commands & confidence

**Files:**

- Modify: `src/voice/grammar.ts`
- Test: `src/voice/__tests__/grammar.setvalues.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/voice/__tests__/grammar.setvalues.test.ts
import { GrammarParser } from '@/voice/grammar';
import type { VoiceContext } from '@/voice/commands';

const ctx: VoiceContext = { units: 'lb', hasActiveExercise: true };
const parse = (t: string) => GrammarParser.parse(t, ctx);

describe('GrammarParser — set values', () => {
  test('weight + reps via "for"/"by"/"times"', () => {
    expect(parse('185 for 5')!.command).toEqual({ kind: 'setValues', weight: 185, reps: 5 });
    expect(parse('one eighty five for five')!.command).toEqual({
      kind: 'setValues',
      weight: 185,
      reps: 5,
    });
    expect(parse('225 by 3')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 3 });
    expect(parse('log 135 times 8 reps')!.command).toEqual({
      kind: 'setValues',
      weight: 135,
      reps: 8,
    });
  });

  test('weight + reps is high confidence', () => {
    expect(parse('185 for 5')!.confidence).toBe('high');
  });

  test('reps only', () => {
    expect(parse('5 reps')!.command).toEqual({ kind: 'setValues', reps: 5 });
    expect(parse('eight reps')!.command).toEqual({ kind: 'setValues', reps: 8 });
  });

  test('bare weight is low confidence', () => {
    const r = parse('185');
    expect(r!.command).toEqual({ kind: 'setValues', weight: 185 });
    expect(r!.confidence).toBe('low');
  });

  test('explicit unit override', () => {
    expect(parse('100 kilos for 5')!.command).toEqual({
      kind: 'setValues',
      weight: 100,
      reps: 5,
      unit: 'kg',
    });
    expect(parse('two twenty five pounds for 3')!.command).toEqual({
      kind: 'setValues',
      weight: 225,
      reps: 3,
      unit: 'lb',
    });
  });

  test('correction "make it 195"', () => {
    expect(parse('make it 195')!.command).toEqual({ kind: 'setValues', weight: 195 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/voice/__tests__/grammar.setvalues.test.ts`
Expected: FAIL — set-value phrases currently return `null`.

- [ ] **Step 3: Add set-value parsing to `grammar.ts`**

Add these helpers above `GrammarParser` (after `parseDuration`):

```ts
const FILLER = new Set([
  'log',
  'set',
  'put',
  'do',
  'make',
  'it',
  'to',
  'the',
  'weight',
  'of',
  'at',
]);
const NUM_WORDS = new Set([
  'a',
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'and',
]);

/** Pull the first contiguous run of number tokens (digits or number-words) and parse it. */
function firstNumberIn(phrase: string): number | null {
  const tokens = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let run: string[] = [];
  for (const tok of tokens) {
    const isNum = /^\d+$/.test(tok) || NUM_WORDS.has(tok);
    if (isNum) {
      run.push(tok);
    } else if (FILLER.has(tok)) {
      if (run.length > 0) break; // filler after a run ends it
      // filler before a run: skip
    } else if (run.length > 0) {
      break;
    }
  }
  return run.length ? wordsToNumber(run.join(' ')) : null;
}

function detectUnit(t: string): 'kg' | 'lb' | undefined {
  if (/\b(kilo|kilos|kg|kgs|kilogram|kilograms)\b/.test(t)) return 'kg';
  if (/\b(pound|pounds|lb|lbs)\b/.test(t)) return 'lb';
  return undefined;
}
```

Then, inside `GrammarParser.parse`, insert the set-value handling **immediately before the final `return null;`**:

```ts
// reps only: "<n> reps"
const repsOnly = t.match(/^(.*?)\breps?\b\s*$/);

// weight <connector> reps
const conn = t.match(/^(.*?)\b(?:for|by|times|x)\b(.*)$/);
if (conn) {
  const weight = firstNumberIn(conn[1]!);
  const reps = firstNumberIn(conn[2]!);
  if (weight != null && reps != null) {
    const unit = detectUnit(t);
    return {
      command: { kind: 'setValues', weight, reps, ...(unit ? { unit } : {}) },
      confidence: 'high',
      transcript,
    };
  }
}

if (repsOnly) {
  const reps = firstNumberIn(repsOnly[1]!);
  if (reps != null) return { command: { kind: 'setValues', reps }, confidence: 'high', transcript };
}

// bare weight (incl. "make it 195") — low confidence
const bare = firstNumberIn(t);
if (bare != null) {
  const unit = detectUnit(t);
  return {
    command: { kind: 'setValues', weight: bare, ...(unit ? { unit } : {}) },
    confidence: 'low',
    transcript,
  };
}
```

- [ ] **Step 4: Run both grammar test files**

Run: `npx jest src/voice/__tests__/grammar`
Expected: PASS (Task 3 + Task 4 tests both green).

- [ ] **Step 5: Commit**

```bash
git add src/voice/grammar.ts src/voice/__tests__/grammar.setvalues.test.ts
git commit -m "feat(voice): parse set values, units, and confidence levels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Dispatch — map data commands to mutations

**Files:**

- Create: `src/voice/dispatch.ts`
- Test: `src/voice/__tests__/dispatch.test.ts`

Dispatch handles only the **data** commands (`setValues`, `completeSet`, `addSet`, `addExercise`). Session-level commands (`startRest`, `nextExercise`, `prevExercise`, `finishWorkout`, `undo`, `stop`) are handled by the hook in Task 7 and are intentionally not dispatched here.

- [ ] **Step 1: Write the failing test**

```ts
// src/voice/__tests__/dispatch.test.ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { listSetsForWorkoutExercise } from '@/queries/sets';
import { setSyncState } from '@/sync/state';
import { dispatchCommand, type DispatchContext } from '@/voice/dispatch';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'voice-user';
const T = '2026-01-01T00:00:00.000Z';

async function seedExercise(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, 'Chest', null, T, T],
  );
}

async function setup(): Promise<DispatchContext> {
  const workoutId = await createWorkout({ userId: USER, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId, exerciseId: 'ex' });
  const sets = await listSetsForWorkoutExercise(weId); // auto-staged set 0
  return { userId: USER, workoutId, activeWeId: weId, activeSetId: sets[0]!.id, units: 'lb' };
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
  await seedExercise('ex', 'Bench Press');
});

test('setValues writes weight and reps to the active set', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'setValues', weight: 185, reps: 5 }, ctx);
  expect(res.ok).toBe(true);
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.weight).toBe(185);
  expect(sets[0]!.reps).toBe(5);
});

test('setValues undo restores prior values', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'setValues', weight: 185, reps: 5 }, ctx);
  await res.undo!();
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.weight).toBeNull();
  expect(sets[0]!.reps).toBeNull();
});

test('completeSet marks the active set completed; undo reverts', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'completeSet' }, ctx);
  let sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.completed).toBe(true);
  await res.undo!();
  sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.completed).toBe(false);
});

test('addSet stages another set; undo removes it', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'addSet' }, ctx);
  let sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets).toHaveLength(2);
  await res.undo!();
  sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets).toHaveLength(1);
});

test('addExercise reuses an existing catalog match', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'addExercise', name: 'Bench Press' }, ctx);
  expect(res.ok).toBe(true);
  const db = await getDb();
  const count = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM exercises WHERE name = 'Bench Press'",
  );
  expect(count!.n).toBe(1); // reused, not duplicated
});

test('addExercise creates a custom exercise when no match exists', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'addExercise', name: 'Zercher Squat' }, ctx);
  expect(res.ok).toBe(true);
  const db = await getDb();
  const row = await db.getFirstAsync<{ user_id: string }>(
    "SELECT user_id FROM exercises WHERE name = 'Zercher Squat'",
  );
  expect(row!.user_id).toBe(USER);
});

test('setValues with no active set is a no-op failure', async () => {
  const ctx = await setup();
  const res = await dispatchCommand(
    { kind: 'setValues', weight: 185 },
    { ...ctx, activeSetId: null },
  );
  expect(res.ok).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/voice/__tests__/dispatch.test.ts`
Expected: FAIL — cannot find module `@/voice/dispatch`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/voice/dispatch.ts
import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { addExerciseToWorkout, createCustomExercise, searchExercises } from '@/queries/exercises';
import { addSet, deleteSet, listSetsForWorkoutExercise, updateSet } from '@/queries/sets';
import type { Command } from './commands';

export interface DispatchContext {
  userId: string;
  workoutId: string;
  activeWeId: string | null;
  activeSetId: string | null;
  units: 'kg' | 'lb';
}

export interface DispatchResult {
  ok: boolean;
  message: string;
  undo?: () => Promise<void>;
}

/** Apply a data command via existing local-first mutations. Returns feedback + an undo. */
export async function dispatchCommand(
  command: Command,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  switch (command.kind) {
    case 'setValues': {
      if (!ctx.activeSetId) return { ok: false, message: 'No active set' };
      const db = await getDb();
      const prior = await db.getFirstAsync<{ weight: number | null; reps: number | null }>(
        'SELECT weight, reps FROM sets WHERE id = ?',
        [ctx.activeSetId],
      );
      const patch: { weight?: number; reps?: number } = {};
      if (command.weight != null) patch.weight = command.weight;
      if (command.reps != null) patch.reps = command.reps;
      await updateSet(ctx.activeSetId, patch);
      const setId = ctx.activeSetId;
      return {
        ok: true,
        message: `${command.weight ?? prior?.weight ?? '—'} × ${command.reps ?? prior?.reps ?? '—'}`,
        undo: async () => {
          await updateSet(setId, { weight: prior?.weight ?? null, reps: prior?.reps ?? null });
        },
      };
    }
    case 'completeSet': {
      if (!ctx.activeSetId) return { ok: false, message: 'No active set' };
      const setId = ctx.activeSetId;
      await updateSet(setId, { completed: true });
      return {
        ok: true,
        message: 'Set complete',
        undo: async () => {
          await updateSet(setId, { completed: false });
        },
      };
    }
    case 'addSet': {
      if (!ctx.activeWeId) return { ok: false, message: 'No active exercise' };
      const newId = await addSet(ctx.activeWeId);
      return {
        ok: true,
        message: 'Set added',
        undo: async () => {
          await deleteSet(newId);
        },
      };
    }
    case 'addExercise': {
      const matches = await searchExercises(ctx.userId, command.name);
      const match =
        matches.find((e) => e.name.toLowerCase() === command.name.toLowerCase()) ?? matches[0];
      const exerciseId = match
        ? match.id
        : await createCustomExercise({ userId: ctx.userId, name: command.name });
      const weId = await addExerciseToWorkout({ workoutId: ctx.workoutId, exerciseId });
      return {
        ok: true,
        message: `Added ${match ? match.name : command.name}`,
        undo: async () => {
          await enqueueMutation({ table: 'workout_exercises', op: 'delete', rowId: weId });
        },
      };
    }
    default:
      return { ok: false, message: 'Not a data command' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/voice/__tests__/dispatch.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite + lint + typecheck**

Run: `npx jest && npx tsc --noEmit && npx eslint src/voice`
Expected: all green; no new lint errors in `src/voice`.

- [ ] **Step 6: Commit**

```bash
git add src/voice/dispatch.ts src/voice/__tests__/dispatch.test.ts
git commit -m "feat(voice): dispatch data commands to local-first mutations with undo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Speech engine adapter (`speechEngine.ts`) — device QA

**Files:**

- Create: `src/voice/speechEngine.ts`
- Modify: `package.json` (add `expo-speech-recognition`)
- Modify: `app.config.ts` (plugin + iOS permission strings)

No unit test — native module cannot run under ts-jest/Node. Verified on-device in Task 9.

- [ ] **Step 1: Install the engine**

Run: `npx expo install expo-speech-recognition`
Expected: dependency added to `package.json`.

- [ ] **Step 2: Define the engine interface + adapter**

```ts
// src/voice/speechEngine.ts
import { ExpoSpeechRecognitionModule, addSpeechRecognitionListener } from 'expo-speech-recognition';

export interface SpeechEvent {
  transcript: string;
  isFinal: boolean;
  confidence?: number; // 0..1 when the engine provides it
}

export interface SpeechEngine {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  start(onEvent: (e: SpeechEvent) => void, onError: (msg: string) => void): Promise<void>;
  stop(): Promise<void>;
}

/** On-device adapter over expo-speech-recognition. */
export const onDeviceEngine: SpeechEngine = {
  async isAvailable() {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  },
  async requestPermissions() {
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return res.granted;
  },
  async start(onEvent, onError) {
    const resultSub = addSpeechRecognitionListener('result', (e) => {
      const best = e.results?.[0];
      if (best)
        onEvent({ transcript: best.transcript, isFinal: e.isFinal, confidence: best.confidence });
    });
    const errSub = addSpeechRecognitionListener('error', (e) =>
      onError(e.message ?? 'speech error'),
    );
    (this as { _subs?: { remove: () => void }[] })._subs = [resultSub, errSub];
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
    });
  },
  async stop() {
    ExpoSpeechRecognitionModule.stop();
    (this as { _subs?: { remove: () => void }[] })._subs?.forEach((s) => s.remove());
  },
};
```

- [ ] **Step 3: Add plugin + permissions to `app.config.ts`**

In the `plugins` array add:

```ts
[
  'expo-speech-recognition',
  {
    microphonePermission: 'Vyayamy uses the microphone to log sets by voice during a workout.',
    speechRecognitionPermission: 'Vyayamy uses speech recognition to understand your workout commands.',
  },
],
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.config.ts src/voice/speechEngine.ts
git commit -m "feat(voice): on-device speech engine adapter + permissions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Voice session hook (`useVoiceSession.ts`) — device QA

**Files:**

- Create: `src/voice/useVoiceSession.ts`

No unit test (hook needs an RN renderer not present in this harness). The pure parts it calls (`GrammarParser`, `dispatchCommand`) are already covered. Verified on-device in Task 9.

- [ ] **Step 1: Implement the hook**

```ts
// src/voice/useVoiceSession.ts
import { useCallback, useRef, useState } from 'react';

import type { Command, VoiceContext } from './commands';
import { dispatchCommand, type DispatchContext } from './dispatch';
import { GrammarParser } from './grammar';
import { onDeviceEngine, type SpeechEngine } from './speechEngine';

export type VoiceUiState =
  | { phase: 'idle' }
  | { phase: 'listening'; partial: string }
  | { phase: 'pending'; command: Command; label: string }
  | { phase: 'applied'; label: string };

interface SessionDeps {
  engine?: SpeechEngine;
  getDispatchContext: () => DispatchContext;
  parserContext: () => VoiceContext;
  onStartRest: (seconds?: number) => void;
  onNextExercise: () => void;
  onPrevExercise: () => void;
  onFinishWorkout: () => void; // shows the existing finish confirmation
  silenceTimeoutMs?: number;
}

export function useVoiceSession(deps: SessionDeps) {
  const engine = deps.engine ?? onDeviceEngine;
  const [ui, setUi] = useState<VoiceUiState>({ phase: 'idle' });
  const lastUndo = useRef<null | (() => Promise<void>)>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSilence = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      void stop();
    }, deps.silenceTimeoutMs ?? 15000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDataCommand = useCallback(
    async (command: Command) => {
      const res = await dispatchCommand(command, deps.getDispatchContext());
      if (res.ok) {
        lastUndo.current = res.undo ?? null;
        setUi({ phase: 'applied', label: res.message });
      }
    },
    [deps],
  );

  const handleCommand = useCallback(
    async (command: Command, confidence: 'high' | 'low') => {
      switch (command.kind) {
        case 'stop':
          return stop();
        case 'undo': {
          if (lastUndo.current) {
            await lastUndo.current();
            lastUndo.current = null;
          }
          setUi({ phase: 'listening', partial: '' });
          return;
        }
        case 'finishWorkout':
          return deps.onFinishWorkout();
        case 'startRest':
          return deps.onStartRest(command.seconds);
        case 'nextExercise':
          return deps.onNextExercise();
        case 'prevExercise':
          return deps.onPrevExercise();
        default: {
          if (confidence === 'low') {
            setUi({ phase: 'pending', command, label: describe(command) });
            return;
          }
          await runDataCommand(command);
        }
      }
    },
    [deps, runDataCommand],
  );

  const onFinal = useCallback(
    (transcript: string) => {
      resetSilence();
      const parsed = GrammarParser.parse(transcript, deps.parserContext());
      if (!parsed) return; // chatter guard
      void handleCommand(parsed.command, parsed.confidence);
    },
    [deps, handleCommand, resetSilence],
  );

  const start = useCallback(async () => {
    if (!(await engine.requestPermissions())) return;
    setUi({ phase: 'listening', partial: '' });
    resetSilence();
    await engine.start(
      (e) => {
        if (e.isFinal) onFinal(e.transcript);
        else setUi({ phase: 'listening', partial: e.transcript });
      },
      () => {
        void stop();
      },
    );
  }, [engine, onFinal, resetSilence]);

  const stop = useCallback(async () => {
    if (timeout.current) clearTimeout(timeout.current);
    await engine.stop();
    setUi({ phase: 'idle' });
  }, [engine]);

  const confirmPending = useCallback(async () => {
    if (ui.phase === 'pending') await runDataCommand(ui.command);
  }, [ui, runDataCommand]);

  return { ui, start, stop, confirmPending };
}

function describe(c: Command): string {
  if (c.kind === 'setValues') return `${c.weight ?? '—'} × ${c.reps ?? '—'}`;
  return c.kind;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/voice/useVoiceSession.ts
git commit -m "feat(voice): listening session hook (confidence routing, undo, timeout)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Inline-morph UI — device QA

**Files:**

- Create: `src/components/VoiceMicButton.tsx`
- Modify: `src/components/ActiveSetCard.tsx`
- Modify: `src/screens/WorkoutActive.tsx`

No unit test (RN components need a renderer absent here). Verified on-device in Task 9.

- [ ] **Step 1: Build `VoiceMicButton.tsx`**

A pressable mic that calls `start()` on tap and `stop()` when listening; supports press-and-hold (hold-to-talk fallback) via `onPressIn`/`onPressOut`; shows `idle | listening | disabled` styles using the theme tokens (`accent` `#6DA37E`, `surface`, `inkSecondary`). Disabled when the engine reports unavailable / permission denied.

```tsx
// src/components/VoiceMicButton.tsx
import { Pressable, Text, StyleSheet } from 'react-native';
import { theme } from '@/ui/theme';

interface Props {
  phase: 'idle' | 'listening' | 'disabled';
  onTap: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

export function VoiceMicButton({ phase, onTap, onHoldStart, onHoldEnd }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={phase === 'listening' ? 'Stop voice' : 'Start voice'}
      disabled={phase === 'disabled'}
      onPress={onTap}
      onLongPress={onHoldStart}
      onPressOut={onHoldEnd}
      style={[
        styles.btn,
        phase === 'listening' && styles.live,
        phase === 'disabled' && styles.disabled,
      ]}
    >
      <Text style={[styles.label, phase === 'listening' && styles.liveLabel]}>
        {phase === 'listening' ? '◉ Listening · tap to stop' : '🎙 Voice'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  live: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  disabled: { opacity: 0.4 },
  label: { color: theme.color.inkSecondary, fontWeight: '600' },
  liveLabel: { color: theme.color.onAccent },
});
```

- [ ] **Step 2: Morph `ActiveSetCard.tsx`**

When the session UI state for this card is `listening`/`pending`/`applied`: switch the card border to `accent`, show the live partial transcript (`inkSecondary`, italic), render the staged weight/reps as live-filling mono digits, and show a feedback line (`✓ <label>` for `applied`, `Heard <label> — say "yes"` for `pending`). Read the current `useTheme()` palette already used by the card. Keep the existing tap-to-edit behavior untouched when `idle`.

- [ ] **Step 3: Wire into `WorkoutActive.tsx`**

Instantiate `useVoiceSession`, deriving `DispatchContext` from the existing active-set cursor (`findInitialCursor`/`advanceCursor` from `src/components/activeSet.ts`) and the loaded workout (`workoutId`, `userId`), and `VoiceContext` from the user's `profile.units`. Pass `onStartRest` → existing `useRestTimer().start`, `onNextExercise`/`onPrevExercise` → cursor moves, `onFinishWorkout` → the existing finish-workout confirmation. Place `VoiceMicButton` in the active-set area. After each applied command, the existing React Query invalidation (`queryKeys.sets.byWorkoutExercise`, `queryKeys.workouts.withExercises`) already refreshes the card.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/VoiceMicButton.tsx src/components/ActiveSetCard.tsx src/screens/WorkoutActive.tsx`
Expected: PASS; no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/VoiceMicButton.tsx src/components/ActiveSetCard.tsx src/screens/WorkoutActive.tsx
git commit -m "feat(voice): inline-morph voice UI on the active set card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Dev build + on-device QA

**Files:** none (build + manual verification).

- [ ] **Step 1: Prebuild & run a dev client**

Run: `npx expo prebuild && npx expo run:ios`
Expected: app launches on a device/simulator with the new permission strings.

- [ ] **Step 2: Manual QA checklist (record results in the PR description)**

- [ ] Grant mic + speech permission on first tap; deny path shows disabled mic, no crash.
- [ ] Tap mic → say "one eighty five for five" → card fills 185 × 5, "✓" shows.
- [ ] Say "done" → set completes and advances.
- [ ] Say "add a set" → new set staged.
- [ ] Say "add incline dumbbell press" → exercise added (reuses catalog if present).
- [ ] Say "two minute rest" → rest timer starts at 120s.
- [ ] Say bare "two twenty five" → pending confirm appears; "yes" applies.
- [ ] Say "scratch that" → last command undone.
- [ ] Background chatter that doesn't parse → nothing happens.
- [ ] Airplane mode → all of the above still work (fully offline).
- [ ] Say "finish workout" → existing finish confirmation appears.

- [ ] **Step 3: Commit any fixes found during QA**, then open the PR.

---

## Self-Review

**Spec coverage:**

- Scope (set logging + flow control) → Tasks 3–5, 7, 8. ✅
- Hybrid, grammar-first → `VoiceParser` interface (Task 2), `GrammarParser` (Tasks 3–4); LLM is an explicit Phase-2 swap behind the same interface. ✅
- Tap-session trigger + hold-to-talk fallback → `VoiceMicButton` tap + long-press (Task 8), session lifecycle (Task 7). ✅
- Confidence-based confirm + chatter guard → grammar confidence (Task 4), `handleCommand` low-confidence pending + `null`-parse ignore (Task 7). ✅
- Inline-morph look → Task 8. ✅
- Voice calls existing mutations → Task 5 uses `addSet`/`updateSet`/`addExerciseToWorkout`/`createCustomExercise`/`enqueueMutation`. ✅
- Units default + override → grammar `detectUnit` (Task 4), `units` in both contexts. ✅
- Error/edge cases (permissions, offline, no active set, ambiguous add) → Task 5 (`activeSetId` guard, fuzzy/create), Task 7 (permission gate, silence timeout), Task 9 QA. ✅
- Testing strategy → pure core unit-tested (Tasks 1,3,4,5); native/hook/UI device-QA (Tasks 6–9), matching the spec's explicit boundary. ✅

**Placeholder scan:** No TBD/TODO; every code step has concrete code. Task 8 Steps 2–3 describe UI integration prose rather than full files because they modify large existing screens whose current contents the implementer must read first — the interfaces they consume (`useVoiceSession`, cursor helpers, `useRestTimer`) are fully defined in earlier tasks.

**Type consistency:** `DispatchContext`/`DispatchResult` defined in Task 5 and consumed unchanged in Task 7; `Command`/`VoiceContext`/`ParseResult` defined in Task 2 and used by Tasks 3,4,7; `SpeechEngine`/`SpeechEvent` defined in Task 6 and consumed in Task 7. `dispatchCommand`, `GrammarParser.parse`, `wordsToNumber` names are consistent across tasks.
