# Change 033 — Gate co-speakers + actions behind an open CFP on the paper submission form

## Status
`planned` · Branch: `feat/submit-paper-cfp-gated-ux`

## Methodology
TDD — Red → Green → Refactor.

## Problem

On the CFP applicant portal **Submit New Paper** page (`SubmitPaperPage` →
`/portal/papers/new`), the form presents too much, too early:

1. **Co-speakers shown up front.** The *Co-speakers (max 3)* section renders
   immediately — before a conference is even selected, and even when the chosen
   conference has **no open CFP**. Adding co-speakers makes no sense until the
   speaker has committed to a conference whose CFP is actually open.
2. **A submit button that shouldn't be there.** The blue **Save as Draft**
   button (and the Cancel button) render unconditionally. When the selected
   conference shows *"No open CFPs for this conference."*, there is nothing to
   submit — yet a prominent blue button invites the user to act. The label
   *"Save as Draft"* also misrepresents the flow: pressing it creates the paper
   and moves the speaker on to the paper detail / edit screen.

See the screenshot in the task: a closed-CFP conference still shows the
*Co-speakers* section and a *Save as Draft* button.

## Proposed Change

Gate the bottom of the form on there being a selectable (open) CFP, and rename
the primary action. All changes are confined to the frontend portal page.

1. **Show *Co-speakers* only once a CFP is selected.** Wrap the co-speakers
   section in the same `selectedCfpId` guard already used for the dynamic form
   fields, so it appears only after the user picks a conference whose CFP is
   open (auto-selected). Before a conference is chosen, or when the conference
   has no open CFP, the section is hidden.

2. **Show actions only once a CFP is selected.** Wrap the action row (Cancel +
   primary button) in the same `selectedCfpId` guard. When the CFP is closed
   (no open CFP, and the user is not an out-of-timeframe submitter), **no
   buttons appear at all**.

3. **Rename the primary button to *Next step*.** Replace the idle label
   *"Save as Draft"* with *"Next step"* (pending label unchanged). Behaviour is
   unchanged — it still creates the paper and navigates to the paper detail
   page, which is literally the next step.

Because the button is now only reachable when a CFP is selected, the
`!selectedCfpId` branch of `handleSubmit`'s "Please select a CFP and provide a
title" guard becomes unreachable via the UI; the title-empty guard still
applies.

## Out of Scope

- Backend, schema, or API changes — none. No OpenAPI regen, no migration.
- The co-speaker invite mechanism (first name + email, auto-provision,
  invitation email) shipped in Change 032 — unchanged.
- The `PaperEditForm` edit screen — co-speakers there are edited after a paper
  already exists, so the gating does not apply.
- The out-of-timeframe submission exception — preserved as-is via the existing
  `availableCfps` / `allow_out_of_timeframe` logic (such users keep seeing the
  form and buttons even when the CFP is closed).

## Affected Code

- `frontend/src/pages/portal/SubmitPaperPage.tsx` — wrap the co-speakers section
  and the actions row in `{selectedCfpId && …}`; rename the button label.
- `frontend/src/pages/portal/__tests__/SubmitPaperPage.test.tsx` — co-speaker
  and action assertions now require a conference/CFP to be selected first;
  button name updated to *Next step*; add coverage that the section and buttons
  are hidden before a CFP is selected and when the CFP is closed.

## Spec

See `openspec/specs/` once implementation lands.
