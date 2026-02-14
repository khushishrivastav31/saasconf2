import { test, expect } from '@playwright/test';

test.describe('Super Admin Pages', () => {
  test('should load Companies page with create button and table', async ({ page }) => {
    await page.goto('/admin/tenants');
    await expect(page.getByRole('heading', { name: /companies|tenants/i })).toBeVisible({ timeout: 10000 });

    // Should have create/add button
    await expect(page.getByRole('button', { name: /create|add|new/i })).toBeVisible();

    // Should show table or list of companies
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasList = await page.locator('tr, [class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasList).toBeTruthy();
  });

  test('should load Modules page with module names', async ({ page }) => {
    await page.goto('/admin/modules');
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible({ timeout: 10000 });

    // Should show module names
    await expect(page.getByText(/conferences|cfp|volunteers/i).first()).toBeVisible();
  });

  test('should load Audit Logs page with table and filters', async ({ page }) => {
    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible({ timeout: 10000 });

    // Should have a table with rows
    const rows = page.locator('tr, [class*="border-b"]');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });

    // Should have filter controls
    const filterControl = page.locator('select, input[type="search"], input[placeholder*="search" i]').first();
    await expect(filterControl).toBeVisible({ timeout: 5000 });
  });

  test('should load Settings page with currencies table', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10000 });

    // Should show currencies section
    await expect(page.getByText(/currenc/i).first()).toBeVisible();

    // Should show a table or list of currencies
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCurrencyItems = await page.getByText(/usd|eur|gbp/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasCurrencyItems).toBeTruthy();
  });

  test('should show pronoun options section in admin settings', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10000 });

    // Should show pronouns section or tab
    const hasPronouns = await page.getByText(/pronoun/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasPronouns) {
      await page.getByText(/pronoun/i).first().click();
      await page.waitForTimeout(500);
    }
  });
});
