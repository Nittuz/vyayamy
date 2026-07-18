# Getting FlexYug onto a tester's iPhone

Two paths. **Path 1 works today with no Apple fees** (7-day re-sign cycle).
**Path 2 is the clean long-term route** once the $99/yr Apple Developer
Program membership exists.

Either way the tester needs an account: auth is mandatory and the backend is
the live Supabase project. Create it first (§ Tester account).

---

## Tester account (both paths)

Use **email + password**, not the magic link — deep-linking an email link back
into a sideloaded build is fragile, and the login screen already has a
"Use a password instead" toggle.

1. Supabase dashboard → Authentication → Users → **Add user**.
2. Enter the tester's email + a starter password, enable **Auto Confirm**.
3. Verify it yourself once: sign in on the simulator with those credentials.

---

## Path 1 — free sideload (now)

### Owner steps (this Mac)

1. One-time: put your Apple team ID in `.env` as `APPLE_TEAM_ID=…`. Find it in
   Xcode → Settings → Accounts → your Apple ID (a free **Personal Team** has
   one too; sign in there once if you never have). The build regenerates the
   Xcode project every run, so a team picked inside Xcode won't stick — the
   `.env` value is what counts. The script also strips the push-notification
   entitlement free teams can't sign (the rest timer only uses local
   notifications, so nothing is lost).
2. `npm run build:ipa` → produces `build/FlexYug.ipa`.
3. Smoke-test the Release build before sending anything (checklist below).
4. Send the IPA to the tester (AirDrop / Drive / etc.) with a link to this doc.

### Tester steps (their iPhone + any computer, ~15 min once)

1. Install [Sideloadly](https://sideloadly.io) (macOS or Windows).
2. Plug in the iPhone, drag `FlexYug.ipa` in, sign in with **your own
   Apple ID** (it re-signs the app to your ID — this is expected).
   If install fails on a bundle-ID collision, enable Sideloadly's
   "custom bundle ID" option.
3. On the iPhone: Settings → General → VPN & Device Management → trust your
   Apple ID's developer profile.
4. Optional but recommended: [SideStore](https://sidestore.io) instead of
   Sideloadly — after a one-time setup it re-signs on-device, so you don't
   need the computer every week.

### Honest constraints of the free path

- The install **expires every 7 days** — re-sideload (or let SideStore
  auto-refresh). This is Apple's free-account policy, not a bug.
- Max **3 sideloaded apps** per free Apple ID.
- Every new app version = a new IPA sent + reinstalled.
- Crash reporting is off (Sentry DSN intentionally empty) — feedback is
  screenshots + descriptions. (`build-ipa.sh` sets
  `SENTRY_DISABLE_AUTO_UPLOAD=true` when no Sentry token is configured;
  without it, Sentry's Xcode phase fails any Release build. Set the same
  variable if you build Release manually, e.g.
  `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release`.)

### What to test / where to send feedback

Log real workouts for a week: manual entry, voice entry, rest timer,
history, progress charts, force-quit + offline relaunch. Send anything that
feels wrong (screenshot + one sentence) to the owner directly.

---

## Path 2 — TestFlight (after Apple Developer enrollment)

1. Enroll at developer.apple.com ($99/yr; approval can take ~24–48 h).
2. `npx eas init` — links the repo to an EAS project; paste the printed
   project ID into `.env` as `EAS_PROJECT_ID` (the dynamic config reads it
   from there).
3. Fill `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID` in `.env`; create the app
   record for `com.mokshlabs.flexyug` in App Store Connect.
4. Per release: `npx eas build --profile production -p ios` then
   `npx eas submit -p ios`.
5. In App Store Connect → TestFlight, add the tester to an external group
   (they install the TestFlight app; no expiry, no computer, no re-signing).

`eas.json` notes: the `preview` profile is **simulator-only** (local QA);
iOS **device** builds via EAS require the paid program — that's why Path 1
doesn't use EAS at all.

---

## Release smoke-test checklist (run before every send)

- Password login with the tester account.
- Log a workout: add exercise, weight/reps steppers, complete sets.
- Voice entry: hold mic, speak a set, confirm; "done" completes the set.
- Rest timer runs between sets; skip works.
- Next/prev exercise; leaving a set with entered values prompts once.
- Force-quit, airplane mode, relaunch: data intact, app usable offline.
- Sync indicator settles after coming back online.
- Visual pass: Today, Workout, Progress in light and dark.
