/**
 * What a recognition session still owes when the recognizer reports 'end'.
 *
 * Server-based recognition (the iOS 27 fallback) finalizes only after audio
 * ends — after the user has released the mic. The engine therefore keeps its
 * listeners alive through 'end', and this tracker promotes the last partial
 * to a final if no final followed it, so a spoken set is never shown on the
 * card and then silently dropped (build 11 on device). Pure; tested.
 */
import type { SpeechEvent } from './speechEngine';

export class LateFinalTracker {
  private pending: string | null = null;

  onResult(e: SpeechEvent): void {
    this.pending = e.isFinal ? null : e.transcript;
  }

  /** The synthesized final owed at 'end', or null. Settles the debt. */
  onEnd(): SpeechEvent | null {
    const transcript = this.pending;
    this.pending = null;
    if (!transcript) return null;
    return { transcript, isFinal: true, confidence: undefined };
  }
}
