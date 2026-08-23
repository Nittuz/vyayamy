# Repo Doc Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every superfluous, stale, or superseded file accumulated across the multi-model build sessions — following the repo's existing archive convention (frozen docs removed from the tree, retrievable from git history) — leaving only living documents.

**Architecture:** Three commits: (1) binary/tooling junk (committed DB backup, audit screenshots, Cursor rules), (2) spec archival per the docs/specs/README.md convention with every living-doc reference updated to a history note, (3) untracked build junk. No source code changes; gates + CI verify nothing broke.

**Tech Stack:** git, Prettier (all edited .md must pass `format:check`).

## Global Constraints

- Owner decisions (2026-08-22): Cursor rules DELETE (not using Cursor); DB backup AND audit screenshots DELETE from tree (history retention accepted — repo is private); spec archival = EVERYTHING implemented (keep only the roadmap spec + README + TEMPLATE in docs/specs/).
- Follow the existing archive precedent exactly: docs/specs/README.md already says removed specs are "retrieve[d] from git history" — extend that section, do not invent a new convention.
- KEEP (explicitly out of scope, do not touch): docs/UX_POLISH_BACKLOG.md (live backlog), docs/specs/2026-08-09-entry-branding-refresh-and-roadmap.md (tracks deferred Batch 5 + unscoped Batch 6), both docs/superpowers/plans/\*.md (wrapup plan still drives blocked Tasks 6-7; this plan), .claude/skills/design-taste-frontend/SKILL.md (design constitution), all docs/adr/, all other living docs (README, ARCHITECTURE, AGENTS, overview, design-system, local-first-sync, operations, threat-model, TESTING), untracked .superpowers/ (session ledger), .expo/ (live Metro cache).
- Commit style: conventional commits (`chore:` for deletions, `docs:` for reference updates).
- Every edited markdown file must pass `npx prettier --check` on itself before commit.
- Pushing to main is authorized.

---

### Task 1: Delete binary and tooling junk

**Files:**

- Delete (tracked): `.claude/flexyug-local-backup-2026-07-12.db`, `.claude/audit-shots/` (8 PNGs), `.cursor/` (5 .mdc rule files)
- Modify: `AGENTS.md:117` (remove the Cursor-rules pointer line)

**Interfaces:**

- Produces: a tree with no committed binaries/IDE config; Task 2 builds on this commit.

- [ ] **Step 1: Verify nothing else references what's being deleted**

Run: `grep -rn "audit-shots\|flexyug-local-backup\|\.cursor/" $(git ls-files "*.md") | grep -v "superpowers/plans"`
Expected: exactly one hit — `AGENTS.md:117` (the Cursor pointer being removed in Step 3). Any other hit: stop and report BLOCKED.

- [ ] **Step 2: Delete**

```bash
git rm .claude/flexyug-local-backup-2026-07-12.db
git rm -r .claude/audit-shots
git rm -r .cursor
```

- [ ] **Step 3: Remove the AGENTS.md pointer**

Delete this line from AGENTS.md (~line 117): `- Cursor-specific rules (narrower, per-glob): [.cursor/rules/](.cursor/rules/)`
Read the surrounding list first; if neighboring lines form a two-item list that now reads oddly, smooth the remaining item's phrasing minimally.

- [ ] **Step 4: Verify + commit**

```bash
npx prettier --check AGENTS.md
git add AGENTS.md
git commit -m "chore: remove committed DB backup, audit screenshots, and Cursor rules

The July taste-audit screenshots and the 2026-07-12 SQLite backup are
retrievable from git history; Cursor is no longer used with this repo."
```

---

### Task 2: Archive all implemented specs + update references

**Files:**

- Delete: `docs/specs/2026-05-26-docs-uplevel-design.md`, `docs/specs/2026-06-10-deep-review-improvement-plan.md`, `docs/specs/2026-07-11-blacktop-overhaul-spec.md`, `docs/specs/2026-07-11-taste-audit.md`, `docs/specs/2026-07-19-set-entry-redesign-plan.md`, `docs/specs/2026-07-19-set-entry-redesign-spec.md`, `docs/specs/2026-08-09-pr-semantics-spec.md`, `docs/specs/2026-08-09-quick-log-spec.md`, `docs/specs/2026-08-09-session-capture-spec.md`, `docs/specs/2026-08-10-plan-reaches-today-spec.md`
- Modify: `docs/specs/README.md` (index rewrite), `README.md:85`, `ARCHITECTURE.md:366`, `ARCHITECTURE.md:412`, `docs/design-system.md:4`
- Keep untouched in docs/specs/: `2026-08-09-entry-branding-refresh-and-roadmap.md`, `README.md` (edited, not removed), `TEMPLATE.md`

**Interfaces:**

- Consumes: Task 1's commit.
- Produces: docs/specs/ holding exactly 3 files; zero dangling links repo-wide.

- [ ] **Step 1: Delete the ten specs**

```bash
git rm docs/specs/2026-05-26-docs-uplevel-design.md docs/specs/2026-06-10-deep-review-improvement-plan.md docs/specs/2026-07-11-blacktop-overhaul-spec.md docs/specs/2026-07-11-taste-audit.md docs/specs/2026-07-19-set-entry-redesign-plan.md docs/specs/2026-07-19-set-entry-redesign-spec.md docs/specs/2026-08-09-pr-semantics-spec.md docs/specs/2026-08-09-quick-log-spec.md docs/specs/2026-08-09-session-capture-spec.md docs/specs/2026-08-10-plan-reaches-today-spec.md
```

- [ ] **Step 2: Rewrite the docs/specs/README.md index**

Replace the `## Index` table with one live row (the roadmap spec: date 2026-08-09, title "Entry branding refresh + August review roadmap", status "partially implemented — Batch 5 deferred, Batch 6 unscoped"). Extend the existing `### Archived` paragraph to enumerate the newly removed specs (date + title + one-clause description each, matching the paragraph's existing prose style), keeping its "retrieve them from git history" instruction. All ten: docs-uplevel (05-26), deep-review improvement plan (06-10, 115 findings + phase plan), taste audit round 2 (07-11), Blacktop overhaul (07-11), set-entry redesign spec + plan (07-19), PR semantics (08-09), session capture (08-09), quick-log (08-09), plan-reaches-Today (08-10).

- [ ] **Step 3: Convert the four living-doc links to history notes**

Follow the precedent already in README.md:85 ("lives in git history as `docs/archive/REPO_REVIEW.md`"):

- `README.md:85` — deep-review sentence: "...The narrative synthesis, phase plan, and full findings appendix live in git history as `docs/specs/2026-06-10-deep-review-improvement-plan.md`." (drop the markdown link).
- `ARCHITECTURE.md:366` — "Record types (2026-08-09 spec, in git history as `docs/specs/2026-08-09-pr-semantics-spec.md`):"
- `ARCHITECTURE.md:412` — "(spec in git history: `docs/specs/2026-07-11-blacktop-overhaul-spec.md`)"
- `docs/design-system.md:4` — same treatment for the blacktop link.
  Adapt wording to each sentence's flow; the invariant is: no `[...](...)` link to a deleted file, path named in backticks, "git history" stated.

- [ ] **Step 4: Repo-wide dangling-link sweep**

Run: `for f in $(git ls-files "*.md"); do grep -oE '\]\((\.\./)*[A-Za-z0-9_./-]+\.md' "$f" | sed 's/^\](//' | while read -r l; do d=$(dirname "$f"); [ -f "$d/$l" ] || [ -f "$l" ] || echo "$f -> $l"; done; done | grep -v "superpowers/plans"`
Expected: no output. (The two plans under docs/superpowers/plans are historical execution records — excluded.) Fix any hit before committing.

- [ ] **Step 5: Verify + commit**

```bash
npx prettier --check docs/specs/README.md README.md ARCHITECTURE.md docs/design-system.md
git add -A
git commit -m "docs: archive all implemented specs to git history per specs README convention

docs/specs/ now holds the living roadmap spec, README, and TEMPLATE.
Living-doc references converted to git-history notes."
```

---

### Task 3: Untracked build junk + gates + push

**Files:**

- Delete (untracked, gitignored): `dist/` (5.3MB stale `expo export` from 2026-05-10)
- Leave: `.expo/` (live Metro cache — Metro is running), `.superpowers/` (session ledger)

**Interfaces:**

- Consumes: Tasks 1-2 commits.
- Produces: green CI on main.

- [ ] **Step 1: Remove stale export**

Run: `rm -rf dist`
(Gitignored; nothing to commit.)

- [ ] **Step 2: Full gates**

Run: `npm run typecheck && npm test && npm run lint && npm run format:check`
Expected: all green (deletions can't break code, but the gate run proves it; format:check also validates every edited md).

- [ ] **Step 3: Push + watch CI**

```bash
git push
gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: CI success.

---

## Explicitly out of scope

- Pruning resolved sections inside docs/UX_POLISH_BACKLOG.md (live document; separate editorial task if ever wanted).
- Purging the DB backup from git HISTORY (repo is private; revisit only if it's ever opened up).
- .claude/skills/design-taste-frontend/SKILL.md (design constitution — stays).
- The wrapup plan (drives blocked Tasks 6-7) and this plan.
