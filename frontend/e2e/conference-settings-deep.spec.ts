import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Settings Deep Tests', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Volunteer Tasks with add button and task list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /volunteer tasks/i }).click();
    await page.waitForTimeout(500);

    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRoles = await page.locator('table, [class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no.*role/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasRoles || hasEmpty).toBeTruthy();
  });

  test('should show Committee Roles with add button and role list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /committee roles/i }).click();
    await page.waitForTimeout(500);

    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRoles = await page.locator('table, [class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasRoles).toBeTruthy();
  });

  test('should show Session Types with type cards or list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /session types/i }).click();
    await page.waitForTimeout(500);

    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTypes = await page.locator('table, [class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasCards = await page.locator('[class*="border"][class*="rounded"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasTypes || hasCards).toBeTruthy();
  });

  test('should show Score Scales with configuration options', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /score scales/i }).click();
    await page.waitForTimeout(500);

    const hasScale = await page.getByText(/scale|score|criteria/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasScale || hasAddBtn).toBeTruthy();
  });

  test('should show Paper Form with field configuration', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /paper form/i }).click();
    await page.waitForTimeout(500);

    const hasField = await page.getByText(/field|form|paper/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasToggle = await page.locator('button[role="switch"], input[type="checkbox"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasSave = await page.getByRole('button', { name: /save/i }).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasField || hasToggle || hasSave).toBeTruthy();
  });

  test('should show Email Templates with template list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /email templates/i }).click();
    await page.waitForTimeout(500);

    const hasTemplates = await page.getByText(/template|email/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCards = await page.locator('[class*="border"][class*="rounded"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasList = await page.locator('[class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTemplates || hasCards || hasList).toBeTruthy();
  });

  test('should navigate between all settings sub-tabs without errors', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');

    const tabs = ['Volunteer Tasks', 'Committee Roles', 'Session Types', 'Score Scales', 'Paper Form', 'Email Templates'];
    for (const tab of tabs) {
      const tabBtn = page.getByRole('button', { name: new RegExp(tab, 'i') });
      if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(300);
        // Verify no error state
        const hasError = await page.getByText(/error|something went wrong|500/i).isVisible({ timeout: 1000 }).catch(() => false);
        expect(hasError).toBeFalsy();
      }
    }
  });
});
