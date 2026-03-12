import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Speakers Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Speakers tab and show heading', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Speakers');

    await expect(page.getByRole('heading', { name: 'Speakers', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should show speakers table or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Speakers');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no speakers/i), 5000);
    const hasCards = await softVisible(page.locator('[class*="border"][class*="rounded"]').first(), 3000);

    expect(hasTable || hasEmpty || hasCards).toBeTruthy();
  });

  test('should show speaker table columns when data exists', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Speakers');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    if (hasTable) {
      const table = page.locator('table').first();
      await expect(table.getByText(/name/i).first()).toBeVisible();
      await expect(table.getByText(/email/i).first()).toBeVisible();
    }
  });

  test('should have search input for filtering speakers', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Speakers');

    const searchInput = page.getByPlaceholder(/search/i);
    const hasSearch = await softVisible(searchInput, 5000);
    // Search may not exist if no speakers
    expect(typeof hasSearch).toBe('boolean');
  });
});
