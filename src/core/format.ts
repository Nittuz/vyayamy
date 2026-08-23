/**
 * Canonical local-day helpers (#149/#150). Storage is UTC instants; every
 * "what day is it" decision in the UI uses the device's LOCAL calendar day, so
 * an evening lift doesn't slide into the next/previous day. Keep all day
 * bucketing and "N days ago" math routed through these two functions.
 */

/** Canonical day-of-week names, Sunday-first to match Date.getDay(). */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function localDayKey(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDaysBetween(dateStr: string, now: Date = new Date()): number {
  const then = new Date(dateStr);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function formatRelativeDate(dateStr: string): string {
  const diffDays = localDaysBetween(dateStr);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Honest fallback (impeccable batch 5): a workout with no `ended_at` hasn't
 * finished, so it has no duration to report — return null rather than a
 * placeholder like "-", which callers were joining into strips as a bare
 * "· -". Callers drop the segment (or substitute their own "in progress"
 * copy where a value is required).
 *
 * Layout polish (row-squaring fix): floors sub-minute sessions to "<1m"
 * rather than a placeholder-looking "0m", and switches to day-aware
 * formatting ("Xd Yh", no minutes) once the session runs 24h+ — a forgotten
 * "end workout" tap used to render something like "301h 48m".
 */
export function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const mins = Math.round((end - start) / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h >= 24) {
    const days = Math.floor(h / 24);
    return `${days}d ${h % 24}h`;
  }
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Device-local clock time ("7:42 PM" or "19:42" — the locale decides 12/24h). */
export function formatTimeOfDay(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * "Aug 10" — a short row-anchoring date for History (row-squaring fix).
 * Deliberately drops weekday/year: rows are already grouped into month
 * sections, so both would be redundant noise on every row.
 */
export function formatRowDate(dateStr: string): string {
  // 'en-US' pinned: the app's copy is English-only, and an unpinned locale
  // makes the output (and its exact-match test) depend on the host's ICU
  // env — a CI-image change away from a false failure (review 2026-08-23).
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function getDateGroup(dateStr: string): string {
  const diffDays = localDaysBetween(dateStr);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (diffDays < 30) return 'This month';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** "Sunday morning" / "Friday night" — the Today screen's greeting line. */
export function greetingFor(now: Date): string {
  const h = now.getHours();
  const day = DAY_NAMES[now.getDay()];
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `${day} ${part}`;
}

/** "MON 9:05" — compact local start time for the collision (resume-which) sheet. */
export function formatStartLabel(iso: string): string {
  const d = new Date(iso);
  const day = DAY_NAMES[d.getDay()]!.slice(0, 3).toUpperCase();
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${h}:${m}`;
}

/** "5H AGO" / "2D AGO" — coarse age of a quarantined sync row. */
export function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

export function formatMemberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

export function getInitials(
  displayName: string | null | undefined,
  email: string | undefined,
): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]!;
      const last = parts[parts.length - 1]!;
      return (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    if (parts.length === 1) return parts[0]!.substring(0, 2).toUpperCase();
  }
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

/**
 * Honest fallback for a snake_case enum with no curated label ("best_volume"
 * → "Best volume") — used when a lookup table like Progress's PR_LABEL
 * doesn't recognize a value, instead of showing the raw enum to the user.
 */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatWeight(weight: number | null, units: 'kg' | 'lb'): string {
  if (weight == null) return '-';
  return `${weight} ${units}`;
}

/**
 * Seconds → m:ss for the rest countdown (e.g. 83 → "1:23", 9 → "0:09").
 * Clamps negatives to zero so an overrun never shows a minus.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/** Round to one decimal and trim a trailing ".0" (e.g. 300.0 → "300", 227.349 → "227.3"). */
function trimNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * Progress screen's Personal Records row strip (impeccable polish A). Each
 * record collapses to its essential number so the strip fits at default text
 * sizes instead of ellipsizing mid-number — the full "N × weight kg" pairing
 * still lives in the stat tiles once an exercise is selected. A bodyweight
 * reps record keeps its "BW" token so the meaning survives the trim. Either
 * record may be absent (a group can hold just one PR type); passing both as
 * null yields an empty string.
 */
export function formatPrRowStrip(
  heaviest: { weight: number } | null,
  mostReps: { reps: number; weight: number | null } | null,
  units: 'kg' | 'lb',
): string {
  const parts: string[] = [];
  if (heaviest) parts.push(`Heaviest ${trimNum(heaviest.weight)} ${units}`);
  if (mostReps) {
    parts.push(mostReps.weight == null ? `${mostReps.reps} BW reps` : `${mostReps.reps} reps`);
  }
  return parts.join(' · ');
}

/**
 * The Progress chart's y-axis unit suffix (impeccable polish B), e.g. " kg"
 * for LineChart's `unitSuffix` prop — weight-based metrics (heaviest weight,
 * best volume) read out in the profile's unit; reps carry no unit. Isolated
 * as a pure function so the axis-suffix wiring — previously just missing,
 * Progress.tsx never passed the prop LineChart already supported — has a
 * test the render tree can't easily give it.
 */
export function chartYAxisUnitSuffix(
  metric: 'heaviest' | 'volume' | 'reps',
  units: 'kg' | 'lb',
): string | undefined {
  return metric === 'reps' ? undefined : ` ${units}`;
}
