# QA — Settings Save Toast Feedback

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| Conferences Member | `conf.member@bjvsoft.com` | `Test1234!` | Pre-seeded; or: Conferences Admin → My Company → Members → Invite → "Conferences Member" role |

---

## Pre-conditions

- At least one conference exists.
- Log in as **Conferences Admin** for all write operations.

---

## Scenario A — Social links save toast

**Role:** Conferences Admin

1. Open a conference → navigate to the **Social** tab.
2. Add or update a social media link (e.g. paste a Twitter/X URL).
3. Click **Save**.
4. **Expected:** A green success toast appears in the top-right corner:
   _"Social links saved"_ (or similar).
5. Introduce a network error (e.g. DevTools → Network → set to Offline) and try to save again.
6. **Expected:** A red error toast appears with an error message.

**PASS:** Toast appears on success and on failure.
**FAIL:** No visual feedback after saving — user cannot tell if save worked.

---

## Scenario B — Deadlines save/create/delete toasts

**Role:** Conferences Admin

1. Open a conference → navigate to the **Deadlines** tab.
2. **Create a deadline:** fill in name and date → click Add/Create.
3. **Expected:** Green toast _"Deadline created"_.
4. **Edit the deadline:** change the date → save.
5. **Expected:** Green toast _"Deadline updated"_.
6. **Delete the deadline:** click delete/trash icon → confirm.
7. **Expected:** Green toast _"Deadline deleted"_.
8. Simulate an error (disconnect network) and attempt a create.
9. **Expected:** Red error toast.

**PASS:** Toast shown for each mutation (create, update, delete).
**FAIL:** No toast on any or all of these actions.

---

## Scenario C — Deadline form field CSS consistency

**Role:** Conferences Admin

1. Open a conference → Deadlines tab.
2. Visually compare the deadline form fields (inputs, labels) with another settings form — e.g. open the **Locations** tab in a second tab for comparison.
3. **Expected:** Font size, padding, border style, and label appearance are consistent across both forms.

**PASS:** Visually consistent.
**FAIL:** Deadline inputs look noticeably different (wrong padding, larger/smaller text, missing border radius).

---

## Scenario D — Locations save/create/delete toasts

**Role:** Conferences Admin

1. Open a conference → navigate to the **Locations** tab.
2. **Create a venue:** fill in name → click Add.
3. **Expected:** Green toast _"Location created"_.
4. **Edit the venue name:** update it → save.
5. **Expected:** Green toast _"Location updated"_.
6. **Delete the venue:** click delete → confirm.
7. **Expected:** Green toast _"Location deleted"_.

**PASS:** Toast shown for each mutation.
**FAIL:** No toast on any of these actions.

---

## Scenario E — Member can view but cannot save

**Role:** Conferences Member (`conf.member@bjvsoft.com`)

1. Open a conference → Deadlines tab.
2. **Expected:** Save/add/delete controls are disabled or hidden (read-only for members).
3. No toasts should appear since no mutations are possible.

**PASS:** Read-only for member role.
**FAIL:** Member can trigger mutations.
