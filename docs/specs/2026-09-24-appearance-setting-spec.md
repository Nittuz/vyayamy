# Appearance setting: System, Light, Dark

- **Status:** approved
- **Date:** 2026-09-24
- **Related ADRs:** none

## Problem

The app follows the phone's appearance (`userInterfaceStyle: automatic`, `useColorScheme`) and
has no control of its own. On build 10 the owner saw the app "turn white" in the morning after
being dark all evening: the phone's Appearance is set to Automatic (sunset to sunrise). That is
correct behaviour, but the owner wants to be able to pin the app.

## Goals & non-goals

- Goal: a three-way Appearance control on Profile: System (default), Light, Dark.
- Goal: the choice applies everywhere at once, including native surfaces (keyboard, modals)
  and the boot overlay, and survives relaunch.
- Non-goal: per-screen schemes. Login stays pinned dark by the existing brand decision.
- Non-goal: syncing the preference to the account; it is a device preference.

## Design

- `src/ui/appearancePref.ts` (pure, tested): `AppearancePref = 'system' | 'light' | 'dark'`,
  stored in the key-value store under `ui.appearance` (schema v1); `loadAppearancePref`
  defaults to `system` and tolerates unknown values; `resolveAppearanceOverride` maps
  `system` → `null`, otherwise the scheme.
- `src/ui/useAppearance.ts`: `applyAppearancePref` calls React Native's
  `Appearance.setColorScheme(override)`, which drives `useColorScheme` (so `useTheme`, the boot
  overlay, the status bar, and the tab bar follow) and the app's native interface style.
  `restoreAppearancePref` runs once at boot from the root layout. `useAppearancePref` is the
  Profile control's state.
- Profile gains an "Appearance" card under Units, a `Segment` with AUTO / LIGHT / DARK.
- The key is not user-scoped (not cleared on sign-out) on purpose.

## Alternatives considered

- A `ThemeScope` override at the root: would drive the app's own theme but leave native
  surfaces on the phone's scheme (dark keyboard on a light-forced app). Rejected.
- Syncing via the profile row: a device preference does not belong to the account. Rejected.

## Testing

- Unit: `appearancePref.test.ts` (mapping, default, round trip, invalid value).
- Device: set Light at night and Dark in the morning; relaunch; check the keyboard and a sheet
  follow; set System and confirm the phone's schedule takes over again.

## Rollout

Ships in the next TestFlight build with the voice fix. No migration; a missing key means System.

## Open questions

None.
