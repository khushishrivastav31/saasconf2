import { Page, expect } from '@playwright/test';

export class ConferencesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/modules/conferences');
  }

  get heading() { return this.page.getByRole('heading', { name: /conferences/i }); }
  get createButton() { return this.page.getByRole('button', { name: /create conference/i }); }
  get statusFilter() { return this.page.locator('select').first(); }

  async expectVisible() {
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  async clickFirstConference() {
    const firstItem = this.page.locator('[class*="cursor-pointer"]').first();
    await firstItem.click();
  }
}
