import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference CFP Users — Portal Account card', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('opens an applicant and, when linked to a portal user, shows the Portal Account card with five actions', async ({
    page,
  }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Users');
    await page.waitForLoadState('networkidle');

    // Find the first applicant row. The Users tab may be empty in the seed —
    // in that case, the spec is a no-op (consistent with other CFP deep specs).
    const firstRow = page.locator('table tbody tr').first();
    const hasRow = await softVisible(firstRow, 5000);
    if (!hasRow) {
      test.skip(true, 'No applicants in seed data — cannot exercise the form.');
      return;
    }

    await firstRow.click();
    await page.waitForLoadState('networkidle');

    // Baseline: the applicant form has opened (email field visible).
    const emailField = page.getByLabel(/email/i).first();
    await expect(emailField).toBeVisible({ timeout: 10000 });

    // The Portal Account tab is conditional on the applicant having a linked
    // portal user. If it's present, navigate to it and assert the five actions render.
    const portalTab = page.getByRole('button', { name: /^Portal Account$/i });
    const isLinked = await softVisible(portalTab, 5000);
    if (!isLinked) {
      test.skip(
        true,
        'Selected applicant has no linked portal user — Portal Account tab correctly absent.'
      );
      return;
    }
    await portalTab.click();
    await expect(page.getByRole('heading', { name: /portal account/i })).toBeVisible();

    // Five expected actions. Deactivate/Activate label depends on is_active, so match either.
    await expect(page.getByRole('button', { name: /Deactivate|Activate/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend invite/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reset password/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Impersonate/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Merge with/i })).toBeVisible();

    // Opening the Merge dialog must not submit the underlying applicant form.
    // The dialog is a sibling overlay; the Portal Account tab controls stay visible.
    await page.getByRole('button', { name: /Merge with/i }).click();
    await expect(page.getByRole('dialog', { name: /merge users/i })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole('button', { name: /Impersonate/i })).toBeVisible();

    // Close the dialog to leave the page in a clean state.
    await page.getByRole('button', { name: /cancel/i }).first().click();
  });
});
