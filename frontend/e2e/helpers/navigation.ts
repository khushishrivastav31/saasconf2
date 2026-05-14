import { Locator, Page, expect } from '@playwright/test';

/**
 * Wait for a locator to become visible, then return true.
 * Returns false if the element doesn't appear within the timeout.
 *
 * Unlike `locator.isVisible({ timeout })` (which checks instantly and ignores
 * the timeout), this properly polls via Playwright's `expect` assertions.
 */
export async function softVisible(locator: Locator, timeout = 5000): Promise<boolean> {
  try {
    await expect(locator).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for the loading spinner to disappear.
 *
 * Some pages render multiple `.animate-spin` elements (e.g. a section spinner
 * plus a button spinner), so we wait for the count to reach zero rather than
 * asserting a single locator is hidden — the latter trips Playwright's strict
 * mode when more than one match exists.
 */
export async function waitForLoadingToFinish(page: Page, timeout = 15000) {
  const spinner = page.locator('.animate-spin');
  if (await softVisible(spinner.first(), 2000)) {
    await expect(spinner).toHaveCount(0, { timeout });
  }
}

/**
 * Navigate to a conference detail section by clicking the sidebar button.
 */
export async function navigateToSection(page: Page, sectionName: string) {
  const sidebar = page.locator('nav').first();
  const btn = sidebar.getByRole('button', { name: sectionName }).first();
  await btn.click();
  await page.waitForTimeout(500);
}

/**
 * Expand a parent section's children in the conference sidebar.
 */
export async function expandSection(page: Page, sectionName: string) {
  const sidebar = page.locator('nav').first();
  // Find the section row, then click its chevron button
  const sectionRow = sidebar.locator('div').filter({ hasText: sectionName }).first();
  const chevron = sectionRow.locator('button:has(svg[class*="transition-transform"])');
  if (await softVisible(chevron, 2000)) {
    await chevron.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Navigate to a child section under a parent (e.g. "Topics" under "Call for Papers").
 */
export async function navigateToChildSection(page: Page, parentName: string, childName: string) {
  await expandSection(page, parentName);
  const sidebar = page.locator('nav').first();
  const childBtn = sidebar.getByRole('button', { name: childName });
  await childBtn.click();
  await page.waitForTimeout(500);
}

/**
 * Navigate to a settings sub-tab within the conference Settings section.
 */
export async function navigateToSettingsSubTab(page: Page, subTabLabel: string) {
  await navigateToSection(page, 'Settings');
  await page.waitForTimeout(300);
  const subTab = page.getByRole('button', { name: subTabLabel });
  await subTab.click();
  await page.waitForTimeout(500);
}
