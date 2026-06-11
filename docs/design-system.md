# Design System

FlexYug is a calm, minimal strength-training journal. The design system exists to make the right choices trivial and the wrong ones impossible.

## Philosophy

Priority order (never invert it):

1. **Clarity**: the user should instantly understand what they're looking at
2. **Usability**: every interaction should feel obvious and forgiving
3. **Speed**: perceived and actual; no layout jank, no unnecessary spinners
4. **Consistency**: identical patterns for identical actions, everywhere
5. **Delight**: subtle motion and refined details, earned only after the above

### Lineage

- **Dieter Rams**: remove everything unnecessary
- **Don Norman**: match human mental models; actions must be predictable
- **Alan Kay**: powerful systems should still be understandable
- **Apple Health / Fitness**: restrained, typographic, spacious; not typical fitness-app design

## Non-negotiables

- **Single column**, phone-first. No tablet-specific layouts.
- **Brutalist-lifter palette + curated skins**: the default **Forge** skin is a muted green accent on near-black (dark) or warm paper (light), selected by system color scheme. Three further skins (**Iron**, **Ember**, **Chalk**) are switchable in Profile. Each skin stays restrained, no saturated chaos. See [src/ui/skins.ts](../src/ui/skins.ts) and [src/ui/colors.ts](../src/ui/colors.ts).
- **Custom fonts**: Geist Sans for chrome/labels, Geist Mono for numerals and data. Loaded via `@expo-google-fonts/geist` + `geist-mono`.
- **44pt minimum touch target** (`theme.touch.min`) on everything interactive.
- **Generous whitespace**: when in doubt, add more.
- **Subtle motion** only: 150 / 220 / 320 ms duration tokens (plus a 600ms counter tally) and three damped Reanimated springs (`snappy` / `settle` / `rebound`) used in exactly three interactions. No particles, no parallax.
- **Progressive disclosure**: primary action first; secondary actions revealed on interaction.

## Tokens

Tokens come from the modules under [src/ui/](../src/ui/): `colors.ts`, `typography.ts`, `motion.ts`, plus the `space` / `radius` / `touch` scales in `useTheme.ts`. Consume them through the `useTheme()` hook; the legacy `theme.ts` shim exists only for the pre-hydration boot overlay in `app/_layout.tsx` and the `brand` constants. Never hard-code colors, spacing, radii, or font sizes.

### Color & skins

Colors are organized as a **skin registry** in [src/ui/skins.ts](../src/ui/skins.ts): four skins (`forge`, `iron`, `ember`, `chalk`), each a coordinated `{ dark, light }` pair of `PaletteTokens`. The base Forge palette lives in [src/ui/colors.ts](../src/ui/colors.ts).

- [src/ui/SkinContext.tsx](../src/ui/SkinContext.tsx) holds the active skin, persisted in AsyncStorage (`flexyug.skin`), a device-display preference, **not synced**. Default is `forge`. First paint is gated on hydration so there's no skin flash.
- [src/ui/useTheme.ts](../src/ui/useTheme.ts) resolves `activeSkin × useColorScheme()` to a single `PaletteTokens` object; consumers' signatures are unchanged.
- Switch skins in **Profile → Appearance**. Every screen reskins live.
- The legacy [src/ui/theme.ts](../src/ui/theme.ts) shim is pinned to Forge-dark for the boot overlay only; all in-app screens consume `useTheme()`.
- WCAG AA is enforced across **all 4 skins × 2 schemes** in [src/ui/__tests__/contrast.test.ts](../src/ui/__tests__/contrast.test.ts).

The dark-palette (Forge) token table below is the canonical reference; the other skins remap the same roles.

| Token          | Dark                    | Light                  | Purpose                       |
| -------------- | ----------------------- | ---------------------- | ----------------------------- |
| `bg`           | `#0F1411`               | `#F4F1EB`              | Page background               |
| `surface`      | `#161B18`               | `#FFFFFF`              | Cards, sheets, input fields   |
| `surface2`     | `#1A211C`               | `#F1F4F0`              | Elevated/active surfaces (3rd step) |
| `border`       | `#1A2420`               | `#E5DFD3`              | Soft dividers                 |
| `borderStrong` | `#1F2925`               | `#D6CFC0`              | Prominent dividers, handles   |
| `ink`          | `#C9D4CC`               | `#1A1F1C`              | Primary text                  |
| `inkSecondary` | `#8C9A92`               | `#5A625C`              | Supporting text               |
| `inkTertiary`  | `#5E6862`               | `#7E847F`              | Labels, hints, chart axes     |
| `inkHero`      | `#E8F0EA`               | `#0A0E0B`              | Hero numerals (weight × reps) |
| `accent`       | `#6DA37E`               | `#3D6E52`              | Primary action, success       |
| `accentSoft`   | `rgba(109,163,126,.12)` | `rgba(61,110,82,.10)`  | Subtle highlight              |
| `success`      | `#6DA37E`               | `#3D6E52`              | Set complete, PR success      |
| `successSoft`  | `rgba(109,163,126,.12)` | `rgba(61,110,82,.10)`  | Success wash                  |
| `danger`       | `#C76B58`               | `#8A4030`              | Destructive action, errors    |
| `dangerSoft`   | `rgba(199,107,88,.12)`  | `rgba(138,64,48,.10)`  | Error wash                    |
| `onAccent`     | `#0F1411`               | `#FFFFFF`              | Text on accent background     |
| `overlay`      | `rgba(0,0,0,.55)`       | `rgba(40,30,20,.30)`   | Modal backdrops               |

### Space (4pt base)

`half` (2), `s1` (4), `s2` (8), `s3` (12), `s4` (16), `s5` (20), `s6` (24), `s8` (32), `s10` (40), `s12` (48), plus `page` (20) and `section` (32).

### Radius

`sm` (8), `md` (12), `lg` (16), `full` (9999), `card` (14), `button` (8).

### Typography

`hero` (82, Geist Mono numerals), `display` (28), `title` (20), `card` (16), `body` (14), `meta` (12), `micro` (12). Weights: `regular` (400), `medium` (500), `semibold` (600). There is no 700.

#### Text primitive

All new code renders text through the `<Text variant="...">` primitive from [src/ui/Text.tsx](../src/ui/Text.tsx). It binds Geist fontFamily + size + tracking + line-height per variant via `resolveTextStyle` in [src/ui/textVariants.ts](../src/ui/textVariants.ts), so no screen can accidentally omit `fontFamily` and fall back to the system font (fix #22).

Variants:

| Variant   | Description                                  |
| --------- | -------------------------------------------- |
| `hero`    | 82pt Geist Mono Medium, active-set headline  |
| `numeral` | Geist Mono, inline data figures              |
| `display` | 28pt sans semibold, screen-defining numbers  |
| `title`   | 20pt sans semibold, screen titles            |
| `card`    | 16pt sans medium, card headings              |
| `body`    | 14pt sans regular, body copy                 |
| `label`   | 12pt sans medium, tracked + uppercase        |
| `meta`    | 12pt sans regular, secondary meta text       |

Migration status: the 2521a49 sweep added the correct Geist `fontFamily` to existing inline styles across seven screens, but no screen imports the `<Text>` primitive yet (zero call sites as of this writing). Full migration to the primitive is an open follow-up.

### Touch

`min` (44), `navHeight` (64), `cta` (52), `avatar` (56), `avatarRadius` (28).

### Duration

`fast` (150), `base` (220), `slow` (320), `counter` (600). Springs: `snappy`, `settle`, `rebound`.

## Implementation

Two styling architectures coexist in the codebase (open finding #66). The **blessed pattern** for new and touched code is `makeStyles(theme)` with `useMemo`:

```tsx
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

export function PrimaryCTA({ label, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
    >
      <Text variant="card" color={theme.color.onAccent}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    cta: {
      height: 52,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaPressed: { opacity: 0.9 },
  });
```

Live examples of this pattern: [src/screens/History.tsx](../src/screens/History.tsx) lines 26-27 and 120-121, [src/screens/Profile.tsx](../src/screens/Profile.tsx), [src/screens/Progress.tsx](../src/screens/Progress.tsx), [src/screens/PlanSetup.tsx](../src/screens/PlanSetup.tsx), [src/screens/TrainingPlan.tsx](../src/screens/TrainingPlan.tsx), [src/screens/Login.tsx](../src/screens/Login.tsx), [src/ui/ToastContext.tsx](../src/ui/ToastContext.tsx), [src/ui/SyncIndicator.tsx](../src/ui/SyncIndicator.tsx), [src/ui/ErrorBoundary.tsx](../src/ui/ErrorBoundary.tsx).

Several components ([src/screens/Today.tsx](../src/screens/Today.tsx), [src/screens/WorkoutActive.tsx](../src/screens/WorkoutActive.tsx), [src/components/ActiveSetCard.tsx](../src/components/ActiveSetCard.tsx), [src/components/SessionVolumeBar.tsx](../src/components/SessionVolumeBar.tsx)) still use a module-level static `StyleSheet.create` combined with inline theme-derived style arrays. That pattern is pending unification (#66). Do not copy it into new code.

No CSS files ship in the mobile app.

## Interactions

### Pressables

Always `<Pressable>`. Express pressed state through the `style` function prop (lighter background or `opacity: 0.9`). No scale-on-press bounces.

### Haptics

Use the wrappers in [src/ui/haptics.ts](../src/ui/haptics.ts) (`haptics.light` / `haptics.medium` / `haptics.rigid` / `haptics.success`). They swallow errors internally so haptics stay best-effort. Never call `expo-haptics` directly in components.

| Trigger                                          | Haptic              |
| ------------------------------------------------ | ------------------- |
| Stepper increments, sheet actions, skip-rest     | `haptics.light`     |
| Set banked / last set of exercise                | `haptics.medium`    |
| Swipe crosses completion threshold               | `haptics.rigid`     |
| Rest timer hits target / PR achieved             | `haptics.success`   |

Sources: [src/components/ActiveSetCard.tsx](../src/components/ActiveSetCard.tsx) lines 76 and 82, [src/ui/completeSetChoreography.ts](../src/ui/completeSetChoreography.ts), [src/ui/hooks/useRestTimer.ts](../src/ui/hooks/useRestTimer.ts).

### The signature complete-set moment

Banking a set is the one moment given disproportionate craft. On completion: a **medium haptic** lands on the swipe gesture ([src/components/ActiveSetCard.tsx](../src/components/ActiveSetCard.tsx)), then the live **session-volume tally** ([src/components/SessionVolumeBar.tsx](../src/components/SessionVolumeBar.tsx)) counts up over 600ms with a single accent-glow bloom. The decision logic is the pure, unit-tested [src/ui/completeSetChoreography.ts](../src/ui/completeSetChoreography.ts); the Reanimated glow lives in [src/ui/useCompleteSetAnimation.ts](../src/ui/useCompleteSetAnimation.ts). Finishing a workout shows a calm [src/ui/SessionRecap.tsx](../src/ui/SessionRecap.tsx): volume headline, sets, duration, framed as progress earned, never a streak. All of it honors OS **Reduce Motion** (state changes instantly; glow/rise are skipped). Still **no particles, no parallax**. List entrances use [src/ui/FadeInView.tsx](../src/ui/FadeInView.tsx) (opacity + small translateY).

### Logo

The mark is the rose-gold championship medal with a Fraunces 900 Italic "F" monogram ([src/ui/Medal.tsx](../src/ui/Medal.tsx)). `FBarMark` in [src/ui/Logo.tsx](../src/ui/Logo.tsx) is a compatibility alias for existing call sites (Today, Login) and ignores `accent`/`ink` props; the mark is fixed-brand and does not reskin with the theme. `Logo` is the medal + wordmark lockup; the wordmark uses `inkHero`. App icon source is [assets/icon-source.svg](../assets/icon-source.svg), regenerated via [assets/branding/medal.js](../assets/branding/medal.js).

### Rest timer

Foreground: `setInterval` in [src/ui/hooks/useRestTimer.ts](../src/ui/hooks/useRestTimer.ts) with a haptic at the configured target.

Background: the same hook schedules a one-shot local notification via [src/lib/restNotifications.ts](../src/lib/restNotifications.ts) on `start()` and cancels it on `stop()` / unmount. The foreground counter is authoritative; notifications are the fallback for when the app is backgrounded or the screen is locked.

### Toasts

`useToast()` from [src/ui/ToastContext.tsx](../src/ui/ToastContext.tsx). Never `Alert.alert` for transient feedback.

### Charts

[src/ui/LineChart.tsx](../src/ui/LineChart.tsx) is the in-house SVG chart. Extend it; do not add Recharts or `victory-native`. Axes and ticks use `theme.color.inkTertiary`.

### Icons

Centralized SVG components (see [src/ui/TabIcon.tsx](../src/ui/TabIcon.tsx)) using `react-native-svg`. Do not sprawl across an icon library with per-glyph imports.

## Layout Defaults

- Screens: `<SafeAreaView>` → `<ScrollView>` with `contentContainerStyle: { padding: theme.space.page, gap: theme.space.s4 }`
- Cards: `backgroundColor: theme.color.surface`, `borderRadius: theme.radius.md`, `borderWidth: 1`, `borderColor: theme.color.border`, `padding: theme.space.s4`
- Primary CTA: `height: 52`, `backgroundColor: theme.color.accent`, `color: theme.color.onAccent`, `borderRadius: theme.radius.md`
- Inputs: `height: 44`, `backgroundColor: theme.color.bg`, `borderRadius: theme.radius.sm`, `fontSize: theme.font.body`

## Responsive

Phone-first. No media queries, no `Dimensions`-based layout branching unless strictly necessary. Keep everything single-column and let `flex` handle the rest.

## Accessibility

- Every interactive element needs a clear label; icon-only controls require `accessibilityLabel`
- Use `accessibilityRole` (`'button'`, `'link'`, `'header'`)
- Minimum 44pt touch target
- Text-color contrast is WCAG-checked against the palette (see [src/ui/__tests__/contrast.test.ts](../src/ui/__tests__/contrast.test.ts))

## Future Polish

- Sheet + ConfirmDialog primitives ported from the legacy web app
- Skeleton placeholders matched to content shape to prevent layout shift
- Exit/presence animations for list unmount (mount is covered by [src/ui/FadeInView.tsx](../src/ui/FadeInView.tsx))
