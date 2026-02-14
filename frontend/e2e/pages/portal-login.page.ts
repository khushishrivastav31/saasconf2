import { Page, expect } from '@playwright/test';

export class PortalLoginPage {
  private tenantSlug: string;

  constructor(private page: Page, tenantSlug?: string) {
    this.tenantSlug = tenantSlug || process.env.E2E_TENANT_SLUG || 'demo';
  }

  async goto() {
    await this.page.goto(`/${this.tenantSlug}/portal/user/login`);
  }

  async gotoRegister() {
    await this.page.goto(`/${this.tenantSlug}/portal/user/register`);
  }

  get emailInput() { return this.page.getByLabel(/email/i); }
  get passwordInput() { return this.page.getByLabel(/password/i); }
  get signInButton() { return this.page.getByRole('button', { name: /sign in/i }); }
  get registerLink() { return this.page.getByRole('link', { name: /register|sign up|create account/i }); }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async expectVisible() {
    await expect(this.emailInput).toBeVisible({ timeout: 10000 });
    await expect(this.signInButton).toBeVisible();
  }
}
