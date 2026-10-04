/**
 * Remember the best complete set heard in the partial stream.
 *
 * Evidence (simulator Voice log, 2026-10-04): for spoken "225 for 5" the
 * recognizer's partials read "225", "225 for", "225 for five" — a perfect
 * set — and only then did Apple's number formatter fuse the utterance into
 * "220 545", which every alternative in the N-best list also carried. The
 * linguistic form exists mid-stream and is gone by the final. This tracker
 * keeps the latest partial that parsed as a complete, high-confidence set so
 * the session can fall back to it when the final and its alternatives fail.
 *
 * Only a complete set qualifies. A bare "225" or a half set is not evidence
 * of what the user meant, and a control word ("yes", "undo") in a partial is
 * left to the final, which is where control words are reliable.
 */
import { isFullSet } from './alternatives';
import type { ParseResult, VoiceContext } from './commands';
import { GrammarParser } from './grammar';

export interface BestPartial {
  transcript: string;
  parsed: ParseResult;
}

export class BestPartialTracker {
  private current: BestPartial | null = null;

  onPartial(transcript: string, ctx: VoiceContext): void {
    const parsed = GrammarParser.parse(transcript, ctx);
    if (parsed && isFullSet(parsed)) this.current = { transcript, parsed };
  }

  best(): BestPartial | null {
    return this.current;
  }

  reset(): void {
    this.current = null;
  }
}

/**
 * True when `weight` is a proper digit prefix of some number in the final's
 * hypotheses: the partial that produced it was cut off mid-number. Evidence
 * (simulator log, 2026-10-04): "seven reps at two fifty" streamed
 * "Seven reps at two" — a complete-looking 2 × 7 — before "Seven reps at
 * 2:50". Only the weight is checked: a reps prefix would also match the
 * fused "545" of "225 for five" and throw away the case this tracker exists
 * for.
 */
export function isTruncatedBy(weight: number, finalCandidates: string[]): boolean {
  const digits = String(weight);
  for (const candidate of finalCandidates) {
    for (const token of candidate.replace(/:/g, '').split(/\s+/)) {
      const number = token.replace(/\D/g, '');
      if (number.length > digits.length && number.startsWith(digits)) return true;
    }
  }
  return false;
}
