import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');

    // Check that login form is visible - heading is "SaaSConf"
    await expect(page.getByRole('heading', { name: /saasconf/i })).toBeVisible();
    // Use placeholder text since labels have sr-only class
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in invalid credentials using placeholder
    await page.getByPlaceholder(/email/i).fill('invalid@example.com');
    await page.getByPlaceholder(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    // Skip if no test credentials are set
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;

    if (!email || !password) {
      test.skip();
      return;
    }

    await page.goto('/login');

    // Fill in valid credentials using placeholder
    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard|conferences/i, { timeout: 10000 });
  });

  test('should logout successfully', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;

    if (!email || !password) {
      test.skip();
      return;
    }

    // Login first
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for dashboard
    await expect(page).toHaveURL(/dashboard|conferences/i, { timeout: 10000 });

    // Find and click logout button in sidebar
    const logoutButton = page.getByRole('button', { name: /logout|sign out|abmelden/i });
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      // Try finding it in a dropdown menu
      const userMenu = page.locator('[data-testid="user-menu"]').or(page.getByText(/user|profile|account/i).first());
      if (await userMenu.isVisible()) {
        await userMenu.click();
        await page.getByRole('menuitem', { name: /logout|sign out/i }).click();
      }
    }

    // Should redirect to login
    await expect(page).toHaveURL(/login/i, { timeout: 10000 });
  });
});
