# MAIN-13444: Seed script for CFP paper review test data

## Status
`draft` · Branch: _to be created on approval_ (`chore/cfp-review-seed-script`)

## Methodology
No TDD in the usual sense — this is a dev-tooling script, not application
behavior. Verified by running the script and inspecting the resulting DB state,
plus a lightweight smoke test that the script runs without error.

## Problem

Ticket: "Create couple or more paper, and couple or evaluated, and having 3
reviewer (20 evaluated papers, with different session types), 5 of evaluated
papers should have the `must have in program`."

Read as: a script that seeds a conference's CFP with enough realistic data
(papers, reviewers, assignments, reviews) to manually test/demo the evaluated-
papers workflows (sort, detail views, must-have flag) — useful groundwork for
the review-UI tickets in this same batch (13443, 13440).

### Recon findings (2026-07-02)

- Closest existing script: `backend/scripts/seed_papers_from_csv.py` (352
  lines) — `get_or_create_applicant` (line 79), `main()` (line 136), creates
  session types by name (201-219), assigns `session_type_id` to papers
  (271-289). Good structural template.
- `backend/scripts/seed_conference_settings.py` (266 lines) and
  `backend/app/db/seed.py` (327 lines) are the other seed-script precedents in
  the repo.
- **No existing script seeds reviewers, assignments, or reviews** — nothing
  creates `CFPCommitteeMember` (reviewer), `CFPPaperAssignment`, or
  `PaperReview`/`ReviewAnswer` rows today.
- Relevant models: `CFPPaper` (`app/models/cfp_papers.py:99`), `PaperReview`
  (`app/models/review.py:180` — status, `total_score`, `speaker_feedback`,
  `internal_comment`, `must_have`), `ReviewAnswer` (`app/models/review.py:232`).
- Alternative seeding convention exists via Alembic migrations (e.g.
  `146_seed_trainings_module.py`, `082_seed_news_module.py`) — but a
  throwaway/dev-only fixture generator is a poor fit for a permanent migration;
  a standalone script (matching `seed_papers_from_csv.py`'s pattern) is the
  right shape here, not a migration.

## Proposed Change

1. New `backend/scripts/seed_cfp_review_data.py`, following
   `seed_papers_from_csv.py`'s structure (`get_or_create_*` helpers, a `main()`
   entrypoint taking a tenant/conference identifier as an argument).
2. Seed, for a given conference:
   - Multiple session types if not already present (reuse
     `seed_papers_from_csv.py`'s session-type creation, lines 201-219).
   - ~20+ papers spread across the session types, in `final_consideration`
     status (evaluated).
   - 3 `CFPCommitteeMember` reviewers.
   - `CFPPaperAssignment` rows assigning reviewers to papers (enough overlap
     that each paper has multiple reviews, matching real assignment patterns).
   - `PaperReview` + `ReviewAnswer` rows per assignment, with realistic score
     spread; exactly 5 papers get `must_have=True` on at least one review.
3. Script is idempotent (safe to re-run — check `get_or_create_*` pattern
   already used in `seed_papers_from_csv.py` prevents duplicate rows) and
   scoped to a single tenant/conference passed as a CLI argument, never
   touching other tenants' data (RLS-safe).
4. Document invocation in the script's own `--help` and in
   `.claude/docs/modules.md` if that's where CFP dev-tooling is documented.

## Out of Scope

- Building a generic "seed anything" framework — this is a purpose-built
  script for CFP review testing, matching the existing per-module seed script
  convention.
- Seeding production or staging data — dev/local only.

## Acceptance Criteria

- Running the script against a target conference creates ≥20 evaluated papers
  across multiple session types, 3 reviewers, and reviews such that exactly 5
  papers have at least one `must_have=True` review.
- Re-running the script against the same conference doesn't create duplicates
  (idempotent).
- Script only touches the specified tenant/conference (RLS/tenant-scoped).

## Spec

See `openspec/specs/` once implementation lands.
