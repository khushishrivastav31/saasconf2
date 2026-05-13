# Conference Module — QA Recommendations

## How to work through this list

1. **Fix one item at a time.** Don't batch fixes for unrelated issues — it makes it impossible to know which change introduced a regression.
2. **Write or update an automated test alongside every fix.** The existing test suite has gaps; if the scenario wasn't covered, add it now so the same bug can't quietly come back.
3. **After a fix, do not merge to `main` until the scenario below has been manually verified end-to-end.** CI passing is not enough — the test suite does not cover the full user journey.
4. **If the handbook doesn't describe how to set up the data needed to test a scenario, update it first.** Several items below are blocked because there are no clear instructions for creating the prerequisite records (speakers, applicants, committee members, etc.). Fixing the code without fixing the docs means the next tester will hit the same wall.

---

## Access control / permissions

### 0.5.1.2 — `Conferences Member` can edit conference data

**Issue:** A user invited as `Conferences Member` (read-only) can edit conference settings. The role restriction is not enforced.

**Recommended fix:** Audit every conference endpoint for a missing or incorrect permission check. The `require_module()` / `TenantAdminDep` guard needs a read-only variant that blocks `POST`, `PUT`, `PATCH`, `DELETE` for members.

**Manual test steps after fix:**
1. Create a tenant with Conferences enabled.
2. Invite `user-b` as `Conferences Member`.
3. Log in as `user-b`.
4. Open any conference → try editing the name, dates, or settings → save should be blocked (HTTP 403 or button hidden).
5. Confirm read views still work.

**Handbook update:** Add a role permissions table to the Team section showing exactly what each role can and cannot do.

---

### 0.5.1.3 — Disabled modules still appear in the left panel

**Issue:** A user with only the `Conferences` role can see the Training module entry in the sidebar even though they have no access to it.

**Recommended fix:** The sidebar should filter out module links based on both (a) what modules the tenant has enabled and (b) what roles the current user holds.

**Manual test steps after fix:**
1. Create a tenant with only Conferences enabled.
2. Invite `user-b` as `Conferences Member`.
3. Log in as `user-b` → Training module should not appear anywhere in the navigation.

**Handbook update:** None needed — this is a UI guard, not a documented flow.

---

### 0.5.1.5 — `Super User` toggle visible to tenant admins

**Issue:** When a tenant admin invites a new user, the `Super User` toggle is shown even though tenant admins should not be able to grant super-user access.

**Recommended fix:** Hide the `Super User` toggle on the invite form unless the currently logged-in user is a super admin.

**Manual test steps after fix:**
1. Log in as a tenant admin (not super admin).
2. Go to Team → Invite user.
3. The `Super User` toggle should not be present.

**Handbook update:** Clarify in the Team section who can assign the Super User role (super admins only).

---

### 0.5.1.6 — Invite form shows roles for all modules regardless of tenant config

**Issue:** Inviting a user on a tenant that only has Conferences enabled still shows Trainings and Accounting role options.

**Recommended fix:** When building the invite form, filter available module roles to only those modules the tenant has active.

**Manual test steps after fix:**
1. Create a tenant with only Conferences enabled.
2. Go to Team → Invite user.
3. Only `Conferences Admin` / `Conferences Member` options should appear. No Trainings or Accounting options.

**Handbook update:** None needed.

---

### 0.5.1.7 — `Conferences Member` can edit the Settings tab

**Issue:** The Settings tab is fully editable for users with the `Conferences Member` role. It should be read-only or inaccessible.

**Recommended fix:** Same root cause as 0.5.1.2 — the Settings endpoints are missing the role guard. Apply the same read-only enforcement there.

**Manual test steps after fix:**
1. Log in as `Conferences Member`.
2. Open a conference → Settings tab.
3. All fields should be read-only or the tab should be hidden entirely.

**Handbook update:** Add Settings tab access to the role permissions table (see 0.5.1.2).

---

### 0.5.1.8 — A user can modify their own roles

**Issue:** A user can change their own role assignment, which should never be allowed.

**Recommended fix:** Backend: add a guard that returns 403 if `current_user.id == target_user.id` on any role-update endpoint. Frontend: hide the edit action on the current user's own row in the team list.

**Manual test steps after fix:**
1. Log in as any non-super-admin user.
2. Go to Team → find your own row.
3. Edit/role-change action should not be available, or should return an error if attempted via API.

**Handbook update:** None needed.

---

## Event setup

### 1.1.1 — Conference dates off by one day on the portal

**Issue:** Dates set in the admin (e.g. Nov 20–23) appear one day earlier on the public portal (Nov 19–22). Suspected UTC/timezone offset in the frontend.

**Recommended fix:** Confirm whether dates are stored as `date` (no time) or `timestamp` (with time). If stored as `timestamp`, the frontend may be converting to local time and shifting the day. Use `date-only` parsing or store explicitly as `DATE` in Postgres.

**Manual test steps after fix:**
1. Set conference start: Nov 20, 2026 / end: Nov 23, 2026.
2. Open the public portal.
3. Dates shown must be Nov 20–23, no shift regardless of the browser timezone.

**Handbook update:** None needed.

---

### 1.3 / 1.4.1 / 1.5 / 1.6 — Missing save confirmation toast

**Issue:** Several tabs (Social Media, People & Roles, Deadlines, Locations) give no visual feedback after saving. The user has no way to know if the save succeeded or failed.

**Recommended fix:** Add a success/error toast notification after every save action in these sections, consistent with the Communication tab which already does this correctly (though the toast position there should move to top-right — see UX issues).

**Manual test steps after fix:**
1. Edit a social media link → save → toast appears confirming success.
2. Edit a user role → save → toast appears.
3. Create a deadline → save → toast appears.
4. Create a location → save → toast appears.
5. Trigger a validation error → error toast appears.

**Handbook update:** None needed.

---

### 1.4.2.4 — Registration portal returns "Something went wrong"

**Issue:** Enabling the public registration checkbox and navigating to `/{tenant}/register/{slug}` results in a generic error page. The backend logs only show SQL queries, not the exception, making this hard to debug.

**Recommended fix:**
1. First, improve error logging so the actual exception is surfaced (see also the logging recommendation below).
2. Investigate what the registration portal route expects — likely missing a required relation or config that isn't being validated before the page is served.
3. Add a preflight check: if required setup is missing (e.g. no booking options, no company data), show a specific message instead of crashing.

**Manual test steps after fix:**
1. Create a tenant, create a conference.
2. Go to Settings → Conference Setup → enable registration portal and set dates.
3. Click the portal link shown on the settings page.
4. The registration page should load without error and show the conference name and booking options.

**Handbook update:** Add a "Registration portal setup checklist" — what must be configured before enabling (booking options, company data, dates). This is a core user journey and the handbook should walk through it step by step.

---

### 1.4.2.6 — Registration question form missing "Question" label field and "Textarea" type

**Issue:** The custom registration question form has three fields visually but only two are labelled. "Textarea" is not available as an input type.

**Recommended fix:** Add the missing "Question" label field. Add "Textarea" as a selectable input type option alongside the existing ones.

**Manual test steps after fix:**
1. Go to Settings → Conference Setup → add a custom registration question.
2. All visible fields should have labels.
3. "Textarea" should appear in the input type dropdown.
4. Save the question, open the registration portal — the question should render as a multi-line text area.

**Handbook update:** Add a section on creating custom registration questions with screenshots of each field type.

---

### 1.4.3.1 — CFP field ID validation error is not user-friendly

**Issue:** The drag-and-drop paper form editor surfaces the raw error `String should match pattern '^[a-z][a-z0-9_]*$'` with no indication of which field is invalid or how to fix it.

**Recommended fix:** Replace the raw pattern message with: *"Field ID must start with a lowercase letter and contain only lowercase letters, numbers, or underscores (e.g. `abstract_text`)."* Highlight the offending field.

**Manual test steps after fix:**
1. In the CFP form editor, add a field with an invalid ID (e.g. starting with a number or containing a space).
2. The error message should be human-readable and the invalid field should be highlighted.

**Handbook update:** Add a note in the CFP setup section explaining field ID format requirements.

---

### 1.4.4.1 — Toast notification position

**Issue:** Save confirmation toasts appear bottom-right. The platform should use top-right consistently.

**Recommended fix:** Locate the toast provider configuration and change the default position to top-right globally.

**Manual test steps after fix:**
1. Save anything that triggers a toast (e.g. Communication settings).
2. Toast should appear top-right.

**Handbook update:** None needed.

---

### 1.4.4.1 — Email header/footer not included in invitation emails

**Issue:** The configured email header and footer do not appear in user invitation emails even when set.

**Recommended fix:** Check the invitation email template — it likely renders the body directly without wrapping it in the header/footer layout used by other system emails.

**Manual test steps after fix:**
1. Configure an email header and footer in Communication settings.
2. Invite a new user to the tenant.
3. Open the received email in MailHog → header and footer should be present.

**Handbook update:** None needed.

---

### 1.4.5 — ZUGFeRD/Factur-X throws an error on enable

**Issue:** Enabling e-invoicing fails silently. The backend logs only show SQL, not the exception.

**Recommended fix:**
1. Fix error logging first (see logging recommendation below).
2. Investigate what ZUGFeRD enable does — likely requires company data fields that aren't validated before the toggle is processed.
3. Surface missing prerequisites as a clear UI message.

**Manual test steps after fix:**
1. Fill in all company data (name, address, VAT).
2. Enable ZUGFeRD/Factur-X.
3. Should succeed, or show a specific message listing what is missing.

**Handbook update:** Add a prerequisites list for enabling e-invoicing.

---

### 1.4.5.6 — Badge design location unknown

**Issue:** The badge design feature exists but cannot be found in the UI.

**Recommended fix:** Add a clear navigation entry point — either as a sub-tab in Settings → Finance, or linked from the Attendees section. If it doesn't exist yet, note it as a missing feature.

**Manual test steps after fix:**
1. Navigate to the badge design section from a logical starting point.
2. Create a badge template for a role.
3. Export or preview the badge.

**Handbook update:** Add a "Badge Design" section describing where to find it and how to configure templates per role.

---

## CFP / portal login

### 2.1.4–2.1.8 and 5.2.1 — Portal login broken for self-registered users

**Issue:** Users who register themselves via the CFP or registration portal (`/{tenant}/portal/user/register`) cannot log back in. The "Invalid email or password" error is returned despite the credentials being correct. This blocks the entire CFP reviewer flow and all attendee registration flows.

**Recommended fix:** Investigate the portal authentication endpoint. Likely candidates:
- Password is being hashed differently on registration vs. login
- Email verification is required but the dev bypass is not working
- The portal login route is pointing at the wrong user table or tenant context

**Manual test steps after fix:**
1. Open `/{tenant}/portal/user/register?cfp={slug}` — register with email + password.
2. Immediately open `/{tenant}/portal/user/login?cfp={slug}` — log in with the same credentials.
3. Should land on the dashboard without error.
4. Repeat for `/{tenant}/portal/user/register` (without CFP param) for the registration flow.

**Handbook update:** Add a step-by-step guide for submitting a paper from a speaker's perspective — this is a primary user journey that has no documentation.

---

### 2.1.3 — Committee member assignment to topics not findable

**Issue:** The scenario "Add a committee member and assign topics" could not be completed because the UI for it wasn't found.

**Recommended fix:** Confirm the feature exists. If it does, add a discoverable entry point (e.g. a "Committee" tab or sub-section under CFP settings). If it doesn't exist yet, mark the checklist item as not implemented.

**Manual test steps after fix:**
1. Navigate to the CFP section.
2. Add a committee member.
3. Assign one or more topics to them.
4. Verify the assignment persists.

**Handbook update:** Add navigation steps for managing the program committee and assigning review topics.

---

### 2.2.5 — Public program portal URL not findable

**Issue:** After publishing the program, there is no visible link to the public-facing program page.

**Recommended fix:** Add a "View public portal" button or link in the Program section that appears after the program is published.

**Manual test steps after fix:**
1. Publish the program.
2. A visible link to the public portal should appear.
3. Open the link — the published program should be visible with sessions and speakers.

**Handbook update:** Document the public portal URL format and where to find it.

---

## People

### 3.1.2 — `MissingGreenlet` error when creating a program committee member

**Issue:** Creating a committee member throws `MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here.` This is a SQLAlchemy async violation — a sync ORM operation is being executed inside an async context.

**Recommended fix:** Find the committee creation endpoint and locate the sync ORM call (likely a lazy-loaded relationship or a missing `await`). Wrap it correctly or use `selectinload` / `asyncio.to_thread()` as appropriate.

**Manual test steps after fix:**
1. Navigate to the committee section.
2. Add a committee member by email.
3. No error should appear, and the member should show in the list.

**Handbook update:** None needed.

---

### 3.2.2 — Cannot edit speaker profile

**Issue:** The speaker profile edit form either doesn't submit or the endpoint doesn't save changes.

**Recommended fix:** Open the network tab on the edit save action. Check whether the request is sent and what response comes back. Fix either the missing submit or the failing endpoint.

**Manual test steps after fix:**
1. Open a speaker profile from the Speakers list.
2. Edit the bio or contact info.
3. Save — changes should persist on page reload.

**Handbook update:** Add speaker profile management to the People section of the handbook.

---

### 3.3.1 / 3.3.3 — CFP portal registration works but login fails; address not saved

**Issue:** 3.3.1 is the same root cause as 2.1.4 — fix portal login first. 3.3.3 is separate: user address fields submitted on the profile form are not persisted.

**Recommended fix for 3.3.3:** Check the user profile update endpoint — it may be missing the address fields in the request schema or the ORM model is not mapping them.

**Manual test steps after fix (3.3.3):**
1. Log in as a portal user (after 2.1.4 is fixed).
2. Edit address fields on the profile.
3. Save — reload the page — address should still be filled in.

**Handbook update:** None needed.

---

## Partnerships

### 4.1.2 — Unclear how to assign a sponsor to a tier

**Issue:** The sponsor creation/edit form does not make it clear how to assign a sponsor to a tier.

**Recommended fix:** Add a "Tier" dropdown to the sponsor creation/edit form. If tier assignment works from a different place, add a tooltip or inline help explaining the flow.

**Manual test steps after fix:**
1. Create a sponsor tier (e.g. Gold).
2. Create a sponsor — the tier should be selectable from the form.
3. The sponsor should appear under the correct tier in the list.

**Handbook update:** Add sponsor tier assignment steps to the Partnerships section.

---

### 4.1.4 — "Create a sponsor package" is in Settings, not Partnerships

**Issue:** The checklist scenario is listed under Partnerships but the feature lives in Settings → Conference Setup. This creates confusion during testing.

**Recommended fix:** Either add a shortcut link from the Sponsors section pointing to Settings → Conference Setup → Sponsor Packages, or restructure the settings navigation to expose it under Partnerships.

**Manual test steps after fix:**
1. Navigate from the Sponsors tab — there should be a discoverable path to create a sponsor package without manually going to Settings.

**Handbook update:** Clarify in the Sponsors section that packages are managed via Settings → Conference Setup, and link to that section.

---

### 4.1.5 — Sponsor invoice missing percentage discount; accounting email prerequisite not surfaced

**Issue:** The invoice generator does not have a percentage discount field. Attempting to send an invoice fails with "Set Accounting Email on My Company before sending invoices or credit notes" with no prior warning.

**Recommended fix:**
1. Add a percentage discount field to the invoice generator.
2. Check for missing accounting email before the user clicks "Send" — show a banner or inline warning on the invoice page if the prerequisite is not met, so the user knows what to do before trying to send.

**Manual test steps after fix:**
1. Go to Finance settings → ensure accounting email is not set.
2. Open an invoice — a warning should appear: "Accounting email not configured. Go to Settings to add it before sending."
3. Add the accounting email, return to the invoice, apply a percentage discount, send — invoice should be delivered.

**Handbook update:** Add a "Finance prerequisites" checklist to the Settings → Finance section: accounting email, bank account, company data.

---

## Communications

### 6.1.1 / 6.1.3 — Messages not delivered (MailHog)

**Issue:** Sending a message to a recipient list and bulk-sending via email template both show success in the UI but nothing arrives in MailHog.

**Recommended fix:** Check if the messaging service is correctly pointed at the local SMTP host (MailHog). Check if the recipient list actually contains valid, resolved email addresses at send time. Add server-side logging for the send attempt and any delivery error.

**Manual test steps after fix:**
1. Create a recipient list with at least one user who has a real email address.
2. Send a message to that list.
3. Open MailHog — the email should appear.
4. Repeat with a bulk send using an email template.

**Handbook update:** Add a dev environment note explaining how to verify email delivery via MailHog and the URL to access it.

---

### 6.2.1 — News article email renders raw HTML

**Issue:** The news notification email prints HTML tags literally (e.g. `<p>article 1</p>`) instead of rendering formatted content.

**Recommended fix:** The news email template is likely not setting `Content-Type: text/html` or the body is being escaped when it should be rendered. Fix the email template to pass the article content as raw HTML in an HTML-typed email part.

**Manual test steps after fix:**
1. Create a news article with formatted content.
2. Publish it (triggering an email notification).
3. Open the email in MailHog — content should be rendered, not raw HTML.

**Handbook update:** None needed.

---

### 6.2.2 — News article not visible on the public portal

**Issue:** Published news articles do not appear on the public portal.

**Recommended fix:** Verify the public portal news route exists and is connected to the news endpoint. If not implemented, mark as missing.

**Manual test steps after fix:**
1. Publish a news article.
2. Open the public portal and navigate to the news section.
3. The article should be visible with its title and content.

**Handbook update:** Add the URL/path for the public portal news section.

---

### 6.2.3 — Unpublishing an article has no confirmation

**Issue:** It is unclear whether unpublishing an article actually removes it from the public portal.

**Recommended fix:** Add a visual state indicator (e.g. "Draft" / "Published" badge) on the article list. After unpublishing, verify the article is removed from the public-facing view.

**Manual test steps after fix:**
1. Publish an article — confirm it appears on the portal.
2. Unpublish it — confirm it disappears from the portal.
3. The article list in admin should show its status as "Draft".

**Handbook update:** Document the publish/unpublish workflow and what each state means for the portal.

---

## Infrastructure / cross-cutting concerns

### Backend error logging is masking actual errors

**Issue:** Across multiple failures (registration portal, ZUGFeRD, program committee), the backend logs only show SQL queries and ROLLBACK. The actual Python exception is not logged, making debugging very difficult.

**Recommended fix:** Ensure the global exception handler logs the full traceback at `ERROR` level before returning the HTTP response. SQLAlchemy INFO logs are useful but should not be the only signal when something goes wrong.

**Manual test steps after fix:**
1. Trigger the registration portal error.
2. Check the backend logs — the Python exception and stack trace should be visible.

**Handbook update:** None needed.

---

### Handbook is missing step-by-step record creation guides

**Issue:** Several test scenarios could not be completed because there are no documented instructions for creating the prerequisite data (speakers, applicants, committee members, booking options, etc.). Testing was blocked not by bugs but by lack of documentation.

**Recommended fix:** For each primary entity in the conference module, add a "How to create your first X" walkthrough to the handbook. Priority order based on what blocked testing:
1. How to register and log in as a speaker/attendee on the portal
2. How to submit a paper via the CFP portal
3. How to create a registration flow end-to-end (booking option → register → invoice)
4. How to set up the program committee and assign reviewers
5. How to send a message to attendees

**Handbook update:** Yes — this is the main deliverable for this item.
