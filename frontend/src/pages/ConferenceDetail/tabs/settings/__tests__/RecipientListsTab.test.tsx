import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipientListsTab from '../RecipientListsTab';
import type { Conference } from '../../../../../types';

vi.mock('../../../../../config/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { api, default: api };
});

import { api } from '../../../../../config/api';
const mockedApi = vi.mocked(api);

const mockConference: Conference = {
  id: 'conf-1',
  name: 'Test',
  abbreviation: 'T',
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

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const baseRoutes = (overrides: Record<string, unknown> = {}) => {
  mockedApi.get.mockImplementation((url: string) => {
    if (url.endsWith('/messaging/recipient-lists')) {
      return Promise.resolve({
        data: overrides.lists ?? { items: [], total: 0 },
      });
    }
    if (url.endsWith('/messaging/dynamic-lists')) {
      return Promise.resolve({
        data: overrides.dynamicLists ?? { items: [], total: 0 },
      });
    }
    if (url.includes('/messaging/recipient-lists/')) {
      return Promise.resolve({
        data: overrides.detail ?? { id: 'list-1', name: 'L1', description: '', members: [] },
      });
    }
    if (url.includes('/cfp/applicants')) {
      return Promise.resolve({
        data: { items: overrides.applicants ?? [] },
      });
    }
    if (
      url.includes('/booking/options') ||
      url.includes('/program/sessions') ||
      url.includes('/sponsor-packages')
    ) {
      return Promise.resolve({ data: { items: [] } });
    }
    return Promise.resolve({ data: { items: [] } });
  });
  mockedApi.post.mockResolvedValue({ data: {} });
  mockedApi.put.mockResolvedValue({ data: {} });
  mockedApi.delete.mockResolvedValue({ data: {} });
};

describe('RecipientListsTab — characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseRoutes();
  });

  it('renders both section headings (static + dynamic)', async () => {
    render(<RecipientListsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });
    expect(await screen.findByText('Recipient Lists')).toBeInTheDocument();
    expect(screen.getByText('Dynamic Lists')).toBeInTheDocument();
  });

  it('hides Create buttons when isAdmin=false', async () => {
    render(<RecipientListsTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });
    await screen.findByText('Recipient Lists');
    expect(screen.queryByRole('button', { name: /^Create List$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Create Dynamic List$/ })).not.toBeInTheDocument();
  });

  it('opens the create-list modal when "Create List" is clicked and fetches applicants', async () => {
    const user = userEvent.setup();
    baseRoutes({
      applicants: [{ id: 'a1', first_name: 'Alice', last_name: 'A', email: 'a@x.com' }],
    });
    render(<RecipientListsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });
    await screen.findByText('Recipient Lists');
    await user.click(screen.getByRole('button', { name: /^Create List$/ }));
    // Applicants endpoint is fetched only when modal opens
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/cfp/applicants');
    });
  });

  it('renders existing lists from the API', async () => {
    baseRoutes({
      lists: {
        items: [
          {
            id: 'list-1',
            name: 'My Reviewers',
            description: 'Senior reviewers',
            member_count: 5,
            updated_at: '2026-04-01',
          },
        ],
        total: 1,
      },
    });
    render(<RecipientListsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });
    expect(await screen.findByText('My Reviewers')).toBeInTheDocument();
    expect(screen.getByText('Senior reviewers')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders existing dynamic lists with target-type pill and recipient count', async () => {
    baseRoutes({
      dynamicLists: {
        items: [
          {
            id: 'dl-1',
            name: 'All Sponsors',
            description: 'Auto-resolved',
            target_type: 'sponsor',
            recipient_count: 12,
            filters: {},
          },
        ],
        total: 1,
      },
    });
    render(<RecipientListsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });
    expect(await screen.findByText('All Sponsors')).toBeInTheDocument();
    expect(screen.getByText('Sponsor')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('two-step delete (confirm flow) calls DELETE only after Confirm', async () => {
    const user = userEvent.setup();
    baseRoutes({
      lists: {
        items: [
          { id: 'list-1', name: 'L', description: '', member_count: 0, updated_at: '2026-04-01' },
        ],
        total: 1,
      },
    });
    render(<RecipientListsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });
    await screen.findByText('L');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // No DELETE call yet
    expect(mockedApi.delete).not.toHaveBeenCalled();
    // After clicking Confirm, the DELETE fires
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(mockedApi.delete).toHaveBeenCalledWith(
        expect.stringContaining('/messaging/recipient-lists/list-1')
      );
    });
  });
});
