import type { Command, ParseResult, VoiceContext, VoiceParser } from './commands';
import { wordsToNumber } from './numberWords';

function normalize(t: string): string {
  return (
    t
      .toLowerCase()
      .replace(/[,!?]/g, ' ')
      // Apple's server recognition writes the multiplication sign for "x".
      .replace(/×/g, ' x ')
      // A hundreds-elided weight ("two fifty") is written as a clock time
      // ("2:50", simulator log 2026-10-04); split it back into digit groups
      // for joinSplitDigits.
      .replace(/(\d):(\d\d)\b/g, '$1 $2')
      // Keep a decimal point between digits ("102.5") but drop sentence dots (#84).
      .replace(/(\d)\.(\d)/g, '$1__DEC__$2')
      .replace(/\./g, ' ')
      .replace(/__DEC__/g, '.')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Parse a duration phrase like "two minute" / "ninety seconds". */
function parseDuration(s: string): number | undefined {
  const m = s.match(/\b(minutes?|mins?|seconds?|secs?)\b/);
  if (!m) return undefined;
  const n = firstNumberIn(s.slice(0, m.index));
  if (n == null) return undefined;
  return /^min/.test(m[1]!) ? n * 60 : n;
}

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
  'oh',
  'o',
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

/**
 * Re-join a spoken weight that the recognizer wrote as separate digit groups.
 *
 * Evidence (simulator Voice log, 2026-10-04): "two forty by eight" came back
 * as the dimension "2 40 x 8"; "two twenty five for five" carried "220 5 for
 * five" in its N-best list. Both are one spoken number, split at the point
 * where the speaker elided "hundred". Two shapes are repaired, left to right:
 *
 *   - a single digit followed by a two-digit group:  2 40  → 240
 *   - a round number followed by a single digit:     220 5 → 225
 *
 * Anything else (e.g. "22 545", a digit group of three) is left alone and
 * fails to parse rather than guess. Callers apply this on the WEIGHT side of a
 * connector only: "230 6" with the connector dropped must not become 236.
 */
export function joinSplitDigits(tokens: string[]): number | null {
  if (tokens.length < 2 || !tokens.every((t) => /^\d+$/.test(t))) return null;
  let acc = parseInt(tokens[0]!, 10);
  for (let i = 1; i < tokens.length; i++) {
    const next = parseInt(tokens[i]!, 10);
    if (acc >= 1 && acc <= 9 && next >= 10 && next <= 99) acc = acc * 100 + next;
    else if (acc >= 20 && acc % 10 === 0 && next >= 1 && next <= 9) acc += next;
    else return null;
  }
  return acc;
}

/**
 * Pull the first contiguous run of number tokens (digits or number-words) and
 * parse it. With `repairSplit`, a run of digit groups that is not one number
 * is re-joined per joinSplitDigits (weight side of a set only).
 */
function firstNumberIn(phrase: string, repairSplit = false): number | null {
  const tokens = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  const run: string[] = [];
  for (const tok of tokens) {
    const isNum = /^\d+(\.\d+)?$/.test(tok) || NUM_WORDS.has(tok);
    if (isNum) {
      run.push(tok);
    } else if (FILLER.has(tok)) {
      if (run.length > 0) break;
    } else if (run.length > 0) {
      break;
    }
  }
  if (!run.length) return null;
  const n = wordsToNumber(run.join(' '));
  if (n != null || !repairSplit) return n;
  return joinSplitDigits(run);
}

/**
 * Every contiguous run of number tokens, in order ("225 pounds 5" → [225, 5]).
 * A spoken number is written either as one digit group or as a chain of
 * words, so "225 five" and "230 6" are two numbers each, not one run.
 */
function numberRunsIn(phrase: string): number[] {
  const tokens = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  const runs: number[] = [];
  let run: string[] = [];
  let runIsDigits = false;
  const flush = () => {
    if (run.length) {
      const n = wordsToNumber(run.join(' '));
      if (n != null) runs.push(n);
      run = [];
    }
  };
  for (const tok of tokens) {
    const isDigits = /^\d+(\.\d+)?$/.test(tok);
    if (isDigits || NUM_WORDS.has(tok)) {
      // Digit groups never chain either: "230 6" is two numbers.
      if (run.length && (isDigits || isDigits !== runIsDigits)) flush();
      runIsDigits = isDigits;
      run.push(tok);
    } else flush();
  }
  flush();
  return runs;
}

/** Largest second number read as reps when the connector is missing. */
const MAX_DROPPED_CONNECTOR_REPS = 50;

function detectUnit(t: string): 'kg' | 'lb' | undefined {
  if (/\b(kilo|kilos|kg|kgs|kilogram|kilograms)\b/.test(t)) return 'kg';
  if (/\b(pound|pounds|lb|lbs)\b/.test(t)) return 'lb';
  return undefined;
}

function high(command: Command, transcript: string): ParseResult {
  return { command, confidence: 'high', transcript };
}

export const GrammarParser: VoiceParser = {
  parse(transcript: string, _ctx: VoiceContext): ParseResult | null {
    // Server recognition writes "for" between two numbers as the digit 4
    // ("225 4 5", build 12 on device): a lone 4 that has a number before it
    // and a number after it is the connector, not a value.
    const t = normalize(transcript).replace(/(\d)\s+4\s+(?=\d)/g, '$1 for ');
    if (t === '') return null;

    // Stop the REST TIMER (must beat both the global "stop" and "startRest"):
    // "skip rest" / "stop the rest timer" / "cancel rest" / "rest done" (#105).
    if (/\b(rest|timer)\b/.test(t) && /\b(skip|stop|cancel|end|over|done)\b/.test(t)) {
      return high({ kind: 'stopRest' }, transcript);
    }

    if (/\b(stop|stop listening|cancel)\b/.test(t)) return high({ kind: 'stop' }, transcript);
    if (/\b(undo|scratch that|never mind|delete that)\b/.test(t))
      return high({ kind: 'undo' }, transcript);
    if (/^(yes|yeah|yep|yup|correct|confirm|that's right)$/.test(t))
      return high({ kind: 'confirm' }, transcript);
    if (/\b(finish|end)\b.*\bworkout\b|\bend session\b/.test(t))
      return high({ kind: 'finishWorkout' }, transcript);

    if (/\b(rest|timer)\b/.test(t) && /\b(start|rest|timer|take)\b/.test(t)) {
      const seconds = parseDuration(t);
      return high({ kind: 'startRest', ...(seconds != null ? { seconds } : {}) }, transcript);
    }

    if (/\bnext exercise\b/.test(t)) return high({ kind: 'nextExercise' }, transcript);
    if (/\b(previous|prior|last) exercise\b/.test(t))
      return high({ kind: 'prevExercise' }, transcript);

    // add a set / another set / one more  — MUST come before "add <exercise>"
    if (/\b(add (a )?set|another set|one more( set)?)\b/.test(t))
      return high({ kind: 'addSet' }, transcript);

    // add <exercise> — LOW confidence so the session confirms before creating +
    // syncing a custom exercise from a possibly-misheard utterance (#103).
    const add = t.match(/^add (.+)$/);
    if (add) {
      return {
        command: { kind: 'addExercise', name: add[1]!.trim() },
        confidence: 'low',
        transcript,
      };
    }

    // VALUE-BEARING patterns are tried BEFORE the bare control-keyword scan, so a
    // trailing "...done" / "...got it" can't swallow the weight × reps (#100).

    // weight <connector> reps
    const conn = t.match(/^(.*?)\b(?:for|by|times|x)\b(.*)$/);
    if (conn) {
      const weight = firstNumberIn(conn[1]!, true);
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

    // reps-first: "five reps at one thirty five" → reps then weight (#102)
    // "of" is what the recognizer wrote for "at" in its N-best list ("seven
    // reps of 250", simulator log 2026-10-04).
    const repsFirst = t.match(/^(.*?)\breps?\b\s+(?:at|with|on|of)\s+(.*)$/);
    if (repsFirst) {
      const reps = firstNumberIn(repsFirst[1]!);
      const weight = firstNumberIn(repsFirst[2]!, true);
      if (reps != null && weight != null) {
        const unit = detectUnit(t);
        return {
          command: { kind: 'setValues', weight, reps, ...(unit ? { unit } : {}) },
          confidence: 'high',
          transcript,
        };
      }
    }

    // "<n> reps" — and "<weight> <unit> <n> reps", where the weight is the
    // first number and the reps the last (server recognition often drops the
    // connector: "225 pounds 5 reps").
    const repsOnly = t.match(/^(.*?)\breps?\b\s*$/);
    if (repsOnly) {
      const runs = numberRunsIn(repsOnly[1]!);
      if (runs.length >= 2) {
        const unit = detectUnit(t);
        return {
          command: {
            kind: 'setValues',
            weight: runs[0]!,
            reps: runs[runs.length - 1]!,
            ...(unit ? { unit } : {}),
          },
          confidence: 'high',
          transcript,
        };
      }
      if (runs.length === 1)
        return { command: { kind: 'setValues', reps: runs[0]! }, confidence: 'high', transcript };
    }

    // Bare control keyword (no values found above).
    if (/\b(done|complete|completed|got it|logged|next set|mark (it )?done)\b/.test(t)) {
      return high({ kind: 'completeSet' }, transcript);
    }

    // "<weight> <reps>" with the connector dropped ("225 five", simulator log
    // 2026-10-04, confidence 0.12). Two number runs, the second small enough
    // to be a rep count: a full set, but LOW confidence so the user is asked
    // with both numbers in the question rather than only the weight.
    const pair = numberRunsIn(t);
    if (
      pair.length === 2 &&
      Number.isInteger(pair[1]) &&
      pair[1]! >= 1 &&
      pair[1]! <= MAX_DROPPED_CONNECTOR_REPS &&
      pair[0]! > pair[1]!
    ) {
      const unit = detectUnit(t);
      return {
        command: { kind: 'setValues', weight: pair[0]!, reps: pair[1]!, ...(unit ? { unit } : {}) },
        confidence: 'low',
        transcript,
      };
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

    return null;
  },
};
