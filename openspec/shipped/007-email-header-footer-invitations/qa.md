# QA — Email Header/Footer in Invitations + Template Editor Padding

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| New attendee (for invite) | any fresh email | — | Register via public portal OR send an invite — the email is caught in MailHog |

> **MailHog** is available at http://localhost:8025. All outgoing emails appear there in local dev.

---

## Pre-conditions

1. Log in as Conferences Admin.
2. Open a conference → **Settings → Email Settings** tab.
3. In the **Email Header** field, paste:
   ```html
   <div style="background:#1e40af;color:#fff;padding:12px;text-align:center;font-size:14px;">
     ACME Conference — Official Communication
   </div>
   ```
4. In the **Email Footer** field, paste:
   ```html
   <div style="color:#6b7280;font-size:12px;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:8px;">
     © 2025 ACME Conference. You received this because you registered.
   </div>
   ```
5. Click **Save header/footer** → confirm success toast.

---

## Scenario A — Verification email includes header/footer

**Trigger:** New attendee registers via the public portal.

**How to create an attendee:**
1. Open the conference's public registration portal URL (visible in conference settings or at `http://localhost:3000/{tenant-slug}/portal`).
2. Complete the registration form with a fresh email address (e.g. `test-attendee@example.com`).
3. Submit.

**Then:**
1. Open MailHog at http://localhost:8025.
2. Find the welcome/verification email sent to `test-attendee@example.com`.
3. Open the email → view HTML source or rendered preview.
4. **Expected:** The blue header banner _"ACME Conference — Official Communication"_ appears at the top of the email.
5. **Expected:** The grey footer line appears at the bottom.

**PASS:** Header and footer present in the email body.
**FAIL:** Email body contains only the default template content — no header or footer.

---

## Scenario B — Team invitation email includes header/footer

**Trigger:** Invite a new team member to the conference.

1. Log in as Conferences Admin → My Company → Members → Invite.
2. Enter a fresh email address → assign "Conferences Member" role → Send Invite.
3. Open MailHog → find the invitation email.
4. **Expected:** The blue header banner appears at the top.
5. **Expected:** The footer appears at the bottom.

**PASS:** Header and footer present.
**FAIL:** Missing from the invitation email.

---

## Scenario C — No header/footer when not configured

1. Open a **different conference** that has no header/footer saved (or clear the fields and save empty).
2. Trigger any email from that conference (e.g. send a test message).
3. **Expected:** Email body contains only the template content — no extra header or footer divs.

**PASS:** No header/footer injected for unconfigured conference.
**FAIL:** Header/footer from another conference bleeds in.

---

## Scenario D — Email template editor has left/right padding

**Role:** Conferences Admin

1. Open a conference → **Settings → Email Templates** tab.
2. Select any template to edit.
3. **Expected:** The rich-text editor area has visible left and right padding — the cursor/text does not start at the very edge of the editor box.
4. Compare with a standard `<textarea>` elsewhere in the app — padding should be similar.

**PASS:** Visible padding on both sides of the editor.
**FAIL:** Text starts flush against the left edge with no breathing room.
