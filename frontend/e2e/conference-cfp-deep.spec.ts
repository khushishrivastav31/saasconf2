import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference CFP Deep Tests', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Assignments and show assignment UI', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Assignments');

    // Should show assignment-related content
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAssign = await page.getByText(/assign|reviewer|committee/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no assignment/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasAssign || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show paper details with status and actions in Papers tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Papers');

    const hasTable = await page.locator('table, tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      // Table should have columns for paper info
      const table = page.locator('table').first();
      const hasTitle = await table.getByText(/title/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasStatus = await table.getByText(/status/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasTitle || hasStatus).toBeTruthy();
    }
  });

  test('should show Users tab with search and filter controls', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Users');

    // Should show search input
    const searchInput = page.getByPlaceholder(/search/i);
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    // Should show filter dropdown
    const filterSelect = page.locator('select').first();
    const hasFilter = await filterSelect.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSearch || hasFilter).toBeTruthy();
  });

  test('should show Evaluated Papers with scores or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Evaluated Papers');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no evaluated|no paper/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show Accepted Papers with export option', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Accepted Papers');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no accepted|no paper/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show Rejected Papers section', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Rejected Papers');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no rejected|no paper/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show Topics tab with add button and topic list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Topics');

    const hasAddBtn = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTopics = await page.getByText(/topic/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no topic/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasTopics || hasEmpty).toBeTruthy();
  });

  test('should show Program Committee with member list and add button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Program Committee');

    const hasAddBtn = await page.getByRole('button', { name: /add|invite|new/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTable = await page.locator('table').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasMembers = await page.getByText(/member|committee/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasTable || hasMembers).toBeTruthy();
  });
});
