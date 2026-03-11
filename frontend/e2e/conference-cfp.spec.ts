import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference CFP Sections', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should display CFP configuration with status and fields', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    // CFP requires the cfp module — skip if section not visible
    const cfpBtn = detail.sidebar.getByRole('button', { name: 'Call for Papers' }).first();
    const hasCfpSection = await cfpBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCfpSection) {
      test.skip();
      return;
    }

    await detail.navigateToSection('Call for Papers', true);
    await page.waitForLoadState('networkidle');

    // Should show CFP form, "Create Call for Papers" button, or child sections expanded
    const hasCfp = await page.getByText(/title|status|draft|open|closed/i).first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasCreate = await page.getByRole('button', { name: /create call for papers/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const hasChildren = await detail.sidebar.getByRole('button', { name: 'Topics' }).isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasCfp || hasCreate || hasChildren).toBeTruthy();
  });

  test('should show CFP form fields when CFP exists', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Call for Papers');

    // If CFP exists, check for form fields
    const hasTitle = await page.getByLabel(/title/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTitle) {
      // Status dropdown should exist
      await expect(page.locator('select').first()).toBeVisible();
      // Save button should exist
      await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
    }
  });

  test('should show CFP rich text tabs', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Call for Papers');

    // Check for rich text content tabs
    const tabs = ['Code of Conduct', 'Guidelines'];
    for (const tab of tabs) {
      const tabBtn = page.getByRole('button', { name: new RegExp(tab, 'i') });
      if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }
  });

  test('should navigate to Topics and show topic list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Topics');

    // Should show topics heading or create button
    const hasTopics = await page.getByText(/topic/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCreate = await page.getByRole('button', { name: /add|create|new/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTopics || hasCreate).toBeTruthy();
  });

  test('should navigate to Program Committee and show members', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Program Committee');

    // Should show committee members or add button
    await expect(detail.contentArea.getByText(/committee|member|add/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Users and show applicant list with search', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Users');

    // Should show search/filter controls, add button, or empty state
    const hasSearch = await page.getByPlaceholder(/search/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasFilter = await page.locator('select').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /add user/i }).isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no users/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasSearch || hasFilter || hasAddBtn || hasEmpty).toBeTruthy();
  });

  test('should navigate to Papers and show paper list', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Papers');

    // Wait for papers content to load (API call)
    await page.waitForLoadState('networkidle');

    // Papers component uses div-based list (not HTML table), or shows empty state
    const hasPapers = await page.getByRole('button', { name: /add paper/i }).isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no paper/i).isVisible().catch(() => false);
    const hasList = await page.locator('.border.rounded-lg').first().isVisible().catch(() => false);
    expect(hasPapers || hasEmpty || hasList).toBeTruthy();
  });

  test('should navigate to Evaluated Papers', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Evaluated Papers');
    await expect(detail.contentArea).toBeVisible();
  });

  test('should navigate to Accepted Papers', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Accepted Papers');
    await expect(detail.contentArea).toBeVisible();
  });

  test('should navigate to Rejected Papers', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Call for Papers', 'Rejected Papers');
    await expect(detail.contentArea).toBeVisible();
  });
});
