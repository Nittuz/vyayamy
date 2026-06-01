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

  test('confirm (yes) for pending commands', () => {
    expect(parse('yes')!.command).toEqual({ kind: 'confirm' });
    expect(parse('yep')!.command).toEqual({ kind: 'confirm' });
    expect(parse('correct')!.command).toEqual({ kind: 'confirm' });
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
