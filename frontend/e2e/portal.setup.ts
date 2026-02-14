import { test } from '@playwright/test';
import { portalLogin } from './fixtures/auth';

test('authenticate as portal applicant', async ({ page }) => {
  if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
    test.skip();
  }
  await portalLogin(page);
});
