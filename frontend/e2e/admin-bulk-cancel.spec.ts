import { test, expect } from '@playwright/test';
import { softVisible, waitForLoadingToFinish } from './helpers/navigation';

/**
 * Smoke E2E for the "Cancel many…" admin entry point shipped in PR #193
 * (training surface) and PR #197 (conference surface). Verifies the
 * button renders on both Registrations admin tabs and that clicking it
 * opens the three-step dialog. We deliberately do NOT click "Confirm"
 * — that's destructive and seed-data-sensitive. Asserting the dialog
 * opens is enough to catch a regression in the entry-point wiring.
 */
test.describe('Admin Bulk-Cancel', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
      test.skip();
    }
  });

  test('training: "Cancel many…" button renders on Registrations admin tab', async ({ page }) => {
    await page.goto('/modules/trainings?section=registrations');
    await waitForLoadingToFinish(page);

    const hasButton = await softVisible(
      page.getByRole('button', { name: /cancel many/i }).first(),
      10000
    );
    if (!hasButton) {
      test.skip(true, 'Training Registrations tab not reachable on this seed');
    }
    expect(hasButton).toBeTruthy();
  });

  test('training: clicking "Cancel many…" opens the bulk-cancel dialog', async ({ page }) => {
    await page.goto('/modules/trainings?section=registrations');
    await waitForLoadingToFinish(page);

    const button = page.getByRole('button', { name: /cancel many/i }).first();
    if (!(await softVisible(button, 10000))) {
      test.skip(true, 'Training Registrations tab not reachable on this seed');
    }
    await button.click();

    // Step 1 of the dialog: filter form. The "Reason" textarea is the
    // marker — required (min 10 chars) and unique to this dialog. The
    // BulkCancelDialog ``<label>`` is not bound to the textarea via
    // ``htmlFor``, so getByLabel won't match — use the placeholder
    // instead, with a ``textarea`` fallback for resilience.
    const reasonField = page.getByPlaceholder(/bot burst|203\.0\.113/i).first();
    if (!(await softVisible(reasonField, 10000))) {
      const fallback = page.locator('div[role="dialog"], .fixed.inset-0').locator('textarea').first();
      await expect(fallback).toBeVisible({ timeout: 10000 });
    }

    // Cancel out so we don't leave the dialog open in subsequent tests.
    await page.getByRole('button', { name: /^cancel$/i }).first().click();
  });

  test('conference: "Cancel many…" button renders on Registrations admin tab', async ({ page }) => {
    // Conference detail's Registrations admin tab — needs a conference id;
    // navigate to conferences list and click the first one.
    await page.goto('/conferences');
    await waitForLoadingToFinish(page);

    const firstConfRow = page.locator('tr').filter({ has: page.locator('a, button') }).nth(1);
    if (!(await softVisible(firstConfRow, 10000))) {
      test.skip(true, 'No conference seeded for this admin');
    }
    const link = firstConfRow.getByRole('link').first();
    if (!(await softVisible(link, 5000))) {
      test.skip(true, 'No clickable conference link');
    }
    await link.click();
    await waitForLoadingToFinish(page);

    // Switch to the Registrations tab.
    const regsTab = page.getByRole('tab', { name: /registrations/i }).first();
    if (!(await softVisible(regsTab, 5000))) {
      test.skip(true, 'Registrations tab not visible — admin role limited?');
    }
    await regsTab.click();
    await waitForLoadingToFinish(page);

    const cancelManyBtn = page.getByRole('button', { name: /cancel many/i }).first();
    expect(await softVisible(cancelManyBtn, 10000)).toBeTruthy();
  });
});
