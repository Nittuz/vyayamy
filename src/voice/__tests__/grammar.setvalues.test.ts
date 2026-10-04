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

  test('a trailing "done" does not swallow the values (#100)', () => {
    // "225 for 5 done" must still log 225 × 5, not be eaten by the complete keyword.
    expect(parse('225 for 5 done')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(parse('one eighty five for five got it')!.command).toEqual({
      kind: 'setValues',
      weight: 185,
      reps: 5,
    });
  });

  test('"two oh five" parses as 205, not 2 (#102)', () => {
    expect(parse('two oh five for three')!.command).toEqual({
      kind: 'setValues',
      weight: 205,
      reps: 3,
    });
    expect(parse('one oh five for five')!.command).toEqual({
      kind: 'setValues',
      weight: 105,
      reps: 5,
    });
  });

  test('reps-first phrasing "five reps at one thirty five" (#102)', () => {
    expect(parse('five reps at one thirty five')!.command).toEqual({
      kind: 'setValues',
      reps: 5,
      weight: 135,
    });
  });

  test('decimal weights survive normalization (#84)', () => {
    expect(parse('102.5 for 5')!.command).toEqual({ kind: 'setValues', weight: 102.5, reps: 5 });
  });

  test('a bare "done" still completes the set', () => {
    expect(parse('done')!.command).toEqual({ kind: 'completeSet' });
    expect(parse('next set')!.command).toEqual({ kind: 'completeSet' });
  });
});

describe('GrammarParser — server-recognition phrasings (build 12 on device)', () => {
  test('"for" transcribed as the digit 4 between two numbers is the connector', () => {
    expect(parse('225 4 5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(parse('225 4 5')!.confidence).toBe('high');
    expect(parse('bench 135 4 8')!.command).toEqual({ kind: 'setValues', weight: 135, reps: 8 });
  });

  test('a plain "4 5" is not rewritten: no number before the 4', () => {
    expect(parse('4 5')).not.toEqual(
      expect.objectContaining({ command: { kind: 'setValues', reps: 5 } }),
    );
  });

  test('the multiplication sign is a connector', () => {
    expect(parse('225 × 5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(parse('225×5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(parse('225 x 5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
  });

  test('"<weight> <unit> <reps> reps" carries both values, not reps alone', () => {
    expect(parse('225 pounds 5 reps')!.command).toEqual({
      kind: 'setValues',
      weight: 225,
      reps: 5,
      unit: 'lb',
    });
    expect(parse('100 kilos 8 reps')!.command).toEqual({
      kind: 'setValues',
      weight: 100,
      reps: 8,
      unit: 'kg',
    });
    expect(parse('5 reps')!.command).toEqual({ kind: 'setValues', reps: 5 });
  });
});

describe('GrammarParser — recognizer splits a spoken weight into digit groups (sim log 2026-10-04)', () => {
  // "two forty by eight" came back as the dimension "2 40 x 8" (alt "2 48").
  test('a leading digit then a two-digit group is the hundreds-elided weight', () => {
    expect(parse('2 40 x 8')!.command).toEqual({ kind: 'setValues', weight: 240, reps: 8 });
    expect(parse('2 25 for 5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(parse('8 reps at 2 40')!.command).toEqual({ kind: 'setValues', weight: 240, reps: 8 });
  });

  // "two twenty five for five" came back as "220 5 for five" in the N-best list.
  test('a round number then a single digit is the split tail of the weight', () => {
    expect(parse('220 5 for five')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(parse('2 20 5 for 5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
  });

  test('the repair stays on the weight side: a dropped connector is not glued into a weight', () => {
    // "230 for six" with the connector lost must not become a 236 weight.
    expect(parse('230 6')?.command).not.toEqual(expect.objectContaining({ weight: 236 }));
  });

  test('fused forms still do not parse as a set', () => {
    expect(parse('220 545')?.command).not.toEqual(expect.objectContaining({ reps: 5 }));
    expect(parse('22 545')?.command).not.toEqual(expect.objectContaining({ reps: 5 }));
  });
});

describe('GrammarParser — recognizer writes a spoken weight as a clock time (sim log 2026-10-04)', () => {
  // "seven reps at two fifty" came back as "Seven reps at 2:50" (alt "Seven reps of 250").
  test('H:MM between digits is the hundreds-elided weight', () => {
    expect(parse('7 reps at 2:50')!.command).toEqual({ kind: 'setValues', weight: 250, reps: 7 });
    expect(parse('2:25 for 5')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
  });

  test('"reps of" is a reps-first connector', () => {
    expect(parse('seven reps of 250')!.command).toEqual({
      kind: 'setValues',
      weight: 250,
      reps: 7,
    });
  });
});

describe('GrammarParser — connector dropped between weight and reps (sim log 2026-10-04)', () => {
  // "two twenty five for five" finalised as "225 five" (conf 0.12); the
  // user is asked either way, so the question should carry both numbers.
  test('"<weight> <small number>" is a full set at low confidence', () => {
    const r = parse('225 five')!;
    expect(r.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
    expect(r.confidence).toBe('low');
    expect(parse('230 6')!.command).toEqual({ kind: 'setValues', weight: 230, reps: 6 });
  });

  test('a second number too large for reps is not a set', () => {
    expect(parse('220 545')?.command).not.toEqual(expect.objectContaining({ reps: 545 }));
  });

  test('the unit still travels with the weight', () => {
    expect(parse('100 kilos 5')!.command).toEqual({
      kind: 'setValues',
      weight: 100,
      reps: 5,
      unit: 'kg',
    });
  });
});
