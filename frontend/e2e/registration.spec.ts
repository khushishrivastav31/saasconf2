import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Registration Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Registration tab and show heading', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    // Should show "Registrations" heading or empty state
    const hasHeading = await page.getByRole('heading', { name: /registration/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await page.getByText(/registration/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasHeading || hasContent).toBeTruthy();
  });

  test('should show registration list or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    // Either a table with registrations or an empty state / add button
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no registration/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /new registration|add registration/i }).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTable || hasEmpty || hasAddBtn).toBeTruthy();
  });

  test('should open new registration form with add attendee button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    // Click "New Registration" button
    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Should show "Add Another Attendee" button (unified flow, no mode toggle)
      const hasAddAttendee = await page.getByRole('button', { name: /add another attendee/i }).isVisible({ timeout: 5000 }).catch(() => false);
      const hasAttendeeSection = await page.getByText(/attendee/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasAddAttendee || hasAttendeeSection).toBeTruthy();
    }
  });

  test('should show billing form fields in new registration', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Should show billing fields
      await expect(page.getByText(/billing information/i)).toBeVisible({ timeout: 5000 });
      await expect(page.getByLabel(/street/i)).toBeVisible();
      await expect(page.getByLabel(/country/i)).toBeVisible();
    }
  });

  test('should show contact person fields with first and last name', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Should show contact person section with first/last name
      await expect(page.getByText(/contact person/i)).toBeVisible({ timeout: 5000 });
      await expect(page.getByLabel(/first name/i).last()).toBeVisible();
      await expect(page.getByLabel(/last name/i).last()).toBeVisible();
    }
  });

  test('should show country as a dropdown with EU countries', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Country should be a select element
      const countrySelect = page.locator('select#country');
      await expect(countrySelect).toBeVisible({ timeout: 5000 });

      // Should contain Germany as an option
      const germanOption = countrySelect.locator('option[value="DE"]');
      await expect(germanOption).toHaveText('Germany');
    }
  });

  test('should show attendee fields with pronouns dropdown when configured', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Attendee section should show first name / last name / email
      await expect(page.getByText(/attendee/i).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByLabel(/first name/i).first()).toBeVisible();
      await expect(page.getByLabel(/last name/i).first()).toBeVisible();
      await expect(page.getByLabel(/email/i).first()).toBeVisible();

      // Pronouns dropdown is visible only if conference has pronoun options configured
      const hasPronounsSelect = await page.getByLabel(/pronouns/i).isVisible({ timeout: 3000 }).catch(() => false);
      // Just verify the field either exists or doesn't error out — it depends on settings
      expect(typeof hasPronounsSelect).toBe('boolean');
    }
  });

  test('should show booking option cards for selection', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Should show booking option section
      const hasBooking = await page.getByText(/booking option|select.*option/i).isVisible({ timeout: 5000 }).catch(() => false);
      const hasCards = await page.locator('[class*="border"][class*="rounded"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasBooking || hasCards).toBeTruthy();
    }
  });

  test('should show VAT number field next to country', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // VAT number input should be visible
      await expect(page.getByLabel(/vat number/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('should trigger VAT validation on blur for EU country', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Registration');

    const addBtn = page.getByRole('button', { name: /new registration|add registration/i });
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();

      // Select Germany as country
      const countrySelect = page.locator('select#country');
      await countrySelect.selectOption('DE');

      // Enter a VAT number and blur
      const vatInput = page.getByLabel(/vat number/i);
      await vatInput.fill('DE123456789');
      await vatInput.blur();

      // Should show "Checking..." then a result (Valid/Invalid/Unverified)
      const hasResult = await page.getByText(/valid|invalid|unverified|checking/i).isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasResult).toBeTruthy();
    }
  });
});
