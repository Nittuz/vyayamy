# Restrained Flourish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated skin system, a signature complete-set moment, a skin-adaptive F-bar logo, and a finish recap — applied to every screen — turning FlexYug's brutalist UI into a polished, restrained "work of art."

**Architecture:** Presentation-layer only. Refactor `colors.ts` into a skin registry; resolve `activeSkin × colorScheme` in `useTheme()` via a new `SkinContext` (persisted in AsyncStorage). Migrate every legacy-`theme.ts`-shim screen to `useTheme()`. Add a Reanimated complete-set choreography hook and a skin-adaptive logo. No data, sync, or business-logic changes.

**Tech Stack:** Expo SDK 55, React Native 0.83, TypeScript (strict), Reanimated 4, react-native-svg, AsyncStorage, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-05-31-restrained-flourish-design.md`

---

## File Structure

**Create:**
- `src/ui/skins.ts` — skin registry: `{ forge, iron, ember, chalk }`, each `{ dark, light }`; `SkinId` type; `SKIN_META` (display names).
- `src/ui/SkinContext.tsx` — context provider, AsyncStorage hydration, `useSkin()` hook.
- `src/ui/useCompleteSetAnimation.ts` — Reanimated choreography hook for the signature moment.
- `src/ui/SessionRecap.tsx` — finish recap card.
- `src/ui/__tests__/skins.test.ts` — registry shape test.
- `src/ui/__tests__/SkinContext.test.tsx` — default/hydrate/persist test.
- `src/ui/__tests__/useCompleteSetAnimation.test.ts` — reduced-motion branch test.
- `src/ui/__tests__/Logo.test.tsx` — adaptive accent test.

**Modify:**
- `src/ui/colors.ts` — add `surface2` to `PaletteTokens`; re-export forge as default `darkPalette`/`lightPalette`.
- `src/ui/useTheme.ts` — resolve active skin from context; add `surface2`.
- `src/ui/__tests__/contrast.test.ts` — iterate all 4 skins × 2 schemes.
- `src/ui/Logo.tsx` — F-bar mark, adaptive accent, `mark`/`full` variants.
- `app/_layout.tsx` — wrap tree in `SkinProvider`, gate first paint on skin hydration.
- `src/components/ActiveSetCard.tsx`, `src/screens/WorkoutActive.tsx` — wire the signature moment + `surface2`.
- `src/screens/Profile.tsx` — skin picker.
- Legacy-shim screens → `useTheme()`: `src/screens/Progress.tsx`, `src/screens/History.tsx`, `src/screens/TrainingPlan.tsx`, `src/screens/PlanSetup.tsx`, `src/screens/Login.tsx`, `app/(tabs)/_layout.tsx`, `app/index.tsx`.

---

## Phase 1 — Tokens & Skin System

### Task 1: Add `surface2` token to the palette shape

**Files:**
- Modify: `src/ui/colors.ts`

- [ ] **Step 1: Add `surface2` to the interface and both Forge palettes**

In `src/ui/colors.ts`, add `surface2: string;` to `PaletteTokens` (after `surface`). Add to `darkPalette`: `surface2: '#1A211C',` and to `lightPalette`: `surface2: '#F1F4F0',`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (interface and both palettes updated; no consumer requires `surface2` yet).

- [ ] **Step 3: Commit**

```bash
git add src/ui/colors.ts
git commit -m "feat(ui): add surface2 elevation token to palette"
```

### Task 2: Skin registry

**Files:**
- Create: `src/ui/skins.ts`
- Test: `src/ui/__tests__/skins.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/__tests__/skins.test.ts
import { skins, SKIN_IDS, SKIN_META } from '@/ui/skins';
import type { PaletteTokens } from '@/ui/colors';

const TOKEN_KEYS: (keyof PaletteTokens)[] = [
  'bg','surface','surface2','border','borderStrong','ink','inkSecondary','inkTertiary',
  'inkHero','accent','accentSoft','success','successSoft','danger','dangerSoft','onAccent','overlay',
];

describe('skin registry', () => {
  test('exposes all four skins', () => {
    expect(SKIN_IDS).toEqual(['forge', 'iron', 'ember', 'chalk']);
  });
  test('every skin has dark+light with the full token shape', () => {
    for (const id of SKIN_IDS) {
      for (const scheme of ['dark', 'light'] as const) {
        const tokens = skins[id][scheme];
        for (const k of TOKEN_KEYS) {
          expect(typeof tokens[k]).toBe('string');
        }
      }
    }
  });
  test('every skin has a display name', () => {
    for (const id of SKIN_IDS) expect(SKIN_META[id].name.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- skins.test`
Expected: FAIL — cannot find module `@/ui/skins`.

- [ ] **Step 3: Implement the registry**

```ts
// src/ui/skins.ts
import { darkPalette, lightPalette, type PaletteTokens } from './colors';

export type SkinId = 'forge' | 'iron' | 'ember' | 'chalk';
export const SKIN_IDS: SkinId[] = ['forge', 'iron', 'ember', 'chalk'];

export const SKIN_META: Record<SkinId, { name: string; blurb: string }> = {
  forge: { name: 'Forge', blurb: 'Muted green — the original' },
  iron: { name: 'Iron', blurb: 'Cool steel & graphite' },
  ember: { name: 'Ember', blurb: 'Saffron heat' },
  chalk: { name: 'Chalk', blurb: 'Warm paper' },
};

// Derivers keep soft/secondary tokens consistent per skin.
const soft = (hex: string, a: number) => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

function make(p: {
  bg: string; surface: string; surface2: string; border: string; borderStrong: string;
  ink: string; inkSecondary: string; inkTertiary: string; inkHero: string;
  accent: string; danger: string; onAccent: string; overlay: string;
}): PaletteTokens {
  return {
    bg: p.bg, surface: p.surface, surface2: p.surface2, border: p.border, borderStrong: p.borderStrong,
    ink: p.ink, inkSecondary: p.inkSecondary, inkTertiary: p.inkTertiary, inkHero: p.inkHero,
    accent: p.accent, accentSoft: soft(p.accent, 0.12),
    success: p.accent, successSoft: soft(p.accent, 0.12),
    danger: p.danger, dangerSoft: soft(p.danger, 0.12),
    onAccent: p.onAccent, overlay: p.overlay,
  };
}

export const skins: Record<SkinId, { dark: PaletteTokens; light: PaletteTokens }> = {
  forge: { dark: darkPalette, light: lightPalette },
  iron: {
    dark: make({ bg: '#0E1113', surface: '#15191C', surface2: '#1B2024', border: '#222A30', borderStrong: '#2C353C',
      ink: '#C7CDD2', inkSecondary: '#8A929B', inkTertiary: '#5C646C', inkHero: '#EDEFF2',
      accent: '#8A93A0', danger: '#C76B58', onAccent: '#0E1113', overlay: 'rgba(0,0,0,0.55)' }),
    light: make({ bg: '#EEF0F2', surface: '#FFFFFF', surface2: '#F5F7F8', border: '#DDE1E5', borderStrong: '#C9CFD5',
      ink: '#1B1F22', inkSecondary: '#566069', inkTertiary: '#7B838B', inkHero: '#0A0D0F',
      accent: '#5C6573', danger: '#8A4030', onAccent: '#FFFFFF', overlay: 'rgba(30,35,40,0.30)' }),
  },
  ember: {
    dark: make({ bg: '#141110', surface: '#1C1815', surface2: '#241D18', border: '#2A211B', borderStrong: '#382C23',
      ink: '#D6C8BD', inkSecondary: '#A18E80', inkTertiary: '#6E5E52', inkHero: '#F4E7DF',
      accent: '#E05A2C', danger: '#C24B45', onAccent: '#141110', overlay: 'rgba(0,0,0,0.55)' }),
    light: make({ bg: '#F6F1EC', surface: '#FFFFFF', surface2: '#FBF6F0', border: '#E7DDD1', borderStrong: '#D6C8B7',
      ink: '#231C17', inkSecondary: '#6B5C4F', inkTertiary: '#8C7C6D', inkHero: '#0D0907',
      accent: '#C24B22', danger: '#9A3328', onAccent: '#FFFFFF', overlay: 'rgba(40,30,20,0.30)' }),
  },
  chalk: {
    dark: make({ bg: '#16140F', surface: '#1D1A14', surface2: '#24201A', border: '#2A251D', borderStrong: '#383022',
      ink: '#D8D2C4', inkSecondary: '#A39C8B', inkTertiary: '#6E6757', inkHero: '#F0EBDF',
      accent: '#A99B6E', danger: '#B5644E', onAccent: '#16140F', overlay: 'rgba(0,0,0,0.55)' }),
    light: make({ bg: '#F4F1EB', surface: '#FFFFFF', surface2: '#FBF9F4', border: '#E5DFD3', borderStrong: '#D6CFC0',
      ink: '#1A1F1C', inkSecondary: '#5A625C', inkTertiary: '#7E847F', inkHero: '#0A0E0B',
      accent: '#4A4736', danger: '#8A4030', onAccent: '#FFFFFF', overlay: 'rgba(40,30,20,0.30)' }),
  },
};
```

> Note: dark-skin accents (iron `#8A93A0`, chalk `#A99B6E`) are deliberately light enough to pass AA on dark backgrounds; light-skin accents are darkened for the same reason. Task 5 verifies.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- skins.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/skins.ts src/ui/__tests__/skins.test.ts
git commit -m "feat(ui): add four-skin palette registry"
```

### Task 3: SkinContext (state + persistence)

**Files:**
- Create: `src/ui/SkinContext.tsx`
- Test: `src/ui/__tests__/SkinContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/__tests__/SkinContext.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SkinProvider, useSkin, SKIN_STORAGE_KEY } from '@/ui/SkinContext';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <SkinProvider>{children}</SkinProvider>;

describe('SkinContext', () => {
  beforeEach(() => jest.clearAllMocks());

  test('defaults to forge when storage empty', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useSkin(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.skin).toBe('forge');
  });

  test('hydrates the stored skin', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('ember');
    const { result } = renderHook(() => useSkin(), { wrapper });
    await waitFor(() => expect(result.current.skin).toBe('ember'));
  });

  test('setSkin persists', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useSkin(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => { await result.current.setSkin('iron'); });
    expect(result.current.skin).toBe('iron');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SKIN_STORAGE_KEY, 'iron');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SkinContext`
Expected: FAIL — cannot find module `@/ui/SkinContext`.

- [ ] **Step 3: Implement the provider**

```tsx
// src/ui/SkinContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { SKIN_IDS, type SkinId } from './skins';

export const SKIN_STORAGE_KEY = 'flexyug.skin';

interface SkinContextValue {
  skin: SkinId;
  setSkin: (id: SkinId) => Promise<void>;
  hydrated: boolean;
}

const SkinContext = createContext<SkinContextValue | null>(null);

function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && (SKIN_IDS as string[]).includes(v);
}

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const [skin, setSkinState] = useState<SkinId>('forge');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SKIN_STORAGE_KEY)
      .then((stored) => { if (active && isSkinId(stored)) setSkinState(stored); })
      .catch(() => {})
      .finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  const value = useMemo<SkinContextValue>(() => ({
    skin,
    hydrated,
    setSkin: async (id: SkinId) => {
      setSkinState(id);
      try { await AsyncStorage.setItem(SKIN_STORAGE_KEY, id); } catch { /* best-effort */ }
    },
  }), [skin, hydrated]);

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error('useSkin must be used within SkinProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SkinContext`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/SkinContext.tsx src/ui/__tests__/SkinContext.test.tsx
git commit -m "feat(ui): SkinContext with AsyncStorage persistence"
```

### Task 4: Resolve active skin in `useTheme()`

**Files:**
- Modify: `src/ui/useTheme.ts`

- [ ] **Step 1: Update `useTheme` to read the active skin**

Replace the imports and `useTheme` body in `src/ui/useTheme.ts`:

```ts
import { useColorScheme } from 'react-native';

import { type PaletteTokens } from './colors';
import { motion } from './motion';
import { skins } from './skins';
import { useSkin } from './SkinContext';
import { typography } from './typography';

// ... space / radius / touch / Theme interface unchanged ...

export function useTheme(): Theme {
  const raw = useColorScheme();
  const scheme: 'light' | 'dark' = raw === 'light' ? 'light' : 'dark';
  const { skin } = useSkin();
  const color: PaletteTokens = skins[skin][scheme];
  return { color, space, radius, touch, font: typography, motion, scheme };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS — existing 309 + new skin/context tests. (Component tests that call `useTheme` must be rendered under `SkinProvider`; if any existing test breaks here, wrap its render in `SkinProvider` — see Task 6 note.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/useTheme.ts
git commit -m "feat(ui): resolve active skin in useTheme"
```

### Task 5: Extend contrast tests to all skins

**Files:**
- Modify: `src/ui/__tests__/contrast.test.ts`

- [ ] **Step 1: Replace the palette source with the skin registry**

In `src/ui/__tests__/contrast.test.ts`, replace the import and `palettes` array:

```ts
import { skins, SKIN_IDS } from '@/ui/skins';
import type { PaletteTokens } from '@/ui/colors';

// ... luminance / contrast helpers unchanged ...

const palettes: { name: string; tokens: PaletteTokens }[] = SKIN_IDS.flatMap((id) => [
  { name: `${id}-dark`, tokens: skins[id].dark },
  { name: `${id}-light`, tokens: skins[id].light },
]);
```

The `pairs` builder and `describe` block are unchanged — they now run across 8 palettes (4 skins × 2 schemes).

- [ ] **Step 2: Run the contrast tests**

Run: `npm test -- contrast`
Expected: PASS. If any pair fails, nudge that skin's token in `src/ui/skins.ts` (darken light accents / lighten dark accents or ink steps) until AA passes, then re-run. Record any nudge in the commit message.

- [ ] **Step 3: Commit**

```bash
git add src/ui/__tests__/contrast.test.ts src/ui/skins.ts
git commit -m "test(ui): WCAG contrast across all 4 skins x 2 schemes"
```

### Task 6: Wire `SkinProvider` into the app root

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Import and wrap the tree, gate first paint on skin hydration**

In `app/_layout.tsx`: import `import { SkinProvider, useSkin } from '@/ui/SkinContext';`. Wrap the provider tree — put `<SkinProvider>` just inside `<SafeAreaProvider>` (outside `QueryClientProvider` is fine). Then extract the existing return body into an inner `<RootContent />` component that calls `const { hydrated } = useSkin();` and includes `hydrated` in the boot-overlay condition:

```tsx
{(!ready || !fontsLoaded || !hydrated) && !bootError && (
  <View style={bootStyles.overlay}><ActivityIndicator color={theme.color.accent} /></View>
)}
```

(The root chrome `bootStyles`/`stackScreenOptions` may keep using the legacy `theme` shim — they are Forge-pinned defaults shown only during boot.)

- [ ] **Step 2: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS. If a component test renders a `useTheme()` consumer without a provider and now throws "must be used within SkinProvider", wrap that test's render in `<SkinProvider>` (or add a `renderWithSkin` helper in the test).

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(app): provide SkinProvider and gate boot on skin hydration"
```

---

## Phase 2 — Migrate legacy-shim screens to `useTheme()`

These screens import the static `theme` from `@/ui/theme` (Forge-dark only) so skins don't reach them. Migrate each to `useTheme()`. This is mechanical: call `const theme = useTheme();` inside the component, move `StyleSheet.create` into a `useMemo` or convert static-color styles to inline `style={{ color: theme.color.x }}` where they reference palette tokens. Keep spacing/radius/font tokens as-is (those are static).

> Pattern reference: any file already using `useTheme()` (e.g. `src/screens/Today.tsx`, `src/components/ActiveSetCard.tsx`) shows the established idiom — follow it exactly.

### Task 7–13: One task per screen

Repeat this loop for each file. **Per file:**

- [ ] **Step 1:** Replace `import { theme } from '@/ui/theme';` with `import { useTheme } from '@/ui/useTheme';` and add `const theme = useTheme();` at the top of the component.
- [ ] **Step 2:** Move any `StyleSheet.create` that references `theme.color.*` to a `useMemo(() => StyleSheet.create({...}), [theme])` inside the component (spacing/radius/font-only styles can stay module-level).
- [ ] **Step 3:** Run `npm run typecheck` — Expected: PASS.
- [ ] **Step 4:** Run the screen's tests if any (`npm test -- <ScreenName>`) — Expected: PASS (wrap render in `SkinProvider` if needed).
- [ ] **Step 5:** Commit `git commit -m "refactor(ui): migrate <screen> to useTheme for skin support"`.

Files, in order:
- [ ] Task 7: `app/(tabs)/_layout.tsx` (tab bar colors) + `src/ui/TabIcon.tsx` if it hard-codes color
- [ ] Task 8: `app/index.tsx`
- [ ] Task 9: `src/screens/Login.tsx`
- [ ] Task 10: `src/screens/Profile.tsx`
- [ ] Task 11: `src/screens/Progress.tsx` (also pass `theme.color.accent` to `LineChart` line stroke; axes already use `inkTertiary`)
- [ ] Task 12: `src/screens/History.tsx`
- [ ] Task 13: `src/screens/TrainingPlan.tsx` and `src/screens/PlanSetup.tsx`

After Task 13:
- [ ] **Verify no skinnable screen still imports the static shim:** Run `grep -rln "from '@/ui/theme'" src app` — Expected: only files that intentionally use `brand`/`Logo` constants remain. Commit nothing (verification only).

---

## Phase 3 — Adaptive F-bar logo

### Task 14: Rewrite `Logo.tsx` as an adaptive F-bar mark

**Files:**
- Modify: `src/ui/Logo.tsx`
- Test: `src/ui/__tests__/Logo.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/__tests__/Logo.test.tsx
import { render } from '@testing-library/react-native';
import { SkinProvider } from '@/ui/SkinContext';
import { FBarMark } from '@/ui/Logo';

describe('FBarMark', () => {
  test('renders the barbell plate in the provided accent', () => {
    const { UNSAFE_root } = render(
      <SkinProvider><FBarMark size={40} accent="#E05A2C" /></SkinProvider>,
    );
    const rects = UNSAFE_root.findAllByType(require('react-native-svg').Rect);
    const fills = rects.map((r) => r.props.fill);
    expect(fills).toContain('#E05A2C'); // barbell uses accent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Logo`
Expected: FAIL — `FBarMark` not exported.

- [ ] **Step 3: Implement the F-bar mark**

```tsx
// src/ui/Logo.tsx
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { brand } from './theme';
import { useTheme } from './useTheme';

export function FBarMark({ size = 40, accent, ink }: { size?: number; accent?: string; ink?: string }) {
  const theme = useTheme();
  const a = accent ?? theme.color.accent;
  const i = ink ?? theme.color.inkHero;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={22} y={14} width={15} height={72} rx={4} fill={i} />
      <Rect x={22} y={14} width={50} height={15} rx={4} fill={i} />
      <Rect x={22} y={46} width={44} height={11} rx={5} fill={a} />
      <Rect x={60} y={40} width={8} height={23} rx={3} fill={a} />
      <Rect x={70} y={44} width={6} height={15} rx={3} fill={a} />
    </Svg>
  );
}

export function Logo({ size = 40, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <FBarMark size={size} />
      {showWordmark && (
        <Text style={[styles.wordmark, { color: theme.color.inkHero, fontSize: size * 0.6 }]}>
          {brand.name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 8 },
  wordmark: { fontWeight: '600', letterSpacing: -0.5 },
});
```

> Removes the old `DumbbellMark`/`variant` API. If any caller imports `DumbbellMark` or `variant`, update it to `FBarMark`/`Logo` (grep in Step 4).

- [ ] **Step 4: Update callers + run**

Run: `grep -rln "DumbbellMark\|variant=" src app | xargs grep -l "Logo" 2>/dev/null` and update any caller to the new API. Then `npm test -- Logo` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Logo.tsx src/ui/__tests__/Logo.test.tsx
git commit -m "feat(ui): adaptive F-bar logo mark"
```

### Task 15: Regenerate static app/splash/notification icons

**Files:**
- Modify: `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash.png`, `assets/notification-icon.png`

- [ ] **Step 1:** Author an SVG of the F-bar mark (Forge green `#6DA37E` plate, `#E8F0EA` F) on `#0F1411` for the store icon, and export PNGs at the required sizes (icon 1024², adaptive 1024², splash per `app.config.ts`, notification 96²). Use the project's existing asset pipeline or an SVG→PNG export.
- [ ] **Step 2:** Run `npx expo prebuild --no-install` (or the project's image step) if native icon regeneration is required; otherwise Expo consumes `assets/*` directly.
- [ ] **Step 3:** Commit `git commit -m "feat(brand): regenerate app icons from F-bar mark"`.

> If image generation tooling is unavailable in-session, leave the PNGs as-is and flag this as the one manual follow-up; the in-app vector mark (Task 14) is unaffected.

---

## Phase 4 — Signature complete-set moment

### Task 16: Complete-set animation hook with reduced-motion support

**Files:**
- Create: `src/ui/useCompleteSetAnimation.ts`
- Test: `src/ui/__tests__/useCompleteSetAnimation.test.ts`

- [ ] **Step 1: Write the failing test (reduced-motion branch is the testable logic)**

```ts
// src/ui/__tests__/useCompleteSetAnimation.test.ts
import { computeChoreography } from '@/ui/useCompleteSetAnimation';

describe('computeChoreography', () => {
  test('full motion: returns spring + glow + tally durations', () => {
    const c = computeChoreography({ reduceMotion: false, isPR: false });
    expect(c.animateCheck).toBe(true);
    expect(c.glow).toBe(true);
    expect(c.tallyMs).toBe(600);
    expect(c.haptic).toBe('medium');
  });
  test('reduced motion: skips animation, keeps haptic + instant tally', () => {
    const c = computeChoreography({ reduceMotion: true, isPR: false });
    expect(c.animateCheck).toBe(false);
    expect(c.glow).toBe(false);
    expect(c.tallyMs).toBe(0);
    expect(c.haptic).toBe('medium');
  });
  test('PR upgrades the haptic to success and shows the pill', () => {
    const c = computeChoreography({ reduceMotion: false, isPR: true });
    expect(c.haptic).toBe('success');
    expect(c.showPRPill).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useCompleteSetAnimation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure planner + the hook**

```ts
// src/ui/useCompleteSetAnimation.ts
import { useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { haptics } from './haptics';
import { motion } from './motion';

export interface Choreography {
  animateCheck: boolean;
  glow: boolean;
  tallyMs: number;
  haptic: 'light' | 'medium' | 'success';
  showPRPill: boolean;
}

export function computeChoreography(o: { reduceMotion: boolean; isPR: boolean; lastSet?: boolean }): Choreography {
  return {
    animateCheck: !o.reduceMotion,
    glow: !o.reduceMotion,
    tallyMs: o.reduceMotion ? 0 : motion.duration.counter,
    haptic: o.isPR ? 'success' : o.lastSet ? 'medium' : 'medium',
    showPRPill: o.isPR,
  };
}

export function useCompleteSetAnimation() {
  const checkScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  const play = useCallback(async (opts: { isPR: boolean; lastSet?: boolean }) => {
    let reduceMotion = false;
    try { reduceMotion = await AccessibilityInfo.isReduceMotionEnabled(); } catch { /* default false */ }
    const c = computeChoreography({ ...opts, reduceMotion });
    haptics[c.haptic]();
    if (c.animateCheck) {
      checkScale.value = withSequence(withSpring(1.18, motion.spring.rebound), withSpring(1, motion.spring.settle));
    }
    if (c.glow) {
      glowOpacity.value = withSequence(withTiming(0.45, { duration: motion.duration.base }), withTiming(0, { duration: motion.duration.base }));
    }
    return c;
  }, [checkScale, glowOpacity]);

  return { checkScale, glowOpacity, play };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useCompleteSetAnimation`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/useCompleteSetAnimation.ts src/ui/__tests__/useCompleteSetAnimation.test.ts
git commit -m "feat(ui): complete-set choreography hook (reduced-motion safe)"
```

### Task 17: Wire the moment into ActiveSetCard / WorkoutActive

**Files:**
- Modify: `src/components/ActiveSetCard.tsx`, `src/screens/WorkoutActive.tsx`

- [ ] **Step 1:** In `ActiveSetCard.tsx`, on the existing complete-set handler, call `await play({ isPR, lastSet })` (derive `isPR` from the existing PR-detection result already available at the call site; `lastSet` from set index vs. count). Apply `checkScale` to the check's `transform: [{ scale: checkScale }]` via an `Animated.View`, and render an absolutely-positioned accent halo `Animated.View` driven by `glowOpacity` behind the check. Use `theme.color.surface2` for the active-set card background.
- [ ] **Step 2:** In `WorkoutActive.tsx`, animate the session-volume number to its new value over `theme.motion.duration.counter` when a set completes (reuse the existing finish-counter tally approach already in the codebase), and slide in the PR pill when `showPRPill`.
- [ ] **Step 3:** Run `npm run typecheck && npm test` — Expected: PASS (no logic tests change; this is view wiring).
- [ ] **Step 4:** Manual device check: complete a set → spring + haptic + glow + tally; complete a PR set → success haptic + pill. Toggle OS Reduce Motion → animation skips, state still updates.
- [ ] **Step 5:** Commit `git commit -m "feat(workout): signature complete-set moment"`.

---

## Phase 5 — Skin picker in Profile

### Task 18: Skin picker UI

**Files:**
- Modify: `src/screens/Profile.tsx`

- [ ] **Step 1:** Add a "Appearance" section listing all `SKIN_IDS`. For each, render a tappable row/swatch using that skin's resolved tokens for the current scheme (`skins[id][theme.scheme]`): a mini preview (bg + surface + accent dot) + `SKIN_META[id].name` + blurb. Mark the active one with a check. On tap call `const { setSkin } = useSkin(); setSkin(id)` — the whole app re-renders into the new skin immediately.
- [ ] **Step 2:** Run `npm run typecheck && npm test -- Profile` — Expected: PASS (wrap any render in `SkinProvider`).
- [ ] **Step 3:** Manual device check: tapping each skin recolors every screen live; relaunch app → last skin persists.
- [ ] **Step 4:** Commit `git commit -m "feat(profile): skin picker with live previews"`.

---

## Phase 6 — Screen polish pass to the north-star bar

### Task 19: Today, Progress, History, Plan, Login polish

**Files:** `src/screens/Today.tsx`, `src/screens/Progress.tsx`, `src/screens/History.tsx`, `src/screens/HistoryDetail.tsx`, `src/screens/TrainingPlan.tsx`, `src/screens/PlanSetup.tsx`, `src/screens/Login.tsx`

Per screen, apply the spec's fidelity bar (reference `docs/superpowers/specs/2026-05-31-restrained-flourish-design.md` → "Screen-by-screen treatment"):

- [ ] **Step 1:** Add list-mount motion (opacity + `translateY(8→0)` over `theme.motion.duration.base`) to primary list/card entrances. Use `theme.color.surface2` for elevated/active elements. Ensure Geist Mono for all numerals (weights, volumes, dates-as-data). Place the `FBarMark` in Today's header and full `Logo` on Login.
- [ ] **Step 2:** Run `npm run typecheck && npm test` — Expected: PASS.
- [ ] **Step 3:** Manual device pass of the screen across Forge/Iron/Ember/Chalk × light/dark.
- [ ] **Step 4:** Commit per screen `git commit -m "feat(ui): polish <screen> to fidelity bar"`.

---

## Phase 7 — Finish recap

### Task 20: SessionRecap card

**Files:**
- Create: `src/ui/SessionRecap.tsx`
- Modify: the workout-finish flow in `src/screens/WorkoutActive.tsx`

- [ ] **Step 1:** Build `SessionRecap` taking `{ totalVolume, setCount, durationMs, prs }`. Lay out a calm card (not a modal takeover): headline volume number in Geist Mono animating up via `theme.motion.duration.counter`, then set count / duration / PR lines settling in with list-mount motion. Use `useTheme()` tokens.
- [ ] **Step 2:** Render it on the finish step of the workout flow using values already computed at finish (reuse existing finish-summary data; no new queries).
- [ ] **Step 3:** Run `npm run typecheck && npm test` — Expected: PASS.
- [ ] **Step 4:** Manual device check: finishing a workout shows the recap with the volume tally; PRs appear when earned.
- [ ] **Step 5:** Commit `git commit -m "feat(workout): session recap on finish"`.

---

## Phase 8 — Verification & docs

### Task 21: Full verification

- [ ] **Step 1:** Run `npm run typecheck` — Expected: PASS.
- [ ] **Step 2:** Run `npm run lint` — Expected: PASS.
- [ ] **Step 3:** Run `npm test` — Expected: PASS (309 existing + new tests; report the count).
- [ ] **Step 4:** Manual device matrix: every screen × {Forge, Iron, Ember, Chalk} × {light, dark}. Confirm no contrast/legibility issues and the signature moment + recap feel right. Note any token nudges back into `skins.ts` and re-run contrast.
- [ ] **Step 5:** Commit any nudges `git commit -m "fix(ui): contrast nudges from device pass"`.

### Task 22: Update design-system docs

**Files:** `docs/design-system.md`, `README.md`

- [ ] **Step 1:** Update `docs/design-system.md`: document the skin system (4 skins, AsyncStorage persistence, `useSkin`/`useTheme`), the `surface2` token, the signature complete-set moment, the adaptive F-bar logo, and revise the "No saturated brand colors / no particles" lines to reflect skins (still no particles). Update the README feature list (skins + adaptive logo).
- [ ] **Step 2:** Commit `git commit -m "docs: document skin system, signature moment, F-bar logo"`.

---

## Self-Review Notes (spec coverage)

- Skin system → Tasks 1–6. Four skins → Task 2. Persistence (AsyncStorage, not synced) → Task 3. `surface2` → Task 1.
- Skins reach 100% of screens → Phase 2 (Tasks 7–13) migrates every legacy-shim screen.
- Contrast across 4×2 → Task 5. Signature moment + reduced-motion → Tasks 16–17. Adaptive F-bar + icons → Tasks 14–15.
- Skin picker → Task 18. Per-screen fidelity → Phase 6 (Task 19). Finish recap → Task 20. Verification → Task 21. Docs → Task 22.
- Non-goals honored: no Supabase migration, no data/sync/logic changes, no particles.
