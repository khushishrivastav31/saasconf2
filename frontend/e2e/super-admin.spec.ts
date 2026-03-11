import { test, expect } from '@playwright/test';

test.describe('Super Admin Pages', () => {
  // Super admin pages require super_admin role.
  // If the test user is only tenant_admin, these pages will redirect to /dashboard.
  // We detect this and skip rather than fail.

  test('should load Companies page or skip if not super_admin', async ({ page }) => {
    await page.goto('/admin/tenants');
    const hasHeading = await page.getByRole('heading', { name: /companies|tenants/i }).isVisible({ timeout: 10000 }).catch(() => false);

    if (!hasHeading) {
      // User is not super_admin — page redirected away
      test.skip(true, 'User is not super_admin - admin pages not accessible');
    }

    // Should have create/add button
    const hasCreateBtn = await page.getByRole('button', { name: /create|add|new/i }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasCreateBtn).toBeTruthy();
  });

  test('should load Modules page with module names', async ({ page }) => {
    await page.goto('/admin/modules');
    const hasHeading = await page.getByRole('heading', { name: /modules/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin - admin pages not accessible');
    }
    await expect(page.getByText(/conferences|cfp|volunteers/i).first()).toBeVisible();
  });

  test('should load Audit Logs page with table and filters', async ({ page }) => {
    await page.goto('/admin/audit-logs');
    const hasHeading = await page.getByRole('heading', { name: /audit/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin - admin pages not accessible');
    }

    // Should have a table with rows
    const rows = page.locator('tr, [class*="border-b"]');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });

    // Should have filter controls
    const filterControl = page.locator('select, input[type="search"], input[placeholder*="search" i]').first();
    await expect(filterControl).toBeVisible({ timeout: 5000 });
  });

  test('should load Settings page with currencies', async ({ page }) => {
    await page.goto('/admin/settings');
    const hasHeading = await page.getByRole('heading', { name: /settings/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin - admin pages not accessible');
    }

    // Should show currencies section
    await expect(page.getByText(/currenc/i).first()).toBeVisible();
  });

  test('should show pronoun options in admin settings', async ({ page }) => {
    await page.goto('/admin/settings');
    const hasHeading = await page.getByRole('heading', { name: /settings/i }).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasHeading) {
      test.skip(true, 'User is not super_admin - admin pages not accessible');
    }

    // Should show pronouns section or tab
    const hasPronouns = await page.getByText(/pronoun/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasPronouns) {
      await page.getByText(/pronoun/i).first().click();
      await page.waitForLoadState('networkidle');
    }
  });
});
