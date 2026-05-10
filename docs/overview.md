# Product Overview

## Positioning

FlexYug is a **mobile-only, local-first strength-training journal**. The product is organized around one job:

> Capture strength training reliably, offline, and fast.

Every other design choice — local SQLite as source of truth, background sync, outbox retries, native haptics, background rest timer — follows from that sentence. If something makes set logging slower or less reliable, it doesn't ship.

## Product Principles

1. **One thing at a time.** Every screen has a single dominant action. Reduce choices, don't add them.
2. **Calm over gamified.** No streaks, badges, or guilt. Show progress without pressure.
3. **Your data, immediately useful.** Every piece of recorded data should surface in a way that helps the next workout.
4. **Fast by default.** The most common path (start workout, log sets, finish) must feel instant.
5. **Mobile-only, always.** Designed for a phone held in one hand at a gym.
6. **Convention over configuration.** Smart defaults beat settings screens. Only expose preferences that truly vary (units, plan structure).
7. **Honest simplicity.** If a feature adds conceptual weight without clear value, it doesn't ship.

## Information Architecture

File-based routing under [app/](../app/):

```
(tabs)/
  today          — start or resume a workout
  history        — past sessions grouped by date
  progress       — PRs and per-exercise trend charts
  profile        — settings, templates, plan link, sign out
workout/active   — live workout session
history/[id]     — single workout detail
profile/plan/    — training plan view + setup wizard
login            — OTP sign-in
+not-found       — catch-all
```

Bottom tabs: Today, History, Progress, Profile (4 tabs). The Plan surface lives under Profile and has a dedicated route — elevating it to a top-level tab is a future consideration, not a current commitment.

## Domain Glossary

Use these names consistently across code, UI copy, and docs.

| Concept                      | Canonical name             | Definition                                                        | Do NOT call it          |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------- | ----------------------- |
| A movement in the library    | **Exercise**               | A named movement with optional muscle group                       | "lift", "movement"      |
| A reusable workout shape     | **Template**               | A named, ordered list of exercises that can start a workout       | "routine"               |
| A multi-day training schedule | **Training plan** (**Plan**) | Weekly or rotating-cycle schedule of slots                       | "program", "schedule"   |
| One day in a plan            | **Slot**                   | A position within a plan referencing a template or marked as rest | "day entry"             |
| A performed session          | **Workout**                | A started (and optionally finished) training session              | "session", "log"        |
| A single effort              | **Set**                    | One set of weight × reps within a workout exercise                | —                       |
| A milestone                  | **Personal record** (**PR**) | A best-ever value for an exercise                                | "achievement", "badge" |

### Naming in code

- Database tables and TypeScript types in [src/db/types.ts](../src/db/types.ts) follow these names.
- Variable names must match: `templateCount`, not `routineCount`.
- Product-level types (units, PR types, sync state, slot draft) live in [src/core/domain.ts](../src/core/domain.ts) — the canonical code glossary.

## Core Flows

### Start and log a workout

1. Today → **Start workout** creates a `workouts` row locally via `enqueueMutation`
2. Workout Active → **Add exercise** opens the [ExercisePicker](../src/components/ExercisePicker.tsx)
3. Each set adds a row in `sets` locally; the completion toggle flips `completed` and fires a haptic
4. **Rest timer** starts on set completion; a background notification is scheduled via [src/lib/restNotifications.ts](../src/lib/restNotifications.ts)
5. **Finish** sets `ended_at`, runs PR detection client-side ([src/core/pr-detection.ts](../src/core/pr-detection.ts)), and upserts any new PRs

Every one of those writes is a local SQLite transaction plus an outbox row. The sync engine drains the outbox to Supabase whenever the network is reachable.

### Review progress

- **History** lists past workouts grouped by date, filtered by period
- **History detail** shows the full exercise + sets breakdown and offers "Repeat" (creates a new workout from the same lineup)
- **Progress** renders per-exercise trend charts via [src/ui/LineChart.tsx](../src/ui/LineChart.tsx) and a weekly training-frequency view

### Plan a week

- **Training plan** (weekly) pairs each day of the week with a template or marks it as rest
- **Training plan** (cycle) assigns templates to rotating cycle positions; `cycle_cursor` advances with each completed workout
- **Plan setup** builds these interactively with [src/screens/PlanSetup.tsx](../src/screens/PlanSetup.tsx)

## Measurement

Core product metrics we intend to track as the product matures:

| Metric                       | What it measures                            | Why it matters                          |
| ---------------------------- | ------------------------------------------- | --------------------------------------- |
| Weekly active workouts       | Completed workouts per user per week        | Core engagement                         |
| Workout completion rate      | Finished / started ratio                    | UX friction                             |
| Avg workout duration         | Mean start-to-finish time                   | Session depth                           |
| Template adoption            | % of workouts from templates                | Template system value                   |
| Plan adherence               | % of planned slots completed on schedule    | Plan feature value                      |
| PR frequency                 | PRs per user per week                       | Progress signal                         |

Instrumentation is currently a no-op vocabulary — connecting a provider is a future task; there is no PII-reliant analytics in the app today.

## What is explicitly not in scope

- Multi-user training, coaching, or social features
- Video or image attachments
- A large seeded exercise library (users add custom exercises as needed)
- Dark-mode polish beyond the pre-baked palette
- A web or desktop client
