# Blacktop Overhaul Spec (Direction C, approved 2026-07-11)

User-approved overhaul (taste-skill v2 §11.A Redesign - Overhaul): new visual language, unchanged IA, routes, copy voice, and the loaded-end mark (recolor only). Supersedes Forged Iron's iron+ember palette; keeps its architecture (single token source, contrast suite, noRawHex guard, Plate/Text/Sheet primitives, motion tokens).

**Language:** Swiss brutalism on gym blacktop. True mono (blacktop `#121212` / chalk `#F2F1ED`) + one volt signal `#D8FF3E`. Inversion is elevation: active/primary surfaces flip to chalk with blacktop type; shadows retire. Anton stays, weaponized (XXL scale contrast, outline variant, deliberate line breaks). Numbers stay GeistMono, everywhere, tabular.

**Dials:** VARIANCE 9 · MOTION 7 · DENSITY 3. Reduced-motion collapses everything to instant (existing planners).

## Tokens (`src/ui/colors.ts` — keep `PaletteTokens` shape; contrast suite must pass)

Dark ("blacktop", default):

- bg `#121212` · surface `#1A1A19` · surface2 `#232322`
- border `#333331` · borderStrong `#55554F`
- ink `#F2F1ED` · inkSecondary `#A8A8A1` · inkTertiary `#66665F` · inkHero `#FAF9F4`
- accent `#D8FF3E` (volt) · onAccent `#121212` · accentSoft `rgba(216,255,62,0.12)`
- success = accent (keep the alias) · danger `#FF6A55` · dangerSoft `rgba(255,106,85,0.12)`
- overlay `rgba(0,0,0,0.65)` · slab `#000000` (legacy token; shadows retired in plateStyles)

Light ("chalk", chalk-first with black panels):

- bg `#EFEEE9` · surface `#F7F6F1` · surface2 `#E4E3DC`
- border `#CFCEC6` · borderStrong `#141414`
- ink `#141414` · inkSecondary `#4F4F4A` · inkTertiary `#6E6E66` · inkHero `#0C0C0C`
- accent: volt fails as text on chalk. Rule: **volt only ever sits on blacktop.** Light accent token = pressed-volt `#55650B` (tune to pass AA); volt appears in light mode only inside inverted black panels (via panel-scoped tokens or onPanel styles).
- onAccent `#F2F1ED` (on pressed-volt) · danger `#B3402F`
- slab `#141414`

Implementation notes: `app.config.ts` colors must come from this file (Phase 2d prerequisite). Update `contrast.test.ts` expectations with the new pairs; extend with onAccent/accent, danger pairs (backlog 7.8) in the same commit. Radii: collapse `radius.sm/md/lg/card/button` to 0 (shape lock: all-sharp); keep `full` for the avatar only.

## Materiality (`Plate`, `plateStyles.ts`)

- Retire the offset slab shadow and press-sink translation.
- Plate tones: `panel` (DEFAULT dark: surface + 1.5px border `border`), `inverted` (chalk bg, blacktop ink — THE elevation/emphasis state), `ghost` (transparent, borderless), `volt` (volt bg, blacktop ink — primary CTA + PR moments only).
- Press feedback: 60ms opacity dip + `scale 0.985` (no translate). Reduced-motion: opacity only.
- Selection (segments, chips, tabs): inversion, never volt. Volt = "act now / achievement", inversion = "current", ghost = "available". One semantic per treatment (fixes the ember-flood).

## Typography (`typography.ts`, `textVariants.ts`)

- Families unchanged (Anton/Geist/GeistMono). Scale unchanged except: add `displayXXL 96` (Anton, tracking -1) for one-per-screen poster moments with deliberate `\n` breaks.
- New `OutlineDisplay` component (react-native-svg `<Text>` stroke: 1.5px ink, transparent fill) for a single emphasized word inside a display headline. Max one per screen; never on user content.
- Eyebrow budget: **max 1 uppercase tracked label per screen** (taste §4.7). Everything else demoted to `meta` sentence-case or removed.
- Mono strips (like `3/3 SETS · 2600 VOL · 14 MIN`) become the standard metadata treatment (GeistMono, inkTertiary, max 1 middot-run per strip).

## Motion (extend `motion.ts`; all reanimated, reduced-motion-gated)

- `settleSlam`: display type enters translateY 12→0 + overshoot (spring snappy), once per screen mount.
- List stagger: rows fade/rise 8px, 40ms cascade (History, Recent, PR list).
- PR/volt flash: existing glow choreography recolored volt, plus a 120ms chalk↔blacktop inversion blink on the volume bar. Haptic map unchanged.
- Segment/tab change: 150ms inversion sweep. Toast/stripe/rest-bar reanimated migration (Phase 2e) is a prerequisite.

## Chrome & navigation

- Tab screens: `headerShown: false` — kills the Today/PROGRESS/PROFILE duplication; the in-screen display headline IS the title.
- Pushed screens keep native back + proper `title` (fixes the raw "history/index" bug).
- Tab bar: blacktop, chalk icons, active = volt underline tick (not filled), labels mono 10px.

## Per-screen composition (fixes VARIANCE 4 → 9)

- **Today:** one eyebrow (greeting) + `displayXXL` two-line headline with one outline word ("READY TO **LIFT.**"). Primary slot = `inverted` panel (Resume/Repeat) with mono strip; Blank/Templates = ghost row (not two equal plates). Recent = borderless mono strip rows under a single hairline.
- **WorkoutActive:** keep the 82pt numeral hero (it was already right); volt only on PR pill/glow + finish CTA; ghost sets as mono strip; empty state = composed (mark + display line + one CTA), not floating text.
- **Progress:** recompose (prior 4.1): 2-col stat tiles (best volume / heaviest, inverted panels, mono numerals) above a full-bleed chart — volt line, chalk PR rings, mono axis (fix the "000 kg" tick with compact notation: `10k`). Segments → text tabs with inversion underline.
- **History:** auto-title finally live (1.6: day-of-week titles via existing `dayOfWeek.ts`); rows = title + mono strip; month headers = mono, not eyebrows; fix pluralization ("1 exercise").
- **Profile:** avatar = chalk-on-blacktop circle; rows ghost; SIGN OUT = quiet destructive ghost row at the bottom (danger text, no fill).
- **Plan/Setup:** training day = inverted chip, rest day = ghost text (quiet); "Weekly/Cycle" = text tabs. Kill the ember-flood pattern entirely.
- **Login:** already the best screen; recolor + volt CTA + outline word in the wordmark tagline moment.

## Copy pass (rides along)

Fix in the same screens: "1 exercises" pluralization; raw `err.message` toasts → friendly copy + `captureException` (8.5); "+ Blank" → "Blank workout"; a11y-label casing mismatches; zero em-dashes anywhere (§9.G — audit found none in UI; keep it that way).

## Guardrails

- `noRawHex` guard stays; only `colors.ts` carries hex.
- `contrast.test.ts` updated pairs must pass AA before any screen work starts.
- §14 pre-flight (adapted) per screen: ≤1 eyebrow, one display moment, volt-semantic check, both schemes screenshotted, reduced-motion path verified.
- Before/after simulator screenshots for every screen at the end (compare against `.claude/audit-shots/`).
