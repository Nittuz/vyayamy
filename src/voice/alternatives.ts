/**
 * Pick the best-parsing transcript out of the recognizer's N-best list.
 *
 * Evidence (simulator Voice log, 2026-10-04): Apple's top hypothesis fuses
 * spoken numbers — "225 for 5" came back as "220 545" — while the word form
 * survives further down the list. So every alternative is parsed and the
 * strongest result wins: a complete set (weight AND reps, high confidence)
 * beats anything else; otherwise the first alternative that parses at all.
 */
import type { ParseResult, VoiceContext } from './commands';
import { GrammarParser } from './grammar';

export interface BestParse {
  parsed: ParseResult;
  transcript: string;
  index: number;
}

export function isFullSet(p: ParseResult): boolean {
  return (
    p.confidence === 'high' &&
    p.command.kind === 'setValues' &&
    p.command.weight != null &&
    p.command.reps != null
  );
}

export function pickBestParse(transcripts: string[], ctx: VoiceContext): BestParse | null {
  let first: BestParse | null = null;
  for (let index = 0; index < transcripts.length; index++) {
    const transcript = transcripts[index]!;
    const parsed = GrammarParser.parse(transcript, ctx);
    if (!parsed) continue;
    // A control word on top ("stop", "undo", "yes") is what the user meant.
    if (index === 0 && parsed.command.kind !== 'setValues') return { parsed, transcript, index };
    if (isFullSet(parsed)) return { parsed, transcript, index };
    if (!first) first = { parsed, transcript, index };
  }
  return first;
}
