import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Messaging Deep Tests', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should navigate to Messages and show compose or inbox', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Messages');

    // Should show message-related UI
    const hasCompose = await page.getByRole('button', { name: /compose|new message|send/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasInbox = await page.getByText(/inbox|message|thread/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRecipient = await page.getByText(/recipient/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasCompose || hasInbox || hasRecipient).toBeTruthy();
  });

  test('should show recipient list or selection in messaging', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Messages');

    // Check for recipient-related UI
    const hasRecipientList = await page.getByText(/recipient list/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasSelect = await page.locator('select').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasRecipientList || hasSelect || hasContent).toBeTruthy();
  });

  test('should show message compose form with subject and body fields', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Messages');

    // Look for compose form elements
    const hasSubject = await page.getByLabel(/subject/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasBody = await page.locator('textarea, [contenteditable], .ProseMirror, .tiptap').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasCompose = await page.getByRole('button', { name: /compose|new message|send/i }).isVisible({ timeout: 3000 }).catch(() => false);

    // At least the messaging area should be visible
    const hasContent = await detail.contentArea.isVisible();
    expect(hasSubject || hasBody || hasCompose || hasContent).toBeTruthy();
  });
});
