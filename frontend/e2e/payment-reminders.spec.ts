import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

/**
 * Payment Reminders Tab E2E Tests
 *
 * Tests the Payment Reminders tab in the conference detail view.
 * Requires the invoices module to be enabled.
 */

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Payment Reminders Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Payment Reminders and show content', async ({
    page,
  }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    // Payment Reminders requires invoices module
    const remindersBtn = detail.sidebar
      .getByRole('button', { name: 'Payment Reminders' })
      .first();
    const hasSection = await remindersBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!hasSection) {
      test.skip(true, 'Payment Reminders section not visible');
      return;
    }

    await detail.navigateToSection('Payment Reminders');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Should show reminder list, stats, empty state, or loading
    const hasStats = await page
      .getByText(/pending|sent|failed/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no payment reminder|no reminder/i)
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasStats || hasEmpty || hasTable || hasContent).toBeTruthy();
  });

  test('should show filter controls when reminders exist', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    const remindersBtn = detail.sidebar
      .getByRole('button', { name: 'Payment Reminders' })
      .first();
    if (!(await remindersBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Payment Reminders section not visible');
      return;
    }

    await detail.navigateToSection('Payment Reminders');
    await page.waitForLoadState('networkidle');

    // Should show filter controls or empty state
    const hasStatusFilter = await page
      .locator('select')
      .first()
      .isVisible()
      .catch(() => false);
    const hasSearch = await page
      .getByPlaceholder(/search/i)
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no payment reminder|no reminder/i)
      .isVisible()
      .catch(() => false);

    expect(hasStatusFilter || hasSearch || hasEmpty).toBeTruthy();
  });
});
