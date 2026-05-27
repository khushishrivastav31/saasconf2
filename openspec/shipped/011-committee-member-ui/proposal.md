# Change 011 — Committee Member Add + Topic Assignment UI

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 2.1.3: Adding a committee member and assigning topics is not findable in
the UI. The tester could not locate the feature at all.

From the codebase, `CFPProgramCommittee` exists as a lazy-loaded component
in `ConferenceDetail/index.tsx` (line 50–52) and is accessible via the CFP
section. However:
1. The navigation path to reach it is not obvious — there is no "Committee"
   sub-section clearly labelled in the CFP sidebar navigation or tab headers.
2. The `CommitteeRolesTab.tsx` exists in `tabs/settings/` but this appears
   to manage role definitions, not member assignment.
3. It is unclear whether "add a committee member" is done through the CFP
   portal applicant flow or through a dedicated committee management UI.
4. Topic assignment (assigning review topics/tracks to a committee member)
   may not be surfaced at all in the current admin UI.

## Proposed Change

1. **Navigation** — ensure the CFP section in the conference sidebar (and
   the CFP tab header) has a clearly labelled "Program Committee" sub-link
   that routes to `CFPProgramCommittee`. Current labelling may say "Committee"
   only — change to "Program Committee".

2. **Committee member add flow** — confirm (or implement) a clear "Add member"
   button in `CFPProgramCommittee` that opens an invite/add modal.

3. **Topic assignment** — verify that after adding a member, the UI shows
   a way to assign CFP topics/tracks to that member. If this feature is
   missing, add it as a follow-up sub-task.

## Out of Scope

- Committee role permissions (separate `CommitteeRolesTab`).
- The full CFP review/scoring workflow.

## Spec

See `openspec/specs/` (to be created alongside implementation).
