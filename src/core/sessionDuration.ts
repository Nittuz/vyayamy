/**
 * The window a session was actually active, for display. A workout started,
 * abandoned and finished days later reported "5d 7h" for a few minutes of
 * lifting; another, resumed fifteen hours after it was opened, reported
 * "15h 10m" (HIG review 2026-10-04, finding 15; simulator data). The logged
 * sets say when the lifting happened: when the first set came more than
 * OPEN_SESSION_GAP_MS after the start, the first set is the honest start, and
 * when the finish came more than the gap after the last set, the last set is
 * the honest end.
 */
export const OPEN_SESSION_GAP_MS = 2 * 60 * 60 * 1000;

export interface SessionWindow {
  start: string;
  end: string | null;
}

export function effectiveSessionWindow(
  startedAt: string,
  endedAt: string | null,
  firstCompletedAt: string | null | undefined,
  lastCompletedAt: string | null | undefined,
  gapMs = OPEN_SESSION_GAP_MS,
): SessionWindow {
  const started = new Date(startedAt).getTime();
  const ended = endedAt ? new Date(endedAt).getTime() : NaN;
  const first = firstCompletedAt ? new Date(firstCompletedAt).getTime() : NaN;
  const last = lastCompletedAt ? new Date(lastCompletedAt).getTime() : NaN;
  if (Number.isNaN(started) || Number.isNaN(first) || Number.isNaN(last)) {
    return { start: startedAt, end: endedAt };
  }
  const inside = (t: number) => t > started && (Number.isNaN(ended) || t < ended);
  const start = inside(first) && first - started > gapMs ? firstCompletedAt! : startedAt;
  const end = endedAt != null && inside(last) && ended - last > gapMs ? lastCompletedAt! : endedAt;
  return { start, end };
}
