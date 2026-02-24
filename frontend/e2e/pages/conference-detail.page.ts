import { Page, expect } from '@playwright/test';

export class ConferenceDetailPage {
  constructor(private page: Page) {}

  async goto(conferenceId: string) {
    await this.page.goto(`/modules/conferences/${conferenceId}`);
  }

  get conferenceName() { return this.page.locator('h1.text-2xl'); }
  get statusBadge() { return this.page.locator('.rounded-full').first(); }
  get sidebar() { return this.page.locator('nav.flex-shrink-0'); }
  get contentArea() { return this.page.locator('.flex-1.min-w-0').first(); }

  async navigateToSection(name: string) {
    const btn = this.sidebar.getByRole('button', { name }).first();
    await btn.click();
    await this.page.waitForTimeout(500);
  }

  async expandSection(name: string) {
    // Find the named section button, then go to its parent container
    // which holds both the section button and its chevron toggle
    const sectionBtn = this.sidebar.getByRole('button', { name }).first();
    const container = sectionBtn.locator('xpath=..');
    const buttons = container.locator('button');
    const count = await buttons.count();
    if (count > 1) {
      // The last button in the container is the chevron/expand toggle
      await buttons.last().click();
      await this.page.waitForTimeout(300);
    }
  }

  async navigateToChildSection(parentName: string, childName: string) {
    await this.expandSection(parentName);
    const childBtn = this.sidebar.getByRole('button', { name: childName, exact: true });
    await childBtn.waitFor({ state: 'visible', timeout: 5000 });
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
