# The plan reaches Today (backlog §5.1 / #109 / #153)

- Date: 2026-08-10
- Status: approved (owner)
- Parent roadmap: docs/specs/2026-08-09-entry-branding-refresh-and-roadmap.md

## Problem

Training plans are decorative: slots (weekday or cycle position → template) are
stored, edited, and rendered, but nothing resolves "what is scheduled today",
nothing starts a workout from a template, `workouts.template_id` is never
written, and `training_plans.cycle_cursor` never advances.

## Resolver (pure, `src/core/planResolver.ts`)

`resolveTodaySlot(plan, slots, todayDow)` → one of:
- `{ kind: 'workout', slot, templateId }` — a scheduled template
- `{ kind: 'rest', slot }` — an explicit rest-day slot
- `{ kind: 'none' }` — nothing scheduled

Rules: **weekly** matches `day_of_week` to the device-local weekday
(Sunday = 0 — `src/lib/dayOfWeek.ts` convention, so the card always agrees
with the default workout title and the greeting). **cycle** takes the slot at
`cycle_cursor % orderedSlotCount` (slots ordered by `cycle_position`). A
non-rest slot with a null template resolves to `none` (unconfigured). SQLite
booleans arrive as 0/1 — the resolver treats them numerically.

## Today surface

Priority in the existing hero-card slot: active workout (resume — unchanged)
→ **scheduled plan card** → rest strip + existing repeat/empty behavior →
existing behavior.

- Plan card: eyebrow "Scheduled today", title = `slot.label ?? template.name`,
  meta = exercise count, primary Start action. Replaces the Repeat card on
  scheduled days (one act-now moment per screen).
- Rest day: quiet strip "Rest day · <plan name>"; cycle plans get a ghost
  "Skip rest" that advances the cursor (otherwise the cycle stalls); weekly
  plans need nothing (the calendar advances them). Repeat card still renders.
- The cold-start snapshot (`todaySnapshot`) is NOT extended: first paint may
  briefly show the repeat/empty state until live queries land — accepted.
- The resolved weekday refreshes on screen focus (greeting precedent), so a
  screen left open across midnight re-resolves.

## Start (`src/queries/plannedWorkout.ts`)

`startPlannedWorkout({ userId, templateId, title })`, following the
`repeatLastWorkout` transaction pattern — ONE transaction containing:
- the workout (`title` from slot label/template name, **`template_id`
  stamped** — first real writer of that column),
- one `workout_exercises` row per entry of `templates.exercise_order`, order
  preserved, silently skipping ids whose exercise row is missing/deleted,
- one seeded set per exercise, prefilled weight/reps/units from that
  exercise's most recent COMPLETED set anywhere in the user's history (null
  seeds when never done — same never-empty contract as everywhere else).

A template that resolves to zero exercises throws (friendly toast; no empty
active workout is created). The Today handler wears the quick-log hardening:
ref latch + fresh `getActiveWorkout` re-check (resume instead of duplicate).

## Cycle advancement

- `finishWorkout` gains a best-effort seam (PR-detection precedent — a
  failure is reported, never blocks finishing): if the finished workout has a
  `template_id` AND the active plan is a cycle AND the slot at the current
  cursor references that template, advance `cycle_cursor` to
  `(cursor + 1) % slotCount` through the outbox.
- "Skip rest" advances the cursor unconditionally by 1 (same mutation).
- Weekly plans never touch the cursor.

## Review-driven hardening (adversarial review: 9 confirmed, 2 refuted)

- **Cycle gaps are skippable.** A cycle cursor parked on an unconfigured slot,
  a deleted template, or a template with zero resolvable exercises surfaces a
  "Nothing scheduled · <plan> · Skip" strip instead of collapsing to nothing —
  otherwise the cycle stalls forever with no escape. Weekly plans collapse the
  same states to none (the calendar moves past them).
- **Plan edits preserve the cursor.** `saveActivePlan` previously hard-reset
  `cycle_cursor` to 0 on every save; harmless while the cursor was decorative,
  a silent cycle restart now. The edit path reads and preserves it.
- **Root invalidation.** The plan-save/apply hooks invalidate the `['plans']`
  root so the new Today-schedule key refreshes with the active-plan key.
- **Skip is latched** (ref + pending disable) — a double tap must not skip a
  real training day.
- **Day refresh on app foreground.** Focus effects don't fire on
  AppState transitions; an AppState listener re-resolves the weekday (and
  greeting) so an overnight background can't offer yesterday's workout. A
  screen that stays foregrounded and focused across midnight without any
  transition remains a known, accepted staleness window.
- **Accepted:** `workouts.template_id` has a server FK to `templates`; if the
  template's own insert is quarantined, the workout push fails until it
  clears. This is the same dependency class the app already carries for
  offline-created custom exercises referenced by `workout_exercises` — not
  newly engineered around.

## Docs rider

ARCHITECTURE.md gets the day-boundary convention paragraph §5.1 asks for:
storage is UTC instants; every "what day is it" decision is the device-local
calendar day.

## Out of scope

Planned-vs-done deviation display; TrainingPlan-screen start affordance; plan
editing changes; prescriptions (sets/reps targets); snapshot extension.

## Tests

- Resolver: weekly Sunday=0 match, no-slot day, rest day, cycle modulo wrap,
  cycle rest, null-template slot, empty slot list.
- Start: template order preserved, `template_id` stamped, history-prefilled
  seeds (incl. unit provenance), never-done exercise seeds null, missing
  exercise id skipped, empty template throws and writes nothing.
- Cursor: advances on matching finish with wrap; does NOT advance for weekly
  plans, ad-hoc workouts, or a non-matching template; skip-rest advances.
