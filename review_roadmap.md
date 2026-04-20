My decisive recommendation, channeling Don Norman with Dieter Rams discipline: start by making the workout experience so clear and fast that it feels inevitable. Then layer trust, guidance, and Apple-shaped craft on top. The goal for the next 12 months is not “more features.” It is: the most calm, credible, private, and useful strength product a serious iPhone user can live in every day.

Product Position
Norman lens

Your positioning should become:

A calm strength journal that helps you know what to do, log it fast, and trust your progress.

Not:

a gym tracker
a dashboard
a social fitness app
a generic health app

That positioning should drive every decision. Each screen should answer one question:

Today → what should I do now?
Workout → what do I log next?
Plan → what am I scheduled to do?
Progress → am I improving?
History → what did I do before?
Profile → how is my data, identity, and preference handled?
What “world-class” means for this product
Rams lens + Dye lens

For your app, world-class means five things:

Faster than memory
The app should reduce thinking during a workout.
Calmer than competitors
No noisy dashboards, streak addiction, or fake motivation.
More trustworthy than clever
Plain-English insights, visible privacy, durable export.
More useful than pretty
Every chart should help a decision.
Apple-shaped without being native
Typography, spacing, motion, touch targets, install experience, offline resilience, and privacy should feel at home on iPhone.
Execution model

I’d run this as five phases, with clear exit criteria. Do not move to the next phase until the current one is genuinely good.

Phase 0 — Foundation and product discipline
Goal

Create the strategic and structural base so later polish is not wasted.

What to do
1. Lock the product principles

Write these into a short internal product brief:

calm over hype
one primary action per screen
explainable guidance over black-box AI
privacy as product behavior
single-column by default
serious lifters first, beginners not excluded
2. Simplify the information architecture

Promote these top-level destinations:

Today
Plan
History
Progress
Profile

Move training plans out of Profile as a primary object.

3. Define the v1 design system

Not a giant component library. Just enough to enforce coherence:

spacing scale
typography scale
color roles
card patterns
form fields
buttons
list patterns
charts
empty states
motion rules
haptic-equivalent feedback patterns for PWA interactions
4. Define product metrics now

Before redesigning, baseline these:

time from app open to first set logged
session completion rate
workouts per active user per week
repeat usage after 2 and 4 weeks
percent of workouts started from Today
percent of plan-based workouts vs free workouts
percent of users viewing Progress weekly
export usage
unit-switch friction
offline/save failures
5. Audit the current experience

Run a screen-by-screen audit and label each issue as one of:

clarity
speed
trust
consistency
delight
technical debt
Deliverables
product principles doc
updated IA
design system starter
KPI dashboard definition
UX audit backlog
Exit criteria

You can describe the whole app in one sentence, and every screen has one primary action.

Phase 1 — Make the workout loop exceptional
Goal

Create the best active workout experience in the product.

This is the phase that matters most. In Norman terms, this is where the product should disappear into the task.

Screens to redesign first
Today

Replace a utility homepage with a decision page.

Primary module:

today’s planned workout

Secondary actions:

free workout
repeat last workout

Support modules:

last completed workout
quick progress note
missed/shifted plan state
Active workout

This should become the product’s masterpiece.

Each exercise should show:

exercise name
planned target or rep range
last session snapshot
current set rows
next action
Exercise detail during workout

Keep it minimal:

instructions or notes
last performance
optional history
rest timer state
Features to build in this phase
1. Last-time ghost data

Show previous values inline behind today’s entry.

Why it matters:

lowers recall burden
increases confidence
speeds entry
2. Suggested next set

Prefill the next likely weight/reps based on the current workout or last session.

3. Rest timer as a core interaction

A rest timer should feel embedded, not bolted on.

4. One-tap save and advance

Entering a set should naturally move the user to the next thing.

5. Warm-up sets

Separate warm-ups from work sets cleanly.

6. Skip / swap / reduce load

Make real gym behavior first-class.

7. Inline notes only where needed

Never force note entry, but make it easy to add context.

8. Session summary at finish

After finishing:

volume
exercises completed
PRs hit
next planned day
Technical work in parallel
autosave reliability
optimistic updates that never feel risky
offline-safe local queue
recovery from interrupted sessions
robust session resume behavior
conflict handling for multi-device use
Success metrics
first set logged in under 20 seconds
fewer abandoned sessions
more workouts started from Today
more repeated exercise completion week over week
Exit criteria

A user can start, complete, pause, resume, and finish a workout with almost no confusion.

Phase 2 — Turn plans and templates into a true training system
Goal

Make planning feel supportive rather than administrative.

Kay lens

The conceptual model should become obvious: a plan tells you what to do, templates make it reusable, workouts record what actually happened.

What to change
1. Rebuild Plan as a primary product area

Plan should show:

current week or cycle
assigned workouts
completed vs pending
rollover or missed sessions
edit structure
2. Separate “template” from “plan” more clearly

Users should never wonder:
“Am I editing the workout I did, the workout I usually do, or the schedule?”

Use plain labels:

Template
Scheduled workout
Completed workout
3. Support plan rollover

If a day is missed, let users choose:

skip it
move it forward
merge with next session
repeat last completed order
4. Improve setup flow

Plan setup should be a guided flow:

training style
days per week
template assignment
optional cycle logic
confirmation preview
5. Add template intelligence

Template cards should show:

muscle emphasis
estimated time
last used date
linked plan usage
Success metrics
more users create a plan
more plan-based sessions begin from Today
fewer edits after initial setup
fewer abandoned setup flows
Exit criteria

The plan system feels like guidance, not admin overhead.

Phase 3 — Make progress useful, not just visible
Goal

Replace passive charting with actionable understanding.

Dyson lens

The insight layer is where you stop being a logger and start becoming a training product.

What to build
1. Insight-first Progress page

Lead with summary cards, not charts.

Examples:

strongest improving lift
stalled lift
weekly consistency
muscle group coverage
volume trend
missed plan impact

Then support each with a chart.

2. Exercise progression summaries

For each exercise:

last best set
recent trend
estimated direction
frequency
next likely target
3. Plateau detection

Use simple, explainable rules.

Examples:

“No load or rep gain in 5 exposures.”
“Volume is rising but top set is flat.”
“Frequency dropped from 2x/week to 1x/week.”
4. Weekly review

A calm weekly summary:

sessions completed
biggest win
area neglected
suggestion for next week
5. Strength-specific training load

Not a pseudo-scientific score. Use transparent building blocks:

sets
load
effort where available
frequency
muscle distribution
What not to do

Do not overbuild machine learning or fake readiness scoring.
Keep it legible and honest.

Success metrics
more repeat visits to Progress
more users changing behavior after insight views
fewer users needing charts to find basic answers
improved adherence for users on plans
Exit criteria

A user can open Progress and immediately know whether training is moving in the right direction.

Phase 4 — Build trust as a visible product feature
Goal

Become the most trusted strength product in the Apple ecosystem, even as a PWA.

Norman lens + Apple-shaped trust

Trust is not a privacy policy. It is visible product behavior.

What to build
1. Privacy center

A simple, readable section covering:

what is stored
what syncs
what stays local
how export works
how deletion works
what analytics are collected
what is never done with data
2. Export and portability

Users should be able to export:

workouts
exercises
templates
plans
progress summaries
3. Import/migration support

Make switching from notes, spreadsheets, or other apps easier.

4. Data durability UX

Show confidence states:

saved locally
synced
retrying
offline
5. Accessibility pass

Treat this as product quality, not compliance:

larger type behavior
strong contrast
touch target sizing
keyboard support where relevant
chart alternatives in text
screen reader labels
6. Install and re-entry experience

Polish the PWA experience:

install guidance
home screen icon quality
splash/loading calmness
resume behavior
return-to-session logic
Success metrics
fewer support issues around missing data
more exports
higher confidence in user interviews
stronger retention among serious users
Exit criteria

A careful user feels safe relying on the app as their long-term training record.

Phase 5 — Apple ecosystem fit, while staying PWA
Goal

Feel native to the Apple ecosystem in values and craft, without going native yet.

Dye / Hankey lens

This is about coherence, tactility, and restraint.

What to improve
1. Refine visual language
tighter typography rhythm
more intentional spacing
stronger hierarchy on cards
reduced chrome
more elegant empty states
2. Motion system

Use motion to clarify state, not decorate:

session start
set saved
timer transitions
workout completion
weekly summary reveal
3. iPhone-first ergonomics
thumb reach
sticky actions at bottom where appropriate
fast numeric input patterns
minimal navigation depth
4. Apple-shaped writing

Microcopy should feel calm, clear, and specific:

“Saved”
“Offline. Changes will sync.”
“You matched last week.”
“Bench is trending up.”
“No squat logged this week.”
5. Premium craftsmanship details

These matter more than extra features:

loading skeleton quality
empty-state quality
animation timing
touch feedback
transition continuity
graceful error recovery
Success metrics
users describe the app as calm, premium, or reliable
fewer misses in usability tests
better session speed without feature reduction
Exit criteria

The product feels intentionally crafted, not merely functional.

Phase 6 — Native readiness without going native
Goal

Prepare the product so a future native move is easy, optional, and not disruptive.

Dyson lens

Engineer the product honestly so it can evolve.

What to do now
keep the domain model clean
separate workout logic from UI logic
define clear sync states
make export/import robust
standardize identifiers for exercises, workouts, templates, and plans
store enough structured data for future insights
avoid web-specific hacks in core business logic
Why this matters

You do not need a native app now.
But you do need a product architecture that does not trap you later.

Exit criteria

A future iPhone or Watch app could reuse the same product model and training logic.

What to build first: the first 90 days

This is the practical starting sequence.

Month 1 — tighten the core
Week 1
write the product principles
define top-level IA
audit current screens
baseline metrics
list all friction points in the workout flow
Week 2
redesign Today
redesign active workout structure
define set-row interaction patterns
define rest timer behavior
define save/sync state language
Week 3
build Today redesign
build active workout UI shell
add ghost data and suggested next set
improve autosave and resume behavior
Week 4
usability test with 5–8 real lifters
measure time to first set
fix the top 10 friction points
lock the v1 interaction model
Month 2 — plans and templates
Week 5
redesign Plan as top-level area
separate template/workout/plan clearly in language and UI
Week 6
rebuild plan setup
add rollover handling
improve template cards
Week 7
test with new and experienced users
reduce setup friction
polish Today-to-Plan relationship
Week 8
ship the new planning model
instrument usage and dropout points
Month 3 — useful progress and trust
Week 9
redesign Progress page to be insight-first
define plateau rules and weekly review rules
Week 10
build summary cards and exercise trend modules
add text-based chart summaries
Week 11
build Privacy center
build export UX
improve sync confidence states
Week 12
run a quality pass across all key flows
fix copy, spacing, motion, and offline edges
prepare a focused beta launch
Recommended screen-by-screen priority

In order:

Active workout
Today
Plan
Progress
History
Profile / Privacy / Settings

That order matters because the workout loop creates the habit, and the habit earns the right to show deeper planning and insight.

What to delay

In the spirit of Rams, remove temptation.

Delay these until the core is excellent:

social features
achievements/streak systems
AI coach chat
calorie or nutrition expansion
general wellness expansion
community templates marketplace
highly customizable dashboards
heavy onboarding personalization

These may grow the product later, but right now they would blur the identity.

Team cadence and operating rhythm

A strong cycle would be:

Every 2 weeks
one core UX improvement
one trust/reliability improvement
one polish improvement
Every month
one moderated usability test round
one data review against product KPIs
one quality pass on the top-used screen
Every quarter
re-evaluate whether the product feels calmer, faster, and more trusted than before
How to judge whether you are winning

Ask these in every review:

Norman question

Does the user always know what to do next?

Rams question

What can we remove?

Dyson question

Is this genuinely better engineered, or just better decorated?

Dye/Hankey question

Does this feel coherent and carefully made?

Duarte question

Does motion and visual detail reinforce meaning?

If the answer is weak on any of these, the feature is not done.

My recommended order of investment

If resources are limited, spend effort in this order:

workout flow speed
reliability and offline trust
planning clarity
insight usefulness
visual refinement
ecosystem expansion

That is the right stack for a PWA-first product trying to become trusted inside the Apple world.

Final recommendation

Start with Phase 0 and Phase 1 immediately, and treat the next 90 days as a mission to make the workout loop obviously superior. Once that loop is excellent, Plans and Progress become much easier to improve because they will be built around a genuinely strong core behavior.

The one thing that would most improve the next step is seeing your current Today, Active Workout, and Progress screens so I can turn this roadmap into a concrete redesign backlog.