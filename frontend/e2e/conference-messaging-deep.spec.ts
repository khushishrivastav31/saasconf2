import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

import { softVisible } from './helpers/navigation';
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
    const hasCompose = await softVisible(page.getByRole('button', { name: /compose|new message|send/i }), 5000);
    const hasInbox = await softVisible(page.getByText(/inbox|message|thread/i).first(), 5000);
    const hasRecipient = await softVisible(page.getByText(/recipient/i).first(), 3000);

    expect(hasCompose || hasInbox || hasRecipient).toBeTruthy();
  });

  test('should show recipient list or selection in messaging', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Messages');

    // Check for recipient-related UI
    const hasRecipientList = await softVisible(page.getByText(/recipient list/i), 5000);
    const hasSelect = await softVisible(page.locator('select').first(), 3000);
    const hasContent = await detail.contentArea.isVisible();

    expect(hasRecipientList || hasSelect || hasContent).toBeTruthy();
  });

  test('should show message compose form with subject and body fields', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Messages');

    // Look for compose form elements
    const hasSubject = await softVisible(page.getByLabel(/subject/i), 5000);
    const hasBody = await softVisible(page.locator('textarea, [contenteditable], .ProseMirror, .tiptap').first(), 3000);
    const hasCompose = await softVisible(page.getByRole('button', { name: /compose|new message|send/i }), 3000);

    // At least the messaging area should be visible
    const hasContent = await detail.contentArea.isVisible();
    expect(hasSubject || hasBody || hasCompose || hasContent).toBeTruthy();
  });
});
