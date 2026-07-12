# Restrained Flourish — Design Overhaul

**Status:** Approved (brainstorming complete)
**Date:** 2026-05-31
**Branch:** `design/restrained-flourish`
**Inspiration:** (Not Boring) Habits — Andy Allen, 2022 Apple Design Award

## Thesis

Data is the hero. One core action — completing a set — is made to _sing_. Personality
comes from curated **skins** and a **living mark**, never from decoration. The result
should read like Rams-clean instrumentation with Apple-Health spaciousness, plus
game-designer attention on the single moment that matters most. We keep the _spirit_
of Not Boring (a simple input turned into a layered moment) without its brashness —
**no particles, no parallax, no 3D scenes.**

## Goals

- Add restrained, premium flourish across **every screen** (pre-launch; full vision).
- Introduce a **skin system**: curated palettes the user switches between.
- Ship a **signature complete-set moment** (spring + haptic + glow + volume tally + PR pill).
- Replace the saffron dumbbell with an **adaptive F-bar mark** that takes the active skin's accent.
- Reconcile the long-standing logo/app color split (saffron mark vs. green app).

## Non-Goals

- No particles, parallax, sound, or 3D (the Not Boring "Expressive" tier was explicitly declined).
- No backend/Supabase migration. Skin is a local device preference (AsyncStorage), not synced.
- No new charting library, navigation change, or tablet layout. Phone-first, single-column stays.
- No change to data model, sync engine, or business logic. This is a presentation-layer overhaul.

## Decisions Locked (from brainstorming)

| Decision        | Choice                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| Restraint dial  | **B — Restrained flourish** (spring + haptic + tally + PR pill; no particles) |
| Color direction | **Direction 2 — Green base + curated skins**                                  |
| Logo            | **B — F-bar monogram**, **skin-adaptive** mark                                |
| Scope           | **C — Full build, all screens**                                               |

## Architecture

### 1. Skin system (the backbone)

Today `src/ui/colors.ts` exports a single `{ darkPalette, lightPalette }`. Refactor into a
**skin registry** — each skin is a `{ dark: PaletteTokens, light: PaletteTokens }` pair.

```
src/ui/skins.ts        // registry: { forge, iron, ember, chalk }, each { dark, light }
src/ui/colors.ts       // keeps PaletteTokens interface; re-exports forge as the default
src/ui/SkinContext.tsx // React context: activeSkin + setSkin, hydrated from AsyncStorage
src/ui/useTheme.ts     // resolves activeSkin × colorScheme → PaletteTokens
```

- `useTheme()` reads the active skin from context and the system `useColorScheme()`, then
  returns the resolved `PaletteTokens` (same shape as today — **no consumer signature change**).
- `theme.ts` legacy shim stays pinned to **Forge dark** so un-migrated screens keep working,
  but every screen in this build migrates to `useTheme()` (see §Screen rollout).
- The active skin id persists in AsyncStorage (`flexyug.skin`) and hydrates on launch before
  first paint (gate splash until read, like font loading).

#### Skin definitions

Four launch skins. Each keeps the same token _roles_; only values change. Forge = today's
palette (unchanged). Exact values below are the starting point — `contrast.test.ts` extends
to all 4 skins × 2 schemes and any token failing WCAG AA is nudged during implementation.

**Forge (green — default).** Dark + light exactly as today's `darkPalette` / `lightPalette`,
plus the one new token: `surface2` = `#1A211C` (dark) / `#F1F4F0` (light).

**Iron (cool steel / graphite).**
| token | dark | light |
| --- | --- | --- |
| bg | `#0E1113` | `#EEF0F2` |
| surface | `#15191C` | `#FFFFFF` |
| surface2 | `#1B2024` | `#F5F7F8` |
| border | `#222A30` | `#DDE1E5` |
| ink | `#C7CDD2` | `#1B1F22` |
| inkHero | `#EDEFF2` | `#0A0D0F` |
| accent | `#8A93A0` | `#5C6573` |
| danger | `#C76B58` | `#8A4030` |
| onAccent | `#0E1113` | `#FFFFFF` |

**Ember (saffron — reconciles the logo).**
| token | dark | light |
| --- | --- | --- |
| bg | `#141110` | `#F6F1EC` |
| surface | `#1C1815` | `#FFFFFF` |
| surface2 | `#241D18` | `#FBF6F0` |
| border | `#2A211B` | `#E7DDD1` |
| ink | `#D6C8BD` | `#231C17` |
| inkHero | `#F4E7DF` | `#0D0907` |
| accent | `#E05A2C` | `#C24B22` |
| danger | `#C24B45` | `#9A3328` |
| onAccent | `#141110` | `#FFFFFF` |

**Chalk (warm paper — light-forward).** Light is the signature; dark is a muted warm-stone inverse.
| token | dark | light |
| --- | --- | --- |
| bg | `#16140F` | `#F4F1EB` |
| surface | `#1D1A14` | `#FFFFFF` |
| surface2 | `#24201A` | `#FBF9F4` |
| border | `#2A251D` | `#E5DFD3` |
| ink | `#D8D2C4` | `#1A1F1C` |
| inkHero | `#F0EBDF` | `#0A0E0B` |
| accent | `#7A7256` | `#4A4736` |
| danger | `#B5644E` | `#8A4030` |
| onAccent | `#16140F` | `#FFFFFF` |

> `surface2` is a **new** token (third elevation step) used for the active-set card and other
> "lifted" elements. It is added to `PaletteTokens` for all skins including Forge.
> `successSoft` / `accentSoft` / `dangerSoft` / `inkSecondary` / `inkTertiary` / `overlay`
> are derived per-skin (alpha washes of accent/danger; ink steps interpolated bg→ink).

### 2. Motion & haptic language (the flourish, codified)

Extend `src/ui/motion.ts` with the **complete-set choreography** as a single reusable hook
`useCompleteSetAnimation()` (Reanimated), so every call site fires the identical sequence:

1. **Spring-scale the check** — `rebound` spring, 1 → 1.18 → 1, ~280ms.
2. **Haptic** — `haptics.medium()` (last set of exercise) / `haptics.light()` (mid-exercise);
   PR uses `haptics.success()`. Reuses the existing trigger map; no new haptic types.
3. **Glow bloom** — accent `shadow`/halo opacity 0 → 0.45 → 0 over `duration.base` (220ms), once.
4. **Volume tally** — session-volume number animates to its new value over `duration.counter` (600ms)
   with an ease-out; mono digits. Reuses the existing finish-counter timing token.
5. **PR pill** — only when earned: slides in (`settle` spring, opacity + translateX 8→0).

Other motion stays minimal: list mount = opacity + `translateY(8→0)` over `duration.base`;
sheet present = `settle`. **Still no particles / parallax.** The choreography is the only
"big" moment; everything else remains calm so it reads as earned.

### 3. Adaptive F-bar logo

Rewrite `src/ui/Logo.tsx`:

- **Mark:** a slab "F" — vertical stem + top arm in `inkHero`; the middle arm is a **loaded
  barbell** (bar + two plates) rendered in the **active skin accent** (`theme.color.accent`).
- **Wordmark:** `FlexYug` in Geist, weight 600, tracking −0.5; optional `The Strength Era` micro-label.
- Variants: `mark` (icon only, 1:1, for app icon / nav) and `full` (mark + wordmark, for Login/splash).
- Replaces the saffron dumbbell everywhere. `brand.saffron` is retained only as the **Ember** accent.
- Export the mark geometry so the **app icon, adaptive-icon, splash, and notification icon** are
  regenerated from the same source (Forge green for the static store icon; documented in spec).

## Signature Moment — exact behavior

On `Complete set`:

- Write the set (unchanged data path) → fire `useCompleteSetAnimation()` → tally session volume →
  if a PR was detected, show the PR pill + `haptics.success()`.
- The moment is **idempotent and interrupt-safe**: rapid completions queue cleanly (no overlapping
  glows; the tally always animates from the last committed value).
- Reduced-motion: honor `AccessibilityInfo.isReduceMotionEnabled()` — skip spring/glow/tally,
  keep the instant state change + haptic.

## Finish recap moment

On workout Finish, a quiet **session recap** card (not a modal takeover): total volume, set count,
duration, and any PRs earned, each line settling in with the list-mount motion. Framed as progress
earned ("a journey, not a guilt-streak"), reusing the counter tally for the headline volume number.

## Screen-by-screen treatment (all screens get the fidelity bar)

| Screen               | Treatment                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **WorkoutActive**    | The north star. Hero numerals (Geist Mono 42pt), `surface2` active-set card, signature complete-set moment, thin SVG rest ring, adaptive mark in the header. |
| **Today**            | Hero greeting + next-workout card; adaptive mark; generous whitespace; primary CTA refined.                                                                  |
| **Progress**         | `LineChart` axis/line inherit skin accent; PR markers get a restrained highlight; section typography.                                                        |
| **Profile**          | **Skin picker** — live swatch previews of all 4 skins, current marked; unit toggle + display name refined.                                                   |
| **History (list)**   | Typographic date grouping, per-session volume tally, skin-aware surfaces.                                                                                    |
| **History (detail)** | Set tables in mono, PR badges, elevation steps.                                                                                                              |
| **TrainingPlan**     | Calmer weekly/cycle schedule layout; skin-aware slots.                                                                                                       |
| **PlanSetup**        | Wizard steps inherit the new tokens; restrained progress affordance.                                                                                         |
| **Login**            | Full-bleed adaptive mark — the new identity's first impression; Forge by default.                                                                            |
| **Tab bar / chrome** | `app/(tabs)/_layout.tsx`, `TabIcon`, `SyncIndicator` migrate off the legacy shim to `useTheme()`.                                                            |

Every legacy-shim consumer (`Progress`, `Profile`, `Login`, `History`, `TrainingPlan`, `PlanSetup`,
`app/_layout`, `app/(tabs)/_layout`, `app/index`) migrates to `useTheme()` so skins reach 100% of the UI.

## Persistence

- Active skin stored in AsyncStorage under `flexyug.skin` (value: `forge|iron|ember|chalk`).
- Read once at startup inside `SkinContext` provider; default `forge` if unset.
- **Not synced** (device-display preference; avoids a Postgres migration on this branch). Syncing the
  skin via the `profiles` table is a documented future option, not in scope.

## Testing

- **Skin registry test** — every skin exposes the full `PaletteTokens` shape (no missing keys).
- **Contrast** — `src/ui/__tests__/contrast.test.ts` extends to **4 skins × 2 schemes**; all
  text/background pairs meet WCAG AA. Values in this spec are starting points; failures get nudged.
- **SkinContext** — defaults to forge, hydrates from AsyncStorage, `setSkin` persists.
- **Motion** — `useCompleteSetAnimation` reduced-motion branch is unit-tested (skips animation,
  keeps state change). Animation timing/feel verified manually on device.
- **Logo** — renders mark with the active accent (snapshot of fill color per skin).
- Existing suite (309 tests) stays green; no logic changes.

## Phasing (execution order on the branch)

1. **Tokens & skin system** — `skins.ts`, `surface2`, `SkinContext`, `useTheme()` resolves skin; tests.
2. **Migrate legacy-shim screens to `useTheme()`** — mechanical, unblocks skins everywhere.
3. **Adaptive F-bar logo** — `Logo.tsx` + regenerated app/splash/notification icons.
4. **Signature moment** — `useCompleteSetAnimation`, wire into `ActiveSetCard` / `WorkoutActive`.
5. **Skin picker** — Profile screen with live previews; persistence.
6. **Screen rollout** — Today, Progress, History, Plan, PlanSetup, Login polished to the fidelity bar.
7. **Finish recap** — session-recap card.
8. **Verification** — full test suite, contrast, manual device pass across all 4 skins × light/dark.

## Risks & mitigations

- **Contrast regressions across skins** — caught by the extended `contrast.test.ts`; values nudged.
- **Legacy-shim migration churn** — done as an isolated mechanical phase (2) before visual polish.
- **Animation jank on low-end devices** — reduced-motion path + Reanimated worklets keep it off the JS thread.
- **Scope creep into logic** — hard non-goal; this is presentation-only. Data/sync untouched.

## Definition of Done

- All 4 skins selectable, persisted, and applied to 100% of screens in light + dark.
- Signature complete-set moment + finish recap shipped, reduced-motion safe.
- Adaptive F-bar logo across app icon, splash, login, and in-app chrome.
- 309 existing tests green; new token/skin/contrast/motion tests added and green.
- Manual device pass: every screen × 4 skins × {light, dark} reviewed against the north-star bar.
