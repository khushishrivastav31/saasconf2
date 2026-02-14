import { Page, expect } from '@playwright/test';

/**
 * Wait for the loading spinner to disappear.
 */
export async function waitForLoadingToFinish(page: Page, timeout = 15000) {
  const spinner = page.locator('.animate-spin');
  if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(spinner).toBeHidden({ timeout });
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
  if (await chevron.isVisible({ timeout: 2000 }).catch(() => false)) {
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
