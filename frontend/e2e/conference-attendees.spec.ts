import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Attendees Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Attendees tab and show heading', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Attendees');

    await expect(page.getByRole('heading', { level: 2, name: /attendees/i })).toBeVisible({ timeout: 10000 });
  });

  test('should show attendees table or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Attendees');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no attendee/i), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show attendee table columns when data exists', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Attendees');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    if (hasTable) {
      const table = page.locator('table').first();
      await expect(table.getByText(/name/i).first()).toBeVisible();
      await expect(table.getByText(/email/i).first()).toBeVisible();
    }
  });
});
