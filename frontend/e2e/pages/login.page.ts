import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  get emailInput() { return this.page.getByPlaceholder(/email/i); }
  get passwordInput() { return this.page.getByPlaceholder(/password/i); }
  get signInButton() { return this.page.getByRole('button', { name: /sign in/i }); }
  get heading() { return this.page.getByRole('heading', { name: /saasconf/i }); }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async expectVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.signInButton).toBeVisible();
  }
}
