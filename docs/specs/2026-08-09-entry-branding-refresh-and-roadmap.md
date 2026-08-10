# Entry-point branding refresh + August 2026 review roadmap

- Date: 2026-08-09
- Status: Batch 1 (branding refresh) approved and executed; batches 2-6 pending design
- Source: review session feedback (7 items), reconciled against a 4-agent codebase survey

## Part 1 — Batch 1 spec: entry-point branding refresh

### Problem

At app launch the splash screen and the home-screen icon still show the retired
rose-gold medallion, even though the medallion was deleted from the codebase on
2026-06-12 and every asset and config on main is the current Blacktop loaded-bar
mark.

### Root cause

The local `ios/` directory is a stale prebuild from 2026-06-01. It bakes the old
medallion into `Images.xcassets` (launch-storyboard logo + app icon — the icon is
byte-identical to the deleted `assets/branding/FINAL-icon.png`, sha256
`04d4d5b2…c577f`). `ios/` is gitignored, `npm run ios` (`expo run:ios`) reuses it
without regenerating, and `npm run prebuild` omits `--clean` so xcassets are never
overwritten. Only `scripts/build-ipa.sh` runs `expo prebuild --clean`, which is why
sideloaded tester IPAs show the new mark while local dev builds show the medallion.

Also stale in the same native project: splash background `#0E1411` (dead palette,
no dark variant) vs. the configured `#EFEEE9` light / `#121212` dark, and a
single-entry `AppIcon` missing the iOS 18 light/dark/tinted variants that
`app.config.ts` declares.

### Fix

1. **Regenerate** — `npx expo prebuild --clean -p ios` + `npx pod-install`
   (same invocation as build-ipa.sh). Rebuilds icon, splash logo, splash
   backgrounds, and icon variants from `app.config.ts`.
2. **Guardrail** — add npm script `prebuild:clean` so the regeneration is a
   first-class command, and document in README that native branding only
   refreshes via a clean prebuild. Deliberately NOT making `npm run ios` clean
   every run (would force a full pod install per launch).
3. **Tidy-up** — close the two stale doc entries that still describe the deleted
   `src/ui/Medal.tsx` as live work (`docs/UX_POLISH_BACKLOG.md` §7.6,
   `docs/specs/2026-06-10-deep-review-improvement-plan.md` #33).

### Verification

- Hash check: regenerated `AppIcon.appiconset/App-Icon-1024x1024@1x.png` must no
  longer equal the medallion sha256.
- Visual check: read the regenerated splash-logo PNG (loaded-bar mark), confirm
  `AppIcon` Contents.json gains dark/tinted entries and the splash background
  colorsets match the configured palette.
- Live check: build to the iOS simulator and screenshot the launch splash.

### Caveat

`prebuild --clean` wipes Xcode-side signing selection. `build-ipa.sh` already
re-threads the team from `.env` every run (unaffected); simulator builds need no
signing; a manual Xcode-on-device build needs the team re-picked once.

## Part 2 — Review roadmap (remaining batches, in order)

Findings below come from the 2026-08-09 codebase survey; premises corrected
where the code disagreed with the feedback item.

### Batch 2 — PR semantics (feedback #3)

Progress leads with the "Best volume" tile (a single set's kg×reps — the "weird
number"); the in-session PR tracker is already heaviest-weight-only. Redesign:
heaviest weight becomes the headline record; rep records cover bodyweight
exercises (which today earn zero records since all PR branches require w > 0);
volume record demoted or removed. Known landmines, all mapped in the survey:
bump `PR_BACKFILL_SCHEMA` with any formula change, one-time cleanup of orphaned
cached record rows, align the chart-vs-tile `ended_at` filter inconsistency,
add the missing BW/null-weight tests.

### Batch 3 — Session capture: times + notes (feedback #4 + #5, one design)

Sets already store `completed_at`; HistoryDetail just doesn't surface time or
structure. Add per-session/per-exercise time display and duration; add a
free-form `note` (synced column: migration + schema mirror + SYNCED_TABLES
path) at the level(s) the design lands on (workout and/or set), with lightweight
capture UI (e.g. "low energy, no carbs").

### Batch 4 — Quick-log without a session (feedback #1, reframed)

Ad-hoc logging exists (Blank workout + in-session picker ×3 + voice); the ask
is a lighter path: log one exercise without ceremony. Likely shape: Today-level
quick-log that creates a wrapper workout, reuses ExercisePicker + set staging,
and finishes immediately on save so history and PRs keep working unchanged.
Related known gap (backlog §5.1): plans never reach Today; design should not
foreclose that wiring.

### Batch 5 — Scan a training plan from an image (feedback #2) — DEFERRED

**Scoped out for now (owner decision, 2026-08-09).** Not on the active
sequence; findings below are preserved for when it is picked back up.

Largest feature; three blockers to resolve in design: (a) no structured
prescription model — seed plans encode "3×8 @ RPE 8" inside exercise name
strings; a `template_exercises`-style table with sets/reps/target columns is
likely prerequisite; (b) no camera/photo capability or permissions yet;
(c) no AI integration and nowhere safe to hold an API key — client bundle is
public-safe by design and AGENTS.md forbids Edge Functions without explicit
approval, so this needs an owner decision (likely a Supabase Edge Function
exemption). Mirror the voice pipeline architecture: capture behind an engine
interface, pure extraction→plan mapping, review-before-commit (never write a
scan straight to the active plan). Reuse `resolveOrCreateExercise` for name
dedup; respect plan_type/day_of_week/muscle_group constrained vocabularies.

### Batch 6 — B2B gym white-labeling (feedback #7)

Strategic track: tenant/org model, per-gym logo (storage + RLS), themable skin
over a deliberately single-skin token system. Scope separately; do not let it
shape batches 1-5.
