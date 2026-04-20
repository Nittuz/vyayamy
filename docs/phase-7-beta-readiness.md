# Phase 7 — Beta Readiness

## Top Launch Risks

1. **Offline behavior gap**: The app shows "Changes will sync when you reconnect" but does not have a true offline queue. Sets logged offline will fail silently. The PrivacyData page discloses this, but users may still lose data during connectivity drops.
2. **No data import**: Users switching from Strong, Hevy, or spreadsheets cannot import history. Starter templates and repeat-last reduce friction but do not solve migration of past data.
3. **No self-service account deletion**: Account removal requires manual contact. A Supabase Edge Function is needed for self-service deletion.
4. **Analytics provider not connected**: All `track()` calls log to console.debug in dev mode only. A provider (PostHog, Plausible, etc.) must be connected before production insights are available.
5. **PWA update UX**: `registerType: 'autoUpdate'` pushes updates automatically. No user-facing "new version available" notification exists — users get the new version on next visit.

## First-Run UX Assumptions

- A new user lands on Today after email OTP sign-in.
- The onboarding card (dismissible, localStorage-gated) explains what the app does in 2 sentences.
- Two clear paths: "Start workout" (hero CTA) or "Set up a training plan" (link).
- Empty states across Today, History, Progress, and TrainingPlan all explain their purpose and suggest a next action.
- Quick-start template presets (PPL, Upper/Lower, Full Body) help experienced lifters skip manual template setup.
- No multi-step onboarding wizard — the app is simple enough to learn by using.

## Key Beta Metrics

| Metric | Why it matters |
|--------|----------------|
| Weekly active workouts | Core engagement — are people training consistently? |
| Workout completion rate | Does the active-workout UX support finishing? |
| Template adoption | Are templates adding value vs. custom workouts? |
| Plan adherence | Does the training plan drive behavior? |
| Starter template conversion | Do quick-start presets reduce onboarding friction? |
| Export usage | Are users trusting the platform with their data? |
| Feedback rate | Is the feedback path discoverable? |
| PR frequency | Are users seeing progress signals? |

Events are instrumented via `src/lib/analytics.ts` and logged to `console.debug` in dev. Connect a provider to see production data.

## Key Feedback Questions for Beta Testers

1. Was it clear how to start your first workout?
2. Did you understand the difference between a free workout and a training plan?
3. If you came from another app, how was the switching experience?
4. Did you encounter any errors or unexpected behavior?
5. What's the one thing you'd change about the app?
6. Would you trust this app as your primary workout logger? Why or why not?

## Major Known Limitations

- **No offline data persistence**: Logging requires an active connection.
- **No data import**: Users cannot import from JSON, CSV, or other apps.
- **No account deletion self-service**: Requires manual email request.
- **No social/sharing features**: By design — single-user journal.
- **Cycle plan support in WeekStrip**: `computeDayState` only handles weekly plans; cycle plans show as empty days.
- **Exercise library is seed-only**: 15 global exercises. Users can add custom exercises but cannot browse a larger catalog.
- **No image/video attachments**: Text-based logging only.

## What to Monitor During Beta

- **Error rates**: Watch for spikes in toast error messages (especially "Failed to save workout", "Failed to start workout").
- **Abandoned workouts**: Long-duration active workouts (>3h) may indicate abandoned sessions.
- **Empty-state drop-off**: If users visit Progress/History without any data and don't take the suggested action, the empty states may need strengthening.
- **PWA install rate**: Track `canInstall` → `promptInstall` conversion.
- **Feedback volume**: If no feedback arrives within the first 2 weeks, the path may be too hidden.

## What Is Intentionally Deferred

- **Data import/restore** — high effort, fragile, better to build after schema stabilizes
- **Offline queue** — requires IndexedDB persistence layer or service worker outbox
- **Self-service account deletion** — needs Supabase Edge Function
- **Analytics provider integration** — event vocabulary is ready, just needs a provider
- **Rich exercise library** — expandable later via community contributions or a seed update
- **Dark mode refinements** — functional but not pixel-polished
- **Notification/reminder system** — out of scope for beta
- **Multi-device sync conflict resolution** — Supabase handles last-write-wins; edge cases exist
