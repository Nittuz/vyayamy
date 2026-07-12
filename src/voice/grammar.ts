import type { Command, ParseResult, VoiceContext, VoiceParser } from './commands';
import { wordsToNumber } from './numberWords';

function normalize(t: string): string {
  return (
    t
      .toLowerCase()
      .replace(/[,!?]/g, ' ')
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

/** Pull the first contiguous run of number tokens (digits or number-words) and parse it. */
function firstNumberIn(phrase: string): number | null {
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
  return run.length ? wordsToNumber(run.join(' ')) : null;
}

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
    const t = normalize(transcript);
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

    // reps-first: "five reps at one thirty five" → reps then weight (#102)
    const repsFirst = t.match(/^(.*?)\breps?\b\s+(?:at|with|on)\s+(.*)$/);
    if (repsFirst) {
      const reps = firstNumberIn(repsFirst[1]!);
      const weight = firstNumberIn(repsFirst[2]!);
      if (reps != null && weight != null) {
        const unit = detectUnit(t);
        return {
          command: { kind: 'setValues', weight, reps, ...(unit ? { unit } : {}) },
          confidence: 'high',
          transcript,
        };
      }
    }

    // reps only: "<n> reps"
    const repsOnly = t.match(/^(.*?)\breps?\b\s*$/);
    if (repsOnly) {
      const reps = firstNumberIn(repsOnly[1]!);
      if (reps != null)
        return { command: { kind: 'setValues', reps }, confidence: 'high', transcript };
    }

    // Bare control keyword (no values found above).
    if (/\b(done|complete|completed|got it|logged|next set|mark (it )?done)\b/.test(t)) {
      return high({ kind: 'completeSet' }, transcript);
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
