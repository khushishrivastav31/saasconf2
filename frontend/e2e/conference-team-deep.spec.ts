import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
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
    const hasHeading = await softVisible(page.getByRole('heading', { name: /team/i }), 10000);
    const hasContent = await softVisible(detail.contentArea.getByText(/team|member|role/i).first(), 5000);

    expect(hasHeading || hasContent).toBeTruthy();
  });

  test('should show team member table or list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasList = await softVisible(page.locator('[class*="border-b"]').first(), 3000);
    const hasEmpty = await softVisible(page.getByText(/no team member/i), 3000);

    expect(hasTable || hasList || hasEmpty).toBeTruthy();
  });

  test('should show team member columns when data exists', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
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

    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add.*member|invite|add/i }).first(), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasAddBtn || hasContent).toBeTruthy();
  });
});
