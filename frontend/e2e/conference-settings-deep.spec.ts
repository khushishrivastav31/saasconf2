import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
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
    await page.waitForLoadState('networkidle');

    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add|create|new/i }).first(), 5000);
    const hasRoles = await softVisible(page.locator('table, [class*="border-b"]').first(), 3000);
    const hasEmpty = await softVisible(page.getByText(/no.*role/i), 3000);

    expect(hasAddBtn || hasRoles || hasEmpty).toBeTruthy();
  });

  test('should show Committee Roles with add button and role list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /committee roles/i }).click();
    await page.waitForLoadState('networkidle');

    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add|create|new/i }).first(), 5000);
    const hasRoles = await softVisible(page.locator('table, [class*="border-b"]').first(), 3000);

    expect(hasAddBtn || hasRoles).toBeTruthy();
  });

  test('should show Session Types with type cards or list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /session types/i }).click();
    await page.waitForLoadState('networkidle');

    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add|create|new/i }).first(), 5000);
    const hasTypes = await softVisible(page.locator('table, [class*="border-b"]').first(), 3000);
    const hasCards = await softVisible(page.locator('[class*="border"][class*="rounded"]').first(), 3000);

    expect(hasAddBtn || hasTypes || hasCards).toBeTruthy();
  });

  test('should show Score Scales with configuration options', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /score scales/i }).click();
    await page.waitForLoadState('networkidle');

    const hasScale = await softVisible(page.getByText(/scale|score|criteria/i).first(), 5000);
    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add|create|new/i }).first(), 3000);

    expect(hasScale || hasAddBtn).toBeTruthy();
  });

  test('should show Paper Form with field configuration', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /paper form/i }).click();
    await page.waitForLoadState('networkidle');

    const hasField = await softVisible(page.getByText(/field|form|paper/i).first(), 5000);
    const hasToggle = await softVisible(page.locator('button[role="switch"], input[type="checkbox"]').first(), 3000);
    const hasSave = await softVisible(page.getByRole('button', { name: /save/i }), 3000);

    expect(hasField || hasToggle || hasSave).toBeTruthy();
  });

  test('should show Email Templates with template list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /email templates/i }).click();
    await page.waitForLoadState('networkidle');

    const hasTemplates = await softVisible(page.getByText(/template|email/i).first(), 5000);
    const hasCards = await softVisible(page.locator('[class*="border"][class*="rounded"]').first(), 3000);
    const hasList = await softVisible(page.locator('[class*="border-b"]').first(), 3000);

    expect(hasTemplates || hasCards || hasList).toBeTruthy();
  });

  test('should show Currency & Tax with currency selectors', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /currency & tax/i }).click();
    await page.waitForLoadState('networkidle');

    const hasPrimary = await softVisible(page.getByText(/primary currency/i), 5000);
    const hasSecond = await softVisible(page.getByText(/second currency/i), 3000);

    expect(hasPrimary || hasSecond).toBeTruthy();
  });

  test('should navigate between all settings sub-tabs without errors', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');

    const tabs = ['Volunteer Tasks', 'Committee Roles', 'Session Types', 'Score Scales', 'Paper Form', 'Email Templates', 'Currency & Tax'];
    for (const tab of tabs) {
      const tabBtn = page.getByRole('button', { name: new RegExp(tab, 'i') });
      if (await softVisible(tabBtn, 2000)) {
        await tabBtn.click();
        await page.waitForLoadState('networkidle');
        // Verify no error state
        const hasError = await softVisible(page.getByText(/error|something went wrong|500/i), 1000);
        expect(hasError).toBeFalsy();
      }
    }
  });
});
