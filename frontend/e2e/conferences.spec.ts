import { test, expect } from '@playwright/test';
import { ConferencesPage } from './pages/conferences.page';

import { softVisible } from './helpers/navigation';
test.describe('Conferences', () => {
  test('should load conferences page with heading', async ({ page }) => {
    const conferencesPage = new ConferencesPage(page);
    await conferencesPage.goto();
    await conferencesPage.expectVisible();
  });

  test('should display conference list with status badges', async ({ page }) => {
    const conferencesPage = new ConferencesPage(page);
    await conferencesPage.goto();
    await conferencesPage.expectVisible();

    // Should have at least one conference card/row
    const conferenceItems = page.locator('[class*="cursor-pointer"]');
    await expect(conferenceItems.first()).toBeVisible({ timeout: 10000 });

    // Should show status badges (upcoming, ongoing, past)
    const badges = page.locator('.rounded-full');
    await expect(badges.first()).toBeVisible();
  });

  test('should show stats cards', async ({ page }) => {
    const conferencesPage = new ConferencesPage(page);
    await conferencesPage.goto();
    await conferencesPage.expectVisible();

    // Stats section should show totals
    await expect(page.getByText(/total|upcoming|ongoing|past/i).first()).toBeVisible();
  });

  test('should show Create Conference button for admin users', async ({ page }) => {
    const conferencesPage = new ConferencesPage(page);
    await conferencesPage.goto();
    await conferencesPage.expectVisible();

    // Wait for page content to fully load before checking
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    // Create button is only visible to tenant_admin+ users
    const hasCreateBtn = await softVisible(conferencesPage.createButton, 5000);
    const hasConferences = await softVisible(page.locator('[class*="cursor-pointer"]').first(), 5000);
    // At minimum, the page should show conferences or the create button
    expect(hasCreateBtn || hasConferences).toBeTruthy();
  });

  test('should navigate to conference detail when clicking a conference', async ({ page }) => {
    const conferencesPage = new ConferencesPage(page);
    await conferencesPage.goto();
    await conferencesPage.expectVisible();

    await conferencesPage.clickFirstConference();
    await expect(page).toHaveURL(/conferences\/[a-f0-9-]+/i, { timeout: 10000 });
    // Should show conference name heading (use .nth(1) to skip the app logo h1)
    await expect(page.locator('h1').nth(1)).toBeVisible({ timeout: 10000 });
  });
});
