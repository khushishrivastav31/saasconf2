# MAIN-13407: Tasks

## 0 — Design review (this step — STOP here)

- [x] Write `proposal.md`, `design.md`, `tasks.md`.
- [x] Build three standalone HTML mockups in `mockups/`.
- [x] Brandon showed Uwe the mockups; **Uwe chose Proposal A** (2026-06-24).
- [x] Record the decision in `proposal.md` / `design.md`; delete the B and C mockups.
- [x] Capture the "many papers, few reviewers" approach in `design.md`
      (auto-assign first, drag for fine-tuning).
- [ ] **Approve the spec (incl. the scale approach) before any RED/GREEN.**

## 1 — RED (frontend tests first) — after approval

- [ ] `CFPAssignments/__tests__/` — card renders `session_type_name` + duration when
      present; omits the badge when null.
- [ ] Card renders each co-speaker **name** for `pending`, `accepted`, and
      `declined` invitation statuses (declined still shown).
- [ ] Card renders `main_speaker.country` and each `cospeakers[].applicant.country`.
- [ ] `canAssignMemberToPaper` returns a typed reason
      (`is_speaker` / `is_cospeaker` / `already_assigned` / `excluded_topic`);
      tooltip shows the matching message on an invalid target.
- [ ] Confirm these fail against the current UI for the right reason.

## 2 — GREEN (implementation) — Proposal A

- [ ] Implement the enriched card in `CFPAssignments/index.tsx` (+ extracted
      `PaperAssignmentCard`).
- [ ] Render session type, speaker name + country, co-speaker names + country +
      invitation status on the card.
- [ ] Make the program-committee panel sticky / independently scrollable.
- [ ] Extend `canAssignMemberToPaper` to return the reason; show it as an
      accessible tooltip on invalid drop targets.
- [ ] Keep drag-and-drop behaviour intact.

## 2b — Massive assign + scale (see design.md "Handling scale" / "Massive assignment")

- [ ] **Fixed reviewer rail** — pin the committee column (own scroll); show each
      reviewer's current **assignment count** (plain number, as today — no target/
      average figure).
- [ ] **Filters** — by session type, topic, and status (all / needs / complete);
      show the filtered count. Default to "needs reviewers" when the list is large.
- [ ] **Arm a reviewer by clicking the card** (decided); disambiguate click-to-arm
      from drag-start. Armed state visually distinct; green/amber stripe previews
      assign-vs-skip on each filtered card.
- [ ] **"Assign <reviewer> to all N filtered"** → **confirm dialog first**
      (decided): "assign X · skip Y (reasons)"; nothing written until confirmed.
- [ ] **Bulk backend** — add `POST /cfp/paper-assignments/bulk` (reviewer +
      paper_ids → `{ assigned, skipped:[{paper_id, reason}] }`) reusing the existing
      conflict/duplicate checks; RED test it. (If client fan-out is chosen instead,
      skip this and the gen:api step.)
- [ ] Surface existing **auto-assign** in the toolbar; keep created/skipped summary.
- [ ] Virtualize/window the card list above ~50 papers (perf-first); verify the
      fixed rail + 15s auto-refetch don't fight the virtual scroller. May follow-up.

## 3 — REFACTOR / sweep

- [ ] `React.memo` the list-rendered card; no inline object/array creation in the
      render path.
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Dark-mode variants + `min-h-[44px]` on interactive elements verified.

## 4 — OpenAPI

- [ ] If the `POST /cfp/paper-assignments/bulk` endpoint is added: run
      `cd frontend && JWT_SECRET_KEY=… SUPER_ADMIN_PASSWORD=… pnpm gen:api` and
      commit `api.generated.ts`; verify `pnpm gen:api:check` prints nothing.
- [ ] If client fan-out is used instead (no new endpoint): no schema change;
      confirm `pnpm gen:api:check` is clean.

## 5 — Handbook + ship

- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx` for the new card
      info (session type, co-speakers, countries, reason tooltip).
- [ ] Move `openspec/changes/main-13407-paper-assignment-reviewer-updates/` →
      `openspec/shipped/` in the implementation PR.
