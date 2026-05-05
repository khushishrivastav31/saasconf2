import { test, expect } from '@playwright/test';
import { softVisible, waitForLoadingToFinish } from './helpers/navigation';

/**
 * Smoke E2E for the super-admin "Unlock user" padlock shipped in PR #198.
 * Verifies the padlock button renders on the admin Tenants → (tenant) →
 * Users tab. Doesn't click — clicking is idempotent (clears Redis lockout
 * state) and the action surfaces as a toast that the unit tests already
 * lock down. Adding a click here adds flake risk without much value.
 */
test.describe('Admin Unlock User', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
      test.skip();
    }
  });

  test('Tenants → Users tab shows the padlock unlock button', async ({ page }) => {
    await page.goto('/admin/tenants');
    await waitForLoadingToFinish(page);

    // Open the first tenant in the list.
    const firstTenantLink = page.getByRole('link').filter({ hasNotText: /^$/ }).first();
    if (!(await softVisible(firstTenantLink, 10000))) {
      test.skip(true, 'No tenant rows visible — super-admin role needed');
    }
    await firstTenantLink.click();
    await waitForLoadingToFinish(page);

    // Switch to the Users tab.
    const usersTab = page.getByRole('button', { name: /^users$/i }).first();
    if (!(await softVisible(usersTab, 5000))) {
      // Tab may render as a link or just a section toggle.
      const usersText = page.getByText(/^users$/i).first();
      if (!(await softVisible(usersText, 5000))) {
        test.skip(true, 'Users tab not reachable on this admin seed');
      }
      await usersText.click();
    } else {
      await usersTab.click();
    }
    await waitForLoadingToFinish(page);

    // Padlock button has title="Reset failed-login counter (unlock account)".
    const padlock = page.getByTitle(/reset failed-login counter/i).first();
    expect(await softVisible(padlock, 10000)).toBeTruthy();
  });
});
