# Wrapup Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap from the 2026-08-22 completion review: green CI, encrypted session storage (#88), a tagged v0.1.0, and the app live on TestFlight with the device-QA rider executed.

**Architecture:** Three code tasks (format fix, an AES-encrypted Supabase session-storage adapter using the official Supabase RN `LargeSecureStore` pattern, wiring + threat-model closure), then a native rebuild, a release tag, and the TestFlight pipeline from docs/TESTING.md Path 2. User-owed actions (Apple enrollment, dashboard checks, account hygiene) are pulled out into their own rail because no agent can perform them.

**Tech Stack:** Expo SDK 56 / RN 0.85, TypeScript, jest + ts-jest, expo-secure-store (new), aes-js (new), Supabase JS v2, EAS CLI.

## Global Constraints

- Node >= 20 (`.nvmrc`); run everything from repo root.
- CocoaPods on this Mac needs `LANG=en_US.UTF-8` exported first (Ruby 4 encoding crash otherwise; non-interactive shells lack it).
- Release/archive builds need `SENTRY_DISABLE_AUTO_UPLOAD=true` unless a Sentry auth token is configured.
- After adding any native module, `npm run prebuild:clean` + `npx pod-install` before any `expo run:ios` — never reuse the stale `ios/` (that was the Batch-1 branding bug).
- Commit style: conventional commits, matching recent history (`fix(...)`, `feat(...)`, `docs:`, `style:`).
- The hosted Supabase project ref is `oqwpjksgnwthqmgeqrnu`.
- Decisions already made by the owner (2026-08-22): implement encryption for #88 (not risk-accept); distribution = paid Apple enrollment + TestFlight (no new sideload IPA); version stays 0.1.0, tagged `v0.1.0`.

---

### Task 1: Green CI (Prettier pass)

CI on main has failed on `format:check` for the last three pushes. Everything else is green.

**Files:**

- Modify: 8 files Prettier flags (README.md, ARCHITECTURE.md, `src/components/activeSet.ts`, `src/ui/icons.tsx`, 4 docs/specs files) — content unchanged, formatting only.

**Interfaces:**

- Produces: a green `CI` run on main; every later task branches from this commit.

- [ ] **Step 1: Confirm the failure is format-only**

Run: `npx prettier --check .`
Expected: `Code style issues found in 8 files.`

- [ ] **Step 2: Fix**

Run: `npm run format`
Expected: ends with the 8 files listed as changed; `git status` shows only those files modified.

- [ ] **Step 3: Verify all four CI gates locally**

Run: `npm run format:check && npm run typecheck && npm run lint && npm test`
Expected: format "All matched files use Prettier code style!", tsc silent, lint 0 errors (33 warnings OK), 753 tests pass.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "style: prettier pass over 8 drifted files; greens format:check on CI"
git push
```

- [ ] **Step 5: Watch CI go green**

Run: `gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: `✓ ... CI` completed success. Do not proceed to Task 5 (tag) until this is true.

---

### Task 2: Encrypted session storage adapter (#88) — TDD

The Supabase session JWT currently persists as plaintext in AsyncStorage (`src/auth/supabase.ts:55`). Implement the official Supabase RN pattern: a per-item 256-bit AES-CTR key held in the iOS Keychain via expo-secure-store, ciphertext in AsyncStorage (sessions can exceed the Keychain's ~4KB practical limit, so the blob itself cannot live in SecureStore).

**Files:**

- Create: `src/auth/secureSessionStorage.ts`
- Create: `src/auth/__tests__/secureSessionStorage.test.ts`
- Create: `src/db/__mocks__/expo-secure-store.ts` (jest mock, same home as the existing expo-crypto/expo-sqlite mocks)
- Modify: `src/db/__mocks__/expo-crypto.ts` (add `getRandomBytes`)
- Modify: `package.json` (deps + jest `moduleNameMapper` entry)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `export const secureSessionStorage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }` — the exact shape `createClient`'s `auth.storage` option needs. Task 3 imports it.

- [ ] **Step 1: Install dependencies**

```bash
npx expo install expo-secure-store
npm install aes-js@^3.1.2
npm install -D @types/aes-js
```

Expected: `expo-secure-store` lands at the SDK-56-compatible `~56.x`. `git diff package.json` shows the three additions.

- [ ] **Step 2: Map expo-secure-store into jest**

In `package.json`, inside `jest.moduleNameMapper`, add (alongside the existing expo-crypto line):

```json
"^expo-secure-store$": "<rootDir>/src/db/__mocks__/expo-secure-store.ts",
```

- [ ] **Step 3: Write the mocks**

Create `src/db/__mocks__/expo-secure-store.ts`:

```ts
/** expo-secure-store Jest stub — in-memory keychain. */
const store = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';

export async function setItemAsync(
  key: string,
  value: string,
  _options?: { keychainAccessible?: string },
): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test-only: wipe the fake keychain between tests. */
export function __reset(): void {
  store.clear();
}
```

Append to `src/db/__mocks__/expo-crypto.ts`:

```ts
/** Non-cryptographic stand-in for expo-crypto's getRandomBytes. */
export function getRandomBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}
```

- [ ] **Step 4: Write the failing tests**

Create `src/auth/__tests__/secureSessionStorage.test.ts`:

```ts
/**
 * #88 — session-at-rest encryption. The adapter must round-trip the
 * Supabase session, keep only ciphertext in AsyncStorage, migrate the
 * legacy plaintext blob from pre-#88 builds, and tear down both halves
 * on removeItem (sign-out path).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { secureSessionStorage } from '../secureSessionStorage';

// Replace jest.setup.js's stateless AsyncStorage stub with the official
// stateful mock — migration and round-trip tests need real reads-after-writes.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'sb-oqwpjksgnwthqmgeqrnu-auth-token';
const SESSION = JSON.stringify({ access_token: 'jwt-abc123', refresh_token: 'refresh-xyz' });

beforeEach(async () => {
  await AsyncStorage.clear();
  (SecureStore as unknown as { __reset(): void }).__reset();
});

test('round-trips a session', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
});

test('AsyncStorage holds only ciphertext after setItem', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  const raw = await AsyncStorage.getItem(KEY);
  expect(raw).not.toBeNull();
  expect(raw).not.toContain('jwt-abc123');
  expect(raw!.startsWith('{')).toBe(false);
});

test('migrates a legacy plaintext session on first read', async () => {
  await AsyncStorage.setItem(KEY, SESSION); // what a pre-#88 build left behind
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
  const raw = await AsyncStorage.getItem(KEY);
  expect(raw).not.toContain('jwt-abc123'); // re-stored encrypted in place
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION); // still readable
});

test('returns null when nothing is stored', async () => {
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test('returns null, not garbage, when the keychain entry is gone', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  await SecureStore.deleteItemAsync(`flexyug.aeskey.${KEY}`);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test('removeItem clears both the blob and the keychain key', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  await secureSessionStorage.removeItem(KEY);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
  await expect(SecureStore.getItemAsync(`flexyug.aeskey.${KEY}`)).resolves.toBeNull();
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx jest src/auth/__tests__/secureSessionStorage.test.ts`
Expected: FAIL — `Cannot find module '../secureSessionStorage'`.

- [ ] **Step 6: Implement the adapter**

Create `src/auth/secureSessionStorage.ts`:

```ts
/**
 * Encrypted at-rest storage for the Supabase session (#88).
 *
 * Pattern: the official Supabase RN "LargeSecureStore" — a fresh 256-bit
 * AES key per write lives in the iOS Keychain (expo-secure-store,
 * AFTER_FIRST_UNLOCK so background token refresh keeps working); the
 * AES-CTR ciphertext lives in AsyncStorage, because sessions can exceed
 * the Keychain's ~4KB practical limit. A fresh key per write means the
 * CTR counter can always start at 1 — no IV bookkeeping.
 *
 * Legacy migration: pre-#88 builds stored the session as plaintext JSON
 * under the same AsyncStorage key. Plaintext starts with '{'; our
 * ciphertext is hex, so first read detects, re-encrypts in place, and
 * returns the value — the user never re-logs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const keychainKeyFor = (storageKey: string) => `flexyug.aeskey.${storageKey}`;

async function encrypt(storageKey: string, value: string): Promise<string> {
  const keyBytes = Crypto.getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  const ciphertext = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keychainKeyFor(storageKey), aesjs.utils.hex.fromBytes(keyBytes), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return aesjs.utils.hex.fromBytes(ciphertext);
}

async function decrypt(storageKey: string, hexCiphertext: string): Promise<string | null> {
  const keyHex = await SecureStore.getItemAsync(keychainKeyFor(storageKey));
  if (!keyHex) return null; // keychain entry lost → treat as signed out, never return garbage
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(keyHex),
    new aesjs.Counter(1),
  );
  const plaintext = cipher.decrypt(aesjs.utils.hex.toBytes(hexCiphertext));
  return aesjs.utils.utf8.fromBytes(plaintext);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (stored == null) return null;
    if (stored.startsWith('{')) {
      // Legacy plaintext session — encrypt in place, then hand it back.
      await secureSessionStorage.setItem(key, stored);
      return stored;
    }
    return decrypt(key, stored);
  },

  async setItem(key: string, value: string): Promise<void> {
    const ciphertext = await encrypt(key, value);
    await AsyncStorage.setItem(key, ciphertext);
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keychainKeyFor(key));
  },
};
```

- [ ] **Step 7: Run the new tests**

Run: `npx jest src/auth/__tests__/secureSessionStorage.test.ts`
Expected: 6 passed.

- [ ] **Step 8: Run the full suite (regression, esp. sign-out teardown)**

Run: `npm test`
Expected: 759 passed (753 + 6), including `src/sync/__tests__/signOutTeardown.test.ts`.

- [ ] **Step 9: Gates + commit**

```bash
npm run typecheck && npm run lint && npm run format:check
git add package.json package-lock.json src/auth/secureSessionStorage.ts src/auth/__tests__/secureSessionStorage.test.ts src/db/__mocks__/expo-secure-store.ts src/db/__mocks__/expo-crypto.ts
git commit -m "feat(auth): AES-encrypted session storage adapter with plaintext migration (#88)"
```

---

### Task 3: Wire the adapter into the Supabase client + close #88 in the threat model

**Files:**

- Modify: `src/auth/supabase.ts` (lines 1, 53-61)
- Modify: `docs/threat-model.md` (the "Session JWT stored in plaintext AsyncStorage (OPEN, #88)" section, ~line 85, and the data-inventory table rows ~19-20)
- Modify: `docs/specs/2026-06-10-deep-review-improvement-plan.md` (#88 entry, ~line 241 — mark fixed)

**Interfaces:**

- Consumes: `secureSessionStorage` from Task 2 (exact import: `import { secureSessionStorage } from '@/auth/secureSessionStorage';` — note the file lives in the same dir, so `./secureSessionStorage` also works; use the relative form to match the file's existing local imports).

- [ ] **Step 1: Swap the storage adapter**

In `src/auth/supabase.ts`, add the import and change one line:

```ts
import { secureSessionStorage } from './secureSessionStorage';
```

and in the `createClient` options:

```ts
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
```

Keep the `AsyncStorage` import ONLY if nothing else in the file uses it — it doesn't, so delete `import AsyncStorage from '@react-native-async-storage/async-storage';`.

- [ ] **Step 2: Update the threat model**

In `docs/threat-model.md`:

1. Retitle the `### Session JWT stored in plaintext AsyncStorage (OPEN, #88)` section to `### Session JWT encrypted at rest (#88, closed 2026-08-22)` and rewrite its body to describe the actual mechanism: AES-CTR-256 ciphertext in AsyncStorage, per-write key in the iOS Keychain (`kSecAttrAccessibleAfterFirstUnlock`), legacy plaintext migrated on first read, both halves cleared on sign-out via the adapter's `removeItem`. Note the residual risk honestly: a device attacker with Keychain extraction (jailbreak) still wins — consistent with the existing "SQLite at-rest is not encrypted (accepted)" posture.
2. In the data-inventory table, change the storage column for "User identity" and "Magic-link session JWT" rows from `AsyncStorage (Supabase auth)` to `AsyncStorage (AES-encrypted; key in Keychain)`.

- [ ] **Step 3: Mark #88 fixed in the deep-review plan doc**

In `docs/specs/2026-06-10-deep-review-improvement-plan.md`, prefix the #88 entry body with a one-line resolution note: `> RESOLVED 2026-08-22 — src/auth/secureSessionStorage.ts (SecureStore-keyed AES-CTR, plaintext migration). See threat-model.md.`

- [ ] **Step 4: Gates + commit**

```bash
npm run typecheck && npm test && npm run lint && npm run format:check
git add src/auth/supabase.ts docs/threat-model.md docs/specs/2026-06-10-deep-review-improvement-plan.md
git commit -m "feat(auth): encrypt session at rest; close threat-model #88"
git push
```

Expected: all gates green; push triggers CI — verify with `gh run watch` as in Task 1 Step 5.

---

### Task 4: Native rebuild + simulator verification of the session migration

expo-secure-store is a native module — the stale-`ios/` guardrail applies.

**Files:** none committed (`ios/` is gitignored).

**Interfaces:**

- Consumes: the Task 3 commit on main.
- Produces: a booted simulator build proving (a) the app launches, (b) an existing plaintext session survives the upgrade (the migration path), (c) sign-out still tears down cleanly.

- [ ] **Step 1: Rebuild the native project**

```bash
export LANG=en_US.UTF-8
npm run prebuild:clean -- -p ios
npx pod-install
```

Expected: pod install completes; `grep -r ExpoSecureStore ios/Podfile.lock` finds the pod.

- [ ] **Step 2: Migration smoke — old session must survive**

The critical sequencing: log in on a build WITHOUT the adapter first, then upgrade.

1. `git stash` nothing needed — instead simulate: on the current simulator, if the QA account (`nittuz4+flexyugqa@gmail.com`) is still logged in from the 2026-08-10 session, that install already holds a plaintext session. Do NOT reinstall/wipe; build over it: `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios`.
2. Expected: app opens straight to Today (no login screen) — the plaintext session migrated.
3. If the simulator was since erased and there is no logged-in install, log in with the QA account on the new build instead and note that the migration path is covered by the jest test only.

- [ ] **Step 3: Round-trip + teardown smoke**

On the running app: force-quit, relaunch (session persists — now from ciphertext); then Profile → sign out; relaunch (lands on Login, no crash). While signed out, no `sb-…-auth-token` plaintext should exist: optional check via `xcrun simctl get_app_container booted com.mokshlabs.flexyug data` and grepping the AsyncStorage manifest for `jwt`/`access_token`.

- [ ] **Step 4: Record the result**

No commit. Note pass/fail in the session log; a failure here blocks Task 5.

---

### Task 5: Tag v0.1.0

**Interfaces:**

- Consumes: green CI on the Task 3 commit (Tasks 1-4 done).

- [ ] **Step 1: Verify CI is green on HEAD**

Run: `gh run list --branch main --limit 1`
Expected: `completed  success`.

- [ ] **Step 2: Tag and push**

```bash
git tag -a v0.1.0 -m "v0.1.0 — wrapup release: Forged Iron identity, set-entry redesign, PR semantics, notes+times, quick-log, training plan on Today, encrypted session storage"
git push origin v0.1.0
```

Expected: `git tag` lists `v0.1.0`; tag visible on GitHub.

---

### Task 6: TestFlight pipeline (BLOCKED on user action U1 — Apple enrollment)

Follow docs/TESTING.md Path 2 exactly. Everything here needs the paid Apple Developer membership approved first.

**Files:**

- Modify: `.env` (adds `EAS_PROJECT_ID`, `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID` — never committed; `.env` is gitignored)

**Interfaces:**

- Consumes: the `v0.1.0` tag; enrolled Apple account; `eas.json` production profile (already correct: `appVersionSource: remote`, `autoIncrement: true`).
- Produces: a build in TestFlight installable by the external tester.

- [ ] **Step 1: Link the repo to EAS**

Run: `npx eas init`
Then paste the printed project ID into `.env` as `EAS_PROJECT_ID=<id>`.

- [ ] **Step 2: App Store Connect record** — USER (U2): create the app for bundle id `com.mokshlabs.flexyug` in App Store Connect; fill `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID` in `.env`.

- [ ] **Step 3: Production build**

Run: `npx eas build --profile production -p ios`
Expected: build finishes on EAS servers. First run walks through credential generation (distribution cert + provisioning profile) — let EAS manage them.

- [ ] **Step 4: Submit**

Run: `npx eas submit -p ios`
Expected: build lands in App Store Connect → TestFlight → processing (~15 min).

- [ ] **Step 5: Tester group** — USER (U3): in App Store Connect → TestFlight, add the friend to an external group (external review of the first build can take ~a day). Optionally add yourself as internal tester for instant install.

---

### Task 7: Device-QA rider on the TestFlight build

The items no simulator can verify, outstanding since July. Run on a real iPhone with the TestFlight build.

**Interfaces:**

- Consumes: an installed TestFlight build (Task 6).

- [ ] **Step 1: Run the full release smoke-test checklist** in `docs/TESTING.md` ("Release smoke-test checklist", ~line 92) — all 20 items.

- [ ] **Step 2: The sim-impossible four**, explicitly:
  - Swipe-to-complete a set (RNGH pan) — banks the staged values, haptic fires.
  - Rest timer: countdown renders, skip works, notification arrives with the app backgrounded.
  - Voice logging: mic permission prompt → "eighty kilos for five" patches the set; "done" completes only when reps are present.
  - Haptics: LOG SET medium impact; PR glow choreography plays.

- [ ] **Step 3: Session-encryption spot-check on device**: log in, force-quit, relaunch (persists); sign out, relaunch (Login screen).

- [ ] **Step 4: File anything broken** as new items in `docs/UX_POLISH_BACKLOG.md` with a `device-qa-2026-08` tag; do not fix inline.

---

## User-owed actions rail (no agent can do these)

- **U1 — Enroll** in the Apple Developer Program at developer.apple.com ($99/yr, ~24-48h approval). Gates Task 6.
- **U2 — App Store Connect record** for `com.mokshlabs.flexyug` + fill `.env` credentials (Task 6 Step 2).
- **U3 — TestFlight tester group** (Task 6 Step 5).
- **U4 — Change the temp password** on your own Supabase account (owed since the July reconnect).
- **U5 — Hosted redirect allowlist**: Supabase dashboard → Authentication → URL Configuration for project `oqwpjksgnwthqmgeqrnu`; confirm no `exp://*` entry (the local config.toml carries it for dev only — #89 magic-link takeover vector if it leaked to hosted).
- **U6 — Delete the QA account** `nittuz4+flexyugqa@gmail.com` (id 2b7850a4…) via dashboard → Authentication → Users, AFTER Task 7 (it may still be useful for device QA; it was left with an ACTIVE workout).

## Explicitly out of scope

- The 33 lint warnings (all `react-hooks/immutability`-class, pre-existing, zero errors).
- The 42 open UX-polish backlog items (polish-tier; cherry-pick post-wrapup if desired).
- Batch 5 (scan-from-image, user-deferred) and Batch 6 (B2B white-labeling, unscoped).
