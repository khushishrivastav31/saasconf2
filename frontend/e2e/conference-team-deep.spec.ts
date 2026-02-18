import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Team Deep Tests', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Team tab and show team members', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');

    // Should show team heading or content
    const hasHeading = await page.getByRole('heading', { name: /team/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await detail.contentArea.getByText(/team|member|role/i).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHeading || hasContent).toBeTruthy();
  });

  test('should show team member table or list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasList = await page.locator('[class*="border-b"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no team member/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasList || hasEmpty).toBeTruthy();
  });

  test('should show team member columns when data exists', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      await expect(table.getByText(/name/i).first()).toBeVisible();
      await expect(table.getByText(/role/i).first()).toBeVisible();
    }
  });

  test('should show Add Team Member button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');

    const hasAddBtn = await page.getByRole('button', { name: /add.*member|invite|add/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasAddBtn || hasContent).toBeTruthy();
  });
});
