Elite Product Audit — Vyayamy
1. Executive Summary
Vyayamy is a genuinely well-built fitness tracking PWA that sits firmly above the average developer-built app. The warm neutral palette, systematic spacing tokens, frosted-glass nav, loading skeletons, and inline set editing show real design intent. This is not a template app.

However, it is not yet great. It lives in the space of "good but not confident" — the kind of app a skilled developer with taste built, but without the final rounds of restraint, unification, and polish that a dedicated product designer would apply. It feels like revision 0.9 of a premium product.

The biggest macro-level issues preventing world-class feel:

Two competing entry points to start a workout (Today page CTAs + separate WorkoutStart page) create conceptual fog
The active workout screen shares screen real estate with the bottom nav, creating a cluttered double-footer that undermines focus
Input styles are duplicated across 5+ files instead of being a single design system primitive
A duplicate CSS variable (--color-accent-soft defined twice with different values) signals the design system is not fully audited
Charts use near-default Recharts styling, breaking the otherwise warm, refined aesthetic
Routines — a core workflow feature — is buried under Profile, like a settings submenu
The bones are strong. The gaps are about discipline, restraint, and finishing the last 15%.

2. Overall Scorecard
Category	Score (1–10)
Clarity	7
Reduction / Simplicity	6
Information Density	7
Visual Rhythm	7.5
Design Taste Level	7
Interaction Quality	8
Perceived Performance	7.5
Consistency of System	6
Mobile UX	7
Desktop UX	6.5
Polish / Craft	6.5
Overall Product Quality	7
UX Friction Scores (1 = smooth, 10 = frustrating):

Friction Type	Score
Navigation Friction	4
Cognitive Friction	5
Input Friction	3
Workflow Friction	5
Visual Friction	3
Mobile Friction	4
3. What Already Feels Strong
The design token system is genuinely good. The 4px spacing scale, multi-tier typography (display → micro), semantic color tokens, transition easing tokens, and shadow hierarchy in theme.css are well-structured and consistently used. This is the foundation of a real design system.

The warm neutral palette is differentiated. Stone-based warm grays (#1C1917, #78716C, #A8A29E, #F8F8F6) give the app a human, calm quality that separates it from the cold blue/gray of most fitness apps. This is a high-taste color choice.

The frosted-glass bottom nav is an Apple-level detail.


Layout.css
Lines 28-29
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
The saturate + blur combination with --color-surface-frosted is exactly the iOS tab bar treatment. It feels premium.

The inline set editing flow in ExerciseBlock is thoughtfully designed. Tap-to-edit, Enter-to-advance (weight → reps), flash confirmation on save, copy-previous-set shortcut, and undo-via-toast for deletion. This is the kind of interaction detail that separates a good workout logger from a great one.


ExerciseBlock.tsx
Lines 80-95
  const saveAndAdvance = (s: Set) => {
    if (!editingField) return;
    // ... saves current field, then advances to next
    if (editingField.field === 'weight') {
      skipBlurRef.current = true;
      setEditingField({ setId: s.id, field: 'reps' });
      setEditValue(s.reps?.toString() ?? '');
    } else {
      setEditingField(null);
    }
  };
Empty states are consistent and warm. Custom SVG illustrations (DumbbellIllustration, TrophyIllustration, etc.) with gentle copy and optional CTAs. Not a generic "Nothing here" placeholder.

Loading states are content-aware. TodaySkeleton mirrors the actual Today layout with correct proportions. DetailSkeleton matches HistoryDetail. This eliminates layout shift and feels fast.

The page crossfade transition on route change via key={location.pathname} is subtle and correct — 250ms opacity fade. Not overdone.

Safe area handling with env(safe-area-inset-bottom) throughout nav and footers shows production-grade mobile awareness.

4. Biggest Quality Gaps
Gap 1: Two competing workout entry points create conceptual fog
The Today page offers "Start workout" (→ navigates to /workout WorkoutStart page) AND "Repeat last session" (→ directly creates and goes to /workout/active). The WorkoutStart page then offers "Empty workout", "Repeat last", and routine templates.

This means:

"Start workout" on Today takes you to an intermediate choice screen
"Repeat last session" on Today bypasses that screen entirely
The same "repeat last" action exists in both places
Quick-start routine chips on Today also bypass WorkoutStart
The user's mental model is fractured. A world-class app would have one canonical path to start a workout.

Gap 2: Active workout shares screen with bottom nav — double footer
WorkoutActive renders inside Layout, which means the bottom nav is visible during an active workout. The workout's own sticky footer (Add exercise + Finish) sits above the nav with padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px) + var(--nav-height)).

This means the user sees two fixed bars at the bottom of the screen during the most important workflow in the entire app. This is the opposite of focus. Apple Health, Strong, and every premium workout app hide chrome during an active session.

Gap 3: Input styles duplicated across the codebase
There are at least 5 separately-defined input styles:

login-input in Login.css
routines-input in Routines.css
profile-name-input in Profile.css
esm-create-input in ExerciseSearchModal.css
esm-search-input in ExerciseSearchModal.css
Each has slightly different heights (36px, 40px, 44px, 48px), padding, border treatments, and focus styles. This is a clear design system gap — inputs should be a single shared primitive with size variants.

Gap 4: Duplicate CSS variable

theme.css
Lines 12-20
  --color-accent-soft: #64748B;
  // ... (8 lines later)
  --color-accent-soft: rgba(28, 25, 23, 0.06);
--color-accent-soft is defined twice — first as a solid slate blue (#64748B), then overwritten as a near-transparent warm black. The first definition is dead code, but its existence suggests the token system hasn't been fully audited. The value #64748B is also the only cool-toned color in an otherwise warm palette, which would be a palette coherence violation if it were actually used.

Gap 5: Charts break the design language
The Recharts configuration uses near-default styling. The tooltip in the Progress page has:


Progress.tsx
Lines 259-268
  contentStyle={{
    background: 'var(--color-surface)',
    border: 'none',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    fontSize: '13px',
    padding: '8px 12px',
  }}
This is inline-styled with hardcoded values instead of using design tokens. The rgba(0,0,0,0.06) shadow won't adapt to dark mode. The charts themselves lack the warmth of the rest of the UI — they feel like a generic data viz dropped into a carefully designed app.

Gap 6: Routines buried under Profile
Routines/templates are a core workflow feature (they power quick-start from Today, and are available on WorkoutStart). But accessing and managing them requires: Profile → Routines. This is treating a primary feature like a secondary setting. Linear doesn't hide project templates under user settings. Notion doesn't bury its template gallery in preferences.

5. Design Taste Audit
What feels refined:

The warm stone palette conveys calm and intentionality
Typography hierarchy (display at 34px down to micro at 11px) is well-calibrated
The frosted nav, hairline borders (0.5px solid), and restrained shadow system
The week-strip dot visualization on Today — simple, glanceable, Apple Watch-esque
The PR card gradient treatment (pg-pr-card--new) with warm amber is elegant
What feels generic:

The .btn-primary is a solid black rounded rectangle. Competent, but indistinguishable from any modern template. The same button used for "Start workout", "Finish workout", "Done", "Create routine", "Send magic link" — it lacks any contextual weight variation
The .card base style (white + thin border + subtle shadow) is the single most common component pattern in modern web apps. It works, but it doesn't distinguish the product
The "← History" and "← Profile" back links using btn-ghost feel ad-hoc, not like a designed navigation pattern
What feels dated or developer-built:

The × character used for set deletion in ExerciseBlock:

ExerciseBlock.tsx
Lines 268-269
                      >
                        ×
A text character instead of an icon component. This is the kind of shortcut that breaks the illusion of polish.

The reorder UI (GripVerticalIcon + ChevronUp/Down buttons) in ExerciseBlock:

ExerciseBlock.tsx
Lines 136-149
            <div className="exercise-block-reorder" onClick={(e) => e.stopPropagation()}>
              <GripVerticalIcon size={14} className="exercise-block-grip" />
              // ... up/down buttons
            </div>
This looks like a developer who needed reorder functionality and built the simplest thing. A grip handle that doesn't enable drag-and-drop, paired with tiny arrows, is confusing affordance — the grip suggests "drag me" but you can't drag. Either commit to drag-and-drop or remove the grip icon entirely.

The Routines page management UI (inline edit, exposed Delete button per item) feels like a CRUD admin panel rather than a designed experience
What feels overdesigned:

Nothing significant — if anything, the app errs toward underdesign rather than overdesign, which is the better error
What feels not cohesive:

The chart sections on Progress feel imported from a different app. The rest of the UI has warm, organic quality; the charts are cold and generic
The Login page is so minimal it feels disconnected from the warmth of the rest of the app
6. Information Density Audit
Today screen: Density is appropriate. The greeting + context line, CTAs, week strip, quick start chips, and recent list create a clear top-to-bottom hierarchy. However, the "Quick start" section adds horizontal scrolling mental overhead that could be avoided if routines were presented differently.

WorkoutStart screen: Under-dense. Two cards and an optional routine list on a full page feels sparse. This screen's content could be a sheet or be absorbed into Today.

WorkoutActive screen: This is the densest screen and it handles it well. The exercise block's 4-column grid (Set / Weight / Reps / Actions) is efficient. The completed-set green highlight provides instant visual parsing. However, the actions column (copy + delete + check) can feel cramped on small screens — three controls in 80px is tight.


ExerciseBlock.css
Lines 66-67
  grid-template-columns: 28px 1fr 1fr 80px;
History screen: Good density. The grouped-by-date pattern with micro-sized group labels creates clear visual breaks. Muscle group tags in cards add useful scannability without clutter.

HistoryDetail screen: The stats row (Duration / Exercises / Sets / Volume) with dividers is elegant and efficiently dense. The per-exercise set tables are appropriately compact.

Progress screen: This screen has the most density problems. When a user has many PRs, the vertically stacked PR cards create a very long scroll. There's no way to collapse, filter, or paginate. The exercise trend pill selector can also overflow awkwardly when there are many exercises — it wraps, which is fine, but slice(0, 8) is an arbitrary cap that isn't communicated to the user.

Profile screen: Good balance. The 3-column stat grid is compact and glanceable. The settings section with the kg/lb toggle is clean. Not too much, not too little.

7. Visual Rhythm Audit
Spacing consistency: The --space-6 (24px) gap between major sections is used consistently across Today, History, Progress, and Profile. Section titles use --space-3 (12px) bottom margin. This creates a steady cadence. It works but is somewhat monotonous — there's no variation in breathing room between more and less important sections.

Alignment: Generally excellent. The --padding-page (20px mobile, 32px tablet, 40px desktop) is used consistently for horizontal page padding. Cards use --space-4 or --space-5 internal padding consistently.

One rhythm issue: The Today page has:

Header → 24px gap → Actions → 24px gap → Week card → 24px gap → Quick start → 24px gap → Recent
Every section break is identical. A more composed layout would use a larger gap before the "Recent" section (which is a secondary content area) and a tighter gap between the CTA and week strip (which are both primary engagement elements).

Another rhythm issue: In ExerciseBlock, the completed set highlight extends with negative margins:


ExerciseBlock.css
Lines 115-118
.set-row--done {
  background: var(--color-success-soft);
  margin: 0 calc(-1 * var(--space-5));
  padding-left: var(--space-5);
This is a nice "bleed" effect, but it causes the green background to touch the card edges. On the last completed set before an incomplete set, the green row with border-bottom-color: transparent creates a visual discontinuity. The rhythm breaks.

The layout-level composition (content constrained to 640px, centered on desktop with border + shadow frame) is clean and calm. The desktop framing at 768px+:


theme.css
Lines 313-319
  #root {
    margin-top: var(--space-6);
    margin-bottom: var(--space-6);
    border: 0.5px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
This creates a phone-frame effect on desktop that's intentional and appropriate for a mobile-first app. However, it means desktop users see a lot of empty space on either side — there's no consideration for what happens at 1440px+ widths.

8. UX Friction Audit
Navigation Friction (Score: 4)
Bottom nav with 4 items is clear and standard
BUT: No way to get to WorkoutActive from the nav if you navigate away mid-workout (you must go to Today and tap "Resume")
Back navigation from HistoryDetail and Routines uses text links, not a consistent back pattern
Routines requires two taps from any nav destination: Profile → Routines
Cognitive Friction (Score: 5)
The two workout entry paths (Today CTAs vs. WorkoutStart page) force a "which way?" decision
The GripVerticalIcon on ExerciseBlock suggests draggability but only offers button-based reorder — mismatched affordance
"Quick start" chips on Today look similar to filter chips but launch entire workouts — the action weight is hidden
On the History filter chips, "3 mo" is an abbreviation while "Month" and "Year" are not — inconsistent labeling
Input Friction (Score: 3)
The tap-to-edit pattern in ExerciseBlock is fast and obvious
Enter-to-advance from weight to reps is excellent for flow
Copy-previous-set is a genuine power feature
Number inputs use inputMode="decimal" and inputMode="numeric" correctly
The one issue: no stepper control for weight/reps. Every value requires typing. A long-press or swipe-to-increment would reduce friction for the common case of adjusting by 2.5kg or 1 rep
Workflow Friction (Score: 5)
Starting a workout from a routine: Today → tap chip → auto-navigate to active. This is fast.
Starting an empty workout: Today → "Start workout" → WorkoutStart page → "Empty workout" → active. Three screens. Should be one or two.
Creating a routine: Profile → Routines → "+ New" → type name → Create → tap "Exercises" → pick exercises one by one. Each exercise requires a separate tap with no batch selection. For a 6-exercise routine, this is 8+ taps.
Deleting a workout: HistoryDetail → "Delete workout" → confirm sheet → confirm. This is appropriately guarded.
Visual Friction (Score: 3)
The palette and type hierarchy minimize visual friction
Cards, lists, and sections are clearly delineated
The one visual friction point: the completed-set green highlight, while nice, can make it harder to scan an ExerciseBlock when most sets are completed — the green rows dominate
Mobile Friction (Score: 4)
Touch targets meet 44px minimum consistently
Safe area insets are handled
The double-footer during active workout (workout footer + bottom nav) wastes ~100px of vertical space on a mobile screen where every pixel matters
Horizontal scrolling chips on Today lack scroll snap — they can stop at awkward half-positions
No pull-to-refresh on any screen
9. Interaction Latency / Speed Audit
Perceived performance is generally good, due to:

Skeleton loading states that mirror actual content shapes
60-second stale time on React Query preventing unnecessary refetches
useAnimatedPresence giving modals enter/exit animations (feels responsive even if data loading)
Page crossfade transitions masking content loading
Areas where speed could feel better:

Exercise search modal delays focus by 100ms after opening:

ExerciseSearchModal.tsx
Lines 44-49
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);
This is likely to wait for the slide-up animation, but 100ms of not being able to type after the modal appears is noticeable. It should focus immediately or use onAnimationEnd.

Workout timer updates every 30 seconds:

WorkoutActive.tsx
Lines 33-34
    const id = setInterval(update, 30000);
During an active workout, seeing "12m" for 30 seconds before it ticks to "13m" can feel stale, especially for short workouts. A 60-second update for 1h+ workouts is fine, but for sub-30-minute workouts, this feels sluggish.

No optimistic updates visible for set completion. When a user taps the check button, the mutation fires but there's no immediate local state toggle — the UI relies on React Query cache updates from the onMutate callback (if implemented in the query hooks). If the query hook doesn't have optimistic updates, there could be a visible delay before the green highlight appears.

Template creation (handleCreateRoutine in Routines) uses mutateAsync with an await, which means the UI blocks until the server round-trip completes. For a simple name save, this should be optimistic.

10. Component & Design System Audit
Inconsistencies
CSS class naming conventions are fragmented:

Full name: workout-active-, today-, exercise-block-, history-
Abbreviated: hd- (HistoryDetail), pg- (Progress), esm- (ExerciseSearchModal)
There's no single convention. A real design system would use one pattern.

Input elements have no shared base class. Five different input definitions with varying heights:

login-input: 48px
routines-input: 44px (--touch-min)
profile-name-input: 36px
esm-search-input: 40px
esm-create-input: 44px
set-row-input: 36px
These should be a single .input base with .input--sm, .input--md, .input--lg variants.

Back navigation has no shared component. Both HistoryDetail and Routines use <Link className="... btn-ghost">← ...</Link> with nearly identical CSS. This should be a <BackLink> component.

The meta class is used as a utility in combination with other classes (e.g., className="today-context meta", className="history-card-date meta"). It sets font-size: var(--font-meta) and color: var(--color-text-secondary). This is fine as a composition pattern, but it means secondary text styles are applied via a class name that doesn't describe its semantic purpose. This is a maintainability risk — a developer must remember to add meta to get secondary text styling.

What should be standardized
Input component with size variants and shared focus/border/placeholder styles
BackLink component with consistent left-arrow treatment
Section header pattern (title + optional right-side action) — used identically in Today, History, and Routines
Stat display pattern — used in HistoryDetail (hd-stat), WorkoutActive summary (workout-summary-stat), and Profile (profile-stat-card) with slight variations that should be unified
Tag/badge pattern — used as history-tag, hd-muscle-tag, routines-badge, pg-pr-badge — all slightly different implementations of the same concept
11. Mobile-First Audit
What works well on mobile:

Content max-width of 640px means layouts are always mobile-optimized
Touch targets consistently ≥44px
Safe area insets properly handled
Horizontal chip scroll with mask fade on Today
Bottom sheet pattern for modals (not centered dialogs)
inputMode attributes on number inputs for appropriate mobile keyboards
What needs improvement:

Double footer during active workout — The bottom nav (52px) + workout footer (~60px + safe area) consumes over 110px of vertical space on a 667px iPhone SE screen. That's 16% of the screen dedicated to chrome, leaving barely 4 exercise set rows visible before scrolling.

No swipe gestures anywhere. Modern mobile fitness apps use:

Swipe to delete sets (instead of tiny × button)
Swipe back for navigation (instead of text back links)
Pull-to-refresh on list views
The set actions column (80px) is tight. When copy + delete + check are all visible, three interactive targets in 80px horizontal space means ~26px per target — well below the 44px touch target guideline for the horizontal axis.

No landscape consideration. The app will work in landscape but the 640px max-width means huge dead zones on either side of a landscape phone.

The exercise search modal at 90dvh is good, but it has no handle indicator (the thin drag bar common in iOS sheets). Users may not realize they can tap the backdrop to dismiss.

Only one responsive breakpoint for small screens (359px). There's no handling for the 375px iPhone SE sweet spot where some layouts are tighter than on a 390px+ phone.

12. High-Impact Improvements
1. Remove WorkoutStart as a separate page — merge into Today or a sheet
Issue: Two competing entry points to start a workout. WorkoutStart is a low-content page that adds a navigation step.

Why it matters: Every extra screen between "intent" and "action" reduces completion rate. The user already sees "Start workout" and "Repeat last" on Today. Making them navigate to another page to see the same options plus templates is friction.

Fix: Remove /workout as a page. Make "Start workout" on Today either (a) directly start an empty workout, or (b) open a bottom sheet with the options currently on WorkoutStart. The quick-start chips on Today already handle the template case.

Impact: Reduces primary workflow from 3 screens to 1-2. Eliminates conceptual confusion.

2. Hide the bottom nav during active workout
Issue: The bottom nav competes with the workout footer for attention and screen space.

Why it matters: The active workout is the single most important screen. It should feel immersive and focused, like recording in a DAW or editing in Figma.

Fix: Detect when the route is /workout/active and hide the bottom nav. Add a "back to home" affordance within the workout header if needed. This recovers ~52px of vertical space and eliminates the double-footer problem.

Impact: Significant improvement to focus, density, and premium feel of the core workflow.

3. Unify input styles into a single shared primitive
Issue: 5+ different input definitions with inconsistent heights and styles.

Fix: Define .input, .input--sm (36px), .input--md (44px), .input--lg (48px) in theme.css with shared border, radius, focus, placeholder, and dark mode styles. Replace all per-component input styles.

Impact: Immediate consistency improvement. Reduces CSS by ~60 lines. Makes future input usage frictionless.

4. Fix the duplicate --color-accent-soft variable
Issue: Defined twice with different values in :root. The first definition (#64748B) is a solid slate blue; the second (rgba(28, 25, 23, 0.06)) is a near-transparent warm black. The second overwrites the first.

Fix: Remove the dead first definition. Audit all usages of --color-accent-soft to ensure the transparent value is intentional everywhere.

Impact: Low effort, high signal that the design system is maintained.

5. Add a handle indicator to bottom sheets
Issue: Bottom sheets (Sheet, ExerciseSearchModal) have no visual handle indicator — the thin rounded bar that iOS uses to signal "you can pull this down."

Fix: Add a 36x5px rounded ::before pseudo-element to .sheet-panel and .esm-panel. Centered, --color-border-strong, border-radius: 2.5px.

Impact: Small change that immediately signals "this is a dismissable sheet" on mobile. Standard iOS/Android convention.

6. Replace the × text character with an icon for set deletion
Issue: The delete button in ExerciseBlock uses a literal × character, while every other interactive element uses SVG icons from Icons.tsx.

Fix: Create a small XIcon or TrashIcon component in Icons.tsx. Use it in the set deletion button.

Impact: Eliminates the most visible "developer shortcut" in the core workflow.

7. Redesign the exercise reorder UI
Issue: GripVerticalIcon suggests drag-and-drop but only offers button-based reorder. The 24x24px move buttons are small and the affordance is confusing.

Fix: Either (a) implement actual drag-and-drop reorder (complex but correct), or (b) remove the grip icon and replace with a simple "Move up / Move down" text buttons in a ··· menu, or (c) use a long-press to enter reorder mode. The current hybrid is the worst of both worlds.

Impact: Removes the most confusing affordance mismatch in the app.

8. Promote Routines to a top-level concept
Issue: Routines are buried under Profile → Routines, but they power two of the three workout entry paths.

Fix: Add a "Routines" section directly on Today or make it a tab/section within the workout start flow. At minimum, add a shortcut to Routines from the Today page Quick Start section header.

Impact: Makes a core feature discoverable without navigation archaeology.

9. Style charts to match the design language
Issue: Recharts defaults break the warm aesthetic. Tooltip shadows use hardcoded values that don't adapt to dark mode.

Fix: Use design tokens for all chart styling. Give the area chart a warmer gradient. Use --shadow-md for tooltips. Format axis ticks with the same --font-micro sizing. Add --color-chart-axis usage consistently (it exists but isn't used everywhere).

Impact: Charts currently feel imported from a different app. Aligning them with the design language unifies the entire Progress page.

10. Add scroll snap to horizontal chip scrollers
Issue: The Quick Start routine chips on Today scroll freely — they can stop at half-positions.

Fix: Add scroll-snap-type: x mandatory to .today-routines and scroll-snap-align: start to .today-routine-chip.

Impact: Subtle but immediately feels more intentional. Standard in premium mobile apps.

13. What To Remove
Element	Reason	Action
WorkoutStart page	Redundant with Today CTAs + quick start chips	Merge into a sheet or eliminate
First --color-accent-soft definition	Dead code (overwritten by second definition)	Delete line 12 of theme.css
GripVerticalIcon in ExerciseBlock	Suggests drag but doesn't enable it	Remove unless implementing drag-and-drop
The × text character	Inconsistent with SVG icon system	Replace with icon
workout-active-footer nav-height padding	Won't be needed if nav is hidden during workout	Remove after hiding nav
today-empty class	Defined in Today.css but never used in Today.tsx (EmptyState handles it)	Delete
history-empty class	Same — defined but unused	Delete
pg-empty class	Same pattern	Delete
exercise-block-ref class	Defined in ExerciseBlock.css but never used in ExerciseBlock.tsx	Delete
.btn-secondary:active:not(:disabled) scale transform	Same as primary and danger — all three do scale(0.98). Consider if secondary needs this aggressive feedback	Evaluate
14. Premium Polish Recommendations
Spacing
Introduce section-level spacing variation: use --space-8 (32px) before major content sections and --space-4 (16px) between closely related elements, instead of uniform --space-6 everywhere. This creates breathing hierarchy.
The 640px --content-max could increase to 680px or 720px to give cards more breathing room on larger phones.
Typography
Add letter-spacing to the meta class (letter-spacing: 0.01em) to improve readability at 13px
The .today-routine-chip-name at --font-meta (13px) is slightly small for an actionable element that launches an entire workout. Consider --font-body (15px).
Add a font-smoothing reset for dark mode (already present globally — good)
Motion
Add spring-based easing to the check-pop animation. The current cubic-bezier goes 1 → 1.2 → 1 linearly. A spring cubic-bezier(0.34, 1.56, 0.64, 1) would feel more alive.
Add a subtle scale pulse when a set row is completed (not just the check icon)
The page crossfade could add a slight translateY(4px) → 0 for a more Apple-like reveal
Add will-change: transform to elements with scale transforms for compositing optimization
Surfaces
Cards could benefit from a very subtle inner glow on hover in dark mode: box-shadow: var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.03)
The summary card on HistoryDetail (hd-summary) could use a slightly different surface — perhaps a very subtle gradient background to distinguish it as a "hero" card
States
Add disabled state styling to chips — currently chips have no :disabled treatment
Add a selected state to history cards (subtle left border or background tint) for keyboard navigation
The exercise search results should show a loading shimmer per item during search, not just the "Searching..." text
Copy
"Send magic link" on Login is clear but could be warmer: "Sign in with email" is more standard
"A minimal training journal" tagline is good — understated and honest
"Ready for your first workout? Your training history will show up here." — slightly long. Consider: "Your training history will appear here."
Confirm dialog messages could be shorter. "Complete "Workout" with 3 of 5 sets done?" — the quote marks around the workout name add visual noise
Charts
Area chart should use animationDuration={800} with animationEasing="ease-out" for a smoother reveal
Bar chart bars should have a hover state (slight opacity change)
Consider adding value labels to bar chart bars for the frequency view
Transitions
Sheet and ExerciseSearchModal closing animations (150ms) are slightly too fast. 200ms would feel more natural.
The workout-active--completing animation (scale up → fade/scale down) is a nice celebratory touch. Consider adding a subtle background flash.
Empty States
The SVG illustrations are tasteful but could be slightly larger (56px instead of 48px) for more visual weight
Consider adding a subtle animation (gentle float or pulse) to empty state icons
15. Priority Roadmap
Immediate Fixes (1–2 days, high impact, low risk)
Fix duplicate --color-accent-soft CSS variable
Replace × text character with proper icon in ExerciseBlock
Remove unused CSS classes (today-empty, history-empty, pg-empty, exercise-block-ref)
Add handle indicator to bottom sheets
Add scroll snap to routine chip scroller
Standardize CSS class naming convention (document whether to use abbreviations or not)
Next-Level Refinements (1–2 weeks, significant quality jump)
Hide bottom nav during active workout — recovers screen space and creates focus
Merge WorkoutStart into Today — eliminate the intermediate page, reduce workflow friction
Unify input styles into shared primitives in theme.css
Restyle charts to use design tokens and match the warm aesthetic
Create shared BackLink component to replace ad-hoc back navigation
Unify tag/badge pattern across History, HistoryDetail, Routines, Progress
Redesign exercise reorder — remove misleading grip icon, commit to either drag-and-drop or menu-based reorder
Promote Routines — make them accessible from Today, not just from Profile
Add optimistic updates to set completion and template creation for instant feedback
Final Polish Pass (1 week, moves from "good" to "premium")
Introduce spacing variation between major/minor sections
Refine animation easings (spring curves, page reveal with translateY)
Add subtle hover states to cards and charts in dark mode
Improve chart tooltip styling for dark mode compatibility
Add loading shimmer to search results in ExerciseSearchModal
Review all copy for consistency and brevity
Add empty state micro-animations
Consider adding haptic feedback hints (navigator.vibrate) for check completion on mobile
Audit all hardcoded color values (e.g., #fff in .set-row-check--done, #0C0A09 for dark mode desktop body) and move to CSS variables
Add prefers-reduced-motion media query to disable animations for accessibility
Bottom line: This app has a strong foundation — better than 90% of developer-built products I've seen. The palette, token system, and core workout interaction are genuinely good. But the inconsistencies in the design system (inputs, naming, back navigation), the workflow confusion (double entry point for workouts), and the unfinished details (chart styling, reorder UX, × character) hold it back from the tier of apps like Linear or Apple Health. The path from 7/10 to 9/10 is about discipline and finishing — not about adding features.