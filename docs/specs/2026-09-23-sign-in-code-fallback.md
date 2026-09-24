# Sign-in code fallback for the magic-link email

- **Status:** approved
- **Date:** 2026-09-23
- **Related ADRs:** none

## Problem

The magic-link email's button is an `https://<supabase>/auth/v1/verify` URL that the auth
server answers with a 303 to `flexyug://login/?code=…`. That last hop only completes when the
tap happens in Safari or Apple Mail on the phone that requested the link (the PKCE verifier is
device-bound). In Gmail's in-app browser and in Chrome-hosted Gmail on the phone the custom
scheme redirect is dropped silently, and on a computer nothing can open it at all. The tester
experience on TestFlight build 7 was "I tap the button and nothing happens".

The server side is verified working (redirect allow-list enforced, `flexyug://login/` target);
the failure is entirely in the mail client → app hand-off, which we do not control.

## Goals & non-goals

- Goal: a sign-in path from the email that works from any mail client on any device.
- Goal: keep the existing link for the clients where it works (Apple Mail → Safari).
- Goal: no new backend, no hosted web page, no domain (Universal Links need both).
- Non-goal: replacing password login, or changing the link handler in the app.
- Non-goal: SMS or TOTP; this is GoTrue's email OTP that already ships with magic links.

## Design

**Email.** The magic-link template gains a second block under the button: "Or enter this code
in the app" with `{{ .Token }}` (GoTrue's email OTP for the same request; the hosted project's Email OTP Length is 8). Both the
link and the code share one expiry (`otp_expiry`, 900 s) and are consumed together.

**App.** After "Email me a sign-in link" succeeds, the sent card (Login → `showSent`) gains:

- a numeric code field (`keyboardType: number-pad`, `textContentType: oneTimeCode`, eight digits,
  digits-only normalization — `src/auth/signInCode.ts`),
- a primary "Sign in with code" button, enabled only when eight digits are present,
- copy: "Your sign-in link is on its way. Open it on this phone, or enter the code from the
  email here."

Submit calls the auth facade's `verifyEmailOtp(email, code)` →
`supabase.auth.verifyOtp({ email, token, type: 'email' })`. Success fires
`onAuthStateChange`, the provider stores the session, and Login's existing
`<Redirect href="/" />` takes over — no navigation code added. Failure (wrong, expired, or
already-used code) shows one neutral line: "That code didn't work. Check it, or send yourself a
fresh link." The resend and "use a different email" actions stay.

**Security.** Short OTPs are brute-forceable without limits; the project already pins
`token_verifications = 30` per 5 min (config.toml, #93) and the code expires with the link.
The facade stays the only Supabase import outside `src/sync`.

## Alternatives considered

- **Universal Links** (associated domain + hosted AASA): robust, but needs a domain we host
  and Apple's CDN propagation; deferred until there is a web presence.
- **"Open in Safari" instruction only:** does not help Gmail's in-app browser or cross-device.
- **Code instead of link:** the link is still the best path for Apple Mail users; keep both.

## Testing

- Unit: `signInCode` normalization/completeness; `verifyEmailOtp` calls the email OTP API
  with the right shape and passes errors through.
- Device (TestFlight build 8): request a link from Chrome-hosted Gmail on the phone, enter the
  code → signed in; wrong code → neutral error; expired code → neutral error; link path from
  Apple Mail still works.

## Rollout

The app change is inert until the live email template carries `{{ .Token }}`; ship the
template update (Supabase dashboard → Authentication → Email Templates → Magic Link, paste
`supabase/templates/magic_link.html`) before or with build 8. Old builds ignore the extra line.

## Open questions

None.
