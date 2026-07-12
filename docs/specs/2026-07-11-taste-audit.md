# Taste Audit: Forged Iron on Device (2026-07-11)

Design audit per taste-skill v2 Redesign Protocol (§11.B: audit before touching). Evidence: live app on iOS simulator (iPhone 17, iOS 26.4), all routes screenshotted in both schemes. Screenshots stored locally at `.claude/audit-shots/` (kept out of git deliberately).

**Design read:** native mobile strength-training app for design-conscious consumer lifters, dark industrial "Forged Iron" language (iron-black + ember, Anton display, Geist/GeistMono, slab depth, near-sharp radii). taste-skill v2 self-scopes to web; its transferable rules (dials, AI-tells, typography/color discipline, redesign levers) are applied here, adapted to React Native.

**Target dials** (§1.A "premium consumer / brand"): VARIANCE 7-8 · MOTION 5-7 · DENSITY 3-4.

## Dial reading of the current app (§11.B)

| Screen           | VARIANCE | MOTION\* | DENSITY | Notes                                                              |
| ---------------- | -------- | -------- | ------- | ------------------------------------------------------------------ |
| Today            | 4        | -        | 3       | One display moment (READY TO LIFT.), then uniform plate stack      |
| Workout (active) | 5        | -        | 3       | 82pt hero numerals are the app's best moment (from code; see Gaps) |
| Progress         | 4        | -        | 4       | Chart + segments + PR list, all same-width slabs                   |
| History          | 3        | -        | 4       | Identical rows, all titled "Workout"                               |
| Profile          | 3        | -        | 3       | Uniform stack; SIGN OUT is the loudest element                     |
| Plan / Setup     | 3        | -        | 4       | Ember flood; uniform row plates                                    |
| Login            | 6        | -        | 2       | Strongest screen: mark + wordmark + one card                       |

\*Static screenshots can't score motion; from code, motion infra is real (reanimated choreography, spring tokens, PR glow) but concentrated in WorkoutActive. Everywhere else is static — effective MOTION ≈ 3 against a 5-7 target.

**Overall: VARIANCE ~4 vs target 7-8.** This is the single biggest reason the UI "isn't popping": the token system is disciplined but every screen composes identically — eyebrow, headline, then a column of same-width bordered plates. The brand has one voice and one sentence structure.

## What is genuinely strong (preserve; §11.C)

- **Token discipline:** one color source, zero raw hex in src (guarded by test), WCAG-gated palette, spacing/radius/depth scales. Rare even in professional apps.
- **The slab language:** Plate's hard-offset slab + press-sink is a real, ownable materiality. Nothing generic about it.
- **Type trio:** Anton condensed display + Geist + GeistMono with a deliberate scale (82pt hero numerals). The ingredients of a distinctive voice are all present.
- **Brand mark:** the loaded-end barbell mark is strong and theme-aware.
- **Craft details:** reduced-motion planners, haptic map, a11y actions, themed sheets. No AI-slop comments, no fake data, no em-dashes found on any screen.

## Defects found on device (ranked)

**Bugs (fix regardless of design direction):**

1. History nav header shows raw route name **"history/index"**.
2. Progress y-axis top tick renders **"000 kg"** (truncated; should read 10000 kg or be compacted, e.g. 10k).
3. **"1 exercises"** pluralization on History cards; meta rows like "0/0 sets · 1 exercises" read broken.
4. Raw internal error text in user-facing toast: "fetch failed: A server with the specified hostname could not be found" with a **164** count badge (backlog 8.5, seen live).
5. Offline resilience: with Supabase unreachable, the app **signed the user out on relaunch** (token refresh failure → root gate → login). For a local-first app this is the worst possible failure mode; months of local data become inaccessible behind a login that needs the very server that's down.
6. Deep-linking `/workout/active` while signed out renders a **blank screen** (nav header only) instead of redirecting.
7. Every workout is titled "Workout" (dead auto-title path, prior finding #151) — confirmed on Today, History, and workout header.

**Taste violations (per adapted §4/§9):** 8. **Eyebrow flood:** 3-4 uppercase tracked micro-labels per screen (SATURDAY MORNING / LAST WORKOUT / RECENT / HISTORY→ on Today alone). The pattern that should mark _one_ moment per screen marks everything, flattening hierarchy (§4.7 eyebrow restraint). 9. **Nav-title duplication:** every screen shows the stock nav header title and then an Anton headline saying the same word (Progress/PROGRESS, Profile/PROFILE, Training plan/TRAINING PLAN). The display font's job is stolen by chrome. 10. **Ember flood on Plan Setup:** accent simultaneously means "selected segment", "rest day", and "exercise chip" — three different semantics, six+ filled-ember elements on one screen. On Progress, two segment rows + chart line + PR markers + date dots all ember. Accent no longer signals anything (§4.2 discipline: the LILA-rule override says keep the brand color, but execute with intent). 11. **"Rest day" is the loudest element on Plan Setup** and **SIGN OUT (danger-filled, full-width) is the loudest element on Profile** — emphasis inverted relative to user intent. 12. **Empty/error surfaces are unstyled:** "No active workout." floating in a void; the sync-failure banner is a flat red slab with system-red tint not drawn from the palette's danger treatment (visually reads foreign next to the ember system). 13. **Uniform plate width:** every card/button/row spans the full page width. No 2-col, no asymmetry, no scale contrast between primary and secondary surfaces (VARIANCE 4 vs 7-8 target). The 82pt numeral moment exists only inside WorkoutActive.

**Evidence gaps:** live WorkoutActive (rest countdown, PR glow, recap) could not be captured — the dead Supabase host blocks sign-in entirely (NXDOMAIN on grcdmostlxonccfefrgw.supabase.co). Assessment of those states is code-based only.

## Verdict (§11.E)

**Redesign - Preserve. Targeted evolution, not overhaul.** The Forged Iron language is distinctive, internally consistent, and half-executed rather than wrong. IA is sound, tokens are sound, primitives are sound. The gap is compositional: monotone screen structure, flooded accent, chrome stealing the brand's voice, and unfinished corners (empty states, copy, titles). Replacing the visual language would discard the best asset (the slab/ember/Anton identity) to fix problems that are execution-level.

**Lever assignment (§11.D, priority order):**

1. ~~Typography refresh~~ — the scale is right; instead: _deploy_ it (kill nav-title duplication, give each screen one true display moment, add numeral moments outside WorkoutActive).
2. **Spacing & rhythm** — vary plate widths/compositions; break the single-column monotony (2-col stat tiles on Progress, asymmetric Today primary slot).
3. **Color recalibration** — ratify one accent semantic ("the current/active thing"); demote rest-day/segment-selected to surface2+borderStrong; restyle SIGN OUT as quiet destructive-ghost; make the sync banner use the palette's danger treatment.
4. **Motion layer** — extend existing motion tokens beyond WorkoutActive: Today primary-slot entrance, History row settle, segment change tick. All reduced-motion-gated, all reanimated.
5. **Key-screen recomposition** — Progress (weakest screen, prior 4.1) and Today's primary slot.
6. Full block replacement — not needed anywhere.

Bugs 1-7 and the P1 UX traps from the June backlog (CollisionSheet escape, banked-set edit, create-from-picker, auth error surfacing) ride along regardless of levers.

**Environmental blocker for the owner:** the Supabase project is gone (NXDOMAIN). Until a project is restored/reconfigured in `.env`, nobody can sign in and sync/auth flows can't be exercised on device. The simulator session was lost to this during the audit (local data intact; DB backed up at `Documents/SQLite/flexyug.db.audit-backup` in the sim container).
