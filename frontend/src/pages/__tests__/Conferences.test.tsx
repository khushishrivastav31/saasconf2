import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Conferences from '../Conferences';
import type { User } from '../../types';

// Mock react-router
const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock useAuth hook (used transitively by useIsTenantAdmin)
let mockUser: User | null = null;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

// Mock the ConferenceLogo component to avoid blob fetch side effects
vi.mock('../../components/ConferenceLogo', () => ({
  default: ({ alt }: { alt?: string }) => (
    <img src="mock-logo.png" alt={alt ?? 'Conference logo'} />
  ),
}));

// Mock the CreateConferenceModal component
vi.mock('../../components/CreateConferenceModal', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="create-conference-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

// Mock api module
vi.mock('../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../../config/api';

const mockedApi = vi.mocked(api);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function renderWithProviders(queryClient?: QueryClient) {
  const client = queryClient ?? createQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Conferences />
    </QueryClientProvider>
  );
}

const mockConferences = [
  {
    id: 'conf-1',
    tenant_id: 'tenant-1',
    tenant_slug: 'acme',
    name: 'React Summit 2026',
    abbreviation: 'RS26',
    description: 'A React conference',
    website: 'https://reactsummit.com',
    logo_url: '/logos/react-summit.png',
    support_email: null,
    contact_email: null,
    start_date: '2026-06-15',
    end_date: '2026-06-17',
    venue_name: 'Convention Center',
    venue_address: null,
    city: 'Amsterdam',
    country: 'Netherlands',
    timezone: null,
    locale: null,
    venue_type: 'onsite' as const,
    virtual_platform_url: null,
    social_links: {},
    team_members: [],
    settings: {},
    currency: null,
    invoice_currency: null,
    is_active: true,
    is_published: true,
    program_published_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    managers_count: 2,
    team_count: 5,
    status: 'upcoming' as const,
  },
  {
    id: 'conf-2',
    tenant_id: 'tenant-1',
    tenant_slug: 'acme',
    name: 'VueConf US',
    abbreviation: null,
    description: null,
    website: null,
    logo_url: null,
    support_email: null,
    contact_email: null,
    start_date: '2026-09-10',
    end_date: '2026-09-10',
    venue_name: null,
    venue_address: null,
    city: null,
    country: null,
    timezone: null,
    locale: null,
    venue_type: 'virtual' as const,
    virtual_platform_url: 'https://vue.example.com',
    social_links: {},
    team_members: [],
    settings: {},
    currency: null,
    invoice_currency: null,
    is_active: true,
    is_published: false,
    program_published_at: null,
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
    managers_count: 0,
    team_count: 3,
    status: 'ongoing' as const,
  },
];

const mockStats = {
  total: 2,
  active: 2,
  published: 1,
  upcoming: 1,
  ongoing: 1,
  past: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUser = {
      id: 'user-1',
      email: 'admin@example.com',
      first_name: 'Admin',
      last_name: 'User',
      pronouns: null,
      role: 'tenant_admin',
      tenant_id: 'tenant-1',
      tenant_name: 'Test Tenant',
      modules: ['conferences'],
      is_active: true,
      is_tenant_super_user: false,
      message_notifications_enabled: false,
      last_login: null,
      created_at: '2024-01-01T00:00:00Z',
    };
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders a loading spinner while data is being fetched', () => {
      // Make api.get return a never-resolving promise to keep loading state
      mockedApi.get.mockReturnValue(new Promise(() => {}));

      renderWithProviders();

      // The spinner is an animated div; there should be no conference cards
      // and no empty-state message
      expect(screen.queryByText('No conferences')).not.toBeInTheDocument();
      expect(screen.queryByText('React Summit 2026')).not.toBeInTheDocument();
      // The spinner element uses the animate-spin class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Rendering conference list
  // -------------------------------------------------------------------------

  describe('conference list', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url.startsWith('/conferences/stats')) {
          return Promise.resolve({ data: mockStats });
        }
        if (url.startsWith('/conferences')) {
          return Promise.resolve({
            data: {
              items: mockConferences,
              total: 2,
              page: 1,
              page_size: 20,
              pages: 1,
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });
    });

    it('renders conference names', async () => {
      renderWithProviders();

      expect(await screen.findByText('React Summit 2026')).toBeInTheDocument();
      expect(screen.getByText('VueConf US')).toBeInTheDocument();
    });

    it('renders conference abbreviation when present', async () => {
      renderWithProviders();

      expect(await screen.findByText('RS26')).toBeInTheDocument();
    });

    it('renders conference status badges', async () => {
      renderWithProviders();

      expect(await screen.findByText('upcoming')).toBeInTheDocument();
      expect(screen.getByText('ongoing')).toBeInTheDocument();
    });

    it('renders location info when city and country are present', async () => {
      renderWithProviders();

      expect(await screen.findByText('Amsterdam, Netherlands')).toBeInTheDocument();
    });

    it('renders team member count', async () => {
      renderWithProviders();

      expect(await screen.findByText('5 team members')).toBeInTheDocument();
      expect(screen.getByText('3 team members')).toBeInTheDocument();
    });

    it('renders manager count when greater than zero', async () => {
      renderWithProviders();

      expect(await screen.findByText('(2 managers)')).toBeInTheDocument();
    });

    it('renders Published badge for published conferences', async () => {
      renderWithProviders();

      expect(await screen.findByText('Published')).toBeInTheDocument();
    });

    it('renders Draft badge for unpublished conferences', async () => {
      renderWithProviders();

      expect(await screen.findByText('Draft')).toBeInTheDocument();
    });

    it('renders stats cards', async () => {
      renderWithProviders();

      // Wait for data to load
      await screen.findByText('React Summit 2026');

      // Stats should be visible — use getAllByText since filter dropdown has duplicate labels
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getAllByText('Upcoming').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Ongoing').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Past').length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url.startsWith('/conferences/stats')) {
          return Promise.resolve({
            data: { total: 0, active: 0, published: 0, upcoming: 0, ongoing: 0, past: 0 },
          });
        }
        if (url.startsWith('/conferences')) {
          return Promise.resolve({
            data: {
              items: [],
              total: 0,
              page: 1,
              page_size: 20,
              pages: 0,
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });
    });

    it('renders empty state message when there are no conferences', async () => {
      renderWithProviders();

      expect(await screen.findByText('No conferences')).toBeInTheDocument();
      expect(
        screen.getByText('Get started by creating your first conference.')
      ).toBeInTheDocument();
    });

    it('renders a create button in empty state for tenant admins', async () => {
      renderWithProviders();

      await screen.findByText('No conferences');

      // There should be two "Create Conference" buttons: header and empty state
      const createButtons = screen.getAllByText('Create Conference');
      expect(createButtons.length).toBe(2);
    });

    it('does not render a create button in empty state for regular users', async () => {
      mockUser = {
        ...mockUser!,
        role: 'user',
      };

      renderWithProviders();

      await screen.findByText('No conferences');

      // Regular users should see no create button at all
      expect(screen.queryByText('Create Conference')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Navigation on click
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url.startsWith('/conferences/stats')) {
          return Promise.resolve({ data: mockStats });
        }
        if (url.startsWith('/conferences')) {
          return Promise.resolve({
            data: {
              items: mockConferences,
              total: 2,
              page: 1,
              page_size: 20,
              pages: 1,
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });
    });

    it('navigates to conference detail when a conference card is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders();

      const card = await screen.findByText('React Summit 2026');
      // Click the card (the clickable div wraps the content)
      await user.click(card);

      expect(mockNavigate).toHaveBeenCalledWith('/modules/conferences/conf-1');
    });

    it('navigates to the correct conference when another card is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders();

      const card = await screen.findByText('VueConf US');
      await user.click(card);

      expect(mockNavigate).toHaveBeenCalledWith('/modules/conferences/conf-2');
    });
  });

  // -------------------------------------------------------------------------
  // Create conference button (admin visibility)
  // -------------------------------------------------------------------------

  describe('create conference button', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url.startsWith('/conferences/stats')) {
          return Promise.resolve({ data: mockStats });
        }
        if (url.startsWith('/conferences')) {
          return Promise.resolve({
            data: {
              items: mockConferences,
              total: 2,
              page: 1,
              page_size: 20,
              pages: 1,
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });
    });

    it('shows the create conference button for tenant admins', async () => {
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      // The header "Create Conference" button
      const buttons = screen.getAllByRole('button');
      const createButton = buttons.find((btn) => btn.textContent?.includes('Create Conference'));
      expect(createButton).toBeDefined();
    });

    it('hides the create conference button for regular users', async () => {
      mockUser = {
        ...mockUser!,
        role: 'user',
      };

      renderWithProviders();

      await screen.findByText('React Summit 2026');

      expect(screen.queryByText('Create Conference')).not.toBeInTheDocument();
    });

    it('hides the create conference button for super admins (read-only)', async () => {
      mockUser = {
        ...mockUser!,
        role: 'super_admin',
      };

      renderWithProviders();

      await screen.findByText('React Summit 2026');

      expect(screen.queryByText('Create Conference')).not.toBeInTheDocument();
    });

    it('opens the create conference modal when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      const createButton = screen.getByRole('button', {
        name: /Create Conference/,
      });
      await user.click(createButton);

      expect(screen.getByTestId('create-conference-modal')).toBeInTheDocument();
    });

    it('closes the create conference modal when close is triggered', async () => {
      const user = userEvent.setup();
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      // Open modal
      const createButton = screen.getByRole('button', {
        name: /Create Conference/,
      });
      await user.click(createButton);

      expect(screen.getByTestId('create-conference-modal')).toBeInTheDocument();

      // Close modal
      await user.click(screen.getByText('Close Modal'));

      expect(screen.queryByTestId('create-conference-modal')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Page header
  // -------------------------------------------------------------------------

  describe('page header', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation(() =>
        Promise.resolve({ data: { items: [], total: 0, page: 1, page_size: 20, pages: 0 } })
      );
    });

    it('renders the page title', async () => {
      renderWithProviders();

      expect(screen.getByRole('heading', { name: 'Conferences' })).toBeInTheDocument();
    });

    it('renders the page description', async () => {
      renderWithProviders();

      expect(screen.getByText('Manage your conferences and events')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Status filter
  // -------------------------------------------------------------------------

  describe('status filter', () => {
    beforeEach(() => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url.startsWith('/conferences/stats')) {
          return Promise.resolve({ data: mockStats });
        }
        if (url.startsWith('/conferences')) {
          return Promise.resolve({
            data: {
              items: mockConferences,
              total: 2,
              page: 1,
              page_size: 20,
              pages: 1,
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });
    });

    it('renders the status filter dropdown', async () => {
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('renders all filter options', async () => {
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      expect(screen.getByRole('option', { name: 'All Conferences' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Upcoming' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ongoing' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Past' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    });

    it('defaults to All Conferences filter', async () => {
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });

    it('updates filter when a different option is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders();

      await screen.findByText('React Summit 2026');

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'upcoming');

      expect((select as HTMLSelectElement).value).toBe('upcoming');
    });
  });
});
