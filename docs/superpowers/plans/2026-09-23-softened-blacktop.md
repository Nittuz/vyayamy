# Softened Blacktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round every surface in the app through the theme (control 6 / card 8 / sheet 16), lift surfaces one step with a hairline, and give cards a scale press and rows a highlight press, without any screen carrying a shape or press number of its own.

**Architecture:** Tokens live in `src/ui/useTheme.tsx` and `src/ui/colors.ts`; every shape and press decision is resolved by the pure style resolvers (`plateStyles.ts`, new `inputStyles.ts`) that the primitives (`Plate`, `Button`, `Segment`, `Sheet`, `Toast`) consume, so screens inherit the change. A guard test fails on raw radii or hand-rolled input borders so the shapes cannot drift back. Spec: `docs/specs/2026-09-23-softened-blacktop-spec.md`.

**Tech Stack:** Expo SDK 56 / React Native 0.85, TypeScript strict, react-native-reanimated (Plate press animation), Jest + ts-jest (node environment with a stubbed `react-native`: components are NOT renderable in tests, so tests target pure resolvers and file scans).

## Global constraints

- Branch: continue on `fix/build-8-wordmark-and-signin-code` (the spec's rollout ships all of it as build 10).
- Every code step is test-first. Run only the named test file for the red/green checks; run the whole suite (`npm test`) before each commit.
- Never type a number for a radius or an input border in a screen or component. If a step needs one, it comes from `theme.radius.*` or `resolveInputStyle`.
- `theme.color.*` names do not change. Only three hex values move, in `src/ui/colors.ts`.
- Format with `npx prettier --write <files>` before every commit (CI enforces it). `npm run typecheck` must be clean before every commit.
- Commit messages: conventional type + scope, a body explaining why, and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Spec items that need no task

- **Tab bar** (`app/(tabs)/_layout.tsx`): its top hairline already reads `theme.color.border`, so the softened value from Task 2 reaches it with no edit. It stays flat.
- **Progress legend chips**: the spec lists them, but Progress has no chip elements (verified by grep on 2026-09-23); its controls are `Segment`, covered by Task 8.
- **PlanSetup day chips**: they are `Plate`s and inherit the card shape from Task 3.
- **Today "Recent" rows**: plain non-pressable Views; nothing to press, so no change.
- **SyncIndicator, OutlineDisplay, Text, LineChart**: untouched.

## File map

| File                                                                                                                                                 | Responsibility in this change                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/ui/useTheme.tsx`                                                                                                                                | Radius scale tokens (`control`, `card`, `sheet`, `full`).                                                |
| `src/ui/colors.ts`                                                                                                                                   | Three palette values: dark `surface`, dark `border`, light `border`.                                     |
| `src/ui/plateStyles.ts`                                                                                                                              | Pure resolver: `shape` → `borderRadius`; press constants and `resolvePressedStyle(reduceMotion, press)`. |
| `src/ui/Plate.tsx`                                                                                                                                   | `shape` and `press` props; highlight tint layer animated on press.                                       |
| `src/ui/Button.tsx`                                                                                                                                  | `shape="control"`; scale press for filled kinds, highlight for the rest.                                 |
| `src/ui/inputStyles.ts` (new)                                                                                                                        | `resolveInputStyle(theme)`: the one text-input style.                                                    |
| `src/screens/Login.tsx`, `src/screens/Profile.tsx`, `src/screens/PlanSetup.tsx`, `src/components/NoteSheet.tsx`, `src/components/ExercisePicker.tsx` | Consume `resolveInputStyle`.                                                                             |
| `src/components/NumericStepperView.tsx`, `src/components/ActiveSetCard.tsx`                                                                          | Stepper keys `radius.control`; set card box `radius.card`.                                               |
| `src/ui/Segment.tsx`                                                                                                                                 | Each option Plate `shape="control"`.                                                                     |
| `src/ui/Sheet.tsx`, `src/ui/ToastContext.tsx`                                                                                                        | Sheet top corners + hairline + round handle; toast `radius.card`.                                        |
| `src/screens/History.tsx`, `src/screens/Profile.tsx`, `src/screens/Today.tsx`                                                                        | Row Plates take `press="highlight"`.                                                                     |
| `src/ui/__tests__/noRawRadius.test.ts` (new)                                                                                                         | Guard: no raw radii, no hand-rolled input borders.                                                       |
| `docs/design-system.md`, `AGENTS.md`                                                                                                                 | Rules rewritten for the new scale and press model.                                                       |

---

### Task 1: Radius scale tokens

**Files:**

- Modify: `src/ui/useTheme.tsx:23-27`
- Test: `src/ui/__tests__/radiusTokens.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Softened Blacktop (spec 2026-09-23): one radius scale for the whole app.
 * control 6 (buttons, inputs, segments, keys), card 8 (Plates, rows, toasts),
 * sheet 16 (bottom-sheet top corners), full (circles). Nothing else exists,
 * so no screen can invent an in-between value.
 */
import { buildTheme } from '@/ui/useTheme';

test('the radius scale is exactly control / card / sheet / full', () => {
  const theme = buildTheme('dark');
  expect(theme.radius).toEqual({ control: 6, card: 8, sheet: 16, full: 9999 });
  // Same object in light: shape is scheme-independent.
  expect(buildTheme('light').radius).toEqual(theme.radius);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/radiusTokens.test.ts`
Expected: FAIL — received `{ full: 9999 }`, expected the four-entry object.

- [ ] **Step 3: Replace the radius block in `src/ui/useTheme.tsx`**

Replace lines 23-27 (the "Blacktop shape lock" comment and the one-entry object) with:

```ts
// Softened Blacktop radius scale (spec 2026-09-23). Small on purpose: the
// rules and flat surfaces still carry the form; rounding takes the edge off.
//   control — buttons, inputs, segments, stepper keys
//   card    — Plates, list rows, toasts, banners
//   sheet   — top corners of bottom sheets
//   full    — circles only (avatar, sync dot, sheet handle)
const radius = {
  control: 6,
  card: 8,
  sheet: 16,
  full: 9999,
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/ui/__tests__/radiusTokens.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck, full suite, commit**

```bash
npm run typecheck && npm test
git add src/ui/useTheme.tsx src/ui/__tests__/radiusTokens.test.ts
git commit -m "feat(theme): radius scale — control 6, card 8, sheet 16, full

Softened Blacktop (docs/specs/2026-09-23-softened-blacktop-spec.md): the
all-sharp shape lock is retired in favour of one small scale that every
primitive reads from. Nothing consumes the new entries yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Surface lift in the palette

**Files:**

- Modify: `src/ui/colors.ts:44-47` (dark) and `src/ui/colors.ts:65-68` (light)
- Test: existing `src/ui/__tests__/contrast.test.ts` and `src/ui/__tests__/noRawHex.test.ts`

Palette values are configuration; the behaviour guard is the existing contrast suite, which must stay green against the new values.

- [ ] **Step 1: Change the three values**

In `darkPalette`:

```ts
  surface: '#1C1C1B',
  surface2: '#232322',
  border: '#2E2E2C',
```

(`surface2` is unchanged; it is shown so the three lines read together.) In `lightPalette`:

```ts
  border: '#D6D5CE',
```

Add this comment directly above `export const darkPalette`:

```ts
// Surface lift (Softened Blacktop, spec 2026-09-23): `surface` sits one step
// above `bg` and `border` is a soft hairline that defines rather than
// outlines. Every ink on surface/surface2 is still checked by contrast.test.ts.
```

- [ ] **Step 2: Run the contrast and raw-hex guards**

Run: `npx jest src/ui/__tests__/contrast.test.ts src/ui/__tests__/noRawHex.test.ts`
Expected: PASS. If any contrast case fails, stop and report the pair; do not lower a ratio.

- [ ] **Step 3: Typecheck, full suite, commit**

```bash
npm run typecheck && npm test
git add src/ui/colors.ts
git commit -m "feat(palette): lift dark surface one step, soften both hairlines

Softened Blacktop surface model: cards separate from the page by a lifted
fill plus a hairline, not by rule alone. Dark surface #1A1A19 -> #1C1C1B,
dark border #333331 -> #2E2E2C, light border #CFCEC6 -> #D6D5CE. Contrast
suite unchanged and green.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Plate style resolver — shape and press

**Files:**

- Modify: `src/ui/plateStyles.ts` (options, face, press constants)
- Test: `src/ui/__tests__/plateStyles.test.ts`

- [ ] **Step 1: Rewrite the shape and press tests**

In `src/ui/__tests__/plateStyles.test.ts`, update the import to:

```ts
import {
  canonicalTone,
  PRESS_DIP_OPACITY,
  PRESS_HIGHLIGHT_OPACITY,
  PRESS_SCALE,
  PRESS_SCALE_OPACITY,
  resolvePlateStyles,
  resolvePressedStyle,
} from '@/ui/plateStyles';
```

In the `panel (default)` test, replace the two lines

```ts
// Blacktop shape lock: faces carry no borderRadius at all.
expect(s.face).not.toHaveProperty('borderRadius');
```

with

```ts
// Softened Blacktop: the default shape is a card.
expect(s.face.borderRadius).toBe(theme.radius.card);
```

Replace the whole `corners are sharp` test with:

```ts
test('shape picks the radius: card by default, control for keys, none for bare', () => {
  for (const tone of ['panel', 'inverted', 'ghost', 'volt', 'danger'] as const) {
    expect(resolvePlateStyles(theme, { tone }).face.borderRadius).toBe(theme.radius.card);
    expect(resolvePlateStyles(theme, { tone, shape: 'control' }).face.borderRadius).toBe(
      theme.radius.control,
    );
    expect(resolvePlateStyles(theme, { tone, shape: 'none' }).face).not.toHaveProperty(
      'borderRadius',
    );
  }
});
```

Replace the whole `press = opacity dip` test with:

```ts
test('scale press: 0.975 scale with a mild darken; reduced motion keeps only the darken', () => {
  expect(resolvePressedStyle(false, 'scale')).toEqual({
    opacity: PRESS_SCALE_OPACITY,
    transform: [{ scale: PRESS_SCALE }],
  });
  expect(resolvePressedStyle(true, 'scale')).toEqual({ opacity: PRESS_SCALE_OPACITY });
  expect(PRESS_SCALE).toBe(0.975);
  expect(PRESS_SCALE_OPACITY).toBe(0.92);
  // Default press is scale.
  expect(resolvePressedStyle(false)).toEqual(resolvePressedStyle(false, 'scale'));
});

test('highlight press never moves or dims the face — the tint layer carries it', () => {
  expect(resolvePressedStyle(false, 'highlight')).toEqual({});
  expect(resolvePressedStyle(true, 'highlight')).toEqual({});
  expect(PRESS_HIGHLIGHT_OPACITY).toBe(0.08);
});

test('flat pressables keep the legacy dip constant for their own opacity', () => {
  expect(PRESS_DIP_OPACITY).toBe(0.8);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/plateStyles.test.ts`
Expected: FAIL — `PRESS_SCALE` / `PRESS_HIGHLIGHT_OPACITY` not exported, `borderRadius` undefined.

- [ ] **Step 3: Implement in `src/ui/plateStyles.ts`**

Add after the `PlateBorder` type:

```ts
/** Corner treatment (Softened Blacktop). `none` is for faces inside a rule-separated list. */
export type PlateShape = 'card' | 'control' | 'none';

/**
 * Press response. `scale` (cards, filled buttons): a 0.975 scale plus a mild
 * darken. `highlight` (list rows, outlined/ghost buttons): a fill tint, no
 * movement — the iOS list-row feel. Reduced Motion drops the scale.
 */
export type PlatePress = 'scale' | 'highlight';
```

Extend `PlateStyleOptions`:

```ts
export interface PlateStyleOptions {
  /** Ignored — the offset slab retired with the Blacktop overhaul. */
  offset?: PlateOffset;
  tone?: PlateTone;
  /** Omit to take the tone's default (panel: soft hairline; others: none). */
  border?: PlateBorder;
  /** Omit for `card`. */
  shape?: PlateShape;
}
```

In `resolvePlateStyles`, replace

```ts
const { tone = 'panel' } = options;
const appearance = toneAppearance(theme, canonicalTone(tone));
const border = options.border ?? appearance.defaultBorder;

// Blacktop shape lock: faces are all-sharp — no borderRadius at all.
const face: ViewStyle = {
  backgroundColor: appearance.fill,
  ...borderStyle(theme, border),
};
```

with

```ts
const { tone = 'panel', shape = 'card' } = options;
const appearance = toneAppearance(theme, canonicalTone(tone));
const border = options.border ?? appearance.defaultBorder;

const face: ViewStyle = {
  backgroundColor: appearance.fill,
  ...borderStyle(theme, border),
  ...(shape === 'none' ? {} : { borderRadius: theme.radius[shape] }),
};
```

Replace the press block (from `/** Press feedback targets` to the end of `resolvePressedStyle`) with:

```ts
/**
 * Press feedback targets (Softened Blacktop, spec 2026-09-23).
 * `scale`: cards and filled buttons shrink to 0.975 and darken to 0.92 over
 * motion.duration.press. `highlight`: rows and outlined/ghost buttons tint
 * their fill by 8% of the foreground ink, no movement. PRESS_DIP_OPACITY is
 * the legacy dip still used by flat, non-Plate pressables (keypad keys).
 */
export const PRESS_SCALE = 0.975;
export const PRESS_SCALE_OPACITY = 0.92;
export const PRESS_HIGHLIGHT_OPACITY = 0.08;
export const PRESS_DIP_OPACITY = 0.8;

/**
 * The pressed-state target for the FACE. Highlight returns nothing here: its
 * response is the tint layer Plate renders over the face. Reduced motion
 * drops the scale component of `scale` (Plate applies it instantly).
 */
export function resolvePressedStyle(reduceMotion: boolean, press: PlatePress = 'scale'): ViewStyle {
  if (press === 'highlight') return {};
  return reduceMotion
    ? { opacity: PRESS_SCALE_OPACITY }
    : { opacity: PRESS_SCALE_OPACITY, transform: [{ scale: PRESS_SCALE }] };
}
```

Delete the old `PRESS_DIP_SCALE` export. Update the file's header comment: replace "Blacktop materiality: shadows are retired — a Plate is a flat face whose tone decides fill, foreground ink, and default border." with "Softened Blacktop: a Plate is a flat, lightly rounded face whose tone decides fill, foreground ink, and default border, and whose shape decides the radius."

- [ ] **Step 4: Fix the two remaining importers of the deleted constant**

`src/ui/Plate.tsx` imports `PRESS_DIP_SCALE` — Task 4 rewrites that file; for now the typecheck will fail there, which is expected until Task 4 lands. Run only the resolver test in this task.

Run: `npx jest src/ui/__tests__/plateStyles.test.ts`
Expected: PASS.

- [ ] **Step 5: Continue to Task 4 before committing** (the repo must typecheck at every commit).

---

### Task 4: Plate — shape and press props, highlight tint layer

**Files:**

- Modify: `src/ui/Plate.tsx`
- Test: none renderable (node jest); the resolver is covered by Task 3. Verification is the simulator pass in Task 13.

- [ ] **Step 1: Rewrite the header comment and imports**

Replace the file header comment with:

```ts
/**
 * Plate — the Softened Blacktop card primitive.
 *
 * A flat, lightly rounded face whose tone decides fill, ink, and border and
 * whose `shape` decides the radius (card / control / none — see
 * plateStyles.ts). Press feedback is one of two responses: `scale` (cards,
 * filled buttons: 0.975 scale + darken over motion.duration.press) or
 * `highlight` (rows, outlined/ghost buttons: a tint layer over the face, no
 * movement). Reduced motion: scale drops its transform and both responses
 * apply instantly. Style maths live in plateStyles.ts (pure, tested).
 */
```

Replace the `plateStyles` import with:

```ts
import {
  PRESS_HIGHLIGHT_OPACITY,
  PRESS_SCALE,
  PRESS_SCALE_OPACITY,
  resolvePlateStyles,
  type PlateBorder,
  type PlateOffset,
  type PlatePress,
  type PlateShape,
  type PlateTone,
} from './plateStyles';
```

and add `StyleSheet` to the `react-native` import list.

- [ ] **Step 2: Add the props**

In `PlateProps`, after `border?: PlateBorder;` add:

```ts
  /** Corner treatment; omit for `card`. `none` for rows inside a rule-separated list. */
  shape?: PlateShape;
  /** Press response; omit for `scale`. Rows and outlined controls pass `highlight`. */
  press?: PlatePress;
```

In the destructuring add `shape = 'card',` after `border,` and `press = 'scale',` after `onLongPress,`. Change the resolver call to `resolvePlateStyles(theme, { tone, border, shape })`.

- [ ] **Step 3: Replace the press handlers and animated styles**

Replace everything from `const faceOpacity = useSharedValue(1);` through the `pressedFace` `useAnimatedStyle` with:

```ts
const faceOpacity = useSharedValue(1);
const faceScale = useSharedValue(1);
const tintOpacity = useSharedValue(0);
const pressMs = theme.motion.duration.press;

const handlePressIn = useCallback(() => {
  if (press === 'highlight') {
    tintOpacity.value = reduceMotionRef.current
      ? PRESS_HIGHLIGHT_OPACITY
      : withTiming(PRESS_HIGHLIGHT_OPACITY, { duration: pressMs });
    return;
  }
  if (reduceMotionRef.current) {
    faceOpacity.value = PRESS_SCALE_OPACITY;
    return;
  }
  faceOpacity.value = withTiming(PRESS_SCALE_OPACITY, { duration: pressMs });
  faceScale.value = withTiming(PRESS_SCALE, { duration: pressMs });
}, [press, faceOpacity, faceScale, tintOpacity, pressMs]);

const handlePressOut = useCallback(() => {
  if (press === 'highlight') {
    tintOpacity.value = reduceMotionRef.current ? 0 : withTiming(0, { duration: pressMs });
    return;
  }
  if (reduceMotionRef.current) {
    faceOpacity.value = 1;
    return;
  }
  faceOpacity.value = withTiming(1, { duration: pressMs });
  faceScale.value = withTiming(1, { duration: pressMs });
}, [press, faceOpacity, faceScale, tintOpacity, pressMs]);

const pressedFace = useAnimatedStyle(() => ({
  opacity: faceOpacity.value,
  transform: [{ scale: faceScale.value }],
}));
const tintStyle = useAnimatedStyle(() => ({ opacity: tintOpacity.value }));
```

- [ ] **Step 4: Render the tint layer inside the pressable**

Replace the pressable return with:

```tsx
return (
  <View style={[s.container, dim, style]}>
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
      style={[s.face, pressedFace, faceStyle]}
    >
      {children}
      {press === 'highlight' ? (
        // The highlight: the face's own foreground ink at PRESS_HIGHLIGHT_OPACITY,
        // clipped to the face's corners. Sits above the children so the tint
        // covers text too, exactly like a native list-row highlight.
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: s.ink, borderRadius: s.face.borderRadius },
            tintStyle,
          ]}
        />
      ) : null}
    </AnimatedPressable>
  </View>
);
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npx eslint src/ui/Plate.tsx src/ui/plateStyles.ts`
Expected: no errors. If `react-hooks/immutability` warns about assigning `.value` inside the callbacks, it is the same pre-existing warning class as `useCompleteSetAnimation.ts`; leave it.

- [ ] **Step 6: Full suite and commit Tasks 3 + 4 together**

```bash
npm test
npx prettier --write src/ui/Plate.tsx src/ui/plateStyles.ts src/ui/__tests__/plateStyles.test.ts
git add src/ui/Plate.tsx src/ui/plateStyles.ts src/ui/__tests__/plateStyles.test.ts
git commit -m "feat(plate): shape (card/control/none) and press (scale/highlight)

Softened Blacktop: the face takes its radius from theme.radius via a shape
prop, and presses are one of two named responses — scale (0.975 + darken
to 0.92) for cards and filled buttons, highlight (an 8% ink tint layer, no
movement) for rows. Reduced motion drops the scale and applies instantly.
Every existing Plate call site keeps compiling with the card/scale defaults.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Button — control shape, press per kind

**Files:**

- Modify: `src/ui/Button.tsx`

No new pure logic; the mapping is two props. Covered by Task 3's resolver tests and the Task 13 simulator pass.

- [ ] **Step 1: Pass shape and press**

In the `<Plate` element inside `Button`, after `border={kind === 'danger' ? 'soft' : undefined}` add:

```tsx
      shape="control"
      press={isFilledKind ? 'scale' : 'highlight'}
```

Update the header comment's last sentence to end with: "Filled kinds (primary, inverted) press with the scale response; secondary, ghost, and danger press with the highlight."

- [ ] **Step 2: Typecheck, suite, commit**

```bash
npm run typecheck && npm test
npx prettier --write src/ui/Button.tsx
git add src/ui/Button.tsx
git commit -m "feat(button): control radius; scale press on filled kinds, highlight on the rest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: One shared input style

**Files:**

- Create: `src/ui/inputStyles.ts`
- Test: `src/ui/__tests__/inputStyles.test.ts` (new)
- Modify: `src/screens/Login.tsx:402-411`, `src/screens/Profile.tsx:334-343`, `src/screens/PlanSetup.tsx:495-504`, `src/components/NoteSheet.tsx:163-170`, `src/components/ExercisePicker.tsx:156-166`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * One text-input style for the whole app (Softened Blacktop). Seven screens
 * used to hand-roll this; drift showed as three different heights and two
 * border colors. Consumers spread it and override only what a field needs
 * (multiline height, a stronger border on the dark Login poster).
 */
import { resolveInputStyle } from '@/ui/inputStyles';
import { buildTheme } from '@/ui/useTheme';

const theme = buildTheme('dark');

test('input: 48pt tall, page fill, soft hairline, control radius, body sans in ink', () => {
  expect(resolveInputStyle(theme)).toEqual({
    height: theme.touch.min + 4,
    paddingHorizontal: theme.space.s4,
    borderWidth: theme.depth.hairline,
    borderColor: theme.color.border,
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.size.body,
    fontFamily: theme.font.family.sans,
    color: theme.color.ink,
  });
});

test('the style is scheme-aware: light mode swaps fill, border, and ink', () => {
  const light = resolveInputStyle(buildTheme('light'));
  expect(light.backgroundColor).toBe(buildTheme('light').color.bg);
  expect(light.color).toBe(buildTheme('light').color.ink);
  expect(light.borderRadius).toBe(theme.radius.control);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/inputStyles.test.ts`
Expected: FAIL — cannot find module `@/ui/inputStyles`.

- [ ] **Step 3: Create `src/ui/inputStyles.ts`**

```ts
/**
 * The one text-input style (Softened Blacktop, spec 2026-09-23). Pure, like
 * plateStyles.ts, so it is unit-testable. Screens spread the result and
 * override only what a field genuinely needs (NoteSheet's multiline height,
 * Login's stronger hairline on the pinned-dark poster). The noRawRadius guard
 * fails any TextInput style that draws its own border elsewhere.
 */
import type { TextStyle } from 'react-native';

import type { Theme } from './useTheme';

export function resolveInputStyle(theme: Theme): TextStyle {
  return {
    height: theme.touch.min + 4,
    paddingHorizontal: theme.space.s4,
    borderWidth: theme.depth.hairline,
    borderColor: theme.color.border,
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.size.body,
    fontFamily: theme.font.family.sans,
    color: theme.color.ink,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/ui/__tests__/inputStyles.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Migrate the five consumers**

Each file adds `import { resolveInputStyle } from '@/ui/inputStyles';` next to its other `@/ui` imports.

`src/screens/Login.tsx` — replace the `input` style block (lines 402-411) with:

```ts
    // Shared input; the pinned-dark poster keeps the stronger hairline so the
    // field reads against #121212 (border alone is too quiet here).
    input: { ...resolveInputStyle(theme), borderColor: theme.color.borderStrong },
```

`src/screens/Profile.tsx` — replace the `input` block (lines 334-343) with:

```ts
    input: resolveInputStyle(theme),
```

`src/screens/PlanSetup.tsx` — replace the `input` block (lines 495-504) with:

```ts
    input: resolveInputStyle(theme),
```

`src/components/NoteSheet.tsx` — replace the `input` block (lines 163-170) with:

```ts
    input: {
      ...resolveInputStyle(theme),
      // Multiline note: grows from 72pt, text anchored to the top.
      height: undefined,
      minHeight: 72,
      paddingVertical: theme.space.s3,
      textAlignVertical: 'top',
    },
```

`src/components/ExercisePicker.tsx` — replace the `search` block (lines 156-166) with:

```ts
    search: {
      ...resolveInputStyle(theme),
      height: theme.touch.min,
      marginBottom: theme.space.s3,
    },
```

- [ ] **Step 6: Typecheck, suite, commit**

```bash
npm run typecheck && npm test
npx prettier --write src/ui/inputStyles.ts src/ui/__tests__/inputStyles.test.ts src/screens/Login.tsx src/screens/Profile.tsx src/screens/PlanSetup.tsx src/components/NoteSheet.tsx src/components/ExercisePicker.tsx
git add src/ui/inputStyles.ts src/ui/__tests__/inputStyles.test.ts src/screens/Login.tsx src/screens/Profile.tsx src/screens/PlanSetup.tsx src/components/NoteSheet.tsx src/components/ExercisePicker.tsx
git commit -m "feat(inputs): one shared text-input style, control radius

Softened Blacktop: resolveInputStyle replaces five hand-rolled input styles
(Login, Profile, PlanSetup, NoteSheet, ExercisePicker search) that had
drifted to three heights and two border colors. Consumers spread it and
override only a multiline height or Login's stronger hairline.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Stepper keys and the active set card

**Files:**

- Modify: `src/components/NumericStepperView.tsx:341-345`
- Modify: `src/components/ActiveSetCard.tsx:366-376`

- [ ] **Step 1: Round the stepper keys**

In `NumericStepperView.tsx`, the `stepKey` style becomes:

```ts
    stepKey: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.depth.hairline,
      borderRadius: theme.radius.control,
    },
```

- [ ] **Step 2: Round the set card box**

In `ActiveSetCard.tsx`, inside the style block that carries the comment `// Panel materiality: flat surface + 1.5px hairline (slab depth retired).`, add after `borderColor: theme.color.border,`:

```ts
      borderRadius: theme.radius.card,
```

- [ ] **Step 3: Typecheck, suite, commit**

```bash
npm run typecheck && npm test
npx prettier --write src/components/NumericStepperView.tsx src/components/ActiveSetCard.tsx
git add src/components/NumericStepperView.tsx src/components/ActiveSetCard.tsx
git commit -m "feat(workout): stepper keys take the control radius, the set card the card radius

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Segment options

**Files:**

- Modify: `src/ui/Segment.tsx`

The spec described "an outer frame"; the shipped Segment is a row of separate Plates with an 8pt gap, so each option rounds on its own. That is the equivalent treatment and needs no new layout.

- [ ] **Step 1: Pass the shape**

In the `<Plate` inside `Segment`, after `border={a.border}` add:

```tsx
shape = 'control';
press = 'highlight';
```

Update the header comment's first paragraph to end: "Each option is a control-shaped Plate with the highlight press (it is a selector, not a card)."

- [ ] **Step 2: Typecheck, suite, commit**

```bash
npm run typecheck && npm test
npx prettier --write src/ui/Segment.tsx
git add src/ui/Segment.tsx
git commit -m "feat(segment): options take the control radius and the highlight press

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Sheets and toast

**Files:**

- Modify: `src/ui/Sheet.tsx:187-200`
- Modify: `src/ui/ToastContext.tsx` (the `toast` style)

- [ ] **Step 1: Sheet bottom panel and handle**

In `src/ui/Sheet.tsx` replace the `bottomPanel` and `handle` styles with:

```ts
    bottomPanel: {
      backgroundColor: theme.color.surface,
      // Softened Blacktop: the heavy top rule becomes the same hairline as
      // cards, and the panel's top corners take the sheet radius.
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
      borderTopLeftRadius: theme.radius.sheet,
      borderTopRightRadius: theme.radius.sheet,
      paddingHorizontal: theme.space.page,
      paddingBottom: theme.space.s8,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: theme.radius.full,
      backgroundColor: theme.color.borderStrong,
      marginTop: theme.space.s3,
      marginBottom: theme.space.s2,
    },
```

The center variant renders `centerPlate.face`, which now carries the card radius from Task 3; no change there.

- [ ] **Step 2: Toast**

In `src/ui/ToastContext.tsx`, in the `toast` style, add after `backgroundColor: theme.color.ink,`:

```ts
      borderRadius: theme.radius.card,
```

- [ ] **Step 3: Typecheck, suite, commit**

```bash
npm run typecheck && npm test
npx prettier --write src/ui/Sheet.tsx src/ui/ToastContext.tsx
git add src/ui/Sheet.tsx src/ui/ToastContext.tsx
git commit -m "feat(sheet,toast): sheet top corners + hairline + round handle; toast card radius

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: List rows take the highlight press

**Files:**

- Modify: `src/screens/History.tsx:155-162`
- Modify: `src/screens/Profile.tsx:228-231` and `:260-263`
- Modify: `src/screens/Today.tsx:359-362`

Today's "Recent" rows are plain, non-pressable Views (`recentRow` style) and stay as they are.

- [ ] **Step 1: History rows**

History rows sit in a rule-separated list (a hairline top rule per row), so they take no corner radius; the highlight tint runs edge to edge like a native list. In the `<Plate` inside the history row component, after `tone="ghost"` add:

```tsx
shape = 'none';
press = 'highlight';
```

- [ ] **Step 2: Profile rows**

Both `<Plate tone="ghost" border="soft" ...>` rows (rest alerts at line 228, training plan at line 260) get, after `border="soft"`:

```tsx
press = 'highlight';
```

- [ ] **Step 3: Today's sync row**

The `<Plate tone="panel" border="soft" onPress={() => setSyncSheetOpen(true)} ...>` at line 359 gets, after `border="soft"`:

```tsx
press = 'highlight';
```

- [ ] **Step 4: Typecheck, suite, commit**

```bash
npm run typecheck && npm test
npx prettier --write src/screens/History.tsx src/screens/Profile.tsx src/screens/Today.tsx
git add src/screens/History.tsx src/screens/Profile.tsx src/screens/Today.tsx
git commit -m "feat(rows): list rows press with the highlight, not the scale

History rows (rule-separated, no radius), Profile's rest-alerts and
training-plan rows, and Today's sync row tint on press like native list
rows; cards keep the scale response.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Guard test — no raw radii, no hand-rolled input borders

**Files:**

- Create: `src/ui/__tests__/noRawRadius.test.ts`

- [ ] **Step 1: Write the guard**

```ts
/**
 * Conventions guard (Softened Blacktop): every corner comes from
 * theme.radius, and every TextInput border comes from resolveInputStyle.
 * A raw `borderRadius: 12` or a hand-drawn input border is exactly how the
 * seven drifting input styles happened. This scans src/ and app/ the same
 * way noRawHex.test.ts scans for colors.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOTS = [join(__dirname, '..', '..'), join(__dirname, '..', '..', '..', 'app')];

// The only files allowed to write a radius or an input border from scratch.
const ALLOWED = new Set([
  join(__dirname, '..', 'useTheme.tsx'), // the scale itself
  join(__dirname, '..', 'inputStyles.ts'), // the one input style
]);

// `borderRadius: 12` / `borderTopLeftRadius: 0` etc. with a numeric literal.
const RAW_RADIUS = /border(?:Top|Bottom)?(?:Left|Right)?Radius:\s*-?\d/;
// A style key named input/search that draws its own border.
const RAW_INPUT_BORDER = /^\s*(?:input|search)\w*:\s*\{[^}]*borderWidth/s;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === '__mocks__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no raw radii or hand-rolled input borders outside the tokens', () => {
  const files = ROOTS.flatMap((root) => walk(root));

  test('there is something to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    if (ALLOWED.has(file)) continue;
    const rel = file.slice(ROOTS[0].length - 'src'.length);
    test(`${rel} takes every radius from theme.radius`, () => {
      const offending = readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RAW_RADIUS.test(line));
      expect(offending.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
    });
    test(`${rel} does not draw its own input border`, () => {
      const source = readFileSync(file, 'utf8');
      // Style blocks are short; scan each `key: {` … `}` run.
      const blocks = source.match(/^\s*(?:input|search)\w*:\s*\{[^}]*\}/gms) ?? [];
      const offending = blocks.filter((b) => RAW_INPUT_BORDER.test(b));
      expect(offending).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run the guard**

Run: `npx jest src/ui/__tests__/noRawRadius.test.ts`
Expected: PASS after Tasks 1-10. If any file fails, that file still carries a raw value: fix it by reading from `theme.radius.*` or `resolveInputStyle`, never by adding it to `ALLOWED`.

- [ ] **Step 3: Prove the guard bites**

Temporarily add `borderRadius: 12,` to the `stepKey` style in `src/components/NumericStepperView.tsx`, run the guard, confirm it FAILS naming that line, then revert the line with `git checkout src/components/NumericStepperView.tsx`.

- [ ] **Step 4: Commit**

```bash
npm test
npx prettier --write src/ui/__tests__/noRawRadius.test.ts
git add src/ui/__tests__/noRawRadius.test.ts
git commit -m "test(ui): guard against raw radii and hand-rolled input borders

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Docs and the agent rule

**Files:**

- Modify: `docs/design-system.md` (lines 36-38, 78-84, 119, 162-164, 198-200)
- Modify: `AGENTS.md:97`

- [ ] **Step 1: Design principles (lines 36-38)**

Replace the two bullets "Depth is a slab, not a blur" and "Pressed = sink" with:

```md
- **Depth is a lift plus a hairline**: cards and rows sit one step lighter than the page (`surface`) with a 1.5px `border` hairline; corners take the small radius scale. No native shadows, no blur, no gradients.
- **Pressed = scale or highlight**: cards and filled buttons scale to 0.975 with a mild darken; list rows and outlined controls tint their fill (`Plate`'s `press` prop). Reduced Motion drops the scale.
```

- [ ] **Step 2: Radius and Depth sections (lines 78-84)**

Replace both sections with:

```md
### Radius

`control` (6): buttons, inputs, segments, stepper keys. `card` (8): Plates, list rows, toasts, banners. `sheet` (16): the top corners of bottom sheets. `full` (9999): circles only. Rows inside a rule-separated list use `shape="none"`. Never a raw number — `noRawRadius.test.ts` fails the build.

### Depth & press

`depth.hairline` (1.5): the Plate and input border. `depth.rule` (2) / `depth.ruleHeavy` (3): section rules. Press: `scale` (0.975, opacity 0.92) for cards and filled buttons, `highlight` (8% ink tint, no movement) for rows and outlined controls; both over `motion.duration.press`.
```

- [ ] **Step 3: Components table (line 119) and pressables (line 164)**

Replace the `Plate` bullet with:

```md
- **`Plate`** ([src/ui/Plate.tsx](../src/ui/Plate.tsx)) — the card: flat `surface` face + 1.5px hairline, `shape` (`card` default / `control` / `none`) for the radius, `press` (`scale` default / `highlight`) for the pressed response. `onPress` makes the face a Pressable.
```

Replace the Pressables paragraph with:

```md
Always `<Pressable>`. Plate-based controls express pressed state through `Plate`'s `press` prop: `scale` on cards and filled buttons, `highlight` on rows and outlined controls. No opacity-only fades on primary controls.
```

- [ ] **Step 4: Recipes (lines 198-200)**

Replace the Cards and Inputs bullets with:

```md
- Cards: `Plate` with `faceStyle: { padding: theme.space.s4 }` — never hand-rolled `borderRadius`+`borderWidth` views
- Inputs: `style={resolveInputStyle(theme)}` from [src/ui/inputStyles.ts](../src/ui/inputStyles.ts); spread and override only a multiline height
```

- [ ] **Step 5: AGENTS.md rule (line 97)**

Replace the sentence "Corners are sharp by design — no `borderRadius` except `theme.radius.full` for circles." with "Shapes come from the radius tokens (`theme.radius.control` / `card` / `sheet` / `full`), never a raw number; text inputs take `resolveInputStyle(theme)`."

- [ ] **Step 6: Commit**

```bash
npx prettier --write docs/design-system.md AGENTS.md
git add docs/design-system.md AGENTS.md
git commit -m "docs(design-system): Softened Blacktop — radius scale, lift + hairline, scale/highlight press

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Spacing audit and simulator verification

**Files:**

- Possibly modify: any screen under `src/screens/` whose section spacing deviates
- Output: side-by-side screenshots on the brainstorm companion page

- [ ] **Step 1: Spacing audit**

Run:

```bash
grep -n "marginTop: theme.space.s[0-9]*\b\|gap: theme.space.s[0-9]*\b\|marginBottom: theme.space.s[0-9]*\b" src/screens/Today.tsx src/screens/History.tsx src/screens/Progress.tsx src/screens/Profile.tsx src/screens/Login.tsx src/screens/PlanSetup.tsx src/screens/TrainingPlan.tsx src/screens/HistoryDetail.tsx
```

For each hit, decide by the rule: a gap between two sections must be `theme.space.section`; padding inside a card `theme.space.s4`; the gap between rows in one list `theme.space.s2`. Change only values that break the rule; do not move elements. Commit as `style(screens): section rhythm — 32 between sections, 16 in cards, 8 between rows` with the same trailer.

- [ ] **Step 2: Release build on the simulator, both schemes**

```bash
SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo run:ios --configuration Release --device A0E9BAE3-5776-48BF-8DA2-0F60AA8068A8 --no-bundler
```

Then, for `dark` and `light`:

```bash
xcrun simctl ui A0E9BAE3-5776-48BF-8DA2-0F60AA8068A8 appearance dark   # then light
xcrun simctl terminate A0E9BAE3-5776-48BF-8DA2-0F60AA8068A8 com.mokshlabs.flexyug; xcrun simctl launch A0E9BAE3-5776-48BF-8DA2-0F60AA8068A8 com.mokshlabs.flexyug
```

Screenshot Login, then sign in (the owner types the password in the simulator panel), then Today, Workout (start the scheduled workout, open the exercise picker and the note sheet), History, Progress, Profile, and the discard ConfirmSheet, with `xcrun simctl io <udid> screenshot --type=png <scheme>-<screen>.png` into the scratchpad. Discard the test workout afterwards so no data reaches the account.

- [ ] **Step 3: Before/after page**

The "before" screenshots are the build 9 captures already in the scratchpad (`final-1.png`, `poster-before.png`) plus the owner's device screenshots; take any missing "before" from the `main` branch build if needed. Write `<screen_dir>/review.html` on the companion server as a `split` view per screen, dark and light, and ask the owner for a final look before Task 14.

- [ ] **Step 4: Reset the simulator**

```bash
xcrun simctl ui A0E9BAE3-5776-48BF-8DA2-0F60AA8068A8 content_size medium
xcrun simctl ui A0E9BAE3-5776-48BF-8DA2-0F60AA8068A8 appearance dark
```

---

### Task 14: Ship as build 10

- [ ] **Step 1: Final checks**

```bash
npm run typecheck && npm test && npm run lint && npm run format:check
```

- [ ] **Step 2: The owner cuts the build** (the agent cannot run EAS deploys in auto mode):

```bash
npx eas-cli@latest build --profile production -p ios --non-interactive
```

```bash
npx eas-cli@latest submit -p ios --profile production --latest --non-interactive
```

- [ ] **Step 3: After the owner confirms on device**, merge the branch to `main`, push, and update the TestFlight memory note with the build-10 outcome and the follow-up HIG review.
