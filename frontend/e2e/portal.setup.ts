import { test } from '@playwright/test';
import { portalLogin } from './fixtures/auth';

test('authenticate as portal applicant', async ({ page }) => {
  await portalLogin(page);
});
