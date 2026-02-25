import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference News Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to News tab and show content area', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('News');

    // Should show news-related content in the content area
    await detail.expectContentContains(/news|article|post|announcement/i);
  });

  test('should show empty state or articles list in News tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('News');

    // Wait for news data to load (API call)
    await page.waitForTimeout(2000);

    // News renders article cards (not HTML tables) or empty state
    const hasArticleCard = await page.locator('.border.border-gray-200.rounded-lg.shadow-sm').first().isVisible().catch(() => false);
    const hasNewArticleBtn = await page.getByRole('button', { name: /new article/i }).isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no news article/i).isVisible().catch(() => false);

    expect(hasArticleCard || hasNewArticleBtn || hasEmpty).toBeTruthy();
  });

  test('should show Create Article button in News tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('News');

    // Should show a button to create/add a new article
    const hasCreateBtn = await page.getByRole('button', { name: /create article|add article|new article|create post|add post/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasCreateBtn || hasAddBtn).toBeTruthy();
  });
});
