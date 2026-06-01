# FlexYug Threat Model

- **Status:** living document
- **Last reviewed:** 2026-05-31

## Scope

This document captures the threat actors, asset inventory, and risk
acceptances for the FlexYug (vyayamy) mobile client. Scope is limited
to client-side concerns; server-side Supabase RLS is documented in
the migration files under `supabase/migrations/`.

## Assets

| Asset | Storage | Sensitivity |
| --- | --- | --- |
| Workout data (exercises, weights, reps, timestamps) | Local SQLite + Supabase | Medium |
| Personal records | Local SQLite + Supabase | Medium |
| User identity (Supabase user id) | AsyncStorage (Supabase auth) | High |
| Magic-link session JWT | AsyncStorage (Supabase auth) | High |
| Rest timer + override preferences | AsyncStorage (`@flexyug/*`) | Low |

## Threat actors

| Actor | Capability | In scope |
| --- | --- | --- |
| Casual observer of the phone screen | Visual inspection | Yes |
| Thief with a non-jailbroken/non-rooted phone | OS-level only | Yes |
| Thief with a jailbroken/rooted phone | App sandbox extraction | **No** — see "Risk acceptances" |
| Malicious app on the same device | Inter-app communication via deep links | Yes |
| Network MITM | Wire-level traffic interception | Yes |
| Compromised Supabase project key | Server-side access | Out of scope (Supabase RLS) |

## Mitigations in place

- **HTTPS only** — Supabase URLs use HTTPS; no fallback to HTTP
- **RLS with USING + WITH CHECK on every table** (post-`00009_security_hardening.sql`)
- **Server-owned `updated_at` trigger** prevents client clock-skew tampering
- **Magic-link deep-link handler guards against React 19 strict-mode double-mount** (`app/_layout.tsx:101-126`)
- **Sentry PII off** (`sendDefaultPii: false`) + URL query/fragment scrubbing (`src/lib/errorReporting.ts` — `beforeBreadcrumb`/`beforeSend` hooks + `scrubUrl` helper)
- **Notifications local-only**; payload is a fixed generic string ("Rest complete"), carrying no workout data or PII (`src/lib/restNotifications.ts`)
- **Sign-out clears Sync state, React Query cache, local SQLite, and all `@flexyug/*` AsyncStorage keys** (`src/sync/engine.ts handleSignOut`)
- **Deep links land on a session-gated layout**; unauthenticated routes redirect to `/login` (`app/(tabs)/_layout.tsx`)

## Risk acceptances

### SQLite at-rest is not encrypted (accepted)

`src/db/client.ts` opens `flexyug.db` without an encryption library (SQLCipher,
expo-sqlite-encrypted, etc.). On a non-compromised device, OS-level sandbox
protection (iOS Data Protection, Android FBE) keeps the file inaccessible
to other apps and to most lost/stolen-phone scenarios. On a jailbroken or
rooted device, the database is extractable as plaintext.

**Rationale for accepting:**

- Workout data is medium-sensitivity at most; a forensic adversary with
  jailbreak access has many higher-value targets on the device
- SQLCipher integration adds a ~1MB native binary, requires key derivation
  + secure storage of the key, and creates a recovery hazard if the key is
  lost (the user's local data becomes permanently unreadable)
- The Supabase mirror provides recovery if the local DB is wiped; the
  inverse — protecting against the case where someone has the device but
  not credentials — is poorly served by full encryption because
  Supabase data is recoverable via password reset anyway

**Revisit if:** a paying customer requires HIPAA/healthcare-grade
protection, OR the data scope expands to include medical conditions,
identifying photos, or financial records.

### Local mutation throw has no retry (accepted)

`src/db/mutations.ts enqueueMutation` propagates SQLite lock/IO errors to
the caller, which surfaces as a toast. There's no automatic retry. On a
single-device app, SQLite contention is extremely rare; the user can re-
attempt the action manually. Adding retry adds complexity and can mask
real DB-corruption issues.

**Revisit if:** Sentry breadcrumbs show recurring transient SQLite errors.

## Out of scope

- Server-side compromise of the Supabase project
- Supply-chain attacks on `expo-google-fonts/*`, React Native, or other
  transitively-loaded npm packages
- Side-channel attacks (timing, power analysis) on cryptographic operations
- Adversaries with the user's unlocked phone in hand
- Insider threats at hosting provider (Supabase, Cloudflare, Sentry)

## Review cadence

This document is reviewed when:
- A new asset is added (e.g. body-measurement photos, payment data)
- A new external integration ships (e.g. Apple Health, share-to-social)
- A real incident occurs that updates our understanding of attacker
  capabilities or asset value
