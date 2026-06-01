import { GrammarParser } from '@/voice/grammar';
import type { VoiceContext } from '@/voice/commands';

const ctx: VoiceContext = { units: 'lb', hasActiveExercise: true };
const parse = (t: string) => GrammarParser.parse(t, ctx);

describe('GrammarParser — set values', () => {
  test('weight + reps via "for"/"by"/"times"', () => {
    expect(parse('185 for 5')!.command).toEqual({ kind: 'setValues', weight: 185, reps: 5 });
    expect(parse('one eighty five for five')!.command).toEqual({ kind: 'setValues', weight: 185, reps: 5 });
    expect(parse('225 by 3')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 3 });
    expect(parse('log 135 times 8 reps')!.command).toEqual({ kind: 'setValues', weight: 135, reps: 8 });
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
    expect(parse('100 kilos for 5')!.command).toEqual({ kind: 'setValues', weight: 100, reps: 5, unit: 'kg' });
    expect(parse('two twenty five pounds for 3')!.command).toEqual({ kind: 'setValues', weight: 225, reps: 3, unit: 'lb' });
  });

  test('correction "make it 195"', () => {
    expect(parse('make it 195')!.command).toEqual({ kind: 'setValues', weight: 195 });
  });
});
