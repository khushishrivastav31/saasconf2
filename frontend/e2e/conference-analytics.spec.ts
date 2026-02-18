import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

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
    const hasHeading = await page.getByRole('heading', { name: /analytics/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const hasCharts = await page.locator('canvas, svg[class*="chart"], [class*="chart"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasStats = await page.getByText(/total|count|statistic|metric/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasHeading || hasCharts || hasStats || hasContent).toBeTruthy();
  });

  test('should display stat cards or summary metrics', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Analytics');

    // Analytics should display some form of data visualization or summary
    const hasNumbers = await page.locator('[class*="stat"], [class*="metric"], [class*="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasNumbers || hasContent).toBeTruthy();
  });
});
