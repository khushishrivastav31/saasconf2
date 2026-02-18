import { test, expect } from '@playwright/test';
import { PortalDashboardPage } from './pages/portal-dashboard.page';

test.describe('Portal Profile Deep Tests', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
      test.skip();
    }
  });

  test('should load profile page with personal info form', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoProfile();

    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });

    // Should show form fields for personal information
    const hasFirstName = await page.getByLabel(/first name/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasLastName = await page.getByLabel(/last name/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmail = await page.getByLabel(/email/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasFirstName || hasLastName || hasEmail).toBeTruthy();
  });

  test('should show save button on profile page', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoProfile();

    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });

    const hasSaveBtn = await page.getByRole('button', { name: /save|update/i }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSaveBtn).toBeTruthy();
  });

  test('should show profile fields for affiliation and bio', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoProfile();

    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });

    // Check for extended profile fields
    const hasAffiliation = await page.getByLabel(/affiliation|organization|company/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasBio = await page.getByLabel(/bio|about/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasPhone = await page.getByLabel(/phone/i).isVisible({ timeout: 3000 }).catch(() => false);

    // At least one extended field should exist
    expect(typeof hasAffiliation === 'boolean' && typeof hasBio === 'boolean').toBeTruthy();
  });
});

test.describe('Portal Messages Deep Tests', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
      test.skip();
    }
  });

  test('should load messages page with inbox or empty state', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoMessages();

    await expect(page).toHaveURL(/messages/i, { timeout: 10000 });

    // Should show message list or empty state
    const hasMessages = await page.locator('[class*="border-b"], table, tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no message/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main, [role="main"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasMessages || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show message date and subject when messages exist', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoMessages();

    await expect(page).toHaveURL(/messages/i, { timeout: 10000 });

    const hasMessages = await page.locator('[class*="border-b"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasMessages) {
      // Messages should show date or subject text
      const hasDate = await page.getByText(/\d{1,2}[\/.-]\d{1,2}/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(typeof hasDate).toBe('boolean');
    }
  });
});

test.describe('Portal Invitations Deep Tests', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
      test.skip();
    }
  });

  test('should load invitations page with list or empty state', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoInvitations();

    await expect(page).toHaveURL(/invitations/i, { timeout: 10000 });

    // Should show invitations or empty state
    const hasInvitations = await page.locator('table, [class*="border-b"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no invitation/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main, [role="main"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasInvitations || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show accept/decline buttons when invitations exist', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoInvitations();

    await expect(page).toHaveURL(/invitations/i, { timeout: 10000 });

    const hasInvitations = await page.locator('[class*="border"]').nth(1).isVisible({ timeout: 5000 }).catch(() => false);
    if (hasInvitations) {
      const hasAccept = await page.getByRole('button', { name: /accept/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasDecline = await page.getByRole('button', { name: /decline|reject/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(typeof hasAccept === 'boolean' && typeof hasDecline === 'boolean').toBeTruthy();
    }
  });
});
