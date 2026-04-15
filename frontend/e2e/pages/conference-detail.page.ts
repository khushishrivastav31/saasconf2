import { Page, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from '../fixtures/auth';

export class ConferenceDetailPage {
  constructor(private page: Page) {}

  async goto(conferenceId: string) {
    const targetUrl = `/modules/conferences/${conferenceId}`;
    await this.page.goto(targetUrl);

    // Race: either the conference page loads or React redirects to /login (token expired)
    const isLogin = await Promise.race([
      this.conferenceName
        .waitFor({ state: 'visible', timeout: 20000 })
        .then(() => false),
      this.page
        .getByPlaceholder(/email/i)
        .waitFor({ state: 'visible', timeout: 20000 })
        .then(() => true),
    ]).catch(() => false);

    if (isLogin) {
      await this.reAuthenticate();
      await this.page.goto(targetUrl);
    }
  }

  private async reAuthenticate() {
    const email = process.env.E2E_ADMIN_EMAIL!;
    const password = process.env.E2E_ADMIN_PASSWORD!;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.getByPlaceholder(/email/i).fill(email);
        await this.page.getByPlaceholder(/password/i).fill(password);
        await this.page.getByRole('button', { name: /sign in/i }).click();
        await expect(this.page).toHaveURL(/dashboard|conferences/i, { timeout: 30000 });
        await this.page.waitForFunction(
          () => !!localStorage.getItem('access_token'),
          { timeout: 15000 },
        );
        await this.page.context().storageState({ path: ADMIN_STORAGE_STATE });
        return;
      } catch (err) {
        if (attempt === 3) throw err;
        await this.page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
      }
    }
  }

  get conferenceName() { return this.page.locator('h1.text-2xl'); }
  get statusBadge() { return this.page.locator('.rounded-full').first(); }
  get sidebar() { return this.page.locator('nav.shrink-0'); }
  get contentArea() { return this.page.locator('.flex-1.min-w-0').first(); }

  async navigateToSection(name: string, waitForContent = false) {
    const btn = this.sidebar.getByRole('button', { name }).first();
    await btn.click();
    await this.page.waitForTimeout(500);
    if (waitForContent) {
      await this.waitForContentLoaded();
    }
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

  async waitForContentLoaded(timeout = 15000) {
    // Wait for any loading spinner in the content area to disappear
    await this.contentArea.locator('[role="status"]').waitFor({ state: 'hidden', timeout }).catch(() => {});
    // Also wait for Suspense fallback spinner to disappear
    await this.contentArea.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async expectLoaded() {
    await expect(this.conferenceName).toBeVisible({ timeout: 15000 });
  }

  async expectContentContains(text: string | RegExp) {
    await expect(this.contentArea).toContainText(text, { timeout: 10000 });
  }
}
