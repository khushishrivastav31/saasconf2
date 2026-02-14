import { Page, expect } from '@playwright/test';

export class ConferenceDetailPage {
  constructor(private page: Page) {}

  async goto(conferenceId: string) {
    await this.page.goto(`/modules/conferences/${conferenceId}`);
  }

  get conferenceName() { return this.page.locator('h1'); }
  get statusBadge() { return this.page.locator('.rounded-full').first(); }
  get sidebar() { return this.page.locator('nav').first(); }
  get contentArea() { return this.page.locator('.flex-1.min-w-0'); }

  async navigateToSection(name: string) {
    const btn = this.sidebar.getByRole('button', { name }).first();
    await btn.click();
    await this.page.waitForTimeout(500);
  }

  async expandSection(name: string) {
    const sectionRow = this.sidebar.locator('div').filter({ hasText: name }).first();
    const chevron = sectionRow.locator('button:has(svg)').last();
    if (await chevron.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chevron.click();
      await this.page.waitForTimeout(300);
    }
  }

  async navigateToChildSection(parentName: string, childName: string) {
    await this.expandSection(parentName);
    const childBtn = this.sidebar.getByRole('button', { name: childName });
    await childBtn.click();
    await this.page.waitForTimeout(500);
  }

  async expectLoaded() {
    await expect(this.conferenceName).toBeVisible({ timeout: 15000 });
  }

  async expectContentContains(text: string | RegExp) {
    await expect(this.contentArea).toContainText(text, { timeout: 10000 });
  }
}
