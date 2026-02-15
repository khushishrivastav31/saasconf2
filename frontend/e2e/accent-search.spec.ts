import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './fixtures/auth';

const conferenceId = process.env.E2E_CONFERENCE_ID;
const API_BASE = process.env.E2E_API_URL || 'http://localhost:8000';

test.describe('Accent-insensitive search', () => {
  let token: string;
  let sponsorId: string | null = null;

  const SPONSOR_NAME = 'E2E Café François Müller';
  const SPONSOR_CITY = 'München';

  test.beforeAll(async ({ browser }) => {
    if (!conferenceId) return;

    // Load admin storage state to get the access token
    const context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
    const page = await context.newPage();
    await page.goto('/');
    token = await page.evaluate(() => localStorage.getItem('access_token') || '');
    await page.close();
    await context.close();

    if (!token) return;

    // Create a test sponsor with accented characters
    const res = await fetch(`${API_BASE}/api/v1/conferences/${conferenceId}/sponsors`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: SPONSOR_NAME, city: SPONSOR_CITY }),
    });

    if (res.ok) {
      const data = await res.json();
      sponsorId = data.id;
    }
  });

  test.afterAll(async () => {
    if (!sponsorId || !token) return;

    await fetch(`${API_BASE}/api/v1/conferences/${conferenceId}/sponsors/${sponsorId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test.beforeEach(async () => {
    if (!conferenceId) test.skip(true, 'E2E_CONFERENCE_ID not set');
    if (!token) test.skip(true, 'No admin token available');
    if (!sponsorId) test.skip(true, 'Test sponsor not created');
  });

  test('should find accented sponsor name with unaccented search', async () => {
    // Search "cafe" should match "Café"
    const res = await fetch(
      `${API_BASE}/api/v1/conferences/${conferenceId}/sponsors?search=cafe`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    const found = data.items.some((s: { id: string }) => s.id === sponsorId);
    expect(found).toBeTruthy();
  });

  test('should find accented city with unaccented search', async () => {
    // Search "munchen" should match "München"
    const res = await fetch(
      `${API_BASE}/api/v1/conferences/${conferenceId}/sponsors?search=munchen`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    const found = data.items.some((s: { id: string }) => s.id === sponsorId);
    expect(found).toBeTruthy();
  });

  test('should find sponsor with accented search term', async () => {
    // Search "München" with accent should also work
    const res = await fetch(
      `${API_BASE}/api/v1/conferences/${conferenceId}/sponsors?search=${encodeURIComponent('München')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    const found = data.items.some((s: { id: string }) => s.id === sponsorId);
    expect(found).toBeTruthy();
  });

  test('should find sponsor with partial unaccented name', async () => {
    // Search "francois muller" should match "François Müller"
    const res = await fetch(
      `${API_BASE}/api/v1/conferences/${conferenceId}/sponsors?search=${encodeURIComponent('francois muller')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    const found = data.items.some((s: { id: string }) => s.id === sponsorId);
    expect(found).toBeTruthy();
  });
});
