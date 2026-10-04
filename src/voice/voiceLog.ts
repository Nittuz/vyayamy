/**
 * Voice diagnostics log — a ring buffer of every stage of a voice session:
 * engine start/stop, each recognizer result (partial/final + confidence),
 * errors by code, end/grace settles, parse outcome, dispatch context and
 * result, ui transitions. The Voice log sheet on the workout screen shows
 * it and shares it as text. Pure; no React, no native imports.
 */
export interface VoiceLogEntry {
  t: number;
  kind: string;
  detail?: string;
}

export const VOICE_LOG_CAP = 200;

let entries: VoiceLogEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function logVoice(kind: string, detail?: string, t: number = Date.now()): void {
  entries.push(detail == null ? { t, kind } : { t, kind, detail });
  if (entries.length > VOICE_LOG_CAP) entries = entries.slice(entries.length - VOICE_LOG_CAP);
  notify();
}

export function getVoiceLog(): VoiceLogEntry[] {
  return entries;
}

export function clearVoiceLog(): void {
  entries = [];
  notify();
}

export function subscribeVoiceLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One line per entry: `+s.mmm kind detail`, seconds since the first entry. */
export function formatVoiceLog(log: VoiceLogEntry[]): string {
  const t0 = log[0]?.t ?? 0;
  return log
    .map((e) => `+${((e.t - t0) / 1000).toFixed(3)} ${e.kind}${e.detail ? ` ${e.detail}` : ''}`)
    .join('\n');
}
