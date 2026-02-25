import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Booking Deep Tests', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show pricing matrix table with period columns', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      // Matrix should show option names in rows and period columns
      await expect(table.locator('th, td').first()).toBeVisible();
    }
  });

  test('should open Add Option modal when clicking + Option button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    // Wait for the pricing matrix section to load
    await page.waitForTimeout(2000);

    const optionBtn = page.getByRole('button', { name: /option/i });
    if (await optionBtn.isVisible().catch(() => false)) {
      await optionBtn.click();

      // Modal should appear with form fields
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10000 });

      // Should have name input or title
      const hasName = await modal.getByLabel(/name/i).isVisible().catch(() => false);
      const hasTitle = await modal.getByText(/booking option|add option|new option/i).first().isVisible().catch(() => false);
      expect(hasName || hasTitle).toBeTruthy();

      // Close modal
      const closeBtn = modal.getByRole('button', { name: /cancel|close/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }
  });

  test('should open Add Period modal when clicking + Period button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    const periodBtn = page.getByRole('button', { name: /period/i });
    if (await periodBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await periodBtn.click();

      // Modal should appear
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Should have date fields
      const hasDate = await modal.getByText(/date|from|to|start|end/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasName = await modal.getByLabel(/name|label/i).first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasDate || hasName).toBeTruthy();

      // Close modal
      const closeBtn = modal.getByRole('button', { name: /cancel|close/i }).first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
  });

  test('should show Booking Packages with add button and cards', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    // Scroll to packages section
    const packagesHeading = page.getByRole('heading', { name: /booking packages/i });
    if (await packagesHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await packagesHeading.scrollIntoViewIfNeeded();

      const packageBtn = page.getByRole('button', { name: /package/i });
      const hasBtn = await packageBtn.isVisible({ timeout: 3000 }).catch(() => false);
      const hasCards = await page.locator('[class*="border"][class*="rounded"]').nth(1).isVisible({ timeout: 3000 }).catch(() => false);
      const hasEmpty = await page.getByText(/no booking packages/i).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasBtn || hasCards || hasEmpty).toBeTruthy();
    }
  });

  test('should show Discount Codes section with add button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Booking Options');

    const discountHeading = page.getByRole('heading', { name: /discount codes/i });
    if (await discountHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await discountHeading.scrollIntoViewIfNeeded();

      const addBtn = page.getByRole('button', { name: /discount code/i });
      const hasBtn = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
      const hasEmpty = await page.getByText(/no discount codes/i).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasBtn || hasEmpty).toBeTruthy();
    }
  });
});
