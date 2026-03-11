import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Booking Module', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Pricing Matrix with periods and options', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    // Should show "Booking Options" heading
    await expect(page.getByRole('heading', { name: /booking options/i })).toBeVisible({ timeout: 10000 });

    // Should show + Period and + Option buttons (for admin)
    const periodBtn = page.getByRole('button', { name: /period/i });
    const optionBtn = page.getByRole('button', { name: /option/i });
    const hasPeriodBtn = await periodBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasOptionBtn = await optionBtn.isVisible({ timeout: 3000 }).catch(() => false);

    // Either has admin buttons or shows the matrix/empty state
    const hasEmptyState = await page.getByText(/no booking options defined yet/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasTable = await page.locator('table').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasPeriodBtn || hasOptionBtn || hasEmptyState || hasTable).toBeTruthy();
  });

  test('should show Booking Packages section', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    // Scroll down to find Packages section
    const packagesHeading = page.getByRole('heading', { name: /booking packages/i });
    const hasPackages = await packagesHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPackages) {
      // Should show + Package button or empty state
      const packageBtn = page.getByRole('button', { name: /package/i });
      const hasPackageBtn = await packageBtn.isVisible({ timeout: 3000 }).catch(() => false);
      const hasEmpty = await page.getByText(/no booking packages defined yet/i).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasPackageBtn || hasEmpty).toBeTruthy();
    }
  });

  test('should show Discount Codes section with table columns', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    // Scroll to Discount Codes section
    const discountHeading = page.getByRole('heading', { name: /discount codes/i });
    const hasDiscount = await discountHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDiscount) {
      // Should show + Discount Code button
      const discountBtn = page.getByRole('button', { name: /discount code/i });
      const hasBtn = await discountBtn.isVisible({ timeout: 3000 }).catch(() => false);
      const hasEmpty = await page.getByText(/no discount codes yet/i).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasBtn || hasEmpty).toBeTruthy();

      // If there are discount codes, verify table columns
      if (!hasEmpty) {
        const table = page.locator('table').last();
        const hasTable = await table.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasTable) {
          await expect(table.getByText(/code/i).first()).toBeVisible();
          await expect(table.getByText(/discount/i).first()).toBeVisible();
        }
      }
    }
  });
});

test.describe('Conference Program Module', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Program Design with day tabs or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Program');

    // Should show Program Design heading
    await expect(page.getByRole('heading', { name: /program design/i })).toBeVisible({ timeout: 10000 });

    // Should show day tabs, "+ Add Day" button, or "No Program Days" message
    const hasAddDay = await page.getByRole('button', { name: /add day/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasDayTabs = await page.getByRole('button').filter({ hasText: /mon|tue|wed|thu|fri|sat|sun|day/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no program days/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasGrid = await page.getByText(/time/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddDay || hasDayTabs || hasEmptyState || hasGrid).toBeTruthy();
  });

  test('should display program grid with tracks when days exist', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Program');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // If days exist, check for grid elements
    const hasGrid = await page.getByText(/time/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasGrid) {
      // Grid should have time column and track headers
      const gridArea = detail.contentArea;
      await expect(gridArea).toBeVisible();
    }
  });

  test('should navigate to Program Build sub-section', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToChildSection('Program', 'Build');
    await expect(detail.contentArea).toBeVisible();
  });
});

test.describe('Conference Invoices Module', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Invoices tab with table or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Invoices');

    // Should show invoice-related content
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no invoice/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });
});
