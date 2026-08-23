# FlexYug Threat Model

- **Status:** living document
- **Last reviewed:** 2026-06-11

## Scope

This document captures the threat actors, asset inventory, and risk
acceptances for the FlexYug (vyayamy) mobile client. Scope is limited
to client-side concerns; server-side Supabase RLS is documented in
the migration files under `supabase/migrations/`.

## Assets

| Asset                                               | Storage                                       | Sensitivity |
| --------------------------------------------------- | --------------------------------------------- | ----------- |
| Workout data (exercises, weights, reps, timestamps) | Local SQLite + Supabase                       | Medium      |
| Personal records                                    | Local SQLite + Supabase                       | Medium      |
| User identity (Supabase user id)                    | AsyncStorage (AES-encrypted; key in Keychain) | High        |
| Magic-link session JWT                              | AsyncStorage (AES-encrypted; key in Keychain) | High        |
| Rest timer + override preferences                   | AsyncStorage (`@flexyug/*`)                   | Low         |

## Threat actors

| Actor                                        | Capability                             | In scope                                         |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| Casual observer of the phone screen          | Visual inspection                      | Yes                                              |
| Thief with a non-jailbroken/non-rooted phone | OS-level only                          | Yes                                              |
| Thief with a jailbroken/rooted phone         | App sandbox extraction                 | **No** (see "Risk acceptances" and "Open risks") |
| Malicious app on the same device             | Inter-app communication via deep links | Yes                                              |
| Network MITM                                 | Wire-level traffic interception        | Yes                                              |
| Compromised Supabase project key             | Server-side access                     | Out of scope (Supabase RLS)                      |

## Mitigations in place

- **HTTPS only**: Supabase URLs use HTTPS; no fallback to HTTP
- **RLS with USING + WITH CHECK on every table** (post-`00009_security_hardening.sql`)
- **Server-owned `updated_at` trigger** prevents client clock-skew tampering
- **Magic-link deep-link handler guards against React 19 strict-mode double-mount** (`app/_layout.tsx`, root deep-link handler)
- **Sentry PII off** (`sendDefaultPii: false`) + URL query/fragment scrubbing (`src/lib/errorReporting.ts`: `beforeBreadcrumb`/`beforeSend` hooks + `scrubUrl` helper)
- **Notifications local-only**; payload is a fixed generic string ("Rest complete"), carrying no workout data or PII (`src/lib/restNotifications.ts`)
- **Sign-out clears Sync state, React Query cache, local SQLite, and all `@flexyug/*` AsyncStorage keys** (`src/sync/engine.ts handleSignOut`)
- **Single root-level auth gate covers ALL routes** (tabs plus sibling stack routes like `workout/active` and `history/[id]`); without a session, any route except `/login` redirects there (`app/_layout.tsx` `AppNavigator`, #91)
- **Magic-link redirect allowlist pinned to the exact app callback `flexyug://login`**; no app-scheme wildcards. `exp://*` exists only in local dev config and must never reach the hosted project (`supabase/config.toml`, #89).
- **Magic-link abuse limits codified in `supabase/config.toml` (#93)**: email send rate limit (4/hr), token-verification and sign-in rate limits, 15-minute OTP expiry, 1-minute resend frequency, and email confirmation required before a session is issued.

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
  - secure storage of the key, and creates a recovery hazard if the key is
    lost (the user's local data becomes permanently unreadable)
- The Supabase mirror provides recovery if the local DB is wiped; the
  inverse (protecting against the case where someone has the device but
  not credentials) is poorly served by full encryption because
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

## Open risks

### Session JWT encrypted at rest (#88, closed 2026-08-22)

The Supabase auth session (including the refresh token) is stored via
`storage: secureSessionStorage` in `src/auth/supabase.ts`, backed by
`src/auth/secureSessionStorage.ts`. On every write, a fresh random
256-bit AES key is generated and stored in the iOS Keychain via
`expo-secure-store` (`kSecAttrAccessibleAfterFirstUnlock`, so background
token refresh keeps working); the session itself is encrypted with
AES-CTR-256 under that key and the hex ciphertext is stored in
AsyncStorage (the Keychain's ~4KB practical limit can't hold a full
session). Because each write gets its own key, the CTR counter can
always start at 1 with no risk of key/counter reuse. Pre-#88 sessions
were stored as plaintext JSON under the same AsyncStorage key; those are
detected on first read (plaintext starts with `{`, ciphertext is hex),
re-encrypted in place, and returned — the user is never forced to
re-log-in. On sign-out, Supabase calls the adapter's `removeItem`, which
clears both the AsyncStorage ciphertext blob and the Keychain key.

**Residual risk (accepted):** a jailbroken/rooted-device attacker who can
extract the Keychain contents still recovers the session — consistent
with this document's existing "SQLite at-rest is not encrypted
(accepted)" posture; encrypting session storage does not change the
device-attacker trust boundary, only the plain-fs-extraction case.
Separately, the write is two steps (Keychain key, then AsyncStorage
blob) and is not atomic: a crash after the Keychain write but before
the AsyncStorage write can either orphan a Keychain key with no blob
(first write; next read finds no AsyncStorage entry and returns `null`
cleanly) or, on a token-refresh rewrite, leave the stale AsyncStorage
blob paired with the new Keychain key (next read decrypts old
ciphertext under the wrong key — CTR has no integrity check — yielding
garbage that surfaces as a session parse error rather than data
exposure; recovery is re-login). Neither crash state exposes the
session; this is inherent to the official Supabase RN
"LargeSecureStore" pattern this adapter follows.

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
