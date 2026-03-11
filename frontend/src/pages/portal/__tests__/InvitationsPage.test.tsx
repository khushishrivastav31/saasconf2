import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import InvitationsPage from '../InvitationsPage';
import type { PortalInvitation } from '../../../types/portal';
import { createTestQueryClient } from '../../../test-utils';

// Mock the portalApi module
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Import the mocked api
import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock formatDate so date output is deterministic in tests
vi.mock('../../../utils/formatDate', () => ({
  formatDate: (dateStr: string) => `formatted:${dateStr}`,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

function createInvitation(overrides: Partial<PortalInvitation> = {}): PortalInvitation {
  return {
    paper_id: 'paper-1',
    paper_title: 'Deep Dive into TypeScript',
    cfp_title: 'Main CFP',
    conference_name: 'ReactConf 2025',
    main_speaker_first_name: 'John',
    main_speaker_last_name: 'Doe',
    main_speaker_email: 'john@example.com',
    invitation_status: 'pending',
    invited_at: '2025-02-20T09:00:00Z',
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InvitationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a loading spinner while fetching invitations', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {})); // never resolves

      const { container } = renderWithProviders(<InvitationsPage />);

      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('always renders the Co-speaker Invitations heading', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<InvitationsPage />);

      expect(screen.getByText('Co-speaker Invitations')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows an empty-state message when there are no invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('No co-speaker invitations at this time.')).toBeInTheDocument();
      });
    });

    it('does not show a count badge when there are no invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Co-speaker Invitations')).toBeInTheDocument();
      });

      // The count badge should not be present
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  describe('rendering invitations', () => {
    it('renders a list of invitations', async () => {
      const invitations = [
        createInvitation({ paper_id: 'p-1', paper_title: 'Paper One' }),
        createInvitation({ paper_id: 'p-2', paper_title: 'Paper Two' }),
      ];
      mockPortalApi.get.mockResolvedValueOnce({ data: { items: invitations, total: 2 } });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Paper One')).toBeInTheDocument();
      });
      expect(screen.getByText('Paper Two')).toBeInTheDocument();
    });

    it('shows the count badge when there are invitations', async () => {
      const invitations = [
        createInvitation({ paper_id: 'p-1' }),
        createInvitation({ paper_id: 'p-2' }),
      ];
      mockPortalApi.get.mockResolvedValueOnce({ data: { items: invitations, total: 2 } });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('displays the conference name for each invitation', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ conference_name: 'VueConf Europe' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('VueConf Europe')).toBeInTheDocument();
      });
    });

    it('displays the paper title for each invitation', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ paper_title: 'Advanced GraphQL Patterns' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Advanced GraphQL Patterns')).toBeInTheDocument();
      });
    });

    it('displays the CFP title when present', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ cfp_title: 'Lightning Talks CFP' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Lightning Talks CFP')).toBeInTheDocument();
      });
    });

    it('displays the main speaker info in the "Invited by" line', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [
            createInvitation({
              main_speaker_first_name: 'Maria',
              main_speaker_last_name: 'Garcia',
              main_speaker_email: 'maria@example.com',
            }),
          ],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Maria Garcia/)).toBeInTheDocument();
      });
      expect(screen.getByText(/maria@example\.com/)).toBeInTheDocument();
    });

    it('renders the formatted invitation date when invited_at is present', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invited_at: '2025-02-20T09:00:00Z' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('formatted:2025-02-20T09:00:00Z')).toBeInTheDocument();
      });
    });

    it('does not render a date when invited_at is null', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invited_at: null })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Deep Dive into TypeScript/)).toBeInTheDocument();
      });

      expect(screen.queryByText(/^formatted:/)).not.toBeInTheDocument();
    });
  });

  describe('invitation status badges', () => {
    it('shows the pending status badge for pending invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invitation_status: 'pending' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('pending')).toBeInTheDocument();
      });
    });

    it('shows the accepted status badge for accepted invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invitation_status: 'accepted' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('accepted')).toBeInTheDocument();
      });
    });

    it('shows the declined status badge for declined invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invitation_status: 'declined' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('declined')).toBeInTheDocument();
      });
    });
  });

  describe('Accept / Decline buttons', () => {
    it('shows Accept and Decline buttons for pending invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invitation_status: 'pending' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    });

    it('does not show Accept / Decline buttons for accepted invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invitation_status: 'accepted' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('accepted')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    });

    it('does not show Accept / Decline buttons for declined invitations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ invitation_status: 'declined' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('declined')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    });
  });

  describe('accepting an invitation', () => {
    it('calls the accept API with the correct paper id when Accept is clicked', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockResolvedValue({
        data: { items: [createInvitation({ paper_id: 'paper-42' })], total: 1 },
      });
      mockPortalApi.post.mockResolvedValueOnce({});

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith('/portal/invitations/paper-42/accept');
      });
    });

    it('disables the Accept button while the mutation is pending', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockResolvedValue({
        data: { items: [createInvitation()], total: 1 },
      });

      let resolvePost!: (v: unknown) => void;
      mockPortalApi.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
      });

      resolvePost({});
    });
  });

  describe('declining an invitation', () => {
    it('calls the decline API with the correct paper id when Decline is clicked', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockResolvedValue({
        data: { items: [createInvitation({ paper_id: 'paper-99' })], total: 1 },
      });
      mockPortalApi.post.mockResolvedValueOnce({});

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Decline' }));

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith('/portal/invitations/paper-99/decline');
      });
    });

    it('disables the Decline button while the mutation is pending', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockResolvedValue({
        data: { items: [createInvitation()], total: 1 },
      });

      let resolvePost!: (v: unknown) => void;
      mockPortalApi.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Decline' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
      });

      resolvePost({});
    });
  });

  describe('query invalidation after mutation', () => {
    it('refetches invitations after a successful accept', async () => {
      const user = userEvent.setup();

      // First fetch — pending invitation
      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ paper_id: 'p-1', invitation_status: 'pending' })],
          total: 1,
        },
      });
      mockPortalApi.post.mockResolvedValueOnce({});
      // Refetch after invalidation — now accepted
      mockPortalApi.get.mockResolvedValue({
        data: {
          items: [createInvitation({ paper_id: 'p-1', invitation_status: 'accepted' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        // After the mutation + refetch the Accept/Decline buttons should be gone
        expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
      });
    });

    it('refetches invitations after a successful decline', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockResolvedValueOnce({
        data: {
          items: [createInvitation({ paper_id: 'p-2', invitation_status: 'pending' })],
          total: 1,
        },
      });
      mockPortalApi.post.mockResolvedValueOnce({});
      mockPortalApi.get.mockResolvedValue({
        data: {
          items: [createInvitation({ paper_id: 'p-2', invitation_status: 'declined' })],
          total: 1,
        },
      });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Decline' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
      });
    });
  });

  describe('API call', () => {
    it('fetches invitations from the correct endpoint', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });

      renderWithProviders(<InvitationsPage />);

      await waitFor(() => {
        expect(mockPortalApi.get).toHaveBeenCalledWith('/portal/invitations');
      });
    });
  });
});
