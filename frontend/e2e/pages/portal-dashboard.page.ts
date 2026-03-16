import { Page, expect } from '@playwright/test';

export class PortalDashboardPage {
  private tenantSlug: string;

  constructor(private page: Page, tenantSlug?: string) {
    this.tenantSlug = tenantSlug || process.env.E2E_TENANT_SLUG || 'demo';
  }

  async goto() {
    await this.page.goto(`/${this.tenantSlug}/portal/dashboard`);
  }

  async gotoSubmitPaper() {
    await this.page.goto(`/${this.tenantSlug}/portal/papers/new`);
  }

  async gotoProfile() {
    await this.page.goto(`/${this.tenantSlug}/portal/profile`);
  }

  async gotoMessages() {
    await this.page.goto(`/${this.tenantSlug}/portal/messages`);
  }

  async gotoInvitations() {
    await this.page.goto(`/${this.tenantSlug}/portal/invitations`);
  }

  async gotoInvoices() {
    await this.page.goto(`/${this.tenantSlug}/portal/invoices`);
  }

  async expectVisible() {
    await expect(this.page).toHaveURL(/portal\/dashboard/, { timeout: 10000 });
  }
}
