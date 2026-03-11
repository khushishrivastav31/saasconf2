import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

/**
 * Invoice Management E2E Tests
 *
 * Tests the Invoices tab in the conference detail view.
 * Requires the invoices module to be enabled.
 */

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Invoice Management', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Invoices tab and show invoice list or empty state', async ({
    page,
  }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    // Invoices requires the invoices module — skip if not visible
    const invoicesBtn = detail.sidebar
      .getByRole('button', { name: 'Invoices' })
      .first();
    const hasInvoicesSection = await invoicesBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!hasInvoicesSection) {
      test.skip(true, 'Invoices module not enabled');
      return;
    }

    await detail.navigateToSection('Invoices');
    await page.waitForLoadState('networkidle');

    // Should show invoice list, empty state, or search controls
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasList = await page
      .locator('.border.rounded-lg')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no invoice/i)
      .isVisible()
      .catch(() => false);
    const hasSearch = await page
      .getByPlaceholder(/search/i)
      .isVisible()
      .catch(() => false);

    expect(hasTable || hasList || hasEmpty || hasSearch).toBeTruthy();
  });

  test('should show invoice filter controls', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    const invoicesBtn = detail.sidebar
      .getByRole('button', { name: 'Invoices' })
      .first();
    if (!(await invoicesBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Invoices module not enabled');
      return;
    }

    await detail.navigateToSection('Invoices');
    await page.waitForLoadState('networkidle');

    // Should show status filter dropdown or search
    const hasStatusFilter = await page
      .locator('select')
      .first()
      .isVisible()
      .catch(() => false);
    const hasSearch = await page
      .getByPlaceholder(/search/i)
      .isVisible()
      .catch(() => false);
    const hasFilterButtons = await page
      .getByRole('button', { name: /all|draft|sent|paid/i })
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasStatusFilter || hasSearch || hasFilterButtons).toBeTruthy();
  });

  test('should open invoice detail panel when clicking an invoice', async ({
    page,
  }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    const invoicesBtn = detail.sidebar
      .getByRole('button', { name: 'Invoices' })
      .first();
    if (!(await invoicesBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Invoices module not enabled');
      return;
    }

    await detail.navigateToSection('Invoices');
    await page.waitForLoadState('networkidle');

    // Find the first clickable invoice row
    const firstInvoiceRow = page
      .locator('tr[class*="cursor"], div[class*="cursor"]')
      .first();
    const hasInvoice = await firstInvoiceRow
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasInvoice) {
      test.skip(true, 'No invoices to click');
      return;
    }

    await firstInvoiceRow.click();

    // Detail panel should open showing invoice details
    const hasPanel = await page
      .getByText(/invoice details|line items|recipient|INV-/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasPanel).toBeTruthy();
  });

  test('should show invoice status badges', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    const invoicesBtn = detail.sidebar
      .getByRole('button', { name: 'Invoices' })
      .first();
    if (!(await invoicesBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Invoices module not enabled');
      return;
    }

    await detail.navigateToSection('Invoices');
    await page.waitForLoadState('networkidle');

    // Check for status badges (Draft, Sent, Paid, Cancelled, Overdue)
    const hasStatusBadge = await page
      .getByText(/draft|sent|paid|cancelled|overdue/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no invoice/i)
      .isVisible()
      .catch(() => false);

    // Either invoices with status or empty state
    expect(hasStatusBadge || hasEmpty).toBeTruthy();
  });
});
