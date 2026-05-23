# QA — CFP Speaker Profile & Address Fields Save

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| CFP Speaker (portal) | `speaker-external@bjvsoft.net` | `Speaker1234!` | Pre-seeded; or: see "Create a speaker" below |
| Team member with address | any admin/member | `Test1234!` | Pre-seeded or invited |

### Create a new speaker for testing

#### Step 1 — Register

1. Open `http://localhost:3000/{tenant-slug}/portal/user/register` in a browser.
2. Fill in the registration form:
   - **First Name:** `Test`
   - **Last Name:** `Speaker`
   - **Email:** `newspeak@example.com` (use a fresh address each run)
   - **Password:** `Speaker1234!`
   - **Confirm Password:** `Speaker1234!`
3. Click **Register** / **Create account**.

#### Step 2 — Verify email

4. Open MailHog at `http://localhost:8025`.
5. Find the email addressed to `newspeak@example.com` with subject **Verify your email**.
6. Click the verification link inside the email. The browser opens the portal and shows a confirmation message.
   > **Tip (local dev):** If the stack is running in debug mode, email verification may be skipped automatically and the account is already active — proceed to Step 3.

#### Step 3 — Complete your profile (needed for Scenarios A & B)

7. Log in at `http://localhost:3000/{tenant-slug}/portal/user/login` with the credentials above.
8. Navigate to **Profile** (`/{tenant-slug}/portal/profile`).
9. Fill in at minimum:
   - **Bio:** `Initial bio — pre-test value`
   - **Company / Organization:** `ACME Corp`
   - **Website** (under Social Links): `https://example.com`
10. Click **Save profile**.
11. Verify a success toast appears.

#### Step 4 — Submit a paper (required for admin visibility)

12. Click **Submit a talk** or navigate to `/{tenant-slug}/portal/papers/new`.
13. Select the target **Conference** from the dropdown.
14. Fill in the required fields:
    - **Title:** `Test Talk — QA Submission`
    - **Short Abstract:** `This is a QA test submission.`
    - **Level:** `Beginner` (or any value)
15. Click **Submit paper** (not just Save draft — the admin view only shows submitted papers).

#### Step 5 — Confirm the speaker appears in admin

16. Log in as Conferences Admin (`admin@bjvsoft.net` / `Test1234!`) in a separate browser tab.
17. Open the conference → **CFP** → **Applicants**.
18. The new speaker (`Test Speaker`) should appear in the list with their submitted paper.

> **If the speaker is missing:** confirm the paper status is **Submitted** (not Draft) and that you are looking at the correct conference.

---

## Pre-conditions

- At least one CFP applicant/speaker exists in the conference.
- The conference has a CFP enabled.

---

## Scenario A — Admin edits a speaker's profile and changes persist (3.2.2)

**Role:** Conferences Admin

1. Open a conference → CFP → Applicants.
2. Click on a speaker to open their profile/detail panel.
3. Find the profile edit fields (bio, website, affiliation, or similar).
4. Note the current value of the **Bio** field.
5. Change the bio to: `Updated bio — QA test 2025`.
6. Click **Save**.
7. **Expected:** A success toast appears.
8. Reload the page (F5 or navigate away and back).
9. Reopen the same speaker's profile.
10. **Expected:** The bio field shows `Updated bio — QA test 2025`.

**PASS:** Change persists after reload.
**FAIL:** Field reverts to the old value after reload (current bug).

---

## Scenario B — Speaker can edit their own profile via the portal (related)

**Role:** Speaker (`speaker-external@bjvsoft.net`)

1. Log in to the CFP portal at `http://localhost:3000/{tenant-slug}/portal`.
2. Navigate to **Profile** or **My Account**.
3. Update the **bio** or **website** field.
4. Save.
5. **Expected:** Success confirmation.
6. Log out and log back in.
7. **Expected:** Updated values are still shown.

**PASS:** Portal profile save works end-to-end.
**FAIL:** Values not persisted.

---

## Scenario C — User address fields save correctly (3.3.3)

**Role:** Conferences Admin

1. Navigate to **My Company → Members**.
2. Click on any team member to open their detail/edit view.
3. Find address fields: Street, City, Postal Code, Country.
4. Fill in:
   - Street: `123 Test Street`
   - City: `London`
   - Postal Code: `W1A 1AA`
   - Country: `United Kingdom` (or `GB`)
5. Click **Save**.
6. **Expected:** Success toast.
7. Reload the page → reopen the same member.
8. **Expected:** All four address fields show the values you entered.

**PASS:** All address fields persist.
**FAIL:** Fields are blank or reverted after reload (current bug).

---

## Scenario D — Partial address save (only city changed)

**Role:** Conferences Admin

1. Open a team member who already has an address saved.
2. Change **only** the City field (leave all others unchanged).
3. Save.
4. Reload.
5. **Expected:** City updated; other fields unchanged.

**PASS:** Partial update works without overwriting other fields.
**FAIL:** Other address fields are cleared after saving only one.
