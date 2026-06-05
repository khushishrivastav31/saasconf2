import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionTypesTab from '../SessionTypesTab';
import type { Conference } from '../../../../../types';

vi.mock('../../../../../config/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { api, default: api };
});

vi.mock('../../../../../components/Modal', () => ({
  default: ({
    open,
    children,
    title,
    onClose,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal" role="dialog">
        <span>{title}</span>
        <button onClick={onClose}>CloseModal</button>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../../components/common/ModalFooter', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../../components/common/StatusBadge', () => ({
  default: ({ isActive }: { isActive: boolean }) => <span>{isActive ? 'Active' : 'Inactive'}</span>,
}));

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
    conference_id: 'conf-1',
    tenant_id: 'tenant-1',
    name: 'Keynote',
    slug: 'keynote',
    duration_minutes: 45,
    cfp_eligible: true,
    separately_bookable: false,
    max_attendees: null,
    is_active: true,
    user_role_id: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'st-2',
    conference_id: 'conf-1',
    tenant_id: 'tenant-1',
    name: 'Workshop',
    slug: 'workshop',
    duration_minutes: 120,
    cfp_eligible: false,
    separately_bookable: true,
    max_attendees: 30,
    is_active: true,
    user_role_id: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const sampleSessionType = SESSION_TYPES[0];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('SessionTypesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('user-roles')) {
        return Promise.resolve({ data: { items: [], total: 0 } });
      }
      if (url.includes('session-types')) {
        return Promise.resolve({ data: { items: SESSION_TYPES, total: SESSION_TYPES.length } });
      }
      return Promise.resolve({ data: { items: [], total: 0 } });
    });
  });

  describe('loading state', () => {
    it('renders a loading spinner while fetching', () => {
      mockedApi.get.mockImplementation(() => new Promise(() => {}));

      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url.includes('user-roles')) return Promise.resolve({ data: { items: [], total: 0 } });
        if (url.includes('session-types'))
          return Promise.resolve({ data: { items: [], total: 0 } });
        return Promise.resolve({ data: { items: [], total: 0 } });
      });
    });

    it('shows the section heading when data loads', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Session Types')).toBeInTheDocument();
      });
    });

    it('shows the Add button for admins', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add session type/i })).toBeInTheDocument();
      });
    });
  });

  describe('list view', () => {
    it('renders existing session types', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Keynote')).toBeInTheDocument();
      });
      expect(screen.getByText('Workshop')).toBeInTheDocument();
    });

    it('renders the slug column', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('keynote')).toBeInTheDocument();
      });
    });

    it('renders the duration column', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('45 min')).toBeInTheDocument();
      });
      expect(screen.getByText('120 min')).toBeInTheDocument();
    });

    it('shows edit and delete buttons for each row when admin', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => screen.getByText('Keynote'));
      expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(SESSION_TYPES.length);
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(SESSION_TYPES.length);
    });

    it('does not show Add button when isAdmin is false', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={false} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => screen.getByText('Keynote'));
      expect(screen.queryByRole('button', { name: /add session type/i })).toBeNull();
    });
  });

  describe('create flow', () => {
    it('opens the create modal when the Add button is clicked', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add session type/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add session type/i }));

      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    it('modal is accessible via dialog role', async () => {
      const user = userEvent.setup();
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => screen.getByRole('button', { name: /add session type/i }));
      await user.click(screen.getByRole('button', { name: /add session type/i }));

      await waitFor(() => screen.getByRole('dialog'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('edit flow', () => {
    it('opens the edit modal when the edit button is clicked', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText(sampleSessionType.name)).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      const modal = screen.getByTestId('modal');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('delete flow', () => {
    it('shows a confirm dialog when the delete button is clicked', async () => {
      render(<SessionTypesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText(sampleSessionType.name)).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
  });
});
