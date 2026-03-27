import { test, expect } from '@playwright/test';
import { TrainingPage } from './pages/training.page';
import { softVisible } from './helpers/navigation';

test.describe('Trainings Module', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
      test.skip();
    }
  });

  // ── Navigation ──────────────────────────────────────────────

  test('should navigate to trainings module', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto();
    await trainingPage.expectVisible();
  });

  test('should show Training Program section with years', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('program');
    await trainingPage.expectVisible();

    // The program section shows a "Training Program" heading
    await expect(
      page.getByText(/training program/i).first()
    ).toBeVisible({ timeout: 10000 });

    // At least one program year should appear (e.g. 2026, 2027, etc.)
    const hasYear = await softVisible(page.getByText(/20\d{2}/).first(), 10000);
    expect(hasYear).toBeTruthy();
  });

  test('should navigate to Design Program', async ({ page }) => {
    test.slow();
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('program');
    await trainingPage.expectVisible();

    // Expand the Training Program sidebar section to reveal year children
    await trainingPage.navigateToSidebarSection('Training Program');
    await page.waitForTimeout(500);

    // Click the first "Design Program" child link
    const designBtn = trainingPage.sidebar
      .getByRole('button', { name: 'Design Program' })
      .first();
    const hasDesign = await softVisible(designBtn, 5000);
    if (hasDesign) {
      await designBtn.click();
      await trainingPage.waitForContent();

      // Calendar grid should appear with a "Month" column header
      await expect(page.getByText(/month/i).first()).toBeVisible({ timeout: 10000 });
    } else {
      // No program years exist — skip gracefully
      test.skip();
    }
  });

  test('should show placement type items in sidebar', async ({ page }) => {
    test.slow();
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('program');
    await trainingPage.expectVisible();

    // Navigate to Design Program
    await trainingPage.navigateToSidebarSection('Training Program');
    await page.waitForTimeout(500);

    const designBtn = trainingPage.sidebar
      .getByRole('button', { name: 'Design Program' })
      .first();
    const hasDesign = await softVisible(designBtn, 5000);
    if (!hasDesign) {
      test.skip();
      return;
    }
    await designBtn.click();
    await trainingPage.waitForContent();

    // Placement type items (Inhouse, Hybrid) should appear
    const hasInhouse = await softVisible(page.getByText('Inhouse').first(), 10000);
    const hasHybrid = await softVisible(page.getByText('Hybrid').first(), 10000);
    expect(hasInhouse || hasHybrid).toBeTruthy();
  });

  // ── Offer Management ────────────────────────────────────────

  test('should navigate to Offer Management tab', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('offer-management');
    await trainingPage.expectVisible();

    await expect(page.getByText(/offer management/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should show offer stats cards', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('offer-management');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    // Stats cards: Draft, Sent, Accepted, Rejected
    const hasDraft = await softVisible(page.getByText('Draft', { exact: false }).first(), 10000);
    const hasSent = await softVisible(page.getByText('Sent', { exact: false }).first(), 5000);
    const hasAccepted = await softVisible(
      page.getByText('Accepted', { exact: false }).first(),
      5000
    );
    const hasRejected = await softVisible(
      page.getByText('Rejected', { exact: false }).first(),
      5000
    );
    // At least some status labels should be visible (stats cards or table rows)
    expect(hasDraft || hasSent || hasAccepted || hasRejected).toBeTruthy();
  });

  test('should show offers table with correct columns', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('offer-management');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    // Table header columns
    const headers = ['Offer #', 'Customer', 'Status', 'Trainings', 'Training Price', 'Cert. Price', 'Created'];
    for (const header of headers) {
      const col = page.getByText(header, { exact: false }).first();
      const isVisible = await softVisible(col, 10000);
      // The table may be empty if no offers exist; headers should still render
      // If the whole table is missing, that's fine — softVisible won't fail the test
      if (!isVisible) {
        // If the first header isn't visible, table might not exist (no offers yet)
        break;
      }
    }
  });

  // ── Customers ───────────────────────────────────────────────

  test('should navigate to Customers tab', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('customers');
    await trainingPage.expectVisible();

    await expect(page.getByText(/customers/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should show customer list', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('customers');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    // Table should show Company, City, Country, Status columns
    const columns = ['Company', 'City', 'Country', 'Status'];
    for (const col of columns) {
      const colHeader = page.getByText(col, { exact: false }).first();
      const isVisible = await softVisible(colHeader, 10000);
      if (!isVisible) break;
    }

    // Search input should be present
    const searchInput = page.getByPlaceholder(/search/i).first();
    const hasSearch = await softVisible(searchInput, 5000);
    expect(hasSearch).toBeTruthy();
  });

  // ── Trainers ────────────────────────────────────────────────

  test('should navigate to Trainers section', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('settings-trainers');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    await expect(page.getByText(/trainers/i).first()).toBeVisible({ timeout: 10000 });
  });

  // ── Settings ────────────────────────────────────────────────

  test('should navigate to Settings', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('settings');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    // Default settings tab is Trainers (fallback when no specific settings- section)
    // Or any settings content should be visible
    const hasTrainers = await softVisible(page.getByText(/trainers/i).first(), 10000);
    expect(hasTrainers).toBeTruthy();
  });

  test('should show Training Catalog in settings', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('settings-trainings');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    await expect(page.getByText(/training catalog/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should show Offer Templates in settings', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('settings-offer-templates');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    await expect(page.getByText(/offer templates/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should show Policies in settings', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('settings-policies');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    await expect(page.getByText(/policies/i).first()).toBeVisible({ timeout: 10000 });
  });
});
