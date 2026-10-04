# HIG review, batch A: type scaling, finish copy, workout actions, chart gutter, delete row

- **Status:** approved
- **Date:** 2026-10-04
- **Related ADRs:** none

## Problem

The screen-by-screen review of build 15
(`docs/reviews/2026-10-04-hig-screen-review.md`) found one P1 and four P2 items that a
tester meets in the first session. The owner chose to build these five first:

1. At accessibility Dynamic Type sizes the workout screen's bottom bar breaks: the
   `LOG SET · 250 × 7` label scales uncapped into a tall column that covers the set
   card, and Today's quarantine banner wraps into a two-line card with a dangling dot.
2. Finish shows "WORKOUT COMPLETE" on what is a confirmation step, and an empty
   workout gets "0 SETS" with no discard path on that screen.
3. The workout's secondary actions are a centered stack of mixed-size text links,
   and the previous-exercise control reads as a dim glyph, not a control.
4. The Progress chart is drawn at window width, so its y-axis labels touch the
   screen edge.
5. History detail's "Delete workout" is a narrow centered button; Profile's "Sign
   out" is a full-width row after a rule.

## Goals & non-goals

- Goal: every control on the workout screen stays usable at every Dynamic Type size,
  including the five accessibility sizes.
- Goal: the finish step reads as a question, and a workout with nothing logged can
  be discarded from that step.
- Goal: the workout's secondary actions share one container and one visual weight,
  and the previous control looks like the control it is.
- Goal: chart labels respect the page margin; destructive rows share one idiom.
- Non-goal: batches B and C of the review; the voice flow; any new screen.

## Design

### Type scaling

- `src/core/layoutScale.ts`: `isStackedLayout(fontScale)` returns true at and above
  `STACKED_LAYOUT_FONT_SCALE = 1.5`. iOS accessibility sizes begin near 1.6, so every
  accessibility size stacks and every standard size keeps the row. Pure, tested.
- `Button` (`size="cta"`): the label renders with `numberOfLines={1}`,
  `adjustsFontSizeToFit` and a `maxFontSizeMultiplier` of `CTA_LABEL_MAX_SCALE = 1.3`.
  A call-to-action is a one-line control; it may shrink its label, never grow into a
  column. Row buttons are unchanged.
- Workout bottom bar: when `isStackedLayout` is true, the bar becomes a column: Log
  set full width on top, Prev and Finish in a row beneath. Otherwise the existing
  row. The same branch stacks the new toolbar (below).
- `QuarantineBanner`: the label is the count alone with `numberOfLines={2}`; "Review"
  moves to a trailing chevron sized by `useFontScale`. The accessibility label keeps
  "tap to review".

### Finish step

- Title becomes "Finish workout?" (same `display` variant, same slam).
- `finishSummaryActions(setCount)` (`src/core/finishSummary.ts`, tested) returns
  `'finish'` when at least one set is logged and `'discard'` when none is. With
  `'discard'` the primary button is "Discard workout" (`kind="danger"`) behind the
  existing discard confirm, whose message becomes "Nothing was logged. This workout
  will be removed.", and a ghost "Back to sets" restores the cursor with
  `findInitialCursor`. Add exercise and Notes stay.

### Workout secondary actions

- Under the mic: one link, "Voice help", opening the help sheet. The help sheet gains
  an `onOpenLog` footer link, "Open voice log", so diagnostics stay one tap deeper.
- Below the voice area: a toolbar of two `secondary` row buttons side by side, "Add
  exercise" (plus icon) and "Notes", each `flex: 1`; stacked under `isStackedLayout`.
- Previous control: the same ghost Plate with `border="soft"` so it is an outlined
  44pt square, the ink chevron inside; disabled dim unchanged.

### Chart gutter and delete row

- `LineChart` left padding grows from 44 to 60 so the widest y label ("600 lb" at
  10px mono) starts at the 16pt page margin; the plot stays edge to edge on the right
  as before.
- History detail's delete button loses `alignSelf: 'center'`; the section already
  mirrors Profile's rule and margin, so the button becomes the same full-width row.

## Alternatives considered

- Capping all `card` text at 1.3: rejected; card titles elsewhere should scale fully.
  Only the CTA label is a control.
- Hiding Prev and Finish at accessibility sizes: rejected; they are the only way to
  move between exercises without voice.
- A segmented toolbar (one Plate with a divider) for Add exercise and Notes: rejected
  for now; two secondary buttons use existing primitives and the same press model.

## Testing

- Unit, written first: `layoutScale.test.ts` (threshold, standard sizes stay row,
  accessibility sizes stack), `finishSummary.test.ts` (0 sets → discard, 1+ → finish).
- Existing: `noRawRadius`, `plateStyles`, grammar and voice suites unchanged.
- Simulator: Release build; workout, Today and History detail at the default size and
  at `accessibility-extra-large`; dark and light; Progress chart left gutter.

## Rollout

Ships in the next TestFlight build together with the rest of the review batches the
owner picks. No data or backend change.

## Open questions

None.
