/**
 * Canonical local-day helpers (#149/#150). Storage is UTC instants; every
 * "what day is it" decision in the UI uses the device's LOCAL calendar day, so
 * an evening lift doesn't slide into the next/previous day. Keep all day
 * bucketing and "N days ago" math routed through these two functions.
 */
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

export function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
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
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    now.getDay()
  ];
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `${day} ${part}`;
}

/** "MON 9:05" — compact local start time for the collision (resume-which) sheet. */
export function formatStartLabel(iso: string): string {
  const d = new Date(iso);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const day = days[d.getDay()];
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
