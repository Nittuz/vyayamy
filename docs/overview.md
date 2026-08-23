# Product Overview

## Positioning

FlexYug is a **mobile-only, local-first strength-training journal**. The product is organized around one job:

> Capture strength training reliably, offline, and fast.

Every other design choice (local SQLite as source of truth, background sync, outbox retries, native haptics, background rest timer, voice logging) follows from that sentence. If something makes set logging slower or less reliable, it doesn't ship.

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
index            : entry redirect (auth session -> today, else login)
(tabs)/
  today          : start or resume a workout
  progress       : PRs and per-exercise trend charts
  profile        : settings, templates, plan link, sign out
workout/active   : live workout
history/         : list (index) + single workout detail ([id])
profile/plan/    : training plan view + setup wizard
login            : email magic-link (OTP) or password sign-in
+not-found       : catch-all
```

Bottom tabs: Today, Progress, Profile (3 tabs). History is a stack route reached from the Today header, not a tab. The Plan surface lives under Profile and has a dedicated route; elevating it to a top-level tab is a future consideration, not a current commitment.

## Domain Glossary

Use these names consistently across code, UI copy, and docs.

| Concept                       | Canonical name               | Definition                                                        | Do NOT call it         |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------- | ---------------------- |
| A movement in the library     | **Exercise**                 | A named movement with optional muscle group                       | "lift", "movement"     |
| A reusable workout shape      | **Template**                 | A named, ordered list of exercises that can start a workout       | "routine"              |
| A multi-day training schedule | **Training plan** (**Plan**) | Weekly or rotating-cycle schedule of slots                        | "program", "schedule"  |
| One day in a plan             | **Slot**                     | A position within a plan referencing a template or marked as rest | "day entry"            |
| A performed session           | **Workout**                  | A started (and optionally finished) training session              | "session", "log"       |
| A single effort               | **Set**                      | One set of weight × reps within a workout exercise                |                        |
| A milestone                   | **Personal record** (**PR**) | A best-ever value for an exercise                                 | "achievement", "badge" |

### Naming in code

- Database tables and TypeScript types in [src/db/types.ts](../src/db/types.ts) follow these names. Sanctioned exception: the plan-preset tier value `program` (server CHECK constraint, `supabase/migrations/00006`) is an internal DB value and must never surface in UI copy.
- Variable names must match: `templateCount`, not `routineCount`.
- Product-level types (units, PR types, sync state, slot draft) live in [src/core/domain.ts](../src/core/domain.ts), the canonical code glossary.

## Core Flows

### Start and log a workout

1. Today → **Start workout** creates a `workouts` row locally via `enqueueMutation`
2. Workout Active → **Add exercise** opens the [ExercisePicker](../src/components/ExercisePicker.tsx)
3. Each set adds a row in `sets` locally; the completion toggle flips `completed` and fires a haptic
4. **Rest timer** starts on set completion; a background notification is scheduled via [src/lib/restNotifications.ts](../src/lib/restNotifications.ts)
5. **Finish** sets `ended_at`, runs PR detection client-side ([src/core/pr-detection.ts](../src/core/pr-detection.ts)) and recomputes the local PR cache ([src/queries/personalRecords.ts](../src/queries/personalRecords.ts))
6. Sets can also be logged hands-free: the mic button ([src/voice/useVoiceSession.ts](../src/voice/useVoiceSession.ts)) parses spoken commands to add sets, mark them done, and control the rest timer

Every workout/exercise/set write is a local SQLite transaction plus an outbox row; the sync engine drains the outbox to Supabase whenever the network is reachable. PRs are the exception: a local derived cache recomputed from synced sets, never pushed or pulled.

### Review progress

- **History** lists past workouts grouped by date, loaded incrementally as you scroll
- **History detail** shows the full exercise + sets breakdown for a past workout — and is the correction surface for it: each set row opens `EditSetSheet` to edit or delete it, and a destructive confirm deletes the whole workout, all with PRs recomputed afterward (see [docs/specs/2026-08-22-history-correction-spec.md](specs/2026-08-22-history-correction-spec.md)). Re-creating a past workout is the **Repeat-Last-Workout** card on Today, not an action here
- **Progress** renders the PR list grouped by exercise and a per-exercise heaviest-weight trend chart via [src/ui/LineChart.tsx](../src/ui/LineChart.tsx)

### Plan a week

- **Training plan** (weekly) pairs each day of the week with a template or marks it as rest
- **Training plan** (cycle) assigns templates to rotating cycle positions; `cycle_cursor` is stored per plan (currently always 0) and advancing it on workout completion is part of the not-yet-built plan-to-Today loop
- **Plan setup** builds these interactively with [src/screens/PlanSetup.tsx](../src/screens/PlanSetup.tsx)

## Measurement

Core product metrics we intend to track as the product matures:

| Metric                  | What it measures                         | Why it matters        |
| ----------------------- | ---------------------------------------- | --------------------- |
| Weekly active workouts  | Completed workouts per user per week     | Core engagement       |
| Workout completion rate | Finished / started ratio                 | UX friction           |
| Avg workout duration    | Mean start-to-finish time                | Workout depth         |
| Template adoption       | % of workouts from templates             | Template system value |
| Plan adherence          | % of planned slots completed on schedule | Plan feature value    |
| PR frequency            | PRs per user per week                    | Progress signal       |

There is no instrumentation in the app today; defining an event vocabulary and connecting a provider are future tasks. No PII-reliant analytics exist.

## What is explicitly not in scope

- Multi-user training, coaching, or social features
- Video or image attachments
- A large curated exercise encyclopedia with media/instructions (a base global set is seeded; users add their own exercises)
- Additional themes beyond the single Blacktop identity (dark + chalk light, following the system scheme); no theme picker, no per-screen theming
- A web or desktop client
