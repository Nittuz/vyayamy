# Softened Blacktop: rounded shapes, lifted surfaces, native press feel

- **Status:** approved
- **Date:** 2026-09-23
- **Related ADRs:** none

## Problem

TestFlight build 9 on the owner's iPhone reads as harsher than a first-party iOS app:
every card, button, input, row, and sheet is a hard rectangle, surfaces sit on the page
with only a rule to separate them, and presses dip in opacity. The Blacktop overhaul
(2026-07) chose this on purpose ("all-sharp, no radius scale, elevation by inversion").
The owner has now reviewed the shipped app on device and wants the identity kept but the
edges softened toward what an Apple app would have, with the shapes and press feel done
once in the system rather than per screen.

Decisions taken in the brainstorm (visual companion, 2026-09-23):

- Direction **A, Softened Blacktop**: small radii, rules and flat surfaces kept. Not the
  fill-and-shadow iOS model, not pills.
- Surfaces separate by a **lifted fill with a hairline** (one step lighter than the page
  plus a 1.5px line), not by rule alone and not by fill alone.
- Press feel: **scale with a mild darken** on cards and buttons, **highlight** (fill tint,
  no movement) on list rows.
- Reach: **every surface in the app**, light and dark, including Login and the tab bar.

## Goals & non-goals

- Goal: one radius scale and one press model in the theme; no screen carries a shape or
  press number of its own.
- Goal: every primitive (Plate, Button, inputs, Segment, Sheet, ConfirmSheet, Toast, tab
  bar) takes its shape from the tokens, so screens inherit the change.
- Goal: the seven hand-rolled input styles collapse onto one shared style.
- Goal: a guard test makes raw radii and hand-rolled input borders fail the build, the way
  the raw-hex test guards colors.
- Non-goal: native iOS components (translucent tab bar, grouped `UITableView` lists).
- Non-goal: copy, navigation, chart drawing, new components, re-layout of any screen.
- Non-goal: the screen-by-screen HIG review; that is the agreed follow-up against build 10.

## Design

### Tokens (`src/ui/useTheme.tsx`, `src/ui/colors.ts`)

| Token            | Value | Used by                                        |
| ---------------- | ----- | ---------------------------------------------- |
| `radius.control` | 6     | Buttons, inputs, segments, chips, stepper keys |
| `radius.card`    | 8     | Plates, list rows, toasts, banners             |
| `radius.sheet`   | 16    | Top corners of Sheet and ConfirmSheet          |
| `radius.full`    | 9999  | Avatar, sync dot, sheet handle (unchanged)     |

Surface lift: dark `surface` `#1A1A19` → `#1C1C1B`, dark `border` `#333331` → `#2E2E2C`;
light `surface` stays `#F7F6F1`, light `border` `#CFCEC6` → `#D6D5CE`. Token names do
not change, so no consumer outside the palette moves. `depth.hairline` stays 1.5.

Press: two named responses replace the single dip in `plateStyles.ts`:

- `scale`: `transform: scale(0.975)` plus opacity 0.92 (the "mild darken"), 60 ms, for
  cards and filled buttons. Reduced Motion: opacity only.
- `highlight`: fill moves one step (`surface` → `surface2`-equivalent tint), no
  transform, for list rows and outlined/ghost buttons. Same under Reduced Motion.

The "Blacktop shape lock" comment in the theme and the "corners are sharp by design" rule
in `AGENTS.md` and `docs/design-system.md` are removed.

### Primitives

- **Plate** (`Plate.tsx`, `plateStyles.ts`): new `shape?: 'card' | 'control' | 'none'`
  (default `card`) resolving to `borderRadius`; new `press?: 'scale' | 'highlight'`
  (default `scale`) selecting the pressed style. Tones, borders, disabled face unchanged.
  `resolvePressedStyle(reduceMotion, press)` returns the target style.
- **Button** (`Button.tsx`): `shape="control"`; primary and inverted kinds press with
  `scale`, secondary/ghost/danger with `highlight`.
- **Inputs**: new `src/ui/inputStyles.ts` exporting `resolveInputStyle(theme)`
  (`height: touch.min + 4`, page fill, hairline `border`, `radius.control`, sans body
  font, ink color). Consumers: Login (email, password, code), Profile (display name),
  PlanSetup (plan name), NoteSheet, ExercisePicker search. NumericStepperView's stepper
  keys take `radius.control` directly (they are keys, not text inputs).
- **Segment** (`Segment.tsx`, `segmentStyles.ts`): outer frame `radius.control` with
  `overflow: hidden`; the selected fill has no radius of its own.
- **Sheet / ConfirmSheet**: `borderTopLeftRadius`/`borderTopRightRadius` = `radius.sheet`;
  the 3px heavy top rule becomes the 1.5px hairline; handle `radius.full`.
- **Toast** (`ToastContext.tsx`): `radius.card`; fills unchanged.
- **Tab bar** (`app/(tabs)/_layout.tsx`): unchanged except the hairline color follows
  the softened token. **SyncIndicator**: unchanged.
- **OutlineDisplay, Text, charts**: untouched.

### Screens

Screens change only where they draw a shape by hand:

- Today: act-now card and quarantine banner inherit `card`/`scale`; Recent rows pass
  `press="highlight"`.
- Workout: ActiveSetCard's hairline box takes `radius.card`; stepper keys
  `radius.control`; exercise picker search and note field use `resolveInputStyle`.
- History: rows `press="highlight"`; detail cards inherit.
- Progress: legend chips `radius.control`; PR mark stays `full`.
- Profile: rest-alerts and training-plan rows `press="highlight"`; name field and units
  segment inherit; avatar stays `full`.
- Login and PlanSetup: inputs move to `resolveInputStyle`; PlanSetup day chips
  `radius.control`.

Spacing rhythm, applied only where a screen deviates (no re-layout): `space.section` (32)
between sections, `space.s4` (16) inside a card, `space.s2` (8) between list rows.

## Alternatives considered

- **Apple native** (large radii, no borders, shadows, grouped lists, translucent bar):
  rejected in the brainstorm; it discards the rule-based identity and the light-mode
  contrast between page and card is thin.
- **Rounded rules and pills**: rejected; pills read as a different product.
- **Screen-by-screen edits**: rejected; values typed in twenty places drift between
  schemes and break the tokens rule on day one.
- **Native component swap**: rejected; new dependencies against the stack guardrails for
  a gain not asked for.

## Testing

- Unit, written first: `plateStyles.test.ts` cases for each shape and press kind,
  including Reduced Motion; `inputStyles.test.ts` for the shared input shape and hairline;
  `segmentStyles` clip behaviour.
- Guard: a new `noRawRadius.test.ts` scans `src/` and `app/` and fails on any
  `borderRadius: <number>` not sourced from `theme.radius`, and on any
  `borderWidth: theme.depth.hairline` inside a `TextInput` style outside `inputStyles.ts`.
- Existing: `contrast.test.ts` runs against the new surface/border values;
  `noRawHex.test.ts` unchanged.
- Device/simulator: Release build, dark and light, every screen screenshotted before and
  after, shown side by side on the companion page for a final owner look before the
  TestFlight build.

## Rollout

Single branch on top of `fix/build-8-wordmark-and-signin-code`; ships as TestFlight
build 10 together with the wordmark, sign-in code, and poster fixes. No data or backend
change. If the owner rejects the look on device, the change reverts as one commit; the
tokens and guard test are worth keeping either way.

## Open questions

None.
