import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import DashboardPage from '../DashboardPage';
import type { PortalPaper } from '../../../types/portal';

// Mock the portalApi module
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
  },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock PaperStatusLifeline to avoid rendering the full status SVG
vi.mock('../../../components/PaperStatusLifeline', () => ({
  default: ({ status }: { status: string }) => (
    <span data-testid={`status-lifeline-${status}`}>{status}</span>
  ),
}));

// ----- Fixtures -----

function createPaper(
  id: string,
  title: string,
  status: string,
  overrides?: Partial<PortalPaper>
): PortalPaper {
  return {
    id,
    cfp_id: 'cfp-1',
    cfp_title: 'TestConf CFP',
    conference_id: 'conf-1',
    conference_name: 'TestConf 2025',
    session_type_id: null,
    session_type_name: null,
    title,
    abstract_short: null,
    abstract_long: null,
    level: null,
    learning_objectives: null,
    importance: null,
    status,
    video_url: null,
    is_main_speaker: true,
    main_speaker_first_name: null,
    main_speaker_last_name: null,
    cospeakers: [],
    custom_field_answers: null,
    submitted_at: null,
    created_at: '2025-01-10T10:00:00Z',
    updated_at: '2025-01-10T10:00:00Z',
    ...overrides,
  };
}

// ----- Helpers -----

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
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/acme/portal/dashboard']}>
        <Routes>
          <Route path="/:companySlug/portal/dashboard" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ----- Tests -----

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a loading spinner while fetching papers', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      const { container } = renderWithProviders(<DashboardPage />);

      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('does not show the paper list while loading', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<DashboardPage />);

      expect(screen.queryByRole('link', { name: /my paper/i })).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no papers are returned', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/no papers yet/i)).toBeInTheDocument();
      });
    });

    it('still shows the My Papers heading in empty state', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('My Papers')).toBeInTheDocument();
      });
    });

    it('does not show a paper count badge in empty state', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('My Papers')).toBeInTheDocument();
      });

      // The count badge appears as a sibling span; with 0 papers it should not render
      const heading = screen.getByText('My Papers');
      const badge = heading.parentElement?.querySelector('span');
      // If a badge span exists it should not contain "0"
      if (badge) {
        expect(badge.textContent).not.toBe('0');
      }
    });
  });

  describe('rendering papers', () => {
    it('shows a list of papers grouped by conference', async () => {
      const papers = [
        createPaper('p-1', 'Intro to Python', 'draft'),
        createPaper('p-2', 'Advanced Python', 'submitted'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 2 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to Python')).toBeInTheDocument();
      });

      expect(screen.getByText('Advanced Python')).toBeInTheDocument();
    });

    it('displays the conference group heading', async () => {
      const papers = [createPaper('p-1', 'My Talk', 'draft')];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('TestConf 2025')).toBeInTheDocument();
      });
    });

    it('shows the paper count badge when papers exist', async () => {
      const papers = [
        createPaper('p-1', 'Paper A', 'draft'),
        createPaper('p-2', 'Paper B', 'submitted'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 2 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('renders a "Submit Paper" navigation link', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('My Papers')).toBeInTheDocument();
      });

      const submitLink = screen.getByRole('link', { name: /submit paper/i });
      expect(submitLink).toBeInTheDocument();
      expect(submitLink).toHaveAttribute('href', '/acme/portal/papers/new');
    });

    it('renders the PaperStatusLifeline for each paper', async () => {
      const papers = [
        createPaper('p-1', 'Draft Paper', 'draft'),
        createPaper('p-2', 'Submitted Paper', 'submitted'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 2 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId('status-lifeline-draft')).toBeInTheDocument();
      });

      expect(screen.getByTestId('status-lifeline-submitted')).toBeInTheDocument();
    });

    it('shows a "Co-speaker" badge for papers where the user is not the main speaker', async () => {
      const papers = [
        createPaper('p-1', 'Collaborative Talk', 'submitted', {
          is_main_speaker: false,
          main_speaker_first_name: 'Alice',
          main_speaker_last_name: 'Smith',
        }),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Co-speaker')).toBeInTheDocument();
      });
    });

    it('shows the main speaker name for co-speaker papers', async () => {
      const papers = [
        createPaper('p-1', 'Collaborative Talk', 'submitted', {
          is_main_speaker: false,
          main_speaker_first_name: 'Alice',
          main_speaker_last_name: 'Smith',
        }),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Main speaker: Alice Smith')).toBeInTheDocument();
      });
    });

    it('shows the session type badge when session_type_name is set', async () => {
      const papers = [
        createPaper('p-1', 'Keynote Talk', 'submitted', {
          session_type_name: 'Keynote',
        }),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Keynote')).toBeInTheDocument();
      });
    });

    it('groups papers from different conferences under separate headings', async () => {
      const papers = [
        createPaper('p-1', 'Python Talk', 'draft', {
          conference_id: 'conf-1',
          conference_name: 'PyCon 2025',
        }),
        createPaper('p-2', 'JS Talk', 'submitted', {
          conference_id: 'conf-2',
          conference_name: 'JSConf 2025',
        }),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 2 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('PyCon 2025')).toBeInTheDocument();
      });

      expect(screen.getByText('JSConf 2025')).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('shows search input when papers exist', async () => {
      const papers = [createPaper('p-1', 'Searchable Talk', 'draft')];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search by title, conference, or session type...')
        ).toBeInTheDocument();
      });
    });

    it('does not show search input when there are no papers', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/no papers yet/i)).toBeInTheDocument();
      });

      expect(
        screen.queryByPlaceholderText('Search by title, conference, or session type...')
      ).not.toBeInTheDocument();
    });

    it('filters papers by title when searching', async () => {
      const user = userEvent.setup();

      const papers = [
        createPaper('p-1', 'Python Deep Dive', 'draft'),
        createPaper('p-2', 'Rust for Beginners', 'submitted'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 2 },
      });

      renderWithProviders(<DashboardPage />);

      const searchInput = await screen.findByPlaceholderText(
        'Search by title, conference, or session type...'
      );

      await user.type(searchInput, 'Python');

      expect(screen.getByText('Python Deep Dive')).toBeInTheDocument();
      expect(screen.queryByText('Rust for Beginners')).not.toBeInTheDocument();
    });

    it('shows "no papers match" message when search yields no results', async () => {
      const user = userEvent.setup();

      const papers = [createPaper('p-1', 'Python Deep Dive', 'draft')];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      const searchInput = await screen.findByPlaceholderText(
        'Search by title, conference, or session type...'
      );

      await user.type(searchInput, 'Haskell');

      expect(screen.getByText(/no papers match/i)).toBeInTheDocument();
    });

    it('clears search when the × clear button is clicked', async () => {
      const user = userEvent.setup();

      const papers = [
        createPaper('p-1', 'Python Deep Dive', 'draft'),
        createPaper('p-2', 'Rust for Beginners', 'submitted'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 2 },
      });

      renderWithProviders(<DashboardPage />);

      const searchInput = await screen.findByPlaceholderText(
        'Search by title, conference, or session type...'
      );

      await user.type(searchInput, 'Python');
      expect(screen.queryByText('Rust for Beginners')).not.toBeInTheDocument();

      // Clear button is an SVG button that appears when query is non-empty
      // It's a sibling of the input inside the relative container
      const clearButton = searchInput
        .closest('div.relative')
        ?.querySelector('button[type="button"]');
      expect(clearButton).toBeTruthy();
      await user.click(clearButton!);

      // Both papers should now be visible again
      expect(screen.getByText('Python Deep Dive')).toBeInTheDocument();
      expect(screen.getByText('Rust for Beginners')).toBeInTheDocument();
    });
  });

  describe('API integration', () => {
    it('fetches papers from the correct endpoint', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(mockPortalApi.get).toHaveBeenCalledWith('/portal/papers');
      });
    });

    it('links each paper row to its detail page', async () => {
      const papers = [createPaper('paper-abc', 'Linked Talk', 'draft')];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: papers, total: 1 },
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Linked Talk')).toBeInTheDocument();
      });

      // The paper title is wrapped in a Link component
      const paperLink = screen.getByText('Linked Talk').closest('a');
      expect(paperLink).toHaveAttribute('href', '/acme/portal/papers/paper-abc');
    });
  });
});
