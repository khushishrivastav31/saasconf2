import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import PortalLayout from '../PortalLayout';
import {
  renderWithPortalProviders,
  makeApplicantAuthContext,
  mockPortalMe,
  createTestQueryClient,
} from '../../../test-utils';
import { ApplicantAuthContext } from '../../../contexts/ApplicantAuthContext';

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

describe('PortalLayout — notification bell dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows summary text and a "View all messages" link when unread > 0', async () => {
    const user = userEvent.setup();

    mockPortalApi.get.mockImplementation((url: string) => {
      if (url === '/portal/conferences') return Promise.resolve({ data: [] });
      if (url.startsWith('/portal/tenant/'))
        return Promise.resolve({ data: { name: 'Acme', logo_url: null } });
      if (url === '/portal/messages/unread-count')
        return Promise.resolve({ data: { unread_count: 3 } });
      if (url === '/portal/assigned-papers/pending-count')
        return Promise.resolve({ data: { pending_count: 0 } });
      if (url === '/portal/me/committee-memberships')
        return Promise.resolve({ data: { items: [] } });
      if (url === '/portal/invoices') return Promise.resolve({ data: { items: [], total: 0 } });
      if (url === '/portal/unified/my-trainings') return Promise.resolve({ data: { items: [] } });
      if (url === '/portal/registration-questions/pending')
        return Promise.resolve({
          data: { conferences: [], has_any_mandatory_pending: false },
        });
      return Promise.resolve({ data: null });
    });

    renderWithPortalProviders(<PortalLayout />, {
      route: '/acme/portal/news',
      path: '/:companySlug/portal/*',
    });

    const bell = await screen.findByRole('button', { name: 'Notifications' });
    await user.click(bell);

    await screen.findByText(/you have 3 unread message/i);

    const viewAllLink = screen.getByRole('menuitem', { name: /view all messages/i });
    expect(viewAllLink).toHaveAttribute('href', '/acme/portal/messages');
  });

  it('shows "No new notifications" when unread count is zero', async () => {
    const user = userEvent.setup();

    mockPortalApi.get.mockImplementation((url: string) => {
      if (url === '/portal/conferences') return Promise.resolve({ data: [] });
      if (url.startsWith('/portal/tenant/'))
        return Promise.resolve({ data: { name: 'Acme', logo_url: null } });
      if (url === '/portal/messages/unread-count')
        return Promise.resolve({ data: { unread_count: 0 } });
      if (url === '/portal/assigned-papers/pending-count')
        return Promise.resolve({ data: { pending_count: 0 } });
      if (url === '/portal/me/committee-memberships')
        return Promise.resolve({ data: { items: [] } });
      if (url === '/portal/invoices') return Promise.resolve({ data: { items: [], total: 0 } });
      if (url === '/portal/unified/my-trainings') return Promise.resolve({ data: { items: [] } });
      if (url === '/portal/registration-questions/pending')
        return Promise.resolve({
          data: { conferences: [], has_any_mandatory_pending: false },
        });
      return Promise.resolve({ data: null });
    });

    renderWithPortalProviders(<PortalLayout />, {
      route: '/acme/portal/news',
      path: '/:companySlug/portal/*',
    });

    const bell = await screen.findByRole('button', { name: 'Notifications' });
    await user.click(bell);

    expect(screen.getByText('No new notifications')).toBeInTheDocument();
  });
});

describe('PortalLayout — Registrations sidebar entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApi();
  });

  it('shows the Registrations link when is_conference_attendee is true', async () => {
    const authContext = makeApplicantAuthContext();
    authContext.portalMe = { ...mockPortalMe, is_conference_attendee: true };

    renderWithPortalProviders(<PortalLayout />, {
      authContext,
      route: '/acme/portal/news',
      path: '/:companySlug/portal/*',
    });

    const link = await screen.findByRole('link', { name: /registrations/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/acme/portal/registrations');
  });

  it('hides the Registrations link when is_conference_attendee is false', async () => {
    const authContext = makeApplicantAuthContext();
    authContext.portalMe = { ...mockPortalMe, is_conference_attendee: false };

    renderWithPortalProviders(<PortalLayout />, {
      authContext,
      route: '/acme/portal/news',
      path: '/:companySlug/portal/*',
    });

    // Wait for the layout to settle by checking a known-visible element
    await screen.findByText(/my profile/i);

    expect(screen.queryByRole('link', { name: /registrations/i })).not.toBeInTheDocument();
  });
});

// ── Auth gate redirect-back (MAIN-13342) ──────────────────────────────────────

function LoginCapture() {
  const loc = useLocation();
  const from = (loc.state as { from?: { pathname: string; search: string } } | null)?.from;
  return (
    <div>
      <div data-testid="login-page">login</div>
      {from && <div data-testid="from-pathname">{from.pathname}</div>}
      {from && <div data-testid="from-search">{from.search}</div>}
    </div>
  );
}

describe('PortalLayout — auth gate preserves destination in state.from (MAIN-13342)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPortalApi.get.mockImplementation(() => Promise.resolve({ data: null }));
  });

  it('redirects unauthenticated user to portal login with state.from = requested location', async () => {
    const authContext = makeApplicantAuthContext(null); // not logged in

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ApplicantAuthContext.Provider value={authContext}>
          <MemoryRouter initialEntries={['/acme/portal/messages?thread=abc123']}>
            <Routes>
              <Route path="/:companySlug/portal/user/login" element={<LoginCapture />} />
              <Route path="/:companySlug/portal/*" element={<PortalLayout />} />
            </Routes>
          </MemoryRouter>
        </ApplicantAuthContext.Provider>
      </QueryClientProvider>
    );

    // After the auth-gate Navigate, we should be on the login page
    const loginEl = await screen.findByTestId('login-page');
    expect(loginEl).toBeInTheDocument();

    // state.from must contain the original pathname + search
    expect(screen.getByTestId('from-pathname')).toHaveTextContent('/acme/portal/messages');
    expect(screen.getByTestId('from-search')).toHaveTextContent('?thread=abc123');
  });
});
