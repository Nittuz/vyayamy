# Design System

Vyayamy is a calm, minimal strength-training journal. The design system exists to make the right choices trivial and the wrong ones impossible.

## Philosophy

Priority order — never invert it:

1. **Clarity** — the user should instantly understand what they're looking at
2. **Usability** — every interaction should feel obvious and forgiving
3. **Speed** — perceived and actual; no layout jank, no unnecessary spinners
4. **Consistency** — identical patterns for identical actions, everywhere
5. **Delight** — subtle motion and refined details, earned only after the above

### Lineage

- **Dieter Rams** — remove everything unnecessary
- **Don Norman** — match human mental models; actions must be predictable
- **Alan Kay** — powerful systems should still be understandable
- **Apple Health / Fitness** — restrained, typographic, spacious; not typical fitness-app design

## Non-negotiables

- **Single column**, phone-first. No tablet-specific layouts.
- **Warm neutral palette** — stone/amber tones (`#F8F8F6` bg, `#1C1917` text). No saturated brand colors.
- **System font** — React Native default (San Francisco on iOS, Roboto on Android). No custom fonts.
- **44pt minimum touch target** (`theme.touch.min`) on everything interactive.
- **Generous whitespace** — when in doubt, add more.
- **Subtle motion** only — 150 / 250 / 350 ms tokens. No bouncy springs, no particles, no parallax.
- **Progressive disclosure** — primary action first; secondary actions revealed on interaction.

## Tokens

All values come from [src/ui/theme.ts](../src/ui/theme.ts). Never hard-code colors, spacing, radii, or font sizes.

### Color

Two palettes are defined (`colors`, `darkColors`). Only the light palette is active today; dark is kept in sync for a future `useColorScheme()` toggle.

| Token              | Light      | Purpose                                       |
| ------------------ | ---------- | --------------------------------------------- |
| `bg`               | `#F8F8F6`  | Page background                               |
| `surface`          | `#FFFFFF`  | Cards, sheets, input fields                   |
| `text`             | `#1C1917`  | Primary text                                  |
| `textSecondary`    | `#78716C`  | Supporting text                               |
| `textTertiary`     | `#A8A29E`  | Labels, hints                                 |
| `border`           | `#F0EEEC`  | Soft dividers                                 |
| `borderStrong`     | `#E7E5E4`  | Prominent dividers, toggles                   |
| `accent`           | `#1C1917`  | Primary action                                |
| `accentMuted`      | `#57534E`  | Secondary emphasis                            |
| `accentSoft`       | `rgba(...)` | Subtle highlight                             |
| `success`          | `#16A34A`  | Set complete, PR success                      |
| `danger`           | `#DC2626`  | Destructive action, errors                    |
| `pr`               | `#D97706`  | PR highlight                                  |
| `chartAxis`        | `#A8A29E`  | Chart lines and axis text                     |
| `onAccent`         | `#FFFFFF`  | Text on accent background                     |
| `overlay`          | `rgba(...)` | Modal backdrops                              |

### Space (4pt base)

`half` (2), `s1` (4), `s2` (8), `s3` (12), `s4` (16), `s5` (20), `s6` (24), `s8` (32), `s10` (40), `s12` (48), plus `page` (20) and `section` (32).

### Radius

`sm` (8), `md` (12), `lg` (16), `full` (9999), `card` (12), `button` (8).

### Typography

`display` (34), `title` (28), `section` (20), `card` (16), `body` (15), `meta` (13), `micro` (11). Weights: `medium` (500), `semibold` (600), `bold` (700).

### Touch

`min` (44), `navHeight` (64).

### Duration

`fast` (150), `normal` (250), `slow` (350).

## Implementation

All styles are `StyleSheet.create` blocks at the bottom of component files. No CSS files ship in the mobile app.

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/ui/theme';

export function PrimaryCTA({ label, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
    >
      <Text style={styles.ctaText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.9 },
  ctaText: {
    color: theme.color.onAccent,
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
  },
});
```

## Interactions

### Pressables

Always `<Pressable>`. Express pressed state through the `style` function prop (lighter background or `opacity: 0.9`). No scale-on-press bounces.

### Haptics

`expo-haptics` for meaningful moments. Always `.catch(() => {})` — haptics are best-effort.

| Event                         | Haptic                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| Set marked complete           | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`       |
| Rest timer crosses target     | `Haptics.notificationAsync(NotificationFeedbackType.Success)`   |
| PR achieved                   | `Haptics.notificationAsync(NotificationFeedbackType.Success)`   |
| Destructive confirmation      | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)`        |

### Rest timer

Foreground: `setInterval` in [src/ui/hooks/useRestTimer.ts](../src/ui/hooks/useRestTimer.ts) with a haptic at the configured target.

Background: the same hook schedules a one-shot local notification via [src/lib/restNotifications.ts](../src/lib/restNotifications.ts) on `start()` and cancels it on `stop()` / unmount. The foreground counter is authoritative — notifications are the fallback for when the app is backgrounded or the screen is locked.

### Toasts

`useToast()` from [src/ui/ToastContext.tsx](../src/ui/ToastContext.tsx). Never `Alert.alert` for transient feedback.

### Charts

[src/ui/LineChart.tsx](../src/ui/LineChart.tsx) is the in-house SVG chart. Extend it; do not add Recharts or `victory-native`. Axes and ticks use `theme.color.chartAxis` / `textTertiary`.

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

- Every interactive element needs a clear label — icon-only controls require `accessibilityLabel`
- Use `accessibilityRole` (`'button'`, `'link'`, `'header'`)
- Minimum 44pt touch target
- Text color contrast is enforced by the palette (stone-black on warm-white)

## Future Polish

- Dark-mode activation via `useColorScheme()` (palette already ships)
- Sheet + ConfirmDialog primitives ported from the legacy web app
- Skeleton placeholders matched to content shape to prevent layout shift
- Animated presence helpers (opacity + translateY fades) for list mount/unmount
