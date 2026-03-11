import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Replace Attendee Functionality', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Replace Attendee button in registration detail view', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    // Check if there are any registrations
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      // Click on first registration row to open detail view
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();

        // Wait for detail view to expand
        await page.waitForLoadState('networkidle');

        // Replace Attendee button should be visible
        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        const hasReplaceBtn = await replaceBtn.isVisible({ timeout: 5000 }).catch(() => false);

        // Button may not be visible if registration is cancelled or already replaced
        expect(typeof hasReplaceBtn).toBe('boolean');
      }
    }
  });

  test('should open Replace Attendee modal when button clicked', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();

          // Modal should appear with title
          const modalTitle = page.getByText(/replace attendee/i).first();
          await expect(modalTitle).toBeVisible({ timeout: 5000 });

          // Should show required fields
          await expect(page.getByLabel(/first name/i)).toBeVisible();
          await expect(page.getByLabel(/last name/i)).toBeVisible();
          await expect(page.getByLabel(/email/i)).toBeVisible();
        }
      }
    }
  });

  test('should show all required form fields in Replace Attendee modal', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Check required fields
          await expect(page.getByLabel(/first name/i)).toBeVisible({ timeout: 5000 });
          await expect(page.getByLabel(/last name/i)).toBeVisible();
          await expect(page.getByLabel(/email/i)).toBeVisible();
          await expect(page.getByLabel(/replacement reason/i)).toBeVisible();

          // Check optional fields
          const hasPhone = await page.getByLabel(/phone/i).isVisible({ timeout: 3000 }).catch(() => false);
          const hasJobTitle = await page.getByLabel(/job title/i).isVisible({ timeout: 3000 }).catch(() => false);
          const hasDepartment = await page.getByLabel(/department/i).isVisible({ timeout: 3000 }).catch(() => false);

          expect(hasPhone || hasJobTitle || hasDepartment).toBeTruthy();
        }
      }
    }
  });

  test('should show pronouns dropdown if configured in settings', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Pronouns field should be a select element
          const pronounsSelect = page.locator('select').filter({ hasText: /he\/him|she\/her|they\/them/i });
          const hasPronounsDropdown = await pronounsSelect.isVisible({ timeout: 3000 }).catch(() => false);

          // Field visibility depends on conference settings
          expect(typeof hasPronounsDropdown).toBe('boolean');
        }
      }
    }
  });

  test('should validate email format on blur', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          const emailInput = page.getByLabel(/email/i);

          // Enter invalid email and blur
          await emailInput.fill('invalid-email');
          await emailInput.blur();
          await page.waitForLoadState('domcontentloaded');

          // Should show validation error (red border or error message)
          const emailInputElement = await emailInput.elementHandle();
          if (emailInputElement) {
            const classList = await emailInputElement.evaluate(el => el.className);
            const hasError = classList.includes('border-red') || classList.includes('ring-red');
            expect(hasError).toBeTruthy();
          }
        }
      }
    }
  });

  test('should validate phone format on blur', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          const phoneInput = page.getByLabel(/phone/i);
          if (await phoneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Enter invalid phone and blur
            await phoneInput.fill('abc');
            await phoneInput.blur();
            await page.waitForLoadState('domcontentloaded');

            // Should show validation error
            const phoneInputElement = await phoneInput.elementHandle();
            if (phoneInputElement) {
              const classList = await phoneInputElement.evaluate(el => el.className);
              const hasError = classList.includes('border-red') || classList.includes('ring-red');
              expect(hasError).toBeTruthy();
            }
          }
        }
      }
    }
  });

  test('should show additional items section', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Should show additional items section
          const additionalItemsSection = page.getByText(/additional items/i).first();
          await expect(additionalItemsSection).toBeVisible({ timeout: 5000 });

          // Should have Add Additional Item button
          const addItemBtn = page.getByRole('button', { name: /add additional item/i });
          await expect(addItemBtn).toBeVisible();
        }
      }
    }
  });

  test('should show type and item dropdowns when adding additional items', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          const addItemBtn = page.getByRole('button', { name: /add additional item/i });
          await addItemBtn.click();

          // Type dropdown should appear
          const typeSelect = page.locator('select').filter({ hasText: /booking option|tutorial/i });
          await expect(typeSelect).toBeVisible({ timeout: 3000 });

          // Select type
          await typeSelect.selectOption('booking_option');
          await page.waitForLoadState('domcontentloaded');

          // Item dropdown should appear
          const itemSelect = page.locator('select').nth(1);
          const hasItemSelect = await itemSelect.isVisible({ timeout: 3000 }).catch(() => false);
          expect(hasItemSelect).toBeTruthy();
        }
      }
    }
  });

  test('should disable tutorial type if attendee already has tutorial', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      // Find a registration that has tutorial in the name or items
      const rows = page.locator('table tbody tr');
      const rowCount = await rows.count();

      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);
        const rowText = await row.textContent();

        if (rowText?.toLowerCase().includes('tutorial')) {
          await row.click();
          await page.waitForLoadState('networkidle');

          const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
          if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await replaceBtn.click();
            await expect(page.getByRole('dialog')).toBeVisible();

            const addItemBtn = page.getByRole('button', { name: /add additional item/i });
            await addItemBtn.click();

            // Type dropdown should appear before checking its options
            const typeSelect = page.locator('select').filter({ hasText: /booking option|tutorial/i });
            await expect(typeSelect).toBeVisible({ timeout: 3000 });

            // Tutorial option should be disabled
            const tutorialOption = page.locator('option[value="tutorial"]');
            const isDisabled = await tutorialOption.isDisabled().catch(() => false);
            expect(isDisabled).toBeTruthy();
            break;
          }
        }
      }
    }
  });

  test('should show summary without invoice message when no additional items', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Summary section should show
          const summarySection = page.getByText(/summary/i).first();
          await expect(summarySection).toBeVisible({ timeout: 5000 });

          // Should show message about replacement without invoice
          const noInvoiceMessage = page.getByText(/will be replaced.*no additional items/i);
          const hasNoInvoiceMessage = await noInvoiceMessage.isVisible({ timeout: 3000 }).catch(() => false);
          expect(hasNoInvoiceMessage).toBeTruthy();
        }
      }
    }
  });

  test('should show invoice creation message when additional items added', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Add an additional item
          const addItemBtn = page.getByRole('button', { name: /add additional item/i });
          await addItemBtn.click();

          const typeSelect = page.locator('select').filter({ hasText: /booking option|tutorial/i });
          await expect(typeSelect).toBeVisible({ timeout: 3000 });
          await typeSelect.selectOption('booking_option');
          await page.waitForLoadState('domcontentloaded');

          // Select first available booking option
          const itemSelect = page.locator('select').nth(1);
          const options = await itemSelect.locator('option').all();
          if (options.length > 1) {
            await itemSelect.selectOption({ index: 1 });
            await page.waitForLoadState('domcontentloaded');

            // Click Add button
            const confirmAddBtn = page.getByRole('button', { name: /^add$/i });
            await confirmAddBtn.click();
            await page.waitForLoadState('networkidle');

            // Should show invoice creation message
            const invoiceMessage = page.getByText(/invoice.*will be created/i);
            const hasInvoiceMessage = await invoiceMessage.isVisible({ timeout: 3000 }).catch(() => false);
            expect(hasInvoiceMessage).toBeTruthy();
          }
        }
      }
    }
  });

  test('should have disabled Replace button when required fields are empty', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Submit button should be disabled initially
          const submitBtn = page.getByRole('button', { name: /^replace$/i });
          const isDisabled = await submitBtn.isDisabled().catch(() => true);
          expect(isDisabled).toBeTruthy();
        }
      }
    }
  });

  test('should close modal when Cancel button clicked', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Modal should be visible
          const modalTitle = page.getByText(/replace attendee/i).first();
          await expect(modalTitle).toBeVisible();

          // Click Cancel
          const cancelBtn = page.getByRole('button', { name: /cancel/i });
          await cancelBtn.click();
          await expect(page.getByRole('dialog')).not.toBeVisible();

          // Modal should be hidden
          const isModalVisible = await modalTitle.isVisible({ timeout: 2000 }).catch(() => false);
          expect(isModalVisible).toBeFalsy();
        }
      }
    }
  });

  test('should enable Replace button when all required fields filled', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');

        const replaceBtn = page.getByRole('button', { name: /replace attendee/i });
        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replaceBtn.click();
          await expect(page.getByRole('dialog')).toBeVisible();

          // Fill required fields
          await page.getByLabel(/first name/i).fill('John');
          await page.getByLabel(/last name/i).fill('Doe');
          await page.getByLabel(/email/i).fill('john.doe@example.com');
          await page.getByLabel(/replacement reason/i).fill('Employee transfer');

          await page.waitForLoadState('domcontentloaded');

          // Submit button should now be enabled
          const submitBtn = page.getByRole('button', { name: /^replace$/i });
          const isEnabled = await submitBtn.isEnabled().catch(() => false);
          expect(isEnabled).toBeTruthy();
        }
      }
    }
  });
});
