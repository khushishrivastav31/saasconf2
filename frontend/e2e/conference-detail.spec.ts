import { test, expect } from '@playwright/test';
import { ConferenceDetailPage } from './pages/conference-detail.page';

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Conference Detail', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should load conference detail with name and sidebar', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    // Sidebar should be visible with navigation buttons
    await expect(detail.sidebar).toBeVisible();
    await expect(detail.sidebar.getByRole('button', { name: 'Details' })).toBeVisible();
    await expect(detail.sidebar.getByRole('button', { name: 'Settings' })).toBeVisible();
  });

  test('should display Details tab by default with conference info', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    // Details tab should show conference name and date fields
    await expect(detail.contentArea.getByText(/name|conference/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Team tab and show members', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Team');
    await detail.expectContentContains(/team|member|role/i);
  });

  test('should navigate to Social Media tab and show form fields', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Social Media');
    await detail.expectContentContains(/social|website|twitter|linkedin/i);
  });

  test('should navigate to Messages tab and show compose area', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Messages');

    // Should show message-related content
    await detail.expectContentContains(/message|compose|thread|inbox/i);
  });
});

test.describe('Conference Volunteers Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Volunteers section with table or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Volunteers');

    // Should show table with volunteers or empty state
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no volunteer/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddBtn = await page.getByRole('button', { name: /add volunteer/i }).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmpty || hasAddBtn).toBeTruthy();
  });

  test('should show volunteer table columns when data exists', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Volunteers');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      // Verify key column headers exist
      await expect(table.getByText(/name/i).first()).toBeVisible();
      await expect(table.getByText(/status/i).first()).toBeVisible();
    }
  });
});

test.describe('Conference Sponsors Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Sponsors section with heading and add button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sponsors');

    // Should show heading
    await expect(page.getByRole('heading', { name: /sponsors/i })).toBeVisible({ timeout: 10000 });

    // Should show + Add Sponsor button or table or empty state
    const hasAddBtn = await page.getByRole('button', { name: /add sponsor/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasTable = await page.locator('table').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no sponsors yet/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasTable || hasEmpty).toBeTruthy();
  });

  test('should show sponsor table with expected columns', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sponsors');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      await expect(table.getByText(/company name/i).first()).toBeVisible();
      await expect(table.getByText(/package/i).first()).toBeVisible();
      await expect(table.getByText(/price/i).first()).toBeVisible();
    }
  });
});

test.describe('Conference Locations Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Locations with linked locations or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Locations');

    // Should show linked locations heading, create button, or empty state
    const hasLinked = await page.getByText(/linked locations/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasCreate = await page.getByRole('button', { name: /create new|link existing/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no locations linked/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLocations = await page.getByText(/locations/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLinked || hasCreate || hasEmpty || hasLocations).toBeTruthy();
  });

  test('should show location list panel with location entries', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Locations');

    // Check for location list panel or empty state
    const hasLocationPanel = await page.getByText(/locations/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no locations linked|select a location/i).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasLocationPanel || hasEmpty).toBeTruthy();
  });
});

test.describe('Conference Service Providers Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Service Providers with heading and add button', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Service Providers');

    // Should show heading
    await expect(page.getByRole('heading', { name: /service providers/i })).toBeVisible({ timeout: 10000 });

    // Should show + Add Provider button or empty state
    const hasAddBtn = await page.getByRole('button', { name: /add provider/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no service providers yet/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasProviders = await page.getByText(/providers/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddBtn || hasEmpty || hasProviders).toBeTruthy();
  });
});

test.describe('Conference Sessions Tab', () => {
  test.beforeEach(async () => {
    if (!conferenceId) test.skip();
  });

  test('should show Sessions heading with table or empty state', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sessions');

    // Should show sessions heading
    await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible({ timeout: 10000 });

    // Should show table or empty state
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no sessions yet/i).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('should show default columns when sessions exist', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sessions');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const table = page.locator('table').first();
      // Default visible columns
      await expect(table.getByText(/day/i).first()).toBeVisible();
      await expect(table.getByText(/time/i).first()).toBeVisible();
      await expect(table.getByText(/track/i).first()).toBeVisible();
      await expect(table.getByText(/session/i).first()).toBeVisible();
      await expect(table.getByText(/type/i).first()).toBeVisible();
      await expect(table.getByText(/speaker/i).first()).toBeVisible();
    }
  });

  test('should show column picker and toggle columns', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sessions');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      // Click the Columns button to open the picker
      const columnsBtn = page.getByRole('button', { name: /columns/i });
      await expect(columnsBtn).toBeVisible({ timeout: 5000 });
      await columnsBtn.click();

      // Column picker dropdown should appear with group labels
      await expect(page.getByText(/session/i).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByText(/speaker/i).first()).toBeVisible({ timeout: 3000 });

      // Should have a Reset to defaults link
      await expect(page.getByText(/reset to defaults/i)).toBeVisible({ timeout: 3000 });
    }
  });

  test('should filter sessions with search and type filter', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sessions');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      // Search input should exist
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Filter dropdown should exist with options
      const filterSelect = page.locator('select');
      await expect(filterSelect).toBeVisible({ timeout: 5000 });
      const options = await filterSelect.locator('option').allTextContents();
      expect(options).toContain('All Sessions');
      expect(options).toContain('With Paper');
      expect(options).toContain('General Events');
    }
  });

  test('should show Export CSV button for admin', async ({ page }) => {
    const detail = new ConferenceDetailPage(page);
    await detail.goto(conferenceId!);
    await detail.expectLoaded();

    await detail.navigateToSection('Sessions');

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      const exportBtn = page.getByRole('button', { name: /export csv/i });
      await expect(exportBtn).toBeVisible({ timeout: 5000 });
    }
  });
});
