import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import PortalLayout from '../PortalLayout';
import { renderWithPortalProviders } from '../../../test-utils';

// Mock portalApi — the layout fires ~8 GETs at mount; we route them by URL
// here and only customize ``/portal/unified/my-trainings`` per test. Everything
// else gets a benign default so the layout reaches the sidebar render.
vi.mock('../../../config/portalApi', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../../components/portal/ScreenOverlayDisplay', () => ({
  default: () => null,
}));
vi.mock('../../../components/portal/RegistrationQuestionnaire', () => ({
  default: () => null,
}));
// ThemeToggle uses ThemeContext via useTheme(); irrelevant to this test.
vi.mock('../../../components/ThemeToggle', () => ({
  default: () => null,
}));
// ConferenceLogo fetches via the real api instance; not under test.
vi.mock('../../../components/ConferenceLogo', () => ({
  default: () => null,
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

interface ApiHandlers {
  trainings?: {
    items: Array<{
      id: number;
      start_date?: string | null;
      status?: string;
    }>;
  };
}

function setupApi({ trainings = { items: [] } }: ApiHandlers = {}) {
  mockPortalApi.get.mockImplementation((url: string) => {
    // Layout-level reads — return whatever shape the consumer expects.
    if (url === '/portal/conferences') return Promise.resolve({ data: [] });
    if (url.startsWith('/portal/tenant/'))
      return Promise.resolve({ data: { name: 'Acme', logo_url: null } });
    if (url === '/portal/messages/unread-count')
      return Promise.resolve({ data: { unread_count: 0 } });
    if (url === '/portal/assigned-papers/pending-count')
      return Promise.resolve({ data: { pending_count: 0 } });
    if (url === '/portal/me/committee-memberships') return Promise.resolve({ data: { items: [] } });
    if (url === '/portal/invoices') return Promise.resolve({ data: { items: [], total: 0 } });
    if (url === '/portal/unified/my-trainings') return Promise.resolve({ data: trainings });
    if (url === '/portal/registration-questions/pending')
      return Promise.resolve({ data: { conferences: [], has_any_mandatory_pending: false } });
    return Promise.resolve({ data: null });
  });
}

function renderLayout() {
  return renderWithPortalProviders(<PortalLayout />, {
    route: '/acme/portal/news',
    path: '/:companySlug/portal/*',
  });
}

describe('PortalLayout — Trainings sidebar entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The endpoint contract is `{items: [...]}` — see
  // backend/app/core/portal_training_listing.py and the assertions in
  // backend/tests/trainings/test_portal_my_trainings_offers.py. The OLD
  // sidebar checked ``data.length`` directly which silently never matched
  // an object; this test locks the contract so we don't regress.
  it('renders the My Trainings link when the user has at least one training', async () => {
    setupApi({ trainings: { items: [{ id: 1 }] } });

    renderLayout();

    const link = await screen.findByRole('link', { name: /my trainings/i });
    expect(link).toBeInTheDocument();
    // Must point at the in-portal route, not the retired
    // /trainings/portal/dashboard subtree.
    expect(link).toHaveAttribute('href', '/acme/portal/trainings');
  });

  it('hides the Trainings section when items is an empty array', async () => {
    setupApi({ trainings: { items: [] } });

    renderLayout();

    // Wait for one of the always-rendered sections so we know the layout
    // has finished mounting.
    await screen.findByText(/my profile/i);

    expect(screen.queryByRole('link', { name: /my trainings/i })).not.toBeInTheDocument();
    // The whole "TRAININGS" section heading should also be absent.
    expect(screen.queryByText(/^trainings$/i)).not.toBeInTheDocument();
  });

  // "Active" badge = upcoming (start_date >= today) AND not cancelled. The
  // sidebar render at PortalLayout.tsx:643 only paints the badge span when
  // the count is > 0 — same affordance as Assigned Papers's
  // ``pendingAssignments``. Items with no start_date are ignored
  // (we can't tell if they're upcoming).
  it('shows an active-trainings badge counting only upcoming, non-cancelled items', async () => {
    const today = new Date();
    const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    setupApi({
      trainings: {
        items: [
          { id: 1, start_date: future, status: 'paid' }, // counts
          { id: 2, start_date: future, status: 'registered' }, // counts
          { id: 3, start_date: future, status: 'cancelled' }, // excluded — cancelled
          { id: 4, start_date: past, status: 'completed' }, // excluded — past
          { id: 5, start_date: null, status: 'paid' }, // excluded — no date
        ],
      },
    });

    renderLayout();

    const link = await screen.findByRole('link', { name: /my trainings/i });
    expect(link).toBeInTheDocument();
    // The badge text "2" lives in a sibling <span> next to the name. The
    // accessible name of the link concatenates them as "My Trainings2"
    // (no whitespace). Asserting on the link's textContent is the cleanest
    // way to require both pieces.
    expect(link.textContent).toContain('My Trainings');
    expect(link.textContent).toMatch(/2/);
  });

  it('does not paint a badge when no trainings are upcoming', async () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    setupApi({
      trainings: {
        items: [
          { id: 1, start_date: past, status: 'completed' },
          { id: 2, start_date: past, status: 'paid' },
        ],
      },
    });

    renderLayout();

    const link = await screen.findByRole('link', { name: /my trainings/i });
    // Link is visible (hasTrainings is still true), but no count.
    expect(link).toBeInTheDocument();
    expect(link.textContent).toContain('My Trainings');
    // The badge span is gated by ``(item.badge ?? 0) > 0`` in
    // PortalLayout.tsx:643, so when activeTrainingsCount is 0 the link's
    // textContent is just the label — no digits.
    expect(link.textContent).not.toMatch(/\d/);
  });
});
