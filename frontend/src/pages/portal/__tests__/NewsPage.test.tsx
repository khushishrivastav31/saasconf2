import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewsPage from '../NewsPage';
import type { PortalNewsArticle } from '../../../types/portal';

// Mock the portalApi module
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
  },
}));

// Import the mocked api
import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock RichTextDisplay component
vi.mock('../../../components/common/RichTextDisplay', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="rich-text-display">{content}</div>
  ),
}));

// Helper to create a test article
function createArticle(
  id: string,
  title: string,
  bodyHtml: string,
  conferenceName = 'TestConf 2025',
  publishedAt = '2025-03-15T14:30:00Z'
): PortalNewsArticle {
  return {
    id,
    conference_id: `conf-${id}`,
    conference_name: conferenceName,
    title,
    body_html: bodyHtml,
    published_at: publishedAt,
  };
}

// Short body that does NOT need truncation (under 200 chars plain text)
const shortBody = '<p>This is a short article body.</p>';

// Long body that WILL be truncated (over 200 chars plain text)
const longBody =
  '<p>' +
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ' +
  'Duis aute irure dolor in reprehenderit.' +
  '</p>';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner while fetching news', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { container } = renderWithProviders(<NewsPage />);

      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('does not show the News heading while loading', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<NewsPage />);

      expect(screen.queryByText('News')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty message when there are no articles', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('No news articles yet.')).toBeInTheDocument();
      });
    });

    it('still shows the News heading in empty state', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('News')).toBeInTheDocument();
      });
    });
  });

  describe('rendering articles', () => {
    it('renders a list of news articles', async () => {
      const articles = [
        createArticle('1', 'First Article', shortBody, 'ConfA'),
        createArticle('2', 'Second Article', shortBody, 'ConfB'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 2 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Article')).toBeInTheDocument();
      });

      expect(screen.getByText('Second Article')).toBeInTheDocument();
    });

    it('displays the conference name badge for each article', async () => {
      const articles = [
        createArticle('1', 'Article One', shortBody, 'React Summit'),
        createArticle('2', 'Article Two', shortBody, 'Vue Conf'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 2 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('React Summit')).toBeInTheDocument();
      });

      expect(screen.getByText('Vue Conf')).toBeInTheDocument();
    });

    it('displays formatted published dates', async () => {
      const articles = [
        createArticle('1', 'Dated Article', shortBody, 'TestConf', '2025-06-20T09:00:00Z'),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('Dated Article')).toBeInTheDocument();
      });

      // The date should be formatted by Intl.DateTimeFormat with en-US locale
      // Exact output depends on timezone, so we check for the month name
      expect(screen.getByText(/June/)).toBeInTheDocument();
    });

    it('shows truncated preview for long articles', async () => {
      const articles = [createArticle('1', 'Long Article', longBody)];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('Long Article')).toBeInTheDocument();
      });

      // The preview text should end with "..."
      const previewElement = screen.getByText(/\.\.\.$/);
      expect(previewElement).toBeInTheDocument();
    });

    it("shows 'Read more' button for long articles", async () => {
      const articles = [createArticle('1', 'Long Article', longBody)];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('Read more')).toBeInTheDocument();
      });
    });

    it("does not show 'Read more' button for short articles", async () => {
      const articles = [createArticle('1', 'Short Article', shortBody)];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('Short Article')).toBeInTheDocument();
      });

      expect(screen.queryByText('Read more')).not.toBeInTheDocument();
    });

    it('displays the News heading', async () => {
      const articles = [createArticle('1', 'An Article', shortBody)];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'News' })).toBeInTheDocument();
      });
    });
  });

  describe('expanding and collapsing articles', () => {
    it("expands an article when 'Read more' is clicked", async () => {
      const user = userEvent.setup();
      const articles = [createArticle('1', 'Expandable Article', longBody)];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('Read more')).toBeInTheDocument();
      });

      // Before expanding, RichTextDisplay should not be present
      expect(screen.queryByTestId('rich-text-display')).not.toBeInTheDocument();

      // Click "Read more"
      await user.click(screen.getByText('Read more'));

      // After expanding, the full content should be shown via RichTextDisplay
      expect(screen.getByTestId('rich-text-display')).toBeInTheDocument();

      // The button should now say "Show less"
      expect(screen.getByText('Show less')).toBeInTheDocument();
      expect(screen.queryByText('Read more')).not.toBeInTheDocument();
    });

    it("collapses an expanded article when 'Show less' is clicked", async () => {
      const user = userEvent.setup();
      const articles = [createArticle('1', 'Collapsible Article', longBody)];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 1 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('Read more')).toBeInTheDocument();
      });

      // Expand the article
      await user.click(screen.getByText('Read more'));

      expect(screen.getByTestId('rich-text-display')).toBeInTheDocument();

      // Collapse the article
      await user.click(screen.getByText('Show less'));

      // RichTextDisplay should be gone again
      expect(screen.queryByTestId('rich-text-display')).not.toBeInTheDocument();

      // Button should say "Read more" again
      expect(screen.getByText('Read more')).toBeInTheDocument();
    });

    it('can expand multiple articles independently', async () => {
      const user = userEvent.setup();
      const articles = [
        createArticle('1', 'First Long Article', longBody),
        createArticle('2', 'Second Long Article', longBody),
      ];

      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: articles, total: 2 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Long Article')).toBeInTheDocument();
      });

      const readMoreButtons = screen.getAllByText('Read more');
      expect(readMoreButtons).toHaveLength(2);

      // Expand first article only
      await user.click(readMoreButtons[0]);

      // First article is expanded, second is not
      const richTextDisplays = screen.getAllByTestId('rich-text-display');
      expect(richTextDisplays).toHaveLength(1);

      // There should be one "Show less" and one "Read more"
      expect(screen.getByText('Show less')).toBeInTheDocument();
      expect(screen.getByText('Read more')).toBeInTheDocument();

      // Expand second article too
      await user.click(screen.getByText('Read more'));

      // Both should now be expanded
      expect(screen.getAllByTestId('rich-text-display')).toHaveLength(2);
      expect(screen.getAllByText('Show less')).toHaveLength(2);
      expect(screen.queryByText('Read more')).not.toBeInTheDocument();
    });
  });

  describe('API call', () => {
    it('fetches news from the correct endpoint', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(<NewsPage />);

      await waitFor(() => {
        expect(mockPortalApi.get).toHaveBeenCalledWith('/portal/news');
      });
    });
  });
});
