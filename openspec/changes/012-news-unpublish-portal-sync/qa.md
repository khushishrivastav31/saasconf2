# QA — News Unpublish Portal Sync

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| Attendee (portal user) | `attendee-external@bjvsoft.net` | `Attend1234!` | Pre-seeded; or: register via public portal — see below |

### Create an attendee portal user

1. Open the conference's public registration portal:
   `http://localhost:3000/{tenant-slug}/portal`
2. Complete the registration form using a fresh email (e.g. `portal-tester@example.com`).
3. Complete the email verification step (link in MailHog at http://localhost:8025).
4. Set a password via the setup link.
5. Log in to the portal — you now have an attendee portal session.

---

## Pre-conditions

- A conference exists with an active registration portal.
- The attendee has access to the conference portal (registered or test user).

---

## Scenario A — Published article appears in the portal

**Role:** First as Conferences Admin, then as Attendee.

**Step 1 — Admin publishes an article:**
1. Log in as Conferences Admin → open a conference → **News** tab.
2. Click **New Article** → write a title: `Test Article — QA`.
3. Write some body content.
4. Click **Publish**.
5. **Expected:** Article shows as Published with a publish date.

**Step 2 — Attendee sees the article:**
1. Open a new browser tab / incognito window.
2. Log in to the conference portal as the attendee.
3. Navigate to the **News** section in the portal.
4. **Expected:** `Test Article — QA` is visible in the news feed.

**PASS:** Published article appears for attendee.
**FAIL:** Article not visible even though published.

---

## Scenario B — Unpublished article is removed from the portal (the main fix)

**Continuing from Scenario A:**

**Step 3 — Admin unpublishes the article:**
1. Switch back to the admin browser tab.
2. Find `Test Article — QA` → click the **Unpublish** button (toggle icon).
3. A confirmation modal appears.
4. **Expected:** Modal text says something like _"It will be removed from the portal feed."_
5. Confirm the unpublish.
6. **Expected:** Article shows as Draft/Unpublished in the admin list.

**Step 4 — Attendee no longer sees the article:**
1. Switch to the portal browser tab.
2. Refresh the page (or navigate away and back — within 30 seconds).
3. **Expected:** `Test Article — QA` is NO longer visible in the news feed.

**PASS:** Article disappears from portal after unpublish (within 30 seconds).
**FAIL:** Article continues to appear in the portal even after unpublishing.

---

## Scenario C — Unpublish confirmation modal has accurate copy

**Role:** Conferences Admin

1. Open the News tab → find any published article.
2. Click the Unpublish button.
3. **Expected:** The confirmation modal body text references **"portal feed"** and
   mentions that attendees currently viewing the page may see it briefly.
4. **Expected:** The text does NOT say "It will no longer be visible" without qualification.

**PASS:** Modal copy is accurate and honest about caching behaviour.
**FAIL:** Copy says "immediately removed" or is misleadingly absolute.

---

## Scenario D — Unauthenticated visitor cannot see unpublished articles via direct URL

**Role:** No login (anonymous / unauthenticated)

1. While the article is published, note its article ID from the admin URL.
2. Unpublish the article.
3. Try to access the article directly via the portal API:
   `GET /portal/news/{article_id}` (use browser DevTools or curl while logged in as attendee).
4. **Expected:** Response is `404 Not Found` or `403 Forbidden` — the unpublished article is not returned.

**PASS:** Unpublished article not accessible via direct API call.
**FAIL:** Article content returned even when unpublished.

---

## Scenario E — Publishing then unpublishing multiple times works correctly

**Role:** Conferences Admin

1. Create a new article.
2. Publish → confirm portal shows it.
3. Unpublish → confirm portal hides it.
4. Publish again → confirm portal shows it again.
5. **Expected:** Each state change is reflected correctly in the portal within 30 seconds.

**PASS:** Publish/unpublish cycle works reliably multiple times.
**FAIL:** Article gets stuck in one state after repeated toggling.
