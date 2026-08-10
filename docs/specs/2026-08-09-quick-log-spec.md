# Quick log: one exercise, minimal ceremony

- Date: 2026-08-09
- Status: approved (owner) — Batch 4 of the 2026-08-09 review roadmap
- Parent: docs/specs/2026-08-09-entry-branding-refresh-and-roadmap.md

## Problem

Logging a single ad-hoc exercise costs the full ceremony: Blank workout →
find Add exercise → pick → log → finish. The owner wants "just do an exercise
and write it down."

## Design (approved)

A **Quick log** ghost button on Today (next to Blank workout) opens the
exercise picker immediately. Picking an exercise:

1. creates a workout **titled after the exercise** (history reads "Pull-ups",
   not "Saturday"; unknown/blank name falls back to the normal day-of-week
   default),
2. adds the exercise through the existing `addExerciseToWorkout` funnel,
3. navigates straight to the normal active-workout screen, cursor on the
   staged set.

Two taps from Today to logging. Underneath it IS a normal workout, so
history, PRs, notes, voice, rest timers, and sync all work unchanged, and
more exercises can still be added mid-session.

Rejected alternative: a separate lightweight capture sheet writing a
pre-finished workout retroactively — truer to "no ceremony" but duplicates
the set-entry machinery (staging, prefill, BW, voice) for one saved tap.

## Constraints honored

- **One active workout**: Quick log disables while a workout is active — the
  same guard as Blank workout.
- **Staged set starts EMPTY, not prefilled.** The never-empty contract stages
  one set, but history-prefill requires registering a staged marker with the
  workout screen's cursor (#12 leave-confirm) — and quick-log adds the
  exercise before that screen mounts. Voice-added exercises hit the identical
  constraint and deliberately stage empty (e6c7e71); quick log follows that
  precedent. Plumbing markers across navigation is a shared future fix for
  both paths.
- All writes through the outbox; no schema changes; no new routes.

## Review-driven hardening (adversarial review, 4 confirmed findings)

- Ref latch on the pick handler (#16 double-fire class): the picker sheet stays
  tappable through its 220ms exit animation, so a double-tap could mint two
  active workouts.
- The one-active-workout invariant is re-checked with a fresh read inside the
  pick handler (the button's disabled guard is stale once the picker is open —
  a sync pull can land an active workout mid-pick); an existing active workout
  is resumed, not duplicated.
- Compensating delete: the workout insert and the exercise add commit in
  separate transactions, so a failure between them soft-deletes the empty
  workout instead of stranding an active workout that disables both start
  buttons.
- Today's ghost row wraps (Yoga's flexShrink:0 default would overflow with a
  third button on narrow devices).

## Tests

- startQuickLog creates the workout titled after the exercise, one
  workout_exercises row (order 0), one empty staged set, and outbox ops for
  all three tables.
- Missing exercise row → workout falls back to the default title.
