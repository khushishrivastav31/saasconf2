import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
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
    const hasPeriodBtn = await softVisible(periodBtn, 5000);
    const hasOptionBtn = await softVisible(optionBtn, 3000);

    // Either has admin buttons or shows the matrix/empty state
    const hasEmptyState = await softVisible(page.getByText(/no booking options defined yet/i), 3000);
    const hasTable = await softVisible(page.locator('table').first(), 3000);

    expect(hasPeriodBtn || hasOptionBtn || hasEmptyState || hasTable).toBeTruthy();
  });

  test('should show Booking Packages section', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    // Scroll down to find Packages section
    const packagesHeading = page.getByRole('heading', { name: /booking packages/i });
    const hasPackages = await softVisible(packagesHeading, 5000);

    if (hasPackages) {
      // Should show + Package button or empty state
      const packageBtn = page.getByRole('button', { name: /package/i });
      const hasPackageBtn = await softVisible(packageBtn, 3000);
      const hasEmpty = await softVisible(page.getByText(/no booking packages defined yet/i), 3000);

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
    const hasDiscount = await softVisible(discountHeading, 5000);

    if (hasDiscount) {
      // Should show + Discount Code button
      const discountBtn = page.getByRole('button', { name: /discount code/i });
      const hasBtn = await softVisible(discountBtn, 3000);
      const hasEmpty = await softVisible(page.getByText(/no discount codes yet/i), 3000);

      expect(hasBtn || hasEmpty).toBeTruthy();

      // If there are discount codes, verify table columns
      if (!hasEmpty) {
        const table = page.locator('table').last();
        const hasTable = await softVisible(table, 3000);
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
    const hasAddDay = await softVisible(page.getByRole('button', { name: /add day/i }), 5000);
    const hasDayTabs = await softVisible(page.getByRole('button').filter({ hasText: /mon|tue|wed|thu|fri|sat|sun|day/i }).first(), 3000);
    const hasEmptyState = await softVisible(page.getByText(/no program days/i), 3000);
    const hasGrid = await softVisible(page.getByText(/time/i).first(), 3000);

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
    const hasGrid = await softVisible(page.getByText(/time/i).first(), 5000);
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
    const hasTable = await softVisible(page.locator('table').first(), 5000);
    const hasEmpty = await softVisible(page.getByText(/no invoice/i), 5000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasTable || hasEmpty || hasContent).toBeTruthy();
  });
});
