# Batch 3: Today Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impeccable Batch 3 — Today stops clipping its own actions, the 96pt poster yields to the act-now card when one exists, and RepeatCard tells the truth (count, units, BW).

**Architecture:** Task 1 is layout/hierarchy in Today.tsx only. Task 2 is RepeatCard honesty + pure-helper tests, then the batch push.

## Global Constraints

- Design source: 2026-08-22 Impeccable critique P1 "Today clips its own actions" + P2 RepeatCard findings; owner decision: "Collapse when content exists — full poster only for empty/rest states."
- The collapse rule (settled): `fullPoster = (no primary card would render, i.e. the EmptyRepeatSlot state) || schedule?.kind === 'rest'`. Everywhere else (Resume/Plan/Repeat/skeleton states on non-rest days) the headline collapses to ONE line.
- Collapsed headline: single `Text variant="displayXL"`, `numberOfLines={1}` + `adjustsFontSizeToFit`, copy "Ready to lift." (or "Back to work." when a workout is active), kicker (greeting) unchanged above it. NO OutlineDisplay in collapsed mode (outline stays a poster-mode-only moment; one per screen).
- Poster mode: byte-identical to today's two-line block (READY TO / outlined LIFT., or Back to / Work.).
- Padding: `scroll.paddingBottom` becomes `theme.touch.navHeight + theme.space.section` (the tab bar is an explicit 64pt `theme.touch.navHeight` in app/(tabs)/\_layout.tsx; no @react-navigation/bottom-tabs dep exists — do NOT add one).
- RepeatCard: mirror PlanCard's `+N more` row exactly (slice(0,4), `overflow > 0` meta row, opacity-idiom); `formatSeed` uses `seedUnits` via `formatWeight` and renders `BW × n` for weight-null+reps-present seeds; `- × -` only when both null. Export `formatSeed`/`stripText` for tests.
- Gates before each commit; conventional commits; push at the end of Task 2 and watch CI.

---

### Task 1: Un-clip + collapse

**Files:** Modify `src/screens/Today.tsx` only.

- [ ] **Step 1: Padding.** `styles.scroll` (~line 582): `paddingBottom: theme.space.section * 2` → `paddingBottom: theme.touch.navHeight + theme.space.section` with a one-line comment naming the tab-bar overlay as the reason (critique P1: "Training plan"/RECENT hidden at default type size).
- [ ] **Step 2: Poster predicate.** Derive, next to the existing primary-slot logic (~353-393): a boolean mirroring the slot's own branch order — poster is true only when the slot would render `EmptyRepeatSlot`, or when `schedule?.kind === 'rest'`. Do not duplicate the branch conditions loosely: derive one `slotState` (or reuse the exact conditions in the same order) so the predicate can never disagree with what actually renders.
- [ ] **Step 3: Collapsed headline.** In the SettleSlam block (~313-346): when NOT poster, render the one-liner per Global Constraints (both active and idle variants); when poster, the existing block unchanged. Keep `styles.headline` for both (padding only, no fixed heights).
- [ ] **Step 4:** Gates; commit `feat(today): headline yields to the act-now card; scroll clears the tab bar (impeccable batch 3)`.

### Task 2: RepeatCard honesty + push

**Files:** Modify `src/components/RepeatCard.tsx`; Test: create `src/components/__tests__/repeatCard.test.ts` (pure helpers only).

- [ ] **Step 1: Tests first** for the exported helpers: `stripText` (0/1/n days, 1/n exercises), `formatSeed` — `{weight 52.5, reps 3, units 'kg'} → '52.5 kg × 3'`; `{weight null, reps 12, units null} → 'BW × 12'`; `{both null} → '- × -'`; lb seed uses 'lb'. Run RED.
- [ ] **Step 2:** Implement: `formatSeed` via `formatWeight(seed.seedWeight, seed.seedUnits ?? DEFAULT_UNITS)`; BW branch; export both helpers. Add the `+N more` overflow row after the seed rows, mirroring PlanCard.tsx's slice/overflow/JSX/opacity idiom exactly. GREEN.
- [ ] **Step 3:** Gates; commit `fix(repeat): honest exercise count with +N more; seed previews carry units and BW (impeccable batch 3)`. Then add this plan file, commit `docs: batch-3 plan (executed)`, push, `gh run watch` → green.

## Verification limits

No tap injection; controller does a relaunch + screenshot after the batch (collapse + padding are visible on the default screen).
