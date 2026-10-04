# HIG screen-by-screen review, build 15

Date: 2026-10-04. Baseline: main @ `689206b` (build 15, voice fix + Today launcher list). Lens: Apple Human Interface Guidelines for iOS (layout and margins, navigation, controls and touch targets, typography and Dynamic Type, modality, consistency, feedback), read against the repo's own design system (`docs/design-system.md`). Walked on the iPhone 16 Pro simulator at the same commit, dark and light, default type size and the accessibility-extra-large size. Login was not re-walked (it was reviewed on device in build 8 to 10); every other screen and sheet was.

Priorities: P1 broken or inaccessible in a core journey, P2 daily-felt friction or a HIG departure a user notices, P3 polish and consistency.

## What holds up

- Empty states are composed, not blank: "No active workout" with the mark and one CTA; the exercise picker creates on type.
- Sheets (voice help, notes, add exercise, confirm) share one anatomy with a handle, title and rule, and the finish confirm uses a destructive outline for the risky action.
- The Softened Blacktop pass landed: one radius scale, one press model, consistent hairlines and lifted surfaces across every screen in both modes.
- The voice path now narrates each state (Starting, listening, a question with what was heard, applied) and the log is one tap away.
- Touch targets on the stepper keys, mic, tab bar and launchers meet 44pt.

## Findings

### P1

**1. Accessibility type sizes break the workout screen.** At the accessibility-extra-large size the bottom bar's `LOG SET · 250 × 7` label scales without a cap or a line limit, so the button becomes a tall column that covers the set card, and `Finish ›` collides with it. Today's quarantine banner wraps its label into a two-line card with a dangling separator dot. HIG: layouts must adapt to every Dynamic Type size, with controls staying usable.
Fix: cap the CTA label (the `card` variant on `Button size="cta"`) around 1.3 and give it `numberOfLines={1}` with `adjustsFontSizeToFit`; above a font-scale threshold (about 1.5) stack the bottom bar vertically (Log set full width, Prev and Finish on a row beneath). Give the banner `numberOfLines={2}` and move the "Review" action to a trailing chevron. Files: `src/screens/WorkoutActive.tsx` (bottomBar), `src/ui/Button.tsx`, `src/components/QuarantineBanner.tsx`. Add a `useWindowDimensions().fontScale` branch, tested as a pure helper.

### P2

**2. Finish reads as done before it is.** Tapping Finish shows a full-screen "WORKOUT COMPLETE" with the summary and a FINISH WORKOUT button beneath. The headline asserts completion on a confirmation step, and for an empty workout it shows "0 SETS" with no discard path on the screen. HIG: a confirmation describes the action and its consequence; the title should be a question or the action name.
Fix: title "Finish workout?" (keep the summary as the body), and when the workout has zero logged sets replace Finish with "Discard workout" (destructive) plus "Keep going". File: `src/screens/WorkoutActive.tsx` finish summary branch.

**3. Workout secondary actions are a centered stack of text links.** Below the mic sit "What can I say?" and "Voice log" (small), then "+ Add exercise" and "Notes" (large), all centered with no container, the same shape that was just fixed on Today. The previous-exercise control at the bottom left is a 44pt box but renders as a tiny dim chevron that does not read as a control.
Fix: one toolbar row of two secondary buttons, "Add exercise" and "Notes", under the card; fold "Voice log" into the help sheet as a link and keep one "Voice help" link under the mic; give the previous control the same visual weight as Finish (label "‹ Prev" or an outlined 44pt square). File: `src/screens/WorkoutActive.tsx` (voiceArea, bottomBar).

**4. Chart ignores the layout margins.** The line chart is rendered at `windowWidth`, so the y-axis labels ("600 lb", "400", "0") sit flush with the screen edge while every other element respects the page inset. HIG: respect the safe area and layout margins.
Fix: either inset the whole chart to `space.page`, or keep the plot edge to edge and inset only the axis labels. File: `src/screens/Progress.tsx` line 343, `src/ui/LineChart.tsx`.

**5. Destructive actions differ per screen.** History detail's "Delete workout" is a narrow centered outline floating in empty space; Profile's "Sign out" is a full-width row after a hairline. Pick the Profile idiom (full width, after a rule, at the end of content) for both. File: `src/screens/HistoryDetail.tsx` (`deleteBtn`).

**6. Training plan day cards look tappable and are not.** Workout days render as filled bone cards, the same treatment as Today's tappable "Repeat workout" card; they have no press handler. HIG: only interactive elements should look interactive.
Fix: either make a day card open the editor scrolled to that day, or render workout days as plain rows (name and exercise count) with the bone fill reserved for the single primary card. File: `src/screens/TrainingPlan.tsx`.

**7. Date formats disagree.** Progress shows "6/11/2026" (locale default) while History shows "OCT 4" and History detail "SUN, OCT 4". Unify on the short form everywhere a date is metadata. Files: `src/screens/Progress.tsx` (PR cards use the default `formatDate`), `src/core/format.ts`.

**8. History detail header competes with the content title.** The navigation bar says "Workout" while the screen's own title says "Sunday"; the helper line "Tap a set to correct it." is instructional text that the row chevrons already make unnecessary.
Fix: header title empty (the in-screen title is the title, as on History and Training plan) or the workout title; drop the helper line, or show it only when a workout has no sets. File: `src/screens/HistoryDetail.tsx`, `app/history/[id].tsx`.

**9. Plan editor can lose edits silently.** "Save plan" is the last element after seven day cards, there is no Save or Done in the header, and back discards every change with no confirmation (no `beforeRemove` or `usePreventRemove` in `src/screens/PlanSetup.tsx`). HIG: provide a clear way to commit, and confirm before discarding work.
Fix: header-right "Save" (disabled until dirty), a leave confirm when dirty, and rename the three day options so "Rest" and "None" are not both present without explanation ("Rest day" / "Unscheduled" / plan name).

**10. Sheets have no visible dismiss control.** Every sheet closes by drag handle or tapping the scrim only. With the keyboard up (Notes, Add exercise) the handle is the only out, and VoiceOver users have no labeled close. HIG: a sheet that collects input should offer an explicit Cancel or Done.
Fix: an optional `closeLabel` on `Sheet` rendering a header-right text button; Notes already has Save, so it gets Cancel; Add exercise gets Done. File: `src/ui/Sheet.tsx` and the two consumers.

### P3

**11. Tab bar labels are 10pt.** HIG minimum for text is 11pt; the labels are also fixed-size, so they never scale. Bump to 11 and allow the label to scale with a cap. File: `app/(tabs)/_layout.tsx`.

**12. Range and metric selectors on Progress are loose buttons.** Three separate bordered buttons per group, while Profile uses the `Segment` primitive for the same job. Use `Segment` for both groups. File: `src/screens/Progress.tsx`.

**13. History rows lack a disclosure indicator.** The rest of the app marks navigational rows with a chevron (Today launchers, Profile rows, History detail set rows); the History list does not. Add the trailing chevron, or justify the exception in the design doc. File: `src/components/HistoryItem.tsx`.

**14. Untitled workouts are listed as "Workout" while titled ones show a weekday.** The active screen's header already falls back to the start day; the list should use the same fallback so every row reads as a day. File: `src/components/HistoryItem.tsx`.

**15. Durations expose workouts left open.** A one-set session shows "1H 5M" and a July workout shows "5D 7H". The number is honest but reads as a bug; cap the displayed duration at the last logged set or show "open" for sessions never finished. Files: `src/core/format.ts`, history queries.

## Resolution log

- **Batch A shipped 2026-10-04** (spec `docs/specs/2026-10-04-hig-batch-a-spec.md`): 1 (CTA
  label cap, stacked bottom bar and toolbar above font scale 1.5, banner chevron and 1.5× cap),
  2 ("Finish workout?", discard primary for an empty session with Back to sets), 3 (toolbar of
  two secondary buttons, one Voice help link with the log inside the help sheet, outlined Prev),
  4 (chart left padding 60), 5 (full-width delete row). Verified on the simulator at the
  default and accessibility-extra-large sizes.
- **Batch B shipped 2026-10-04**: 6 (training plan days are ruled rows, nothing looks
  tappable that is not), 7 (relative dates fall back to "Jun 11, 2026", never the numeric
  locale default), 8 (History detail bar title empty, helper line dropped), 9 (header Save
  disabled until dirty, "Discard changes?" confirm through the vendored prevent-remove hook,
  "None" renamed "Free" / "Free day"), 10 (`Sheet` gains a labeled header dismiss: Add
  exercise "Done", Notes "Cancel" that discards this open's typing). Verified on the simulator.

## Suggested order

Batch A (one build): 1, 2, 3, 4, 5. These are the ones a tester notices in the first session.
Batch B: 6, 7, 8, 9, 10. Consistency and data-safety.
Batch C: 11 to 15 with the next polish pass.
