import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyRegistrationsPage from '../MyRegistrationsPage';

// Mock the portalApi module
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

// Import the mocked api
import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock the Toast hook so session-selector calls don't blow up
vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

function createRegistration(
  overrides: Partial<{
    id: string;
    conference_name: string | null;
    conference_abbreviation: string | null;
    first_name: string;
    last_name: string;
    email: string;
    status: string;
    booking_option_id: string;
    booking_option_name: string | null;
    has_bookable_sessions: boolean;
    main_session_id: string | null;
    main_session_name: string | null;
    created_at: string | null;
    items: unknown[];
  }> = {}
) {
  return {
    id: 'reg-1',
    conference_name: 'TestConf 2025',
    conference_abbreviation: 'TC25',
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@example.com',
    status: 'paid',
    booking_option_id: 'opt-1',
    booking_option_name: 'Full Conference Pass',
    has_bookable_sessions: false,
    main_session_id: null,
    main_session_name: null,
    created_at: '2025-01-15T10:00:00Z',
    items: [],
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MyRegistrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a loading spinner while fetching registrations', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {})); // never resolves

      const { container } = renderWithProviders(<MyRegistrationsPage />);

      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('does not show registration cards while loading', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<MyRegistrationsPage />);

      expect(screen.queryByText('My Registrations')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows an empty-state message when there are no registrations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('No registrations found')).toBeInTheDocument();
      });
    });

    it('shows the helper subtitle in empty state', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(
          screen.getByText("You don't have any conference registrations yet.")
        ).toBeInTheDocument();
      });
    });
  });

  describe('rendering registrations', () => {
    it('renders a list of registration cards', async () => {
      const regs = [
        createRegistration({ id: 'reg-1', conference_name: 'ConfAlpha 2025' }),
        createRegistration({ id: 'reg-2', conference_name: 'ConfBeta 2026' }),
      ];
      mockPortalApi.get.mockResolvedValueOnce({ data: regs });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('ConfAlpha 2025')).toBeInTheDocument();
      });
      expect(screen.getByText('ConfBeta 2026')).toBeInTheDocument();
    });

    it('renders the "My Registrations" heading', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration()],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Registrations')).toBeInTheDocument();
      });
    });

    it('displays the attendee name and email on each card', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [
          createRegistration({
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane@example.com',
          }),
        ],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
      });
      expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument();
    });

    it('displays the booking option name', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ booking_option_name: 'Workshop Pass' })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Workshop Pass')).toBeInTheDocument();
      });
    });

    it('displays the registration date when created_at is present', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ created_at: '2025-03-10T08:00:00Z' })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Registered:')).toBeInTheDocument();
      });
    });

    it('does not show a registration date when created_at is null', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ created_at: null })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Registrations')).toBeInTheDocument();
      });

      expect(screen.queryByText('Registered:')).not.toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('renders a "Paid" status badge for paid registrations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'paid' })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Paid')).toBeInTheDocument();
      });
    });

    it('renders an "Invoiced" badge for invoiced registrations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'invoiced' })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Invoiced')).toBeInTheDocument();
      });
    });

    it('renders a "Pending Invoice" badge for registrations pending invoice', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'registered_pending_invoice' })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Pending Invoice')).toBeInTheDocument();
      });
    });

    it('renders a humanised label for unknown statuses', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'cancelled_refunded' })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        // underscores replaced with spaces
        expect(screen.getByText('cancelled refunded')).toBeInTheDocument();
      });
    });
  });

  describe('add-on items', () => {
    it('renders add-on items when present', async () => {
      const reg = createRegistration({
        items: [
          {
            id: 'item-1',
            item_type: 'tutorial',
            item_name: 'Advanced React Workshop',
            booking_option_id: null,
            program_session_id: null,
            program_session_name: null,
            has_bookable_sessions: false,
          },
        ],
      });
      mockPortalApi.get.mockResolvedValueOnce({ data: [reg] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Advanced React Workshop')).toBeInTheDocument();
      });
      expect(screen.getByText('Add-on Items')).toBeInTheDocument();
    });

    it('shows the Tutorial type label for tutorial items', async () => {
      const reg = createRegistration({
        items: [
          {
            id: 'item-1',
            item_type: 'tutorial',
            item_name: 'Some Tutorial',
            booking_option_id: null,
            program_session_id: null,
            program_session_name: null,
            has_bookable_sessions: false,
          },
        ],
      });
      mockPortalApi.get.mockResolvedValueOnce({ data: [reg] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Tutorial')).toBeInTheDocument();
      });
    });

    it('shows the session name when an item has a locked session', async () => {
      const reg = createRegistration({
        items: [
          {
            id: 'item-1',
            item_type: 'option',
            item_name: 'Workshop Item',
            booking_option_id: null,
            program_session_id: 'session-99',
            program_session_name: 'Morning Workshop',
            has_bookable_sessions: true,
          },
        ],
      });
      mockPortalApi.get.mockResolvedValueOnce({ data: [reg] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Morning Workshop')).toBeInTheDocument();
      });
      expect(screen.getByText('Session locked')).toBeInTheDocument();
    });

    it('does not render the add-on section when there are no items', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ items: [] })],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Registrations')).toBeInTheDocument();
      });

      expect(screen.queryByText('Add-on Items')).not.toBeInTheDocument();
    });
  });

  describe('session selection prompt', () => {
    it('shows session selection prompt when main session is missing', async () => {
      // Returning empty groups so the SessionSelector renders its "no sessions" message
      mockPortalApi.get
        .mockResolvedValueOnce({
          data: [
            createRegistration({
              has_bookable_sessions: true,
              main_session_id: null,
            }),
          ],
        })
        .mockResolvedValueOnce({ data: { groups: [] } }); // bookable-sessions call

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Please select your session')).toBeInTheDocument();
      });
    });

    it('shows locked-session notice when main session is already selected', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [
          createRegistration({
            has_bookable_sessions: true,
            main_session_id: 'session-42',
            main_session_name: 'Keynote Morning',
          }),
        ],
      });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(
            'Session locked. Contact the conference organizer if you need to change it.'
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe('session selector confirm flow', () => {
    it('calls the select-session API when a session is confirmed', async () => {
      const user = userEvent.setup();

      mockPortalApi.get
        .mockResolvedValueOnce({
          data: [
            createRegistration({
              id: 'reg-1',
              has_bookable_sessions: true,
              main_session_id: null,
            }),
          ],
        })
        .mockResolvedValueOnce({
          data: {
            groups: [
              {
                session_type_id: 'type-1',
                session_type_name: 'Workshop',
                slots: [
                  {
                    slot_id: 'slot-1',
                    label: 'Slot A',
                    sessions: [
                      {
                        id: 'sess-1',
                        title: 'Advanced TypeScript',
                        speaker_name: 'Bob Builder',
                        has_paper: true,
                        max_attendees: null,
                        available_spots: null,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });

      mockPortalApi.put.mockResolvedValueOnce({});

      // Invalidation re-fetch
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Select your session:')).toBeInTheDocument();
      });

      // Choose a session from the dropdown
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'sess-1');

      // Click Confirm Session
      const confirmBtn = screen.getByRole('button', { name: 'Confirm Session' });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockPortalApi.put).toHaveBeenCalledWith(
          '/portal/my-registrations/reg-1/select-session',
          { session_id: 'sess-1' }
        );
      });
    });
  });

  describe('API call', () => {
    it('fetches registrations from the correct endpoint', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<MyRegistrationsPage />);

      await waitFor(() => {
        expect(mockPortalApi.get).toHaveBeenCalledWith('/portal/my-registrations');
      });
    });
  });
});
