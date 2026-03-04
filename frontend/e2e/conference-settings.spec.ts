import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Settings', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should load Settings tab with sub-tab navigation', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');

    // Should show settings sub-tab buttons
    await expect(page.getByRole('button', { name: /volunteer tasks/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /committee roles/i })).toBeVisible();
  });

  test('should display Volunteer Tasks sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /volunteer tasks/i }).click();
    await page.waitForTimeout(500);

    // Should show role list or create button
    await expect(detail.contentArea.getByText(/volunteer|role/i).first()).toBeVisible();
  });

  test('should navigate to Committee Roles sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /committee roles/i }).click();
    await page.waitForTimeout(500);

    await expect(detail.contentArea.getByText(/committee|role/i).first()).toBeVisible();
  });

  test('should navigate to Session Types sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /session types/i }).click();
    await page.waitForTimeout(500);

    await expect(detail.contentArea.getByText(/session|type/i).first()).toBeVisible();
  });

  test('should navigate to Score Scales sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /score scales/i }).click();
    await page.waitForTimeout(500);

    await expect(detail.contentArea.getByText(/score|scale/i).first()).toBeVisible();
  });

  test('should navigate to Paper Form sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /paper form/i }).click();
    await page.waitForTimeout(500);

    await expect(detail.contentArea.getByText(/form|field|paper/i).first()).toBeVisible();
  });

  test('should navigate to Email Templates sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /email templates/i }).click();
    await page.waitForTimeout(500);

    await expect(detail.contentArea.getByText(/email|template/i).first()).toBeVisible();
  });

  test('should navigate to Currency & Tax sub-tab', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Settings');
    await page.getByRole('button', { name: /currency & tax/i }).click();
    await page.waitForTimeout(500);

    await expect(detail.contentArea.getByText(/currency|tax/i).first()).toBeVisible();
  });
});
