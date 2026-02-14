import { test, expect } from '@playwright/test';
import { PortalDashboardPage } from './pages/portal-dashboard.page';

test.describe('Portal Dashboard', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
      test.skip();
    }
  });

  test('should load portal dashboard with papers section', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();

    // Dashboard should display papers or submissions section
    await expect(page.getByText(/paper|submission/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should show portal sidebar navigation links', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();

    // Should have navigation links in sidebar
    const sidebar = page.locator('aside, nav').first();
    await expect(sidebar).toBeVisible();

    // Verify key navigation links exist
    const hasSubmitPaper = await page.getByText(/submit paper|new paper/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProfile = await page.getByText(/profile/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasMessages = await page.getByText(/messages/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSubmitPaper || hasProfile || hasMessages).toBeTruthy();
  });

  test('should navigate to Submit Paper page with form elements', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoSubmitPaper();

    await expect(page).toHaveURL(/papers\/new/i, { timeout: 10000 });

    // Should show "Submit New Paper" heading
    await expect(page.getByRole('heading', { name: /submit new paper/i })).toBeVisible({ timeout: 10000 });

    // Should show conference select dropdown
    const conferenceSelect = page.getByText(/conference/i).first();
    await expect(conferenceSelect).toBeVisible({ timeout: 5000 });
  });

  test('should show paper form fields when conference is selected', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoSubmitPaper();

    await expect(page).toHaveURL(/papers\/new/i, { timeout: 10000 });

    // Check for form fields (they may be visible if conference is pre-selected)
    const hasTitle = await page.getByLabel(/title/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasConferenceSelect = await page.locator('select').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasConferenceSelect).toBeTruthy();

    // If title field is visible, check for other form fields
    if (hasTitle) {
      const hasSessionType = await page.getByText(/session type/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasAbstract = await page.getByText(/abstract/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasSessionType || hasAbstract).toBeTruthy();
    }
  });

  test('should navigate to Profile page with account fields', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoProfile();

    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });

    // Should show profile-related content
    await expect(page.getByText(/profile|account|email/i).first()).toBeVisible({ timeout: 10000 });

    // Should show form fields for profile
    const hasInput = await page.locator('input').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasInput).toBeTruthy();
  });

  test('should navigate to Messages page', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoMessages();

    await expect(page).toHaveURL(/messages/i, { timeout: 10000 });

    // Should show messages content area
    await expect(page.locator('main, [role="main"], .content').first()).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Invitations page', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoInvitations();

    await expect(page).toHaveURL(/invitations/i, { timeout: 10000 });
  });
});
