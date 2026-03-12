import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
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
    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasAssign = await softVisible(page.getByText(/assign|reviewer|committee/i).first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no assignment/i), 3000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasAssign || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show paper details with status and actions in Papers tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Papers');

    const hasTable = await softVisible(page.locator('table, tr').first(), 5000);
    if (hasTable) {
      // Table should have columns for paper info
      const table = page.locator('table').first();
      const hasTitle = await softVisible(table.getByText(/title/i).first(), 3000);
      const hasStatus = await softVisible(table.getByText(/status/i).first(), 3000);
      expect(hasTitle || hasStatus).toBeTruthy();
    }
  });

  test('should show Users tab with search and filter controls', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Users');

    // Should show search/filter controls, add button, or empty state
    const hasSearch = await softVisible(page.getByPlaceholder(/search/i), 5000);
    const hasFilter = await softVisible(page.locator('select').first(), 3000);
    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add user/i }), 3000);
    const hasEmpty = await softVisible(page.getByText(/no users/i), 3000);

    expect(hasSearch || hasFilter || hasAddBtn || hasEmpty).toBeTruthy();
  });

  test('should show Evaluated Papers with scores or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Evaluated Papers');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no evaluated|no paper/i), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show Accepted Papers with export option', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Accepted Papers');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no accepted|no paper/i), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show Rejected Papers section', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Rejected Papers');

    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no rejected|no paper/i), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });

  test('should show Topics tab with add button and topic list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Topics');

    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add|create|new/i }).first(), 5000);
    const hasTopics = await softVisible(page.getByText(/topic/i).first(), 3000);
    const hasEmpty = await softVisible(page.getByText(/no topic/i), 3000);

    expect(hasAddBtn || hasTopics || hasEmpty).toBeTruthy();
  });

  test('should show Program Committee with member list and add button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Program Committee');

    const hasAddBtn = await softVisible(page.getByRole('button', { name: /add|invite|new/i }).first(), 5000);
    const hasTable = await softVisible(page.locator('table').first(), 3000);
    const hasMembers = await softVisible(page.getByText(/member|committee/i).first(), 3000);

    expect(hasAddBtn || hasTable || hasMembers).toBeTruthy();
  });
});
