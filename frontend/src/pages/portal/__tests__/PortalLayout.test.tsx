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
  trainings?: { items: Array<{ id: number }> };
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
});
