# Batch 5: Consistency Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impeccable Batch 5 — the consistency minors: accent discipline on chrome, one title voice per surface class, one destructive treatment, honest fallbacks, first-run de-nesting, config hygiene.

## Global Constraints

- Design source: 2026-08-22 critique Minor Observations + audit P3s. All items verified against CURRENT code before changing — several observations may already be partially fixed; report reality.
- Accent rule: volt = act-now or achievement ONLY. The nav back-chevron is neither.
- Title rule (make the code's own comment literally true): nav headers are Geist because header titles are USER text. Chrome-titled pushed screens (History, Training plan, Plan setup) therefore move their titles in-screen (Anton display voice, matching Progress/Profile) with an empty nav headerTitle; HistoryDetail keeps its Geist header (workout title IS user text).
- One destructive treatment: quiet-danger (panel plate, danger hairline, danger text, no fill) — Today's syncRow comment claims it's already "the ONE treatment shared with QuarantineBanner"; verify and align whatever still renders a FILLED danger plate (Assessment A cited PlateTone 'danger'). If the filled tone has no remaining legitimate consumer, retire it (or leave it with a comment if retiring breaks the Plate API surface — judgment, documented).
- Honest fallbacks: `formatDuration` with null ended_at must not render "· -" — callers drop the segment (or render "in progress" where a value is required); update src/core/format tests. `PR_LABEL` unknown record types render a humanized fallback (underscores→spaces, capitalized), never the raw enum; test it.
- First-run de-nesting: when WorkoutActive mounts with zero exercises (blank workout), auto-open the ExercisePicker ONCE (ref latch; closing it without picking shows the normal empty state, no re-open loop). Quick-log/plan/voice starts are unaffected (they always have an exercise).
- Config hygiene: remove the unused `android` npm script; keep app.config.ts's android block with a one-line comment (future optionality; iOS-only stance) — do NOT delete config.
- Gates before each commit; push at end + CI watch.

---

### Task 1 (single task): all items + push

- [ ] Survey each item against current code; skip-with-note anything already consistent.
- [ ] headerTintColor volt → ink (app/\_layout.tsx; check theme token for the right ink on both schemes).
- [ ] Chrome titles: History/TrainingPlan/PlanSetup in-screen Anton titles + empty nav titles (mirror Progress/Profile's SettleSlam+displayXL idiom); HistoryDetail untouched.
- [ ] Destructive treatment alignment per Global Constraints.
- [ ] formatDuration + PR_LABEL fallbacks, TDD in src/core/**tests**/format.test.ts (+ wherever PR_LABEL lives).
- [ ] WorkoutActive zero-exercise auto-picker with ref latch.
- [ ] package.json android script removal + app.config.ts comment.
- [ ] Full gates; commit `polish(consistency): one accent discipline, one title voice, one danger treatment, honest fallbacks (impeccable batch 5)`; add this plan file, commit `docs: batch-5 plan (executed)`; push; CI watch green.
