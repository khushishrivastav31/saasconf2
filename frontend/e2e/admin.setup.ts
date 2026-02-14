import { test } from '@playwright/test';
import { adminLogin } from './fixtures/auth';

test('authenticate as admin', async ({ page }) => {
  await adminLogin(page);
});
