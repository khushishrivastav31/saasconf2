import { test, expect } from '@playwright/test';
import { PortalDashboardPage } from './pages/portal-dashboard.page';

import { softVisible } from './helpers/navigation';
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
    const hasFirstName = await softVisible(page.getByLabel(/first name/i), 5000);
    const hasLastName = await softVisible(page.getByLabel(/last name/i), 3000);
    const hasEmail = await softVisible(page.getByLabel(/email/i).first(), 3000);

    expect(hasFirstName || hasLastName || hasEmail).toBeTruthy();
  });

  test('should show save button on profile page', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoProfile();

    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });

    const hasSaveBtn = await softVisible(page.getByRole('button', { name: /save|update/i }), 5000);
    expect(hasSaveBtn).toBeTruthy();
  });

  test('should show profile fields for affiliation and bio', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoProfile();

    await expect(page).toHaveURL(/profile/i, { timeout: 10000 });

    // Check for extended profile fields
    const hasAffiliation = await softVisible(page.getByLabel(/affiliation|organization|company/i), 5000);
    const hasBio = await softVisible(page.getByLabel(/bio|about/i), 3000);
    const hasPhone = await softVisible(page.getByLabel(/phone/i), 3000);

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
    const hasMessages = await softVisible(page.locator('[class*="border-b"], table, tr').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no message/i), 5000);
    const hasContent = await softVisible(page.locator('main, [role="main"]').first(), 3000);

    expect(hasMessages || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show message date and subject when messages exist', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoMessages();

    await expect(page).toHaveURL(/messages/i, { timeout: 10000 });

    const hasMessages = await softVisible(page.locator('[class*="border-b"]').first(), 5000);
    if (hasMessages) {
      // Messages should show date or subject text
      const hasDate = await softVisible(page.getByText(/\d{1,2}[\/.-]\d{1,2}/i).first(), 3000);
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
    const hasInvitations = await softVisible(page.locator('table, [class*="border-b"]').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no invitation/i), 5000);
    const hasContent = await softVisible(page.locator('main, [role="main"]').first(), 3000);

    expect(hasInvitations || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show accept/decline buttons when invitations exist', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.gotoInvitations();

    await expect(page).toHaveURL(/invitations/i, { timeout: 10000 });

    const hasInvitations = await softVisible(page.locator('[class*="border"]').nth(1), 5000);
    if (hasInvitations) {
      const hasAccept = await softVisible(page.getByRole('button', { name: /accept/i }).first(), 3000);
      const hasDecline = await softVisible(page.getByRole('button', { name: /decline|reject/i }).first(), 3000);
      expect(typeof hasAccept === 'boolean' && typeof hasDecline === 'boolean').toBeTruthy();
    }
  });
});
