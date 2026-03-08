# Vyayamy

A minimal, mobile-first workout journal built as a Progressive Web App. Log workouts, track sets and weights, monitor personal records, and follow your progress over time — all through a calm, single-column interface.

## Features

- **Workout logging** — start a session from Today, add exercises, record sets (weight + reps), and finish when done
- **Routine templates** — save frequently used exercise combinations as reusable routines
- **Training plans** — weekly or cycle-based schedules that map days (or cycle positions) to templates; create and edit via `/profile/plan` and `/profile/plan/setup`
- **Repeat workouts** — quickly re-create a past workout with the same exercise lineup
- **Personal records** — automatic PR detection for heaviest weight, best volume, and most reps at a given weight
- **Progress charts** — per-exercise trend lines and weekly training frequency via Recharts
- **Workout history** — browse past sessions grouped by date with period filters
- **Custom exercises** — add your own exercises alongside the built-in global library
- **Unit preference** — switch between kg and lb at any time
- **Magic-link auth** — passwordless email sign-in powered by Supabase Auth
- **PWA** — installable on mobile and desktop; works offline for cached assets

## Tech Stack

| Layer          | Technology                                  |
| -------------- | ------------------------------------------- |
| Framework      | React 19, TypeScript 5.9                    |
| Build          | Vite 7                                      |
| Routing        | React Router v7                             |
| Server state   | TanStack React Query 5                      |
| Backend        | Supabase (Postgres, Auth, Row Level Security) |
| Charts         | Recharts 3                                  |
| PWA            | vite-plugin-pwa (Workbox)                   |
| Testing        | Vitest 4                                    |
| Code quality   | ESLint 9, Prettier 3                        |

## Project Structure

```
vyayamy/
├── public/                     # Static assets
├── src/
│   ├── components/             # Shared UI components
│   │   ├── BackLink.tsx        # Back navigation link
│   │   ├── ConfirmDialog.tsx   # Confirmation modal
│   │   ├── EmptyState.tsx      # Empty-state illustrations + messages
│   │   ├── ErrorBoundary.tsx   # Global error boundary
│   │   ├── ExerciseBlock.tsx   # Exercise card with sets table
│   │   ├── ExerciseSearchModal.tsx  # Exercise picker / creator
│   │   ├── Icons.tsx           # SVG icon components
│   │   ├── Layout.tsx          # App shell + bottom nav
│   │   ├── ProtectedRoute.tsx # Auth guard
│   │   ├── Sheet.tsx           # Bottom sheet overlay
│   │   ├── Skeleton.tsx        # Loading placeholders
│   │   ├── TodayHero.tsx       # Today dashboard hero section
│   │   ├── Toast.tsx           # Toast notifications + ToastProvider
│   │   └── WeekStrip.tsx       # Week-day strip for plan view
│   ├── contexts/
│   │   ├── AuthContext.tsx     # Auth state + sign-in/out
│   │   ├── AuthContextDef.ts   # Auth context type definitions
│   │   └── ToastContext.ts     # Toast context type
│   ├── lib/
│   │   ├── queries/            # TanStack Query hooks (one file per domain)
│   │   │   ├── exercises.ts
│   │   │   ├── history.ts
│   │   │   ├── plans.ts        # Training plans + slots
│   │   │   ├── profile.ts
│   │   │   ├── records.ts
│   │   │   ├── sets.ts
│   │   │   ├── templates.ts
│   │   │   └── workouts.ts
│   │   ├── __tests__/          # Unit tests (format.test.ts, pr-detection.test.ts)
│   │   ├── chartConfig.ts      # Recharts config constants
│   │   ├── format.ts           # Display formatting helpers
│   │   ├── haptics.ts          # Haptic feedback helpers
│   │   ├── hooks.ts            # Shared hooks (debounce, etc.)
│   │   ├── pr-detection.ts     # PR computation + upsert logic
│   │   ├── supabase.ts         # Supabase client singleton
│   │   ├── useAuth.ts          # useAuth convenience hook
│   │   └── useToast.ts         # useToast convenience hook
│   ├── routes/                 # Page-level route components
│   │   ├── Today.tsx           # Dashboard / home
│   │   ├── WorkoutActive.tsx   # Live workout session
│   │   ├── History.tsx         # Past workouts list
│   │   ├── HistoryDetail.tsx   # Single workout detail
│   │   ├── Progress.tsx        # PRs, charts, frequency
│   │   ├── Profile.tsx        # Settings + routines
│   │   ├── TrainingPlan.tsx    # Active plan view + slot management
│   │   ├── PlanSetup.tsx       # Plan creation/edit wizard
│   │   └── Login.tsx           # Magic-link sign-in
│   ├── styles/
│   │   └── theme.css           # CSS custom properties (design tokens)
│   ├── types/
│   │   └── database.ts         # Supabase-typed schema definitions
│   ├── App.tsx                 # Route definitions
│   ├── main.tsx                # App bootstrap + provider tree
│   └── index.css               # Global styles
├── supabase/
│   ├── config.toml             # Local dev config
│   ├── migrations/             # SQL schema migrations
│   │   ├── 00001_initial_schema.sql
│   │   ├── 00002_constraints_and_improvements.sql
│   │   └── 00003_training_plans.sql
│   └── seed.sql                # Default exercise library
├── .env.example                # Required env vars template
├── vite.config.ts              # Vite + PWA config
└── package.json
```

## Routes

| Path                | Component      | Description                        |
| ------------------- | -------------- | ---------------------------------- |
| `/login`            | Login          | Magic-link sign-in                 |
| `/`                 | Today          | Dashboard, start workout           |
| `/workout/active`   | WorkoutActive  | Active workout session             |
| `/history`          | History        | Past workouts list                 |
| `/history/:id`      | HistoryDetail  | Single workout detail              |
| `/progress`         | Progress       | PRs, charts, training frequency    |
| `/profile`          | Profile        | Settings, routines, plan link      |
| `/profile/plan`     | TrainingPlan   | View/edit active training plan     |
| `/profile/plan/setup` | PlanSetup    | Create or edit plan (wizard)        |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone and install

```bash
git clone <repo-url> vyayamy
cd vyayamy
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in order via the SQL editor or the Supabase CLI:
   - `supabase/migrations/00001_initial_schema.sql`
   - `supabase/migrations/00002_constraints_and_improvements.sql`
   - `supabase/migrations/00003_training_plans.sql`
3. Optionally run `supabase/seed.sql` to populate the global exercise library.
4. In **Project Settings > API**, copy the project URL and anon key.

### 3. Environment variables

```bash
cp .env.example .env
```

Set the two required values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start Vite dev server                    |
| `npm run build`      | Type-check + production build (includes PWA) |
| `npm run preview`    | Serve the production build locally       |
| `npm run lint`       | Run ESLint                               |
| `npm run format`     | Format with Prettier                     |
| `npm run format:check` | Check formatting without writing       |
| `npm test`           | Run tests once (Vitest)                  |
| `npm run test:watch` | Run tests in watch mode                  |

## Local Supabase Development

If you prefer running Supabase locally:

```bash
npx supabase start
```

This uses the settings in `supabase/config.toml` (API on port 54321, DB on 54322, Studio on 54323). Update your `.env` to point to the local instance.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed design and solution architecture overview covering the data model, component hierarchy, state management strategy, authentication flow, and security model.
