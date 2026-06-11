export type Unit = 'kg' | 'lb';

export type Command =
  | { kind: 'setValues'; weight?: number; reps?: number; unit?: Unit }
  | { kind: 'completeSet' }
  | { kind: 'addSet' }
  | { kind: 'addExercise'; name: string }
  | { kind: 'nextExercise' }
  | { kind: 'prevExercise' }
  | { kind: 'startRest'; seconds?: number }
  | { kind: 'stopRest' }
  | { kind: 'finishWorkout' }
  | { kind: 'undo' }
  | { kind: 'confirm' }
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
