# Architecture

This document describes the design and solution architecture of Vyayamy — a minimal, mobile-first workout journal built as a Progressive Web App.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Frontend Architecture](#frontend-architecture)
4. [Data Layer](#data-layer)
5. [Database Design](#database-design)
6. [Authentication](#authentication)
7. [Personal Record Detection](#personal-record-detection)
8. [PWA Strategy](#pwa-strategy)
9. [Security Model](#security-model)
10. [Design System](#design-system)
11. [Key Design Decisions](#key-design-decisions)

---

## System Overview

Vyayamy is a single-page application that runs entirely in the browser. There is no custom backend server — all data persistence, authentication, and authorization are handled by Supabase (managed Postgres + Auth + REST API). The app is deployed as static assets and installable as a PWA.

```
┌─────────────────────────────────────────────────────┐
│                     Client (Browser)                 │
│                                                     │
│  React 19 + TypeScript                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Routes   │  │  Components  │  │  Contexts    │  │
│  │  (pages)  │──│  (shared UI) │  │  (Auth,Toast)│  │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  │
│       │               │                 │           │
│       └───────┬───────┘                 │           │
│               │                         │           │
│        ┌──────▼───────┐                 │           │
│        │ TanStack     │                 │           │
│        │ React Query  │                 │           │
│        │ (hooks)      │                 │           │
│        └──────┬───────┘                 │           │
│               │                         │           │
│        ┌──────▼───────┐          ┌──────▼───────┐   │
│        │  Supabase    │          │  Supabase    │   │
│        │  Client      │──────────│  Auth        │   │
│        │  (REST)      │          │  (OTP)       │   │
│        └──────┬───────┘          └──────┬───────┘   │
└───────────────┼─────────────────────────┼───────────┘
                │          HTTPS          │
        ┌───────▼─────────────────────────▼───────┐
        │            Supabase Platform            │
        │  ┌──────────┐  ┌────────┐  ┌────────┐  │
        │  │ Postgres  │  │  Auth  │  │  RLS   │  │
        │  │ (data)    │  │ (JWT)  │  │(policy)│  │
        │  └──────────┘  └────────┘  └────────┘  │
        └─────────────────────────────────────────┘
```

---

## High-Level Architecture

The application follows a **client-heavy, serverless** pattern:

| Concern             | Solution                                      |
| ------------------- | --------------------------------------------- |
| UI rendering        | React 19 with functional components           |
| Routing             | React Router v7 (nested, layout-based)        |
| Server state        | TanStack React Query 5 (cache, mutations)     |
| Local/UI state      | React `useState` / `useReducer` in components |
| Auth state          | React Context (`AuthProvider`)                |
| Backend + DB        | Supabase (Postgres 15, PostgREST, GoTrue)     |
| Authorization       | Row Level Security policies in Postgres       |
| Build + bundling    | Vite 7                                        |
| Offline / install   | Service Worker via vite-plugin-pwa (Workbox)  |

There is no API server layer, no ORM, and no server-side rendering. The Supabase JS client talks directly to PostgREST and GoTrue over HTTPS.

---

## Frontend Architecture

### Provider Tree

The app bootstraps through a layered provider tree in `main.tsx`:

```
StrictMode
  └─ ErrorBoundary
       └─ QueryClientProvider        ← TanStack Query cache
            └─ BrowserRouter          ← React Router
                 └─ AuthProvider       ← Auth state + session
                      └─ ToastProvider ← Toast notifications
                           └─ App     ← Route definitions
```

### Routing

All authenticated routes are nested under a `ProtectedRoute` + `Layout` wrapper. The layout provides the persistent bottom navigation bar (Today, History, Progress, Profile).

| Path               | Component          | Description                       |
| ------------------ | ------------------ | --------------------------------- |
| `/login`           | `Login`            | Magic-link email sign-in          |
| `/`                | `Today`            | Dashboard — active/recent workouts |
| `/workout`         | `WorkoutStart`     | Choose how to start a workout     |
| `/workout/active`  | `WorkoutActive`    | Live session — exercises + sets   |
| `/history`         | `History`          | Past workouts by date             |
| `/history/:id`     | `HistoryDetail`    | Single workout detail view        |
| `/progress`        | `Progress`         | PRs, trend charts, frequency      |
| `/profile`         | `Profile`          | Settings, routines, sign out      |
| `*`                | Redirect → `/`     | Catch-all                         |

### Component Hierarchy

```
Layout
├── BottomNav (Today | History | Progress | Profile)
├── Today
│   ├── ActiveWorkoutCard → links to /workout/active
│   └── RecentWorkoutsList
├── WorkoutStart
│   ├── Empty workout
│   ├── Repeat last workout
│   └── From routine (template)
├── WorkoutActive
│   ├── ExerciseBlock (per exercise)
│   │   ├── SetsTable (weight, reps, complete toggle)
│   │   └── AddSetButton
│   ├── ExerciseSearchModal
│   │   ├── SearchInput (debounced)
│   │   ├── RecentExercises
│   │   ├── GlobalExercises
│   │   └── CreateCustomExercise
│   └── FinishWorkoutButton → triggers PR detection
├── History
│   ├── PeriodFilter
│   └── WorkoutCard (grouped by date)
├── HistoryDetail
│   ├── ExerciseBlock (read-only)
│   ├── RepeatButton
│   └── DeleteButton → ConfirmDialog
├── Progress
│   ├── PersonalRecordsList
│   ├── ExerciseTrendChart (Recharts)
│   └── WeeklyFrequencyChart
└── Profile
    ├── DisplayName / Units
    ├── RoutinesList
    │   └── Sheet (exercise list per routine)
    └── SignOutButton
```

---

## Data Layer

### Query Architecture

All server-state management uses TanStack React Query. Data access is organized into **domain-specific query modules** under `src/lib/queries/`:

| Module          | Key hooks                                                        |
| --------------- | ---------------------------------------------------------------- |
| `workouts.ts`   | `useActiveWorkout`, `useRecentWorkouts`, `useCreateWorkout`, `useWorkoutWithExercises` |
| `exercises.ts`  | `useExercisesSearch`, `useRecentExerciseIds`, `useGlobalExercises`, `useCreateExercise`, `useAddExerciseToWorkout` |
| `sets.ts`       | `useAddSet`, `useUpdateSet`, `useDeleteSet`, `useFinishWorkout`, `useReorderExercise`, `useDeleteWorkout` |
| `history.ts`    | `useHistoryWorkouts` (with date range / period filters)          |
| `records.ts`    | `usePersonalRecords`, `useExerciseHistory`, `useWeeklyFrequency` |
| `profile.ts`    | `useProfile`, `useUpdateProfile`                                 |
| `templates.ts`  | `useTemplates`, `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate` |

Each module exports custom hooks that encapsulate:
- Supabase query construction
- Query key management
- Mutation logic with cache invalidation

### Caching Strategy

- **Default stale time**: 60 seconds (configured on the `QueryClient`)
- **Invalidation**: mutations use `queryClient.invalidateQueries` to refetch affected data on success
- **Optimistic updates**: `useUpdateSet` and `useDeleteSet` apply changes to the cache immediately via `onMutate`, with rollback in `onError`

### Data Flow

```
Component (UI)
    │
    ▼
useXxxQuery / useXxxMutation   ← TanStack Query hook
    │
    ▼
supabase.from('table')...      ← Supabase JS client
    │
    ▼ HTTPS (PostgREST)
    │
Postgres + RLS policies         ← Supabase platform
```

---

## Database Design

### Entity-Relationship Model

```
┌──────────────┐       ┌──────────────────┐
│   profiles   │       │    exercises      │
│──────────────│       │──────────────────│
│ id (PK, FK)  │       │ id (PK)          │
│ display_name │       │ name             │
│ units        │       │ muscle_group     │
│ created_at   │       │ user_id (FK?)    │ ← NULL = global
│ updated_at   │       │ created_at       │
└──────────────┘       └────────┬─────────┘
                                │
┌──────────────┐                │
│  templates   │                │
│──────────────│                │
│ id (PK)      │                │
│ user_id (FK) │                │
│ name         │                │
│ exercise_order│ ← UUID[]     │
│ created_at   │                │
│ updated_at   │                │
└──────┬───────┘                │
       │ (optional)             │
       ▼                        │
┌──────────────┐       ┌───────▼──────────┐
│   workouts   │       │workout_exercises │
│──────────────│       │──────────────────│
│ id (PK)      │◄──────│ workout_id (FK)  │
│ user_id (FK) │       │ exercise_id (FK) │───►exercises
│ started_at   │       │ order_index      │
│ ended_at     │       │ created_at       │
│ title        │       └────────┬─────────┘
│ template_id  │───►templates           │
│ created_at   │                │
└──────┬───────┘                │
       │                        │
       │               ┌────────▼─────────┐
       │               │      sets        │
       │               │──────────────────│
       │               │ id (PK)          │
       │               │ workout_exercise_id│
       │               │ order_index      │
       │               │ weight           │
       │               │ reps             │
       │               │ completed        │
       │               │ completed_at     │
       │               │ created_at       │
       │               └──────────────────┘
       │
       │               ┌──────────────────┐
       └──────────────►│ personal_records │
                       │──────────────────│
                       │ id (PK)          │
                       │ user_id (FK)     │
                       │ exercise_id (FK) │───►exercises
                       │ type             │
                       │ value (JSONB)    │
                       │ achieved_at      │
                       │ workout_id (FK?) │
                       │ set_id           │
                       │ created_at       │
                       └──────────────────┘
```

### Table Descriptions

| Table                | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `profiles`           | Extends `auth.users` with display name and unit preference     |
| `exercises`          | Exercise catalog; `user_id = NULL` for global, otherwise user-created |
| `workouts`           | A training session with start/end timestamps and optional template link |
| `templates`          | Reusable routines storing an ordered array of exercise UUIDs   |
| `workout_exercises`  | Junction table linking workouts to exercises with ordering      |
| `sets`               | Individual sets within a workout-exercise pairing              |
| `personal_records`   | Best-ever lifts per exercise, per record type (JSONB value)    |

### Indexes

- `idx_workouts_user_started` — fast lookup of a user's workouts by date
- `idx_workouts_ended` — partial index for finding active (unfinished) workouts
- `idx_workout_exercises_workout` — sets retrieval by workout
- `idx_sets_workout_exercise` — sets retrieval by workout-exercise
- `idx_personal_records_user_exercise` — PR lookups by user and exercise
- `idx_personal_records_unique` — unique constraint enabling upsert on `(user_id, exercise_id, type)`
- `idx_exercises_user` / `idx_templates_user` — user-scoped lookups

### Triggers

| Trigger                 | Fires on                 | Action                                      |
| ----------------------- | ------------------------ | ------------------------------------------- |
| `on_auth_user_created`  | `auth.users` INSERT      | Creates a `profiles` row with default `kg`  |
| `profiles_updated_at`   | `profiles` UPDATE        | Sets `updated_at = now()`                   |
| `templates_updated_at`  | `templates` UPDATE       | Sets `updated_at = now()`                   |

---

## Authentication

Vyayamy uses **passwordless email authentication** (magic links) via Supabase GoTrue.

### Flow

```
 User                    App                     Supabase Auth
  │                       │                           │
  │  enters email         │                           │
  │──────────────────────►│                           │
  │                       │  signInWithOtp(email)     │
  │                       │──────────────────────────►│
  │                       │                           │  sends email
  │  clicks magic link    │                           │◄─────────────
  │──────────────────────►│                           │
  │                       │  onAuthStateChange fires  │
  │                       │◄──────────────────────────│
  │                       │                           │
  │  session established  │  JWT stored in memory     │
  │◄──────────────────────│                           │
```

### Implementation

- `AuthProvider` (`src/contexts/AuthContext.tsx`) initializes the session on mount via `getSession()` and subscribes to `onAuthStateChange` for real-time session updates.
- `ProtectedRoute` checks for an authenticated user; unauthenticated visitors are redirected to `/login` with the intended destination preserved in state for post-login redirect.
- The Supabase client automatically attaches the JWT to all API requests, enabling RLS policies to identify the user via `auth.uid()`.

---

## Personal Record Detection

When a workout is finished, the app runs PR detection client-side before closing the session.

### Algorithm (`src/lib/pr-detection.ts`)

For each exercise in the workout:

1. **Filter** to completed sets that have at least weight or reps recorded.
2. **Compute** three candidate records:
   - `heaviest_weight` — maximum weight lifted
   - `best_volume` — maximum single-set volume (weight x reps)
   - `most_reps_at_weight` — highest reps at any weight (ties broken by heavier weight)
3. **Fetch** existing PRs for the exercise from the database.
4. **Compare** each candidate against the existing record. If the new value exceeds the previous, **upsert** the record using the unique constraint `(user_id, exercise_id, type)`.

### Record Types

| Type                 | JSONB Value Shape                    | Comparison                    |
| -------------------- | ------------------------------------ | ----------------------------- |
| `heaviest_weight`    | `number`                             | Higher weight wins            |
| `best_volume`        | `number`                             | Higher volume wins            |
| `most_reps_at_weight`| `{ weight: number, reps: number }`   | Higher reps wins; ties go to heavier weight |

---

## PWA Strategy

The app is configured as an installable PWA via `vite-plugin-pwa` with Workbox.

| Setting           | Value                                            |
| ----------------- | ------------------------------------------------ |
| Register type     | `autoUpdate` — new service worker activates immediately |
| Display mode      | `standalone` — no browser chrome                 |
| Precached assets  | `**/*.{js,css,html,ico,png,svg}`                 |
| Theme color       | `#FAFAF9` (warm off-white)                       |

The service worker caches the app shell (HTML, JS, CSS) for offline access to previously loaded pages. Data fetches still require a network connection since Supabase queries go over HTTPS.

---

## Security Model

### Row Level Security (RLS)

Every table has RLS enabled. Policies enforce that users can only access their own data:

| Table                | Policy                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `profiles`           | SELECT / INSERT / UPDATE own row (`auth.uid() = id`)                  |
| `exercises`          | SELECT global (`user_id IS NULL`) or own; INSERT / UPDATE own only    |
| `workouts`           | ALL operations scoped to `user_id = auth.uid()`                       |
| `workout_exercises`  | ALL via subquery — workout must belong to user                        |
| `sets`               | ALL via subquery — joins through `workout_exercises` → `workouts`     |
| `personal_records`   | ALL operations scoped to `user_id = auth.uid()`                       |
| `templates`          | ALL operations scoped to `user_id = auth.uid()`                       |

### Auth Token Handling

- The Supabase JS client manages JWT storage and refresh automatically.
- The anon key is safe to expose in client code — it only grants access permitted by RLS policies.
- No sensitive operations are performed without a valid session JWT.

### Data Isolation

- Cross-user data access is impossible at the database level due to RLS.
- The only shared data is the global exercise library (`exercises` rows where `user_id IS NULL`), which is read-only to all users.

---

## Design System

The visual layer is built on CSS custom properties defined in `src/styles/theme.css`.

### Tokens

| Category    | Examples                                                    |
| ----------- | ----------------------------------------------------------- |
| Colors      | `--color-bg`, `--color-surface`, `--color-accent`, `--color-success`, `--color-danger`, `--color-pr` |
| Spacing     | 4px base scale: `--space-1` (4px) through `--space-12` (48px) |
| Radius      | `--radius-sm` (8px), `--radius-md` (12px), `--radius-lg` (16px) |
| Typography  | `--font-display` (34px) down to `--font-micro` (11px)      |
| Shadows     | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-sheet` |
| Transitions | `--ease-out`, `--ease-in-out`, `--duration-fast/normal/slow` |
| Sizing      | `--touch-min` (44px), `--nav-height` (52px), `--content-max` (640px) |

### Layout Principles

- **Single column**, max-width 640px, centered — optimized for phone screens
- **44px minimum touch targets** for all interactive elements
- **System font stack** (`-apple-system`, `SF Pro`, `system-ui`, etc.) for native feel
- **Warm neutral palette** — stone/amber tones, minimal use of saturated color
- Component-scoped CSS files (co-located `.css` alongside `.tsx`)

---

## Key Design Decisions

### Why Supabase instead of a custom backend?

Supabase provides auth, a relational database, and row-level security out of the box. For a single-user journaling app, this eliminates the need for a separate API server, deployment infrastructure, and session management — the entire backend is managed.

### Why TanStack Query instead of Redux / Zustand?

The app's state is almost entirely server-derived (workouts, exercises, sets, PRs). TanStack Query is purpose-built for this: it handles caching, background refetching, optimistic updates, and cache invalidation. There is very little pure client state beyond modal/form visibility, which is handled by component-local `useState`.

### Why client-side PR detection?

Computing personal records on the client avoids the need for Postgres functions or edge functions. The logic is straightforward (three comparisons per exercise), runs only when finishing a workout, and the upsert pattern ensures idempotency. If the computation grows more complex, it could move to a Supabase Edge Function without changing the data model.

### Why CSS custom properties instead of a CSS-in-JS library?

Custom properties provide a lightweight design token system with zero runtime cost. They work naturally with component-scoped `.css` files and avoid the bundle-size and complexity overhead of CSS-in-JS solutions. The app's styling needs are modest and well-served by vanilla CSS.

### Why magic-link auth instead of passwords?

Passwordless auth reduces friction (no password to remember) and eliminates password-related security concerns (storage, reset flows, brute force). For a personal fitness app, the email-based OTP flow is a good balance of security and convenience.

### Why a UUID array for template exercise order?

Storing `exercise_order UUID[]` directly on the `templates` table avoids a separate junction table and ordering column for templates. Since templates are user-managed lists of 5-15 exercises, the array type is simple, atomic to update, and sufficient for the use case.
