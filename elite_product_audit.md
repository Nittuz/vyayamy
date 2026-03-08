Elite Product Audit — Vyayamy

1. Executive Summary

Vyayamy is a good but not yet great product. It is significantly better than the typical developer-built fitness app. The foundations are right: a restrained warm-neutral color palette, a proper spacing scale, a well-structured token system, and a mobile-first architecture that makes the right architectural choices (bottom nav, bottom sheets, touch targets). Someone with taste made the initial decisions.

However, the app sits in the uncanny valley between "thoughtfully designed" and "truly polished." The design system is coherent in concept but inconsistent in execution. Several screens betray their implementation origin — they feel assembled from correct parts rather than composed as a whole. The Profile page is overgrown. The Progress page is undercooked. Empty states are perfunctory. Desktop is an afterthought. And several small craft failures (inline styles, hardcoded colors, CSS typos, missing exit animations, dead code) accumulate into a product that feels 70% of the way to premium.

The biggest single issue: the app lacks restraint in its busiest moments and lacks ambition in its quietest ones. The active workout screen packs functional density without elegance. The empty states are clinically informative but emotionally flat. The charts are generic Recharts defaults. The Profile page tries to do everything.

To reach the Linear/Apple Health tier, this app needs: tighter visual rhythm, more purposeful information density, animated state transitions, stronger empty states, a desktop-aware layout, and a ruthless edit pass on the Profile page.



2. Overall Scorecard

Design & UX Scores (1-10):







Category



Score



Notes





Clarity



7



Good page-level intent, but some screens lack a single clear CTA





Reduction / Simplicity



6



Profile is bloated; workout screen has dense controls





Information Density



6.5



Mostly appropriate; Progress page oscillates between sparse and cramped





Visual Rhythm



6



Token system exists but inconsistently applied; several spacing mismatches





Design Taste Level



7



Above average — warm palette, restrained type — but generic in details





Interaction Quality



6.5



Set editing is clever; sheet/modal usage is sound; but many rough edges





Perceived Performance



7



Good query architecture; skeleton screens exist; page-in animations help





Consistency of System



5.5



Token system exists but components diverge (inline styles, hardcoded values, prefix inconsistency)





Mobile UX



7



Touch targets correct, bottom nav solid, safe-area handling present





Desktop UX



3



A 640px column centered in a void — no desktop consideration at all





Polish / Craft



5



Missing: exit animations, scroll restoration, error recovery, loading nuance





Overall Product Quality



6



Good foundation, inconsistent execution, needs a focused craft pass

UX Friction Scores (1 = smooth, 10 = frustrating):







Category



Score



Notes





Navigation Friction



3



Bottom nav is clear; back links are present; workout flow is linear





Cognitive Friction



4



Generally understandable, but the Profile page requires mental modeling





Input Friction



5



Set editing is tap-edit-blur but no visual save confirmation; keyboard flows have edge cases





Workflow Friction



4



Workout logging flow is reasonable; "repeat last" is smart; routine setup is clunky





Visual Friction



4



Layout is mostly calm; noise creeps in on Progress and Profile





Mobile Friction



3.5



Good touch targets; some scroll/density issues on small screens



3. What Already Feels Strong

1. Color palette and restraint. The warm neutral palette (#F8F8F6 background, #1C1917 text, stone-based secondaries) is genuinely tasteful. It avoids the cold blue/gray SaaS default. The accent color being the same near-black as text creates a calm, unified look. This is a strong foundation.

2. Typography system. Seven size tokens from --font-display (34px) to --font-micro (11px) with appropriate weight and tracking adjustments. The system font stack prioritizing SF Pro is the right call for this type of app. font-variant-numeric: tabular-nums applied to data values shows attention to craft.

3. Bottom navigation. The frosted glass effect (backdrop-filter: saturate(180%) blur(20px)) with a subtle 0.5px border is the current gold standard for mobile nav bars. Icon + label pattern is correct. Active state is clear without being loud. Safe-area-inset handling is present.

4. Spacing token system. 4px-base scale (--space-1 through --space-12) provides enough granularity without being unwieldy. The semantic aliases (--padding-page, --space-section) are a good idea even if underused.

5. The "Today" screen concept. Greeting + last-trained context + primary action + week strip + quick start + recent history is a well-prioritized information hierarchy. The week strip with filled/empty dots is a clean, glanceable pattern.

6. Set editing interaction pattern. The tap-to-edit → inline input → Enter-to-advance-to-next-field flow in ExerciseBlock shows real thought about the high-frequency input loop. The skipBlurRef to handle focus transitions is a good technical detail.

7. Sheet component. Bottom sheet with slide-up animation, Escape to close, backdrop click to dismiss, body scroll lock — the fundamental interaction is correct and follows platform conventions.

8. Touch target compliance. --touch-min: 44px applied to buttons, inputs, list items, and nav links. This is non-negotiable for a fitness app used with sweaty hands, and it's consistently applied.



4. Biggest Quality Gaps

Gap 1: Profile Page is an Everything Drawer

[src/routes/Profile.tsx](src/routes/Profile.tsx) manages 12 pieces of state, contains inline styles for the exercise picker sheet (lines 359-418), and handles four distinct concerns: identity management, settings, routine CRUD, and sign-out. This is the single weakest screen in the app.

The exercise picker inside the Sheet uses raw inline styles:

const handleSaveDisplayName = () => {
    const name = displayNameDraft.trim();
    updateProfile.mutate(
      { display_name: name || null },
      { onSuccess: () => setEditingDisplayName(false) },
    );

And then lines 365-418 are all inline style={{...}} objects — no CSS classes, no design system, no consistency with the rest of the app. This screams "built in a hurry."

Gap 2: No Exit Animations

Every sheet, modal, toast, and page transition has an entrance animation but no exit animation. Closing a bottom sheet is instant — the content and backdrop simply vanish. This is the single most noticeable craft failure. Premium apps (iOS sheets, Linear modals, Stripe drawers) all animate out. The absence makes every dismissal feel broken.

Gap 3: Desktop is Abandoned

The entire app renders in a 640px column centered on screen. On a 1440px monitor, there's ~800px of empty #F8F8F6 background on either side. There's exactly one desktop media query in the entire codebase:

@media (min-width: 768px) {
  :root {
    --padding-page: 32px;
    --font-display: 38px;
  }
}

This changes two values. No layout adaptation. No sidebar. No two-column layouts. No larger touch targets becoming click targets. For a PWA that will install on desktops, this is a significant gap.

Gap 4: Empty States Are Emotionally Flat

Every empty state in the app follows the same pattern: a card with centered gray text.





Today: "Your training history will appear here after your first workout."



History: "Your training journal will appear here after your first workout."  



Progress: "Finish workouts to see personal records here."

These are informationally correct and emotionally dead. No illustrations, no personality, no motivation, no call to action beyond the generic message. For a fitness app, empty states are the first impression — they should inspire action, not just describe absence.

Gap 5: Chart Styling is Generic Default

The Recharts configuration in [src/routes/Progress.tsx](src/routes/Progress.tsx) uses hardcoded color strings (fill: '#A8A29E') instead of CSS variables, default tooltip styling with inline style objects, and minimal customization. The bar chart uses opacity: 0.7 on all bars, making them look washed out. The line chart dots are visible at all times, adding noise. The Y-axis left margin is negative (left: -20), a hack to fit content. These charts look like Recharts tutorial examples, not designed data visualizations.

Gap 6: Inconsistent Design System Adherence

The token system in [theme.css](src/styles/theme.css) is well-defined but inconsistently respected:





Hardcoded colors: WorkoutActive footer uses rgba(248, 248, 246, 0.85) instead of a variable. Chart axes use literal '#A8A29E'.



Inline styles: ConfirmDialog uses style={{ marginBottom: 'var(--space-6)' }} and style={{ display: 'flex', gap: 'var(--space-3)' }}. Profile exercise picker is entirely inline-styled.



CSS prefix inconsistency: History Detail uses hd-, Progress uses pg-, Today uses today-, ExerciseBlock uses exercise-block-. No consistent naming convention.



Dead CSS: today-time-actions is defined in [Today.css](src/routes/Today.css) (line 22) but the component uses today-actions — evidence of a rename that wasn't cleaned up.



CSS typo: .h focus-block-info in [HistoryDetail.css](src/routes/HistoryDetail.css) should be .hd-block-info. This selector is broken and the element it targets has no styles.

Gap 7: Loading States Are Primitive

[ProtectedRoute.tsx](src/components/ProtectedRoute.tsx) shows <p className="meta">Loading…</p> as its auth-loading state. HistoryDetail shows the same "Loading..." text. The SkeletonList component exists but is only used on the History page. The Today page — the most important first-load screen — has no loading skeleton at all.



5. Design Taste Audit

Where it feels refined:





Login page: minimal, centered, generous whitespace, no unnecessary decoration. The title "Vyayamy" with the tagline "A minimal training journal" followed by a single input field is restrained and confident.



Bottom nav bar: the frosted glass treatment with 0.5px border is current and premium.



Week strip dots: simple, glanceable, no over-decoration.



The warm stone palette: avoids the generic blue/gray tech aesthetic.

Where it feels generic:





Card surfaces: every card is background: white, border-radius: 12px, box-shadow: 0 1px 2px rgba(0,0,0,0.04). This is correct but not distinctive. It's the same surface treatment as every modern SaaS app.



Section titles with uppercase/letter-spacing micro labels ("THIS WEEK", "RECENT", "PERSONAL RECORDS"): this is a common pattern that feels more "Bootstrap 5 dashboard" than "Apple Health."



Filter chips (History, Progress): the capsule-shaped toggle chips are ubiquitous and unremarkable.

Where it feels dated:





The 3px left border on PR cards with "NEW" indicator (border-left: 3px solid var(--color-pr)): this is a Bootstrap-era "accent border" pattern. Modern premium apps use subtler indicators — a dot, a glow, a background tint.



The !important overrides in Profile CSS (lines 170, 290, 313-314): these are code smells that indicate the design system is fighting itself.



Routine management action buttons ("Exercises", "Edit", "Delete") as bare ghost buttons in a row: this feels like a CRUD admin panel, not a consumer product.

Where it feels overdesigned:





Nothing significant. The app generally errs on the side of underdesign, which is preferable.

Where it feels underdesigned:





Charts and data visualization (Progress page)



Empty states across the board



Desktop viewport



Error states (generic toast messages)



The WorkoutActive footer with two equally-weighted buttons ("Add exercise" and "Finish workout") — these should have different visual weight since "Add exercise" is continuous and "Finish workout" is terminal.



6. Information Density Audit

Today page: Good density. The hierarchy flows naturally: greeting → action → weekly context → quick start → recent history. The one issue is that "Repeat last session" competes visually with "Start workout" — the secondary button is nearly as prominent as the primary.

WorkoutStart page: Sparse. Two option cards and an optional routine list. This is fine for its purpose — it's a brief interstitial. The subtitle "Choose how to begin." is unnecessary; the options are self-evident.

WorkoutActive page: This is where density becomes challenging. Each exercise block contains: exercise name, muscle group, set count, move up/down buttons, column labels, set rows with weight/reps/copy/delete/check buttons, and an add-set link. With 3-4 exercises and 3-4 sets each, this page becomes a wall of interactive elements. The fixed footer adds two more buttons. On a small phone, this is a lot of cognitive load.

History page: Well-balanced. Grouped by date, each card shows title, date, muscle tags, duration, and a chevron. The tags at the bottom add useful context without overwhelming. The filter chips at the top are appropriately minimal.

HistoryDetail page: The summary card with stats (duration, exercises, sets, volume) divided by thin vertical lines is a clean density pattern. The exercise blocks below are read-only and simpler than the active workout view, which is correct.

Progress page: This page oscillates between too much and too little:





PR cards are dense: exercise name, muscle group, up to 3 PR types with labels/values, a "NEW" badge, and a date. Multiple PR cards stacked create a wall.



The exercise trend section has pill selectors (up to 8 exercise names) that can wrap onto multiple lines, creating visual chaos.



The frequency bar chart is too small at 100px height — it's hard to read.



Empty states create large blank cards that waste vertical space.

Profile page: Too dense with too many interaction modes. The page juggles: avatar, editable name, email, member-since date, 3 stat cards, a settings section with unit toggle, a routines section with create/edit/delete/exercise management, and sign-out. This is a settings page, a routine builder, and a profile page all in one.



7. Visual Rhythm Audit

Spacing system adherence:
The spacing system is generally respected but with notable exceptions:





gap: 2px appears in several places ([Profile.css](src/routes/Profile.css) line 33, [HistoryDetail.css](src/routes/HistoryDetail.css) line 102, etc.) — this is finer than --space-1 (4px) and breaks the scale.



margin-top: 2px and padding: 2px appear in tags and badges — again off-scale.



The --space-5 (20px) value is used frequently for page padding but creates asymmetric relationships with --space-4 (16px) and --space-6 (24px).

Section spacing:
Pages use margin-bottom: var(--space-5) between sections, but there's inconsistency:





Today: --space-5 between week card and sections, --space-6 for header margin



History: --space-6 between groups



Progress: --space-6 for section top margin



Profile: --space-4 for stats, --space-5 for cards

This 4-5-6 dance is close enough to look intentional from 10 feet away but creates subtle rhythm breaks at close inspection.

Alignment:
Generally good horizontal alignment within the 640px content column. The page padding (--padding-page: 20px) is consistent. But the exercise block body has its own --space-5 padding that creates a subtle inset from the card edge, while the head has --space-5 horizontal padding too — these should match but the visual weight differs because the body has denser content.

Compositional quality:
The app feels assembled more than composed. Each component individually makes sense, but pages don't have the rhythmic breathing of a truly designed layout. The Today page comes closest — it has a clear visual hierarchy that flows. The Profile page feels most assembled — sections are stacked without compositional intent.



8. UX Friction Audit

Navigation friction (low):
The bottom nav is clear and conventional. Back navigation uses text links ("← History") which is functional but not as discoverable as a standard back arrow button. The WorkoutStart → WorkoutActive → Today flow is linear and makes sense. One friction point: there's no way to get to WorkoutStart from the bottom nav — you must go through Today first.

Comprehension friction (moderate):





The "copy previous set" button in ExerciseBlock uses a PlusIcon, which reads as "add" not "copy." This is a misaffordance.



The week strip on Today doesn't indicate what the dots mean until you observe the pattern. No legend, no tooltip.



"Repeat last session" on Today vs "Repeat workout" on HistoryDetail — slightly different labels for the same action.



The "Exercises" button on routine items in Profile opens a sheet to manage exercises — but "Exercises" as a label doesn't communicate "manage the exercises in this routine."

Data entry friction (moderate):





The set editing flow (tap → input → enter/blur) is fast once learned but has no onboarding. First-time users won't know they can tap the dash to edit.



No undo for completed sets or deleted sets.



Weight input accepts decimal but doesn't show a decimal keyboard on all devices (uses inputMode="decimal" which is correct, but the type="number" can conflict on some browsers).



There's no way to batch-edit sets or copy an entire exercise's sets from a previous workout.

Editing friction (moderate):





Profile name editing requires: tap name → type → tap "Save" OR press Enter. The separate "Save" and "Cancel" buttons add visual weight to what should be a seamless inline edit.



Routine name editing has the same pattern.



No way to reorder exercises in a routine (only in active workout).

State change friction (moderate):





Completing a set shows a green check animation (check-pop) which is good. But uncompleting a set is instant with no confirmation — easy to accidentally undo.



Finishing a workout shows a confirmation dialog but no summary of what was accomplished.



Deleting a workout from HistoryDetail shows a confirmation but doesn't mention the workout name.

Mobile friction (low-moderate):





Touch targets are correct (44px minimum).



The exercise block's move up/down buttons (↑↓) are small text arrows inside ghost buttons — hard to tap accurately during a workout.



On very small screens (320px width), the set row grid (28px 1fr 1fr 80px) may compress the weight/reps fields.



The quick-start routine chips are horizontally scrollable but there's no visual indicator of scrollability.



9. Interaction Latency / Speed Audit

What feels fast:





Page transitions with page-in animation provide immediate visual feedback.



React Query with 60s staleTime means returning to visited pages is instant from cache.



Bottom sheets animate in at 250ms — snappy and appropriate.



Set completion updates are presumably optimistic (via React Query mutations).

What may feel slow:





No optimistic creation for workouts. createWorkout.mutateAsync must resolve before navigation to /workout/active. The button shows no intermediate state between click and navigation.



The exercise search modal debounces at 250ms then waits for a network response. During typing, there's a "Searching..." text but no skeleton or progressive loading.



PR detection happens during handleFinish in WorkoutActive — detectAndInsertPRs runs before finishWorkout. If the PR detection takes time, the user waits at a dismissed confirmation dialog with no visible progress.



The "Loading..." text on HistoryDetail and ProtectedRoute provides no visual structure — the content area is blank except for small text. This is the worst type of loading state for perceived performance.

Where optimistic UI should be applied:





Adding a set to an exercise (show immediately, reconcile on response)



Completing a set (already may be optimistic, but should verify)



Adding an exercise to a workout (show the block immediately)



Toggling units in Profile settings



10. Component & Design System Audit

Token system quality: Good
The [theme.css](src/styles/theme.css) file defines a comprehensive set of tokens covering colors (17), spacing (9 + 4 aliases), radius (6), typography (7), shadows (4), transitions (5), and sizing (3). This is a solid foundation.

Button system: Good but incomplete
Three button variants (btn-primary, btn-secondary, btn-ghost) cover the main cases. However:





There's no "danger" button variant — destructive actions in ConfirmDialog use inline style overrides: style={destructive ? { background: 'var(--color-danger)' } : undefined}.



There's no "icon-only" button variant, leading to inconsistent icon button implementations across components.



The login button duplicates btn-primary styles instead of using the class.

Card pattern: Inconsistent
Multiple card patterns exist across the app:





today-week-card, today-recent-card, today-empty-card (Today)



history-card, history-empty-card (History)



hd-summary, hd-block (HistoryDetail)



pg-pr-card, pg-chart-card, pg-empty-card (Progress)



profile-stat-card, profile-card (Profile)



workout-start-option (WorkoutStart)

All share the same base pattern: background: white; border-radius: var(--radius-card); box-shadow: var(--shadow-sm). But each page re-implements this independently. There's no shared .card base class.

List/row pattern: Duplicated
Similar list items appear in:





today-list-item (Today recent list)



esm-item (ExerciseSearchModal)



history-card (History — cards, not rows)



hd-set (HistoryDetail set rows)



set-row (ExerciseBlock active set rows)



profile-routine-item (Profile routine list)

Each has subtly different padding, border, and alignment. A shared list-item component would reduce CSS by ~30%.

Chip/tag pattern: Duplicated





today-routine-chip (Today)



history-chip / pg-pill (History filters / Progress exercise pills) — nearly identical but separate implementations



history-tag / hd-muscle-tag / pg-pr-badge — tag variants with different styling

What should become standardized components:





Card — a base .card class used everywhere



ListItem — a shared row component for all list-like patterns



Chip/Pill — a single filter chip component



Tag/Badge — a small label component



DangerButton — a dedicated destructive button variant



IconButton — a consistent icon-only button



EmptyState — a shared empty state component with optional illustration



11. Mobile-First Audit

Touch targets: Compliant. The 44px minimum is consistently applied via --touch-min. Navigation links have correct sizing. Set row elements meet the threshold.

Safe areas: Handled. Both the nav bar and WorkoutActive footer account for env(safe-area-inset-bottom).

Scroll behavior: No explicit scroll management. Pages don't scroll-to-top on navigation (React Router default). Long exercise lists on WorkoutActive will have the fixed footer potentially obscuring the last exercise block — the padding-bottom: 120px on .workout-active attempts to compensate but may not be enough with many exercises.

Density on small screens: The set row grid 28px 1fr 1fr 80px allocates 80px to the action column (copy + delete + check). On a 320px screen with 40px of page padding, that leaves 320 - 40 - 28 - 80 - 16(gaps) = 156px for two value columns, or 78px each. The 36px-height input/value buttons at 78px width will show roughly 4-5 characters — sufficient for weights up to 999.

Thumb zone optimization: The bottom nav is in the natural thumb zone. The WorkoutActive footer buttons are also at the bottom. However, the exercise block headers (for expand/collapse) are at the top of each card, requiring upward thumb reach on long lists. The move up/down arrows are in the top-right corner of each exercise — the hardest spot to reach.

Orientation: No landscape-specific handling. Landscape mode on a phone will show very little content above the fold due to the fixed nav and footer eating vertical space on WorkoutActive.



12. High-Impact Improvements

1. Add exit animations to sheets and modals





Issue: All sheets, modals, and the exercise search modal appear with animation but disappear instantly.



Why it matters: Exit animations are 50% of perceived interaction quality. Their absence makes every dismissal feel janky.



Fix: Add CSS exit animations (fade-out + slide-down for sheets, fade-out for backdrops). Use a small delay before removing the element from DOM, or use the animationend event. Consider the Web Animations API or simply toggle a .closing class.



Impact: High — this is the single change most likely to make the app feel "premium."

2. Refactor Profile into sub-screens or sections





Issue: Profile.tsx manages 12 state variables and 4 distinct concerns, with inline styles in the exercise picker.



Why it matters: The page feels cluttered, is hard to maintain, and the inline-styled sheet is inconsistent with the rest of the app.



Fix: Extract routine management into a dedicated route or sheet flow. Move the exercise picker to use ExerciseSearchModal or a dedicated CSS-classed component. Consider a settings-style grouped list layout instead of cards.



Impact: High — simplifies the most complex screen and improves consistency.

3. Create a shared Card component and base class





Issue: The same background/radius/shadow pattern is reimplemented 10+ times across the app.



Why it matters: Inconsistency in padding, shadow, and radius across card instances. Any future surface change requires editing every file.



Fix: Create a .card base class in theme.css or a Card component. All existing card classes extend from this base.



Impact: Medium-high — improves consistency and reduces CSS duplication.

4. Redesign empty states with illustrations and CTAs





Issue: All empty states are gray text in a white box. No visual personality.



Why it matters: Empty states are the first thing new users see. They set the emotional tone.



Fix: Add simple SVG illustrations (a dumbbell, a chart growing, etc.), a motivational message, and a direct CTA button. Example: "Ready for your first workout?" with a "Start now" button.



Impact: High — dramatically improves new-user experience and perceived quality.

5. Unify the chip/pill/filter component





Issue: history-chip, pg-pill, and today-routine-chip are three separate implementations of the same UI pattern.



Why it matters: Visual inconsistency between pages. Maintenance burden.



Fix: Create a single Chip component with variants (selectable, action) and consistent sizing/styling.



Impact: Medium — improves system coherence.

6. Fix chart styling and make it intentional





Issue: Recharts uses hardcoded colors, default tooltips, and minimal customization. Bar chart opacity is 0.7, dots are always visible, frequency chart is too short.



Why it matters: Charts are the centerpiece of the Progress page. Generic charts make the whole page feel template-driven.



Fix: Use CSS variables for all chart colors. Hide dots except on hover. Increase frequency chart height to 140-160px. Style tooltips to match the app's visual language. Remove grid lines. Consider a subtle gradient fill under the line chart.



Impact: Medium-high — Progress page goes from "developer demo" to "designed."

7. Add desktop layout awareness





Issue: The app is a narrow column on desktop with no adaptation.



Why it matters: As a PWA that can install on desktop, this is a significant gap.



Fix: At minimum, add a subtle sidebar or card-like container for the content column on wide screens. Consider a max-width container with a soft shadow or border to frame the content. For more ambitious: a sidebar nav on desktop replacing the bottom bar.



Impact: Medium — dramatically improves desktop impression.

8. Add a btn-danger variant and remove inline style overrides





Issue: Destructive actions use inline style={{ background: 'var(--color-danger)' }} and !important overrides for danger coloring.



Why it matters: These are hacks that indicate the design system has gaps. !important is always a smell.



Fix: Add btn-danger to theme.css alongside btn-primary. Remove all !important usage and inline style overrides.



Impact: Medium — improves system integrity.

9. Improve the WorkoutActive footer hierarchy





Issue: "Add exercise" (secondary) and "Finish workout" (primary) share equal flex space and nearly equal visual weight.



Why it matters: "Add exercise" is an ongoing action; "Finish workout" is terminal. They should have clearly different visual weights. Currently, the accidental tap on "Finish" (which triggers a confirmation dialog, mitigating but not eliminating the issue) is too easy.



Fix: Make "Add exercise" a ghost or text button, or reduce its visual prominence. "Finish workout" should remain the sole primary button. Alternatively, move "Add exercise" inline (e.g., a floating action button or at the bottom of the exercise list).



Impact: Medium — reduces workflow friction during the most-used screen.

10. Fix the CSS defects





Issue: Dead CSS class (.today-time-actions), broken selector (.h focus-block-info), hardcoded color in WorkoutActive footer, and login button duplicating btn-primary styles.



Why it matters: These are small issues individually but they accumulate into a codebase that doesn't feel maintained at a premium level.



Fix: Remove dead CSS, fix the typo, use CSS variables for all colors, apply btn-primary class to the login button.



Impact: Low individually, medium cumulatively — code hygiene affects maintainability and signals quality.



13. What To Remove





"Choose how to begin." subtitle on WorkoutStart — the options are self-evident. This is a "tell, don't show" anti-pattern.



The --space-micro and --space-component and --space-section aliases in theme.css — these are labeled "legacy aliases" and should be removed if they're not adding semantic value. They're just pointers to scale values.



The .today-time-actions dead CSS class in Today.css.



The PR card left-border accent (border-left: 3px solid var(--color-pr)) — replace with a subtler indicator (background tint, dot, or just the "NEW" badge alone).



Move up/down buttons on exercise blocks — on mobile, these are hard to tap and rarely used. Consider a long-press drag-to-reorder pattern instead, or move reordering to a dedicated edit mode.



The "Cancel" button text on the sheet close button — for sheets that are opened by direct user action, a simple "×" icon or drag-to-dismiss is sufficient. "Cancel" implies abandoning an in-progress action, which isn't always the case.



Routine management from the Profile page — this is complex enough to warrant its own route (e.g., /routines or /profile/routines).



The !important declarations in Profile CSS (3 instances) — fix the specificity properly.



14. Premium Polish Recommendations

Spacing:





Audit all 2px and gap: 2px values and decide if they should be --space-1 (4px) or if 2px is intentional (in which case, add a --space-half token at 2px).



Standardize section margins across all pages to use --space-6 consistently.



The 0.5px borders are good — keep them. They read as clean hairlines on retina screens.

Typography:





The Progress page section titles use --font-card (16px) while semantic section-title class uses --font-section (20px). Use the semantic class consistently, or create a smaller section-title variant.



Add a --font-weight-bold: 700 and --font-weight-semibold: 600 and --font-weight-medium: 500 token set. Currently weights are hardcoded per-rule.

Motion:





Exit animations for all sheets, modals, and toasts (most critical recommendation).



Page transitions should coordinate with route changes — consider crossfade between pages rather than each page individually animating in.



The check-pop animation on set completion is delightful. Add similarly subtle animations for: adding a set (slide-in), removing a set (slide-out), and completing a workout (confetti or checkmark).



Toast exit should slide up and fade out, not just disappear.

Surfaces:





Consider adding a very subtle paper-like texture or grain to the background to differentiate from generic flat white. Even 1% noise at low opacity can add perceived depth.



Cards could have a very subtle border (0.5px var(--color-border)) in addition to the shadow, for a cleaner edge.

States:





Add a proper loading skeleton for the Today page initial load.



Add a proper loading skeleton for HistoryDetail.



When a set is saved (value updated), provide brief visual confirmation (subtle flash or highlight).



When a workout is being created (from Today page buttons), show a loading state on the button (spinner or text change).

Copy:





Empty states should be encouraging: "Let's get started" > "Your history will appear here."



The word "workout" is used everywhere — consider "session" or "training" occasionally for variety.



"Send magic link" on Login is clear and modern. Good.

Charts:





Line chart: hide dots, show only on hover. Add a subtle area fill with gradient (accent color at 5-10% opacity).



Bar chart: increase height, use solid accent color (not 0.7 opacity), add subtle rounded corners on bars (already have radius: [4,4,0,0]).



Add a custom tooltip component styled to match the app's visual language.



Remove all hardcoded color strings and use CSS variable references.

Transitions:





Input focus transitions should be smoother — currently border-color jumps to accent with duration-fast (150ms). Consider 200ms with an ease-out.



Page-in animations could be slightly more subtle (4px translateY instead of 8px).

Empty states:





Create 3-4 simple SVG illustrations that match the warm tone of the app.



Each empty state should have: illustration + message + optional CTA button.



These should feel warm and encouraging, not clinical.

Visual restraint:





Replace the uppercase/letter-spacing section labels ("THIS WEEK", "RECENT") with sentence-case labels at --font-meta size. The uppercase treatment adds visual noise and reads as "categories in an admin panel."



Or: keep uppercase but use a lighter weight (400) and more subtle color.



15. Priority Roadmap

Immediate Fixes (1-2 days)





Fix CSS typo .h focus-block-info → .hd-block-info in HistoryDetail.css



Remove dead .today-time-actions class from Today.css



Replace hardcoded rgba(248, 248, 246, 0.85) in WorkoutActive footer with a CSS variable



Replace hardcoded chart colors ('#A8A29E') with CSS variable references



Add btn-danger variant to theme.css; remove all !important and inline style overrides



Apply btn-primary class to the login button; remove duplicated styles



Extract inline styles from ConfirmDialog into CSS classes



Fix section title inconsistency on Progress page (use section-title class or --font-section)

Next-Level Refinements (1-2 weeks)





Add exit animations to Sheet, ExerciseSearchModal, ConfirmDialog, and Toast



Create shared Card base class/component



Create shared Chip/Pill component (unify filter chips and routine chips)



Redesign empty states with illustrations and CTAs



Restyle charts with custom tooltips, hidden dots, area fills, proper colors



Improve loading states (skeleton for Today, HistoryDetail)



Extract Profile page exercise picker into CSS-styled component (remove all inline styles)



Add visual save confirmation for set editing (subtle highlight flash)



Differentiate WorkoutActive footer button hierarchy



Replace PlusIcon on "copy previous set" with an appropriate copy/duplicate icon

Final Polish Pass (1 week)





Add desktop layout awareness (container framing, optional sidebar nav at wide breakpoints)



Split Profile page routine management into dedicated sub-route



Add page transition coordination (crossfade between routes)



Add subtle animations: set addition/removal, workout completion



Audit all spacing values; formalize the 2px micro-spacing decision



Add scroll-to-top behavior on route changes



Add --font-weight-* tokens and apply consistently



Consider dark mode token set (all colors are already CSS variables, so this is mechanical)



Replace move up/down arrows with a drag handle or long-press reorder



Test on 320px viewport and verify all grid layouts compress gracefully

