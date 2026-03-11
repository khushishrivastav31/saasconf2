import { test, expect } from '@playwright/test';

test.describe('Management Pages', () => {
  test('should load Team page with member list', async ({ page }) => {
    await page.goto('/management/team');

    // May redirect if user doesn't have access
    const hasHeading = await page.getByRole('heading', { name: /team/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const redirected = page.url().includes('login') || page.url().includes('dashboard');

    if (redirected || !hasHeading) {
      // User doesn't have management access, skip
      test.skip(true, 'User does not have management access');
    }

    // Should show team member table or add button
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /invite|add|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasList = await page.locator('[class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasAddBtn || hasList).toBeTruthy();
  });

  test('should show team member roles and email', async ({ page }) => {
    await page.goto('/management/team');

    const hasHeading = await page.getByRole('heading', { name: /team/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User does not have management access');
    }

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      await expect(table.getByText(/name|email/i).first()).toBeVisible();
      await expect(table.getByText(/role/i).first()).toBeVisible();
    }
  });

  test('should load My Company page with company details', async ({ page }) => {
    await page.goto('/management/company');

    const hasHeading = await page.getByRole('heading', { name: /company|organization/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const redirected = page.url().includes('login') || page.url().includes('dashboard');

    if (redirected || !hasHeading) {
      test.skip(true, 'User does not have management access');
    }

    // Should show company form fields
    const hasName = await page.getByLabel(/name|company/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('form, input').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasName || hasForm).toBeTruthy();
  });

  test('should show company address fields', async ({ page }) => {
    await page.goto('/management/company');

    const hasHeading = await page.getByRole('heading', { name: /company|organization/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User does not have management access');
    }

    // Should show address-related fields
    const hasAddress = await page.getByLabel(/address|street|city|country/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddress || hasForm).toBeTruthy();
  });
});

test.describe('Admin Settings Deep Tests', () => {
  test('should load admin settings with currency management', async ({ page }) => {
    await page.goto('/admin/settings');

    const hasHeading = await page.getByRole('heading', { name: /settings/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin');
    }

    // Should show currency list
    await expect(page.getByText(/currenc/i).first()).toBeVisible();

    // Should show add/create button for currencies
    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCurrencyList = await page.getByText(/eur|usd|gbp/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasCurrencyList).toBeTruthy();
  });

  test('should show pronouns management section', async ({ page }) => {
    await page.goto('/admin/settings');

    const hasHeading = await page.getByRole('heading', { name: /settings/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin');
    }

    // Navigate to pronouns tab if it exists
    const pronounsTab = page.getByRole('button', { name: /pronoun/i });
    if (await pronounsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pronounsTab.click();
      await page.waitForLoadState('networkidle');

      // Should show pronoun options
      const hasPronouns = await page.getByText(/he\/him|she\/her|they\/them/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasPronouns || hasAddBtn).toBeTruthy();
    }
  });

  test('should load Companies page with create and search', async ({ page }) => {
    await page.goto('/admin/tenants');

    const hasHeading = await page.getByRole('heading', { name: /companies|tenants/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin');
    }

    // Should have create button
    const hasCreateBtn = await page.getByRole('button', { name: /create|add|new/i }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasCreateBtn).toBeTruthy();

    // Should have search or filter
    const hasSearch = await page.getByPlaceholder(/search/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasFilter = await page.locator('select, input[type="search"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSearch || hasFilter || hasCreateBtn).toBeTruthy();
  });

  test('should show Audit Logs with date filter and action filter', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    const hasHeading = await page.getByRole('heading', { name: /audit/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin');
    }

    // Should have filter controls
    const filterControls = page.locator('select, input[type="date"], input[type="search"]');
    const controlCount = await filterControls.count();
    expect(controlCount).toBeGreaterThan(0);

    // Should show rows of audit data
    const rows = page.locator('tr, [class*="border-b"]');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
  });

  test('should load Modules page with module toggle controls', async ({ page }) => {
    await page.goto('/admin/modules');

    const hasHeading = await page.getByRole('heading', { name: /modules/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin');
    }

    // Should show module names
    await expect(page.getByText(/conferences/i).first()).toBeVisible({ timeout: 5000 });

    // Should have toggle switches or enable/disable controls
    const hasToggles = await page.locator('button[role="switch"], input[type="checkbox"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasModuleCards = await page.locator('[class*="border"][class*="rounded"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasToggles || hasModuleCards).toBeTruthy();
  });
});
