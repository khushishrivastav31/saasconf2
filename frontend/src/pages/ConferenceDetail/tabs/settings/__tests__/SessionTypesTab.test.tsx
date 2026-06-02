import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConferenceSessionTypesTab from '../SessionTypesTab';
import type { Conference } from '../../../../../types';

vi.mock('../../../../../config/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { api, default: api };
});

import { api } from '../../../../../config/api';
const mockedApi = vi.mocked(api);

const mockConference: Conference = {
  id: 'conf-1',
  name: 'Test Conference',
  abbreviation: 'TC',
  tenant_id: 'tenant-1',
  tenant_slug: 'demo',
  status: 'active',
  currency: 'EUR',
  invoice_currency: null,
  country: 'DE',
  city: null,
  state: null,
  postal_code: null,
  start_date: null,
  end_date: null,
  timezone: null,
  description: null,
  website: null,
  support_email: null,
  contact_email: null,
  phone: null,
  venue_name: null,
  venue_address: null,
  venue_type: 'in_person',
  venue_url: null,
  virtual_platform_url: null,
  logo_url: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
} as unknown as Conference;

const SESSION_TYPES = [
  {
    id: 'st-1',
    name: 'Keynote',
    slug: 'keynote',
    duration_minutes: 45,
    cfp_eligible: true,
    separately_bookable: false,
    max_attendees: null,
    is_active: true,
    user_role_id: null,
    conference_id: 'conf-1',
  },
  {
    id: 'st-2',
    name: 'Workshop',
    slug: 'workshop',
    duration_minutes: 120,
    cfp_eligible: false,
    separately_bookable: true,
    max_attendees: 30,
    is_active: true,
    user_role_id: null,
    conference_id: 'conf-1',
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url.includes('user-roles')) return Promise.resolve({ data: { items: [], total: 0 } });
    if (url.includes('session-types'))
      return Promise.resolve({ data: { items: SESSION_TYPES, total: 2 } });
    return Promise.resolve({ data: { items: [], total: 0 } });
  });
});

describe('ConferenceSessionTypesTab', () => {
  it('renders the section header and Add button for admin', async () => {
    render(<ConferenceSessionTypesTab conference={mockConference} isAdmin />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Session Types'));
    expect(
      screen.getByText('Define the types of sessions available for the conference')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add session type/i })).toBeInTheDocument();
  });

  it('renders a row for each session type', async () => {
    render(<ConferenceSessionTypesTab conference={mockConference} isAdmin />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Keynote'));
    expect(screen.getByText('Workshop')).toBeInTheDocument();
  });

  it('shows duration and CFP-eligible badge per row', async () => {
    render(<ConferenceSessionTypesTab conference={mockConference} isAdmin />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('45 min'));
    expect(screen.getByText('120 min')).toBeInTheDocument();
    // cfp_eligible=true → "Yes" badge; false → "No"
    const yesBadges = screen.getAllByText('Yes');
    expect(yesBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows edit and delete buttons for admin', async () => {
    render(<ConferenceSessionTypesTab conference={mockConference} isAdmin />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Keynote'));
    const editBtns = screen.getAllByRole('button', { name: /edit/i });
    const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
    expect(editBtns.length).toBe(SESSION_TYPES.length);
    expect(deleteBtns.length).toBe(SESSION_TYPES.length);
  });

  it('does not show Add button when isAdmin is false', async () => {
    render(<ConferenceSessionTypesTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Keynote'));
    expect(screen.queryByRole('button', { name: /add session type/i })).toBeNull();
  });

  it('opens the Add modal when Add Session Type is clicked', async () => {
    const user = userEvent.setup();
    render(<ConferenceSessionTypesTab conference={mockConference} isAdmin />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByRole('button', { name: /add session type/i }));
    await user.click(screen.getByRole('button', { name: /add session type/i }));

    await waitFor(() => screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
