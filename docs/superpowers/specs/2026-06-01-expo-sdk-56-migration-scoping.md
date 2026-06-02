# Expo SDK 55 → 56 Migration — Scoping

**Status:** ✅ Executed 2026-06-01 on `chore/expo-sdk-56`. expo 56 / RN 0.85.3 / React 19.2.3 / speech-recognition 56.0.0. typecheck clean, 367 tests green, expo-doctor 21/21, clean iOS build launches. See "Execution notes" at the bottom for what actually surfaced vs. predicted.
**Date:** 2026-06-01
**Trigger:** `expo-speech-recognition@56` (the current line) is SDK-56-only; on our SDK 55 it cannot autolink. We pinned to `3.1.3` (the correct SDK-55 version, voice works). Moving to the 56 line of the module — and staying current generally — requires an Expo SDK upgrade.

## TL;DR

This app is a **clean candidate**: **none of SDK 56's headline breaking changes apply to us**, and we're already on the New Architecture. The work is mostly a mechanical version bump (RN 0.83 → 0.85, all `expo-*` 55 → 56) plus a careful verification pass of a handful of third-party native libraries and our SQLite/sync core. **Estimated effort: ~0.5–1.5 days**, most of it device QA. **Recommendation: do it on its own branch when there's appetite for a focused native pass — not mixed into the design work.**

## What SDK 56 brings

| | SDK 55 (now) | SDK 56 |
| --- | --- | --- |
| React Native | 0.83 | **0.85** (skips 0.84 — two RN versions in one jump) |
| React | 19.2 | 19.2 (unchanged ✅) |
| JS engine | Hermes | **Hermes V1** (default) |
| Architecture | New Arch (forced) | New Arch (forced — no migration) ✅ |
| iOS builds | — | Legacy-arch code removed; heaviest Expo modules ship as **prebuilt frameworks** (~16% faster clean builds) |

## Breaking changes — applicability to THIS app

| SDK 56 breaking change | Applies here? |
| --- | --- |
| Expo Router ↔ React Navigation split (`@react-navigation/*` direct imports break; codemod provided) | **No** — we import only from `expo-router`; zero direct `@react-navigation` imports. |
| `@expo/vector-icons` no longer bundled by `expo` | **No** — we use custom SVG icons (`src/ui/TabIcon.tsx`), never `@expo/vector-icons`. |
| `@expo/dom-webview` becomes default WebView | **No** — no WebView / DOM components; `react-native-webview` not a dependency. |
| iOS deployment target → 16.4 for **custom** module podspecs | **No** — we ship no first-party native module with its own podspec (all our code is JS/TS). Prebuild bumps the app target automatically. |
| Hermes V1 default | Low risk — standard JS; nothing Hermes-version-specific in our code. |

**Net: the disruptive breaking changes are all no-ops for us.** That's the main reason this is low-risk relative to a typical SDK jump.

## Dependency impact

`npx expo install --fix` realigns all Expo-managed packages. The ones to watch (native, SDK-coupled):

| Package | Now | Action |
| --- | --- | --- |
| `expo` + all `expo-*` (router, sqlite, notifications, haptics, speech, etc.) | 55.x | `expo install --fix` → 56.x |
| `react-native` | 0.83.6 | → 0.85.x (via `expo install --fix`) |
| `react-native-reanimated` | 4.2.1 | → SDK-56 pinned 4.x (verify Worklets pairing) |
| `react-native-worklets` | 0.7.4 | → SDK-56 pinned (must match Reanimated) |
| `react-native-screens` | ~4.23 | → SDK-56 pinned |
| `react-native-gesture-handler` | ~2.30 | → SDK-56 pinned |
| `react-native-safe-area-context` | ~5.6 | → SDK-56 pinned |
| `react-native-svg` | 15.15.3 | → SDK-56 pinned (charts + logo + icons depend on it) |
| `@sentry/react-native` | ~7.11 | **Manual check** — confirm an SDK-56/RN-0.85-compatible release; bump if needed |
| `expo-speech-recognition` | 3.1.3 | → **56.0.0** (the whole point) |
| `@supabase/supabase-js`, `@tanstack/react-query` | current | JS-only — low risk, leave unless peer warnings |

## Risk assessment (app-specific)

- **Local-first SQLite as source of truth** (`expo-sqlite`) — the spine of the app. Highest-value thing to re-verify: DB init + migrations on a fresh install, the outbox/sync engine round-trip, and that no `execAsync`/transaction semantics changed in the `expo-sqlite` 56 line. *Mitigation:* our 367 Jest tests cover query/sync logic against the `better-sqlite3` mock and stay valid; the device pass must exercise a real workout end-to-end.
- **Reanimated 4 + Worklets pairing** — version skew between `react-native-reanimated` and `react-native-worklets` is the classic breakage. *Mitigation:* take both from `expo install --fix` together; smoke-test the signature complete-set moment, rest bar, and `FadeInView`.
- **Sentry** — `@sentry/react-native` tracks RN closely; ~7.11 may predate RN 0.85. *Mitigation:* check its changelog, bump to the RN-0.85 line; it's DSN-gated so failure is non-fatal.
- **Two RN versions at once (0.83→0.85)** — slightly more surface than a single-step jump, but New Arch is already on, so the usual New-Arch breakage is behind us.
- **`react-native-web`** (`^0.21`) — only matters if the web target is still used; verify or drop.

## Migration procedure (when executed)

Run on a **dedicated branch** (`chore/expo-sdk-56`), not the design branch.

1. `git switch -c chore/expo-sdk-56` from updated `main`.
2. `npx expo install expo@^56.0.0 --fix` — bumps `expo`, RN, and all Expo-managed natives.
3. `npx expo install expo-speech-recognition@56` — move voice to the 56 line; revert the `app.config.ts` permission strings? (keep them — still required).
4. Manually bump `@sentry/react-native` to its RN-0.85 release if `expo-doctor` flags it.
5. `npx expo-doctor@latest` — resolve every warning (version mismatches, peer deps, config plugins).
6. `rm -rf ios android` (they're gitignored/regenerated) → `npx expo prebuild --clean` → reinstall pods.
7. `npm run typecheck` → fix any RN 0.85 / React 19.2 type changes.
8. `npm test` — the 367-test suite must stay green (logic is RN-agnostic).
9. Clean dev build + **device QA matrix**: app boot + DB migrate on fresh install, a full workout (incl. the signature moment + recap), all 4 skins × light/dark, charts, rest timer/notifications, sync round-trip, and **voice** (now on 56 — verify mic permission + on-device transcription).
10. Update `README.md` tech-stack table (SDK/RN versions) + this doc's status.

## Effort

- **Mechanical bump + typecheck + tests:** ~2–4 hrs (clean candidate; few/no code edits expected).
- **Native rebuild + `expo-doctor` cleanup + Sentry/Reanimated verification:** ~2–4 hrs.
- **Device QA matrix (the real cost):** ~2–4 hrs.
- **Total: ~0.5–1.5 focused days**, dominated by verification, assuming no surprise from a lagging third-party native lib.

## Recommendation

Defer until there's a dedicated slot for a native pass, then execute on `chore/expo-sdk-56`. Because the breaking changes don't touch us and we're already on New Arch, this is about as low-risk as an SDK major gets — but it still warrants its own branch, its own PR, and a real device QA pass rather than being folded into feature work. Until then, `expo-speech-recognition@3.1.3` on SDK 55 is the correct, working state.

## Execution notes (what actually surfaced)

As predicted, the headline breaking changes were all no-ops here. The real work was a handful of small fixes:

- **SDK 56 requires explicit config plugins** for `expo-splash-screen`, `expo-sqlite`, `expo-status-bar` — added to `app.config.ts`. The top-level `splash` config moved into the `expo-splash-screen` plugin.
- **`expo-speech-recognition@56` autolinks cleanly on SDK 56** (the whole point) — and its config plugin (already present in `app.config.ts`) generates the mic/speech `Info.plist` strings, so the manual `infoPlist` entries from the SDK-55 stopgap were removed.
- **RN 0.85 type changes:** `StyleSheet.absoluteFillObject` dropped from types (inlined the object in 4 files); `tabBarIcon`'s `color` is now `ColorValue` (updated callbacks + `TabIcon` prop).
- **TypeScript:** SDK 56 wants TS `~6.0.3`, but TS 6.0 breaks `@types/jest@29` global resolution under `ts-jest@29` (all suites fail to compile). Pinned `typescript@~5.9` and recorded it in `expo.install.exclude` so `expo-doctor` stays green. Revisit when the jest stack supports TS 6.
- **`react-test-renderer`** had to be bumped to `19.2.3` to match React.
- **eslint:** SDK 56's `eslint-config-expo` enables React Compiler rules (`react-hooks/refs|immutability|purity|set-state-in-effect`) that false-positive on Reanimated/gesture code — downgraded to `warn`. ~30 findings remain as warnings; a future cleanup could address them where genuine.

One real bug surfaced (not caused) by the migration:

- **Sync transaction race.** `expo-sqlite`'s `withTransactionAsync` is raw `BEGIN/COMMIT/ROLLBACK` (not nestable). The sync engine's `pushInFlight`/`pullInFlight` guards prevent push-vs-push and pull-vs-pull, but a **push transaction could overlap a pull transaction** (triggered from different startup events) → "cannot rollback - no transaction is active", which masked the real error and failed the sync. Latent on SDK 55; SDK 56's faster New-Arch startup made it fire on every launch. Fixed with a single sync mutex in `engine.ts` (invokes synchronously when uncontended, FIFO-queues under contention) + a regression test. Also worth a follow-up: the two unhandled in-flight runtime stalls aside, this is the only place the codebase relied on `withTransactionAsync` concurrency safety.

Total wall-clock: a bit over the estimated half-day once the sync race + clean-rebuild debugging is counted; no surprises from lagging third-party native libs (Sentry ~7.11 passed doctor on RN 0.85). Note: after an SDK bump, **always restart Metro with `-c`** — a stale Metro cache from the prior SDK serves an incompatible bundle and looks like an app crash.

## Sources

- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [How to upgrade to Expo SDK 56](https://expo.dev/blog/upgrading-to-sdk-56)
- [Upgrade Expo SDK walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [React Native 0.84 — Hermes V1 by default](https://reactnative.dev/blog/2026/02/11/react-native-0.84)
- [Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture/)
