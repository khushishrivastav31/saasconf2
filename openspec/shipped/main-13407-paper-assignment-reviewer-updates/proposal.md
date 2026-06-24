# MAIN-13407: Update Paper Assignment for reviewers

## Context

Admins assign papers to program-committee reviewers on the admin screen
`frontend/src/pages/modules/cfp/CFPAssignments/index.tsx` — a two-panel
drag-and-drop view (program committee members on the left, papers on the right).
Everything in this change is **admin-only** and lives on that screen; there are
**no reviewer-portal changes**.

Brandon showed Uwe three layout proposals (standalone HTML mockups). **Uwe chose
Proposal A — "Enriched card, sticky sidebar"** (2026-06-24); B and C were dropped
and their mockups deleted. `mockups/proposal-a-enriched-card.html` is the surviving
prototype (throwaway, not app code). This proposal + `design.md` describe the
requirements and the chosen layout; `design.md` also covers how the screen handles
**many papers with few reviewers**. Implementation follows in a separate PR.

## Problem

The current paper card drops information reviewers/admins need to assign well, and
the assignment UX has friction:

1. **No session type on the card (Must).** `session_type_name` /
   `session_type_duration` are already in the papers response but are not rendered
   on the card — you must open the detail modal to see it.
2. **Co-speakers show only a count.** The card shows `+2 co-speakers`, not the
   names. We need the **co-speaker names visible on the card regardless of
   invitation status** (pending / accepted / declined all show).
3. **No country shown.** `main_speaker.country` and
   `cospeakers[].applicant.country` are in the response but not displayed. We need
   the **country for the speaker and each co-speaker**.
4. **Committee panel scrolls away.** When you scroll the papers list to reach a
   paper further down, the program-committee panel scrolls out of view, so you
   lose the drag source / drop targets. The committee panel must **stay visible
   while scrolling the papers list**.
5. **Assignment errors are easy to miss.** When a paper can't be assigned to a
   reviewer (conflict of interest = speaker/co-speaker, excluded-topic overlap, or
   already assigned) the failure surfaces only as a red highlight + a red banner at
   the top of the page. We need the **specific reason shown as a tooltip on hover**
   over the invalid drop target.

## Proposed Solution

Enrich the admin assignment screen — **frontend-only**:

- Render **session type** (name + duration) on each paper card.
- Render **co-speaker names** on the card, each with its **invitation status**
  (pending / accepted / declined), regardless of acceptance.
- Render **country** for the main speaker and for each co-speaker.
- Make the **program-committee panel sticky** so it stays in view while the papers
  list scrolls.
- Keep the existing **drag-and-drop** assignment interaction.
- On an invalid drop target, show a **tooltip with the specific reason** the paper
  can't be assigned to that reviewer (conflict of interest, excluded topic, already
  assigned), in addition to / replacing the existing red banner.

The final card layout / panel arrangement is chosen from one of the three mockups
in `mockups/` after Uwe's review.

## Scope

- **Mostly frontend** — `CFPAssignments/index.tsx` (enriched paper card, fixed
  committee rail, reason tooltip, filters by session type / topic / status, bulk
  "assign to all filtered" with a confirm dialog) and extracted subcomponents.
- **Display fields need no backend work.** All required fields
  (`session_type_name`, `session_type_duration`, `main_speaker.country`,
  `cospeakers[].applicant.country`, `cospeakers[].invitation_status`) are already in
  the `Paper` response (`backend/app/schemas/cfp_papers.py:200`,
  `frontend/src/types/cfp.ts:319`). No migration.
- **One backend addition (for bulk assign):** a `POST /cfp/paper-assignments/bulk`
  endpoint (reviewer + paper_ids → `{ assigned, skipped: [{paper_id, reason}] }`)
  reusing the existing conflict/duplicate checks. This **adds to the OpenAPI
  schema**, so `pnpm gen:api` must run and `api.generated.ts` be committed. If we
  instead fan out client-side over the existing single-assign endpoint, there is no
  schema change — decide at implementation time (single bulk endpoint preferred).
- Handbook (`frontend/src/pages/Handbook/handbookSections.tsx`) updated for the
  user-visible card changes at implementation time.

## Out of scope

- Reviewer-portal views (`AssignedPapersTab`, `My Papers`).
- The auto-assign algorithm and conflict rules themselves (unchanged — we only
  change how the existing conflict reason is surfaced).
- Any change to what counts as a conflict / excluded topic.

## Deliverable for this step

1. This OpenSpec folder (`proposal.md`, `design.md`, `tasks.md`).
2. The chosen HTML mockup `mockups/proposal-a-enriched-card.html` (B and C deleted).

**Review gate:** direction chosen (Proposal A). Stop before RED/GREEN until the
spec — including the "Handling scale" approach — is approved.
