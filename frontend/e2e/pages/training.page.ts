import { Page, expect } from '@playwright/test';
import { waitForLoadingToFinish } from '../helpers/navigation';

export class TrainingPage {
  constructor(private page: Page) {}

  async goto(section?: string) {
    const url = section
      ? `/modules/trainings?section=${section}`
      : '/modules/trainings';
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await waitForLoadingToFinish(this.page);
  }

  get heading() {
    return this.page.getByRole('heading', { name: /training management/i });
  }

  get sidebar() {
    return this.page.locator('nav').first();
  }

  get contentArea() {
    return this.page.locator('.flex-1.min-w-0').first();
  }

  async expectVisible() {
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }

  async waitForContent() {
    await waitForLoadingToFinish(this.page);
    // Wait for any Suspense fallback spinner to disappear
    await this.contentArea
      .locator('.animate-spin')
      .waitFor({ state: 'hidden', timeout: 10000 })
      .catch(() => {});
  }

  async navigateToSidebarSection(sectionName: string) {
    const btn = this.sidebar.getByRole('button', { name: sectionName }).first();
    await btn.click();
    await this.page.waitForTimeout(500);
    await this.waitForContent();
  }

  async expandSidebarSection(sectionName: string) {
    const sectionBtn = this.sidebar.getByRole('button', { name: sectionName }).first();
    const container = sectionBtn.locator('xpath=..');
    const buttons = container.locator('button');
    const count = await buttons.count();
    if (count > 1) {
      await buttons.last().click();
      await this.page.waitForTimeout(300);
    }
  }

  async navigateToChildSection(parentName: string, childName: string) {
    await this.expandSidebarSection(parentName);
    const childBtn = this.sidebar.getByRole('button', { name: childName });
    await childBtn.waitFor({ state: 'visible', timeout: 5000 });
    await childBtn.click();
    await this.page.waitForTimeout(500);
    await this.waitForContent();
  }

  async expectContentContains(text: string | RegExp) {
    await expect(this.contentArea).toContainText(text, { timeout: 15000 });
  }
}
