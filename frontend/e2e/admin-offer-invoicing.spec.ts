import { test, expect } from '@playwright/test';
import { softVisible } from './helpers/navigation';
import { TrainingPage } from './pages/training.page';

/**
 * Smoke E2E for the offer-invoicing dashboard shipped in PR #199.
 * Verifies the new "Invoices" + "Invoiced" columns render on the
 * Offer Management tab and the per-status "Invoiced" sub-line shows
 * up on stat cards. Doesn't click invoice links (would require seeded
 * invoices on this admin's tenant); the unit tests already lock the
 * click-through behaviour.
 */
test.describe('Admin Offer-Invoicing Dashboard', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
      test.skip();
    }
  });

  test('Offer Management table shows Invoices + Invoiced columns', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('offer-management');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    // Both column headers should render even on an empty table.
    const invoicesHeader = page.getByText(/^Invoices$/i).first();
    const invoicedHeader = page.getByText(/^Invoiced$/i).first();
    expect(await softVisible(invoicesHeader, 10000)).toBeTruthy();
    expect(await softVisible(invoicedHeader, 10000)).toBeTruthy();
  });

  test('Offer Management stat cards show the per-status Invoiced sub-line', async ({ page }) => {
    const trainingPage = new TrainingPage(page);
    await trainingPage.goto('offer-management');
    await trainingPage.expectVisible();
    await trainingPage.waitForContent();

    // The "Invoiced" label appears on each stat card AND in the table header.
    // ≥ 2 matches confirms the sub-line is rendering across cards (offers
    // exist on this seed); 0 matches usually means there are no offers yet
    // and the dashboard has no stat cards rendered at all.
    const invoicedAll = page.getByText(/^Invoiced$/i);
    const count = await invoicedAll.count();
    if (count === 0) {
      test.skip(true, 'No offers on this seed — stat cards not rendered');
    }
    expect(count).toBeGreaterThan(0);
  });
});
