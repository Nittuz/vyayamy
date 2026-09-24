# Design System — Forged Iron

> **SUPERSEDED (2026-07):** the Blacktop overhaul
> (spec in git history: `docs/specs/2026-07-11-blacktop-overhaul-spec.md`)
> replaced this system: true-mono palette with a single volt accent, all-sharp
> corners (no radius scale), elevation by inversion (no slabs, no press-sink),
> and a single skin. Token names below (ember, `slab`, `press`, `radius.md`,
> skins) no longer exist in code. Kept for the primitives inventory and
> historical rationale until a Blacktop-native rewrite lands; the source of
> truth is the spec plus the token modules in [src/ui/](../src/ui/).
> Softened Blacktop (2026-09-23) then reintroduced a small radius scale, a
> lifted surface with a soft hairline, and scale/highlight presses; see the
> Radius and Depth & press sections.

FlexYug is a strength-training journal with an industrial-brutalist identity: iron black, bone ink, one hot ember accent, condensed poster type, and flat surfaces lifted by a hairline instead of soft shadows. The design system exists to make the right choices trivial and the wrong ones impossible.

## Philosophy

Priority order (never invert it):

1. **Clarity**: the user should instantly understand what they're looking at
2. **Usability**: every interaction should feel obvious and forgiving
3. **Speed**: perceived and actual; no layout jank, no unnecessary spinners
4. **Consistency**: identical patterns for identical actions, everywhere
5. **Confidence**: bold type, structural rules, one hot color — restraint with conviction, not timidity

### Lineage

- **Dieter Rams**: remove everything unnecessary — then make what remains unmistakable
- **Don Norman**: match human mental models; actions must be predictable
- **Gym iron**: plates, knurling, chalk; the UI's depth model is a lifted surface with a hairline edge, not floating glass
- **Neo-brutalist print**: visible structure, heavy rules, poster headlines; never decoration for its own sake

## Non-negotiables

- **Single column**, phone-first. No tablet-specific layouts.
- **One signature look**: the Forged Iron palette — iron black (dark) or bone paper (light) selected by system color scheme, with a single ember accent tuned per scheme. The multi-skin system is gone entirely — `buildTheme(scheme)` in [src/ui/useTheme.ts](../src/ui/useTheme.ts) selects the dark/light palette directly.
- **Custom fonts**: Anton (condensed industrial display) for uppercase chrome headlines, Geist Sans for body/labels, Geist Mono for numerals and data. Loaded via `@expo-google-fonts/anton`, `geist`, and `geist-mono`.
- **Display type is chrome-only**: `display`/`displayXL` variants force uppercase Anton. User content (workout titles, exercise names) always renders in `title`/`card` — never force-uppercased into a poster face.
- **Depth is a lift plus a hairline**: cards and rows sit one step lighter than the page (`surface`) with a 1.5px `border` hairline; corners take the small radius scale. The hairline is deliberately soft (well under 3:1 against the page): the lift and the hairline carry the boundary together. No native shadows, no blur, no gradients.
- **Pressed = scale or highlight**: cards and filled buttons scale to 0.975 with a mild darken; list rows and outlined controls tint their fill (`Plate`'s `press` prop). Reduced Motion drops the scale.
- **44pt minimum touch target** (`theme.touch.min`) on everything interactive.
- **Motion budget**: 150 / 220 / 320 ms duration tokens (plus a 600ms counter tally) and three damped Reanimated springs (`snappy` / `settle` / `rebound`), spent on entrances, the complete-set moment, sheet presentation, and the rest tick. Everything else is instant. No particles, no parallax. Reduce Motion always honored.
- **Progressive disclosure**: primary action first; secondary actions revealed on interaction.

## Tokens

Tokens come from the modules under [src/ui/](../src/ui/): `colors.ts`, `typography.ts`, `motion.ts`, plus the `space` / `radius` / `depth` / `press` / `touch` scales in `useTheme.ts`. Consume them through the `useTheme()` hook. Never hard-code colors, spacing, radii, or font sizes.

### Color

One skin, two schemes, defined in [src/ui/colors.ts](../src/ui/colors.ts). The accent is ember, tuned per scheme so it clears WCAG body contrast on its surfaces (raw ember fails on bone, hence the deeper light value). WCAG AA is enforced in [src/ui/**tests**/contrast.test.ts](../src/ui/__tests__/contrast.test.ts) — including text-on-accent and text-on-danger pairs — and that suite is the merge gate for any palette change.

| Token          | Dark                  | Light                 | Purpose                             |
| -------------- | --------------------- | --------------------- | ----------------------------------- |
| `bg`           | `#0B0B0D`             | `#ECEAE4`             | Page background                     |
| `surface`      | `#131316`             | `#F7F5F0`             | Cards, sheets, input fields         |
| `surface2`     | `#1B1B1F`             | `#E0DED7`             | Elevated/active surfaces (3rd step) |
| `border`       | `#26262B`             | `#C8C6BE`             | Soft dividers                       |
| `borderStrong` | `#404048`             | `#17171A`             | Structural rules, Plate outlines    |
| `ink`          | `#E8E5DE`             | `#1A1A1D`             | Primary text (bone on iron)         |
| `inkSecondary` | `#A6A39B`             | `#53524D`             | Supporting text                     |
| `inkTertiary`  | `#74716A`             | `#71706A`             | Labels, hints, chart axes           |
| `inkHero`      | `#F4F1E9`             | `#0C0C0E`             | Hero numerals (weight × reps)       |
| `accent`       | `#E8602F`             | `#B83E14`             | Primary action, ember               |
| `accentSoft`   | `rgba(232,96,47,.14)` | `rgba(184,62,20,.10)` | Subtle highlight                    |
| `success`      | = accent              | = accent              | Set complete, PR success            |
| `successSoft`  | = accentSoft          | = accentSoft          | Success wash                        |
| `danger`       | `#D6524A`             | `#A8312B`             | Destructive action, errors          |
| `dangerSoft`   | `rgba(214,82,74,.14)` | `rgba(168,49,43,.10)` | Error wash                          |
| `onAccent`     | `#0B0B0D`             | `#FFFFFF`             | Text on accent/danger fills         |
| `overlay`      | `rgba(0,0,0,.6)`      | `rgba(12,12,14,.4)`   | Modal backdrops                     |

(The `SkinContext` hydration layer described in earlier revisions is gone along with the skin registry — the scheme comes straight from `useColorScheme()`.)

### Space (4pt base)

`half` (2), `s1` (4), `s2` (8), `s3` (12), `s4` (16), `s5` (20), `s6` (24), `s8` (32), `s10` (40), `s12` (48), plus `page` (20) and `section` (32).

### Radius

`control` (6): buttons, inputs, segments, stepper keys. `card` (8): Plates, list rows, toasts, banners. `sheet` (16): the top corners of bottom sheets. `full` (9999): circles only. Rows inside a rule-separated list use `shape="none"`. Never a raw number: `noRawRadius.test.ts` fails the build on a numeric radius or a hand-drawn input border.

### Depth & press

`depth.hairline` (1.5): the Plate and input border. `depth.rule` (2) / `depth.ruleHeavy` (3): section rules. Press: `scale` (0.975, opacity 0.92) for cards and filled buttons, `highlight` (an 8% tint of the face's own ink, no movement) for rows and outlined controls; both over `motion.duration.press`. Reduced Motion drops the scale and applies instantly.

### Typography

| Variant     | Face                | Size | Notes                                        |
| ----------- | ------------------- | ---- | -------------------------------------------- |
| `hero`      | Geist Mono Medium   | 82   | Active-set numerals, the signature           |
| `displayXL` | Anton, uppercase    | 44   | Wordmark, recap headline, brand moments      |
| `display`   | Anton, uppercase    | 34   | Screen titles (chrome only, never user text) |
| `numeralLg` | Geist Mono Medium   | 28   | Rest countdown, volume tally, recap stats    |
| `title`     | Geist Sans Semibold | 20   | In-content headings — user-text safe         |
| `card`      | Geist Sans Medium   | 16   | Card headings                                |
| `body`      | Geist Sans Regular  | 14   | Body copy                                    |
| `label`     | Geist Sans Medium   | 12   | Eyebrows: tracked +2.0, uppercase            |
| `meta`      | Geist Sans Regular  | 12   | Secondary meta text                          |
| `numeral`   | Geist Mono Regular  | 16   | Inline data figures                          |

Weights: 400 / 500 / 600 via distinct families. There is no 700 and no `fontWeight` in style objects. Line-height multipliers never dip below 1.0 (iOS clips tall glyphs — both the 82pt mono digits and Anton caps).

#### Text primitive

All code renders text through the `<Text variant="...">` primitive from [src/ui/Text.tsx](../src/ui/Text.tsx). It binds family + size + tracking + line-height per variant via `resolveTextStyle` in [src/ui/textVariants.ts](../src/ui/textVariants.ts), so no screen can fall back to the system font (#22). Display-class variants cap Dynamic Type at 1.2× (`resolveMaxFontSizeMultiplier`), except the poster `displayXXL`, which never scales: at 96pt it is already the largest thing on screen, and growth would push its long first line into shrink-to-fit while the short outlined second line stayed full size. Two stacked display lines use `stackedDisplayTrim` on the second line to close Anton's unused descent (the line boxes stay 1.2 em; the overlap is what closes the gap). Body-class variants scale freely.

### Touch

`min` (44), `navHeight` (64), `cta` (52), `avatar` (56), `avatarRadius` (28).

### Duration

`fast` (150), `base` (220), `slow` (320), `counter` (600). Springs: `snappy`, `settle`, `rebound`.

## Primitives

Build screens out of these; do not hand-roll cards, buttons, or sheets.

- **`Plate`** ([src/ui/Plate.tsx](../src/ui/Plate.tsx)) — the card: flat `surface` face + 1.5px hairline, `shape` (`card` default / `control` / `none`) for the radius, `press` (`scale` default / `highlight`) for the pressed response. `onPress` makes the face a Pressable.
- **`Button`** ([src/ui/Button.tsx](../src/ui/Button.tsx)) — `primary` (ember plate), `secondary` (surface plate), `ghost` (flat text), `danger`. Sizes `cta` (52) / `row` (44).
- **`Sheet`** ([src/ui/Sheet.tsx](../src/ui/Sheet.tsx)) — the one modal surface: `bottom` or `center` variants, animated in on `settle`, animated out with deferred unmount, Reduce Motion instant, pinned `footer` action row. **`ConfirmSheet`** ([src/ui/ConfirmSheet.tsx](../src/ui/ConfirmSheet.tsx)) replaces `Alert.alert` for confirm/destructive decisions.
- **`Icon`** ([src/ui/icons.tsx](../src/ui/icons.tsx)) — 24-grid stroke icon registry on `react-native-svg`. No emoji glyphs, no per-glyph icon-library imports.

## Implementation

The blessed pattern is `makeStyles(theme)` with `useMemo`:

```tsx
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

export function LastSession({ onRepeat }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Plate onPress={onRepeat} faceStyle={styles.face} accessibilityRole="button">
      <Text variant="label" color={theme.color.inkTertiary}>
        Last — push day
      </Text>
      <Text variant="numeral" color={theme.color.ink}>
        80 kg × 8
      </Text>
    </Plate>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    face: { padding: theme.space.s5, gap: theme.space.s2 },
  });
```

No CSS files ship in the mobile app. No static module-level `theme.ts`-shim styling in screens — everything themes through `useTheme()`.

## Interactions

### Pressables

Always `<Pressable>`. Plate-based controls express pressed state through `Plate`'s `press` prop: `scale` on cards and filled buttons, `highlight` on rows and outlined controls. No opacity-only fades on primary controls.

### Haptics

Use the wrappers in [src/ui/haptics.ts](../src/ui/haptics.ts) (`haptics.light` / `haptics.medium` / `haptics.rigid` / `haptics.success`). They swallow errors internally so haptics stay best-effort. Never call `expo-haptics` directly in components.

| Trigger                                      | Haptic            |
| -------------------------------------------- | ----------------- |
| Stepper increments, sheet actions, skip-rest | `haptics.light`   |
| Set banked / last set of exercise            | `haptics.medium`  |
| Swipe crosses completion threshold           | `haptics.rigid`   |
| Rest timer hits target / PR achieved         | `haptics.success` |

### The signature complete-set moment

Banking a set is the one moment given disproportionate craft. On completion: a **medium haptic** lands on the swipe gesture ([src/components/ActiveSetCard.tsx](../src/components/ActiveSetCard.tsx)), then the live **workout-volume tally** counts up over 600ms with a single ember-glow bloom — louder when the set is a **PR**. The decision logic is the pure, unit-tested [src/ui/completeSetChoreography.ts](../src/ui/completeSetChoreography.ts); the Reanimated glow lives in [src/ui/useCompleteSetAnimation.ts](../src/ui/useCompleteSetAnimation.ts). Finishing shows the recap: volume headline in `displayXL`, sets, duration, and a stamped PR plate when records fell — progress earned, never a streak. All of it honors OS **Reduce Motion**. List entrances use [src/ui/FadeInView.tsx](../src/ui/FadeInView.tsx) (opacity + small translateY).

### Rest timer

Foreground: `setInterval` in [src/ui/hooks/useRestTimer.ts](../src/ui/hooks/useRestTimer.ts) with a haptic at the configured target; the running state shows a `numeralLg` mono countdown with a ≥44pt skip target, not a bare progress hairline.

Background: the same hook schedules a one-shot local notification via [src/lib/restNotifications.ts](../src/lib/restNotifications.ts) on `start()` and cancels it on `stop()` / unmount. The foreground counter is authoritative.

### Toasts

`useToast()` from [src/ui/ToastContext.tsx](../src/ui/ToastContext.tsx). Never `Alert.alert` for transient feedback; `ConfirmSheet` for decisions.

### Charts

[src/ui/LineChart.tsx](../src/ui/LineChart.tsx) is the in-house SVG chart. Extend it; do not add Recharts or `victory-native`. Axes use hard 2px rules; tick labels are Geist Mono in `inkTertiary`; PR points get ember markers.

## Layout Defaults

- Screens: `<SafeAreaView>` → `<ScrollView>` with `contentContainerStyle: { padding: theme.space.page, gap: theme.space.s4 }`
- Cards: `Plate` with `faceStyle: { padding: theme.space.s4 }` — never hand-rolled `borderRadius`+`borderWidth` views
- Primary CTA: `Button kind="primary" size="cta"`
- Inputs: `style={resolveInputStyle(theme)}` from [src/ui/inputStyles.ts](../src/ui/inputStyles.ts); spread and override only a multiline height or a stronger hairline

## Responsive

Phone-first. No media queries, no `Dimensions`-based layout branching unless strictly necessary. Keep everything single-column and let `flex` handle the rest.

## Accessibility

- Every interactive element needs a clear label; icon-only controls require `accessibilityLabel`
- Use `accessibilityRole` (`'button'`, `'link'`, `'header'`)
- Minimum 44pt touch target
- Text-color contrast is WCAG-checked against the palette (see [src/ui/**tests**/contrast.test.ts](../src/ui/__tests__/contrast.test.ts))
- Display variants cap Dynamic Type at 1.2×; body text scales freely
