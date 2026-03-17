import { Page, expect } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard');
  }

  get heading() { return this.page.getByRole('heading', { name: /welcome/i }); }

  async expectVisible() {
    await expect(this.page).toHaveURL(/dashboard/, { timeout: 10000 });
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }
}
