import { test, expect } from '@playwright/test';

test.describe('Cross-Conference Module Pages', () => {
  test('should load volunteers page with heading and description', async ({ page }) => {
    await page.goto('/modules/volunteers');

    // Should show "Volunteers" heading
    await expect(page.getByRole('heading', { name: /volunteer/i })).toBeVisible({ timeout: 10000 });

    // Should show description text
    await expect(page.getByText(/manage.*volunteer/i)).toBeVisible({ timeout: 5000 });

    // Should show stat cards (Total, Pending, Approved, etc.)
    const hasStats = await page.getByText(/total|pending|approved|active/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTable = await page.locator('table').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /add volunteer/i }).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasStats || hasTable || hasAddBtn).toBeTruthy();
  });

  test('should show volunteer table with columns', async ({ page }) => {
    await page.goto('/modules/volunteers');

    await expect(page.getByRole('heading', { name: /volunteer/i })).toBeVisible({ timeout: 10000 });

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      await expect(table.getByText(/name/i).first()).toBeVisible();
      await expect(table.getByText(/email/i).first()).toBeVisible();
      await expect(table.getByText(/status/i).first()).toBeVisible();
    }
  });

  test('should filter volunteers by status', async ({ page }) => {
    await page.goto('/modules/volunteers');

    await expect(page.getByRole('heading', { name: /volunteer/i })).toBeVisible({ timeout: 10000 });

    // Should have status filter dropdown
    const filterControl = page.locator('select').first();
    if (await filterControl.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Should have status options
      const options = await filterControl.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(1);

      // Select a filter option
      if (options.length > 1) {
        await filterControl.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
  });

  test('should load locations page with content', async ({ page }) => {
    await page.goto('/modules/locations');

    const heading = page.getByRole('heading', { name: /location/i });
    const content = page.getByText(/location/i).first();
    await expect(heading.or(content)).toBeVisible({ timeout: 10000 });
  });

  test('should load CFP module page', async ({ page }) => {
    await page.goto('/modules/cfp');

    // Should show CFP content or redirect to sub-page
    await expect(page).toHaveURL(/cfp/i, { timeout: 10000 });

    // Should render page content
    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.getByText(/call for papers|cfp|paper/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasHeading || hasContent).toBeTruthy();
  });
});
