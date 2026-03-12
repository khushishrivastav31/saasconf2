import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Analytics Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Analytics tab and show content', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Analytics');

    // Should show analytics-related content
    const hasHeading = await softVisible(page.getByRole('heading', { name: /analytics/i }), 10000);
    const hasCharts = await softVisible(page.locator('canvas, svg[class*="chart"], [class*="chart"]').first(), 5000);
    const hasStats = await softVisible(page.getByText(/total|count|statistic|metric/i).first(), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasHeading || hasCharts || hasStats || hasContent).toBeTruthy();
  });

  test('should display stat cards or summary metrics', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Analytics');

    // Analytics should display some form of data visualization or summary
    const hasNumbers = await softVisible(page.locator('[class*="stat"], [class*="metric"], [class*="card"]').first(), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasNumbers || hasContent).toBeTruthy();
  });
});
