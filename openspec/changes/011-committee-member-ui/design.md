# Design — Committee Member Add + Topic Assignment UI

## Navigation fix

### `ConferenceDetail/index.tsx` and sidebar sections

The CFP sub-navigation items (from `conferenceSections.ts` or inline in the
tab render) should have an entry labelled **"Program Committee"** pointing to
the `CFPProgramCommittee` component. Verify this entry:
- Exists in the CFP sub-section list
- Uses the label "Program Committee" (not just "Committee")
- Is visible to users with `cfp_admin` or `cfp_reviewer` roles
- Appears in the correct order relative to CFP Applicants and CFP Papers

If the entry is missing or poorly labelled, add/rename it.

---

## Committee member add modal

### `CFPProgramCommittee` component

Check if an "Add member" / "Invite member" button exists. Expected behaviour:
- Button opens a modal with an email input + role selector
- Submits to `POST /conferences/{id}/committee/members` (or equivalent)
- On success: member appears in the list, invite email sent

If the button exists but is hard to find: increase visual prominence
(primary button style, not a ghost/text link).

If the button is absent: implement it following the pattern in other list
tabs (e.g. `SponsorsTab` add flow).

---

## Topic assignment

After reviewing `CFPProgramCommittee`:
- If a topic assignment column or inline select already exists, document it
  and ensure it is visible in the member row.
- If absent: add an inline topic multi-select for each committee member row.
  Fetch topics from `GET /conferences/{id}/cfp/topics` and render as a
  chip-based multi-select.

Backend endpoint needed (if missing):
`PATCH /conferences/{id}/committee/members/{member_id}/topics`
Body: `{ topic_ids: string[] }`

---

## Test Impact

| File | Change |
|------|--------|
| `CFPProgramCommittee.test.tsx` (new or extend) | "Program Committee" navigation item is rendered |
| Same | "Add member" button is visible and prominent |
| Same | Topic multi-select appears in each member row |
| Backend: `tests/cfp/test_committee_members.py` | POST creates member, PATCH assigns topics |
