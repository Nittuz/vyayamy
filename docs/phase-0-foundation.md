# Vyayamy — Phase 0 Foundation

## 1. Product positioning

Vyayamy is a calm, mobile-first workout journal that helps people build a consistent training habit without complexity.

## 2. Product principles

1. **One thing at a time.** Every screen has a single dominant action. Reduce choices, don't add them.
2. **Calm over gamified.** No streaks, badges, or guilt. Show progress without pressure.
3. **Your data, immediately useful.** Every piece of recorded data should surface in a way that helps the next workout.
4. **Fast by default.** The most common path (start workout, log sets, finish) must feel instant.
5. **Mobile-first, always.** Design for a phone held in one hand at a gym. Desktop is a nice-to-have.
6. **Convention over configuration.** Smart defaults beat settings screens. Only expose preferences that truly vary (units, plan structure).
7. **Honest simplicity.** If a feature adds conceptual weight without clear value, it doesn't ship.

## 3. Information architecture

### Current IA (as shipped)

```
Today (/)
  Workout Active (/workout/active)
History (/history)
  History Detail (/history/:id)
Progress (/progress)
Profile (/profile)
  Training Plan (/profile/plan)
    Plan Setup (/profile/plan/setup)
Login (/login)
```

Bottom nav: Today, History, Progress, Profile (4 tabs).

### Target IA

```
Today (/)
  Workout Active (/workout/active)
Plan (/plan)
  Plan Setup (/plan/setup)
History (/history)
  History Detail (/history/:id)
Progress (/progress)
Profile (/profile)
Login (/login)
```

Bottom nav: Today, Plan, History, Progress, Profile (5 tabs).

### What changes now vs later

| Change | When | Why |
|--------|------|-----|
| Centralize route paths in `src/lib/routes.ts` | Now (done) | Makes future path changes safe |
| Centralize nav items in `NAV_ITEMS` | Now (done) | Adding the Plan tab becomes a one-line change |
| Promote Plan to `/plan` route | Phase 1 | Requires updating BackLink targets, nav, and existing plan links |
| Add Plan tab to bottom nav | Phase 1 | Follows the route promotion |

## 4. Domain naming rules

Use these terms consistently across code, UI copy, and documentation.

| Concept | Canonical name | Definition | Do NOT call it |
|---------|---------------|------------|----------------|
| A movement in the library | **Exercise** | A named movement (e.g. "Bench Press") with optional muscle group | "lift", "movement" |
| A reusable workout shape | **Template** | A named, ordered list of exercises that can start a workout | "routine" |
| A multi-day training schedule | **Training plan** (or just **Plan**) | Weekly or rotating-cycle schedule of slots | "program", "schedule" |
| One day in a plan | **Slot** | A position within a plan, referencing a template or marked as rest | "day entry" |
| A performed session | **Workout** | A started (and optionally finished) training session | "session", "log" |
| A single effort | **Set** | One set of weight x reps within a workout exercise | — |
| A milestone | **Personal record** (or **PR**) | A best-ever value for an exercise (heaviest weight, best volume, etc.) | "achievement", "badge" |

### Naming in code

- Database tables and TypeScript types already follow these names.
- Variable names must match: use `templateCount`, not `routineCount`.
- The `src/lib/domain.ts` file is the canonical code glossary.

## 5. Design-system v1 scope

### What exists (solid foundation)

- **Tokens:** Single-file system in `src/styles/theme.css` covering colors, spacing, radii, typography, shadows, transitions, and z-index.
- **Light/dark mode:** Full dark palette via `prefers-color-scheme: dark`.
- **Responsive:** Desktop framing, small-viewport adjustments, reduced-motion support.
- **Global utility classes:** `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.chip`, `.card`, `.tag`, `.input` + modifiers, typography classes (`.page-title`, `.section-title`, `.card-title`, `.meta`).
- **Shared components:** `Sheet`, `ConfirmDialog`, `Toast`, `EmptyState`, `BackLink`, `Skeleton`, `Icons`.

### What's missing (future work)

| Gap | Priority | Notes |
|-----|----------|-------|
| `Button` React component | Medium | Wrap `.btn-*` classes; add loading state, icon slot |
| `Input` React component | Medium | Wrap `.input` classes; standardize search input |
| `Card` React component | Low | `.card` class works well; component adds type safety for slots |
| Deduplicated Sheet primitive | High | `ExerciseSearchModal.css` duplicates `Sheet.css` patterns |
| Chip consistency | Low | `.today-alt-chip` diverges from `.chip`; unify when touching Today |
| Toast action tokens | Low | `.toast-action` uses raw rgba(); replace with semantic tokens |
| Off-scale literals | Low | A few components use `6px`, `9px`, `4px` radii outside `--radius-*` |

### Z-index scale (now tokenized)

| Token | Value | Usage |
|-------|-------|-------|
| `--z-sticky` | 50 | Sticky footers (workout active) |
| `--z-nav` | 100 | Bottom navigation bar |
| `--z-overlay` | 500 | Reserved for future overlays |
| `--z-sheet` | 1000 | Bottom sheets and modals |
| `--z-toast` | 9999 | Toast notifications (always on top) |

## 6. Measurement plan

### Core product metrics

| Metric | What it measures | Why it matters |
|--------|-----------------|----------------|
| Weekly active workouts | Completed workouts per user per week | Core engagement signal |
| Workout completion rate | Finished / started ratio | UX friction indicator |
| Avg workout duration | Mean start-to-finish time | Session depth; outliers = possible abandonment |
| Template adoption | % of workouts from templates vs custom | Template system value |
| Plan adherence | % of planned slots completed on schedule | Plan feature value |
| PR frequency | PRs per user per week | Progress/motivation signal |

### Instrumentation approach

Event definitions live in `src/lib/analytics.ts`. The `track()` function is a no-op stub. When we pick a provider:

1. Wire `track()` to the provider SDK.
2. Add `track()` calls at existing mutation `onSuccess` callbacks.
3. No new UI work needed — events align with existing data flows.

### Key instrumentation points (by file)

| Event | Where to instrument |
|-------|-------------------|
| `workout_started` | `src/lib/queries/workouts.ts` — `useCreateWorkout` onSuccess |
| `workout_completed` | `src/lib/queries/sets.ts` — `useFinishWorkout` onSuccess |
| `exercise_added` | `src/lib/queries/exercises.ts` — `useAddExerciseToWorkout` onSuccess |
| `set_logged` | `src/lib/queries/sets.ts` — `useAddSet` onSuccess |
| `pr_achieved` | `src/lib/pr-detection.ts` — after successful upsert |
| `template_created` | `src/lib/queries/templates.ts` — `useCreateTemplate` onSuccess |
| `plan_created` | `src/lib/queries/plans.ts` — `useCreatePlan` onSuccess |

## 7. Prioritized Phase 0 backlog

| # | Issue | File(s) | Effort | Impact |
|---|-------|---------|--------|--------|
| 1 | Centralize route/nav config | `src/lib/routes.ts`, `App.tsx`, `Layout.tsx` | Done | High |
| 2 | Unify "routine" -> "template" naming | `TrainingPlan.tsx`, `Profile.tsx`, `history.ts` | Done | Medium |
| 3 | Tokenize z-index scale | `theme.css`, 5 CSS files | Done | Medium |
| 4 | Add analytics event vocabulary | `src/lib/analytics.ts` | Done | Medium |
| 5 | Add domain naming glossary | `src/lib/domain.ts` | Done | Medium |
| 6 | Deduplicate Sheet/ExerciseSearchModal CSS | `Sheet.css`, `ExerciseSearchModal.css` | Small | High |
| 7 | Extract `useFinishWorkout`/`useDeleteWorkout` from `sets.ts` | `src/lib/queries/sets.ts` | Small | Medium |
| 8 | Standardize search input to use `.input` classes | `ExerciseSearchModal.css` | Small | Low |
| 9 | Replace raw rgba() in Toast with tokens | `Toast.css` | Tiny | Low |
| 10 | Align off-scale radii/spacing literals | Various CSS | Tiny | Low |

## 8. "Change now vs later" guidance

### Changed now (Phase 0)

- Route paths centralized in `src/lib/routes.ts` — all future path changes happen in one place.
- Nav items centralized in `NAV_ITEMS` — adding Plan tab is a one-line change.
- "Routine" renamed to "template" in TypeScript variables and query filter fields.
- Z-index values replaced with design tokens.
- Analytics event vocabulary defined with no-op `track()`.
- Domain glossary established in code and documentation.

### Change in Phase 1

- Promote Plan to top-level route (`/plan` instead of `/profile/plan`).
- Add Plan tab to bottom navigation.
- Deduplicate Sheet and ExerciseSearchModal CSS into a shared primitive.
- Extract workout lifecycle mutations from `sets.ts` into `workouts.ts` or a new `workoutActions.ts`.
- Consider `Button` and `Input` React component wrappers.

### Do not change (by design)

- CSS utility class approach (`.btn-primary`, `.card`, `.input`) — works well for this codebase size.
- Co-located CSS files per component — keeps styles discoverable.
- One query module per domain — clear ownership boundaries.
- No state management library — `useState` + React Query is sufficient.
- No barrel files (`index.ts` re-exports) — direct imports are clearer.
