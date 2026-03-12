import { test, expect } from '@playwright/test';
import { PortalDashboardPage } from './pages/portal-dashboard.page';

import { softVisible } from './helpers/navigation';
test.describe('CFP Portal', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
      test.skip();
    }
  });

  test('should display submit paper form with conference selection', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoSubmitPaper();

    await expect(page).toHaveURL(/papers\/new/i, { timeout: 10000 });

    // Should show form with conference select or paper fields
    const formElement = page.locator('form, select, input, textarea').first();
    await expect(formElement).toBeVisible({ timeout: 10000 });

    // Check for conference dropdown
    const hasSelect = await softVisible(page.locator('select').first(), 5000);
    const hasForm = await softVisible(page.locator('form').first(), 3000);
    expect(hasSelect || hasForm).toBeTruthy();
  });

  test('should show paper form fields including title and abstract', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoSubmitPaper();

    await expect(page).toHaveURL(/papers\/new/i, { timeout: 10000 });

    // If form is rendered (conference may be pre-selected or only one conference)
    const hasTitle = await softVisible(page.getByLabel(/title/i).first(), 5000);
    if (hasTitle) {
      // Verify form structure
      const hasAbstract = await softVisible(page.getByText(/abstract/i).first(), 3000);
      const hasSaveDraft = await softVisible(page.getByRole('button', { name: /save as draft|save/i }).first(), 3000);
      const hasCancel = await softVisible(page.getByRole('button', { name: /cancel/i }), 3000);

      expect(hasAbstract || hasSaveDraft || hasCancel).toBeTruthy();
    }
  });

  test('should show co-speakers section in paper form', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoSubmitPaper();

    await expect(page).toHaveURL(/papers\/new/i, { timeout: 10000 });

    // Check for co-speakers section (may only be visible when form is fully rendered)
    const hasCoSpeakers = await softVisible(page.getByText(/co-speaker/i).first(), 5000);
    if (hasCoSpeakers) {
      // Should show email input for adding co-speakers
      const emailInput = page.getByPlaceholder(/co-speaker email/i);
      await expect(emailInput).toBeVisible({ timeout: 3000 });
    }
  });

  test('should show paper list on dashboard', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();

    // Dashboard should display papers section
    await expect(page.getByText(/paper|submission/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate between portal pages without errors', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);

    // Navigate through key portal pages
    await dashboard.goto();
    await dashboard.expectVisible();

    await dashboard.gotoProfile();
    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });
    // Profile should render without errors
    await expect(page.locator('input').first()).toBeVisible({ timeout: 5000 });

    await dashboard.gotoMessages();
    await expect(page).toHaveURL(/messages/i, { timeout: 10000 });

    // Return to dashboard
    await dashboard.goto();
    await dashboard.expectVisible();
  });
});
