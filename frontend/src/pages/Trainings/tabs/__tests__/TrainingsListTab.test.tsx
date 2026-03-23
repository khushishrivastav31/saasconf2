import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrainingsListTab from '../TrainingsListTab';
import type { Training } from '../../../../types/training';

// Mock the api module
vi.mock('../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../config/api';

const mockApi = vi.mocked(api);

function createTraining(overrides: Partial<Training> = {}): Training {
  return {
    id: 't-1',
    tenant_id: 'tenant-1',
    name: 'React Fundamentals',
    abbreviation: 'RF',
    description: null,
    website: null,
    logo_url: null,
    support_email: null,
    contact_email: null,
    phone: null,
    start_date: '2026-04-01',
    end_date: '2026-04-03',
    venue_name: null,
    venue_address: null,
    city: 'Berlin',
    state: null,
    postal_code: null,
    country: null,
    timezone: null,
    locale: null,
    venue_type: 'onsite',
    venue_url: null,
    virtual_platform_url: null,
    social_links: {},
    team_members: [],
    settings: {},
    currency: null,
    invoice_currency: null,
    is_active: false,
    is_published: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    managers_count: 0,
    team_count: 3,
    status: 'upcoming',
    ...overrides,
  };
}

const mockTrainings: Training[] = [
  createTraining({
    id: 't-1',
    name: 'React Fundamentals',
    abbreviation: 'RF',
    city: 'Berlin',
    status: 'upcoming',
    team_count: 3,
  }),
  createTraining({
    id: 't-2',
    name: 'Advanced TypeScript',
    abbreviation: 'AT',
    city: 'Munich',
    status: 'ongoing',
    team_count: 5,
    is_active: true,
  }),
  createTraining({
    id: 't-3',
    name: 'Node.js Workshop',
    abbreviation: null,
    city: null,
    status: 'draft',
    team_count: 0,
    start_date: null,
    end_date: null,
  }),
];

const mockListResponse = {
  items: mockTrainings,
  total: 3,
  page: 1,
  page_size: 20,
  pages: 1,
};

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

describe('TrainingsListTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner while fetching trainings', () => {
      mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { container } = renderWithProviders(<TrainingsListTab />);

      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no trainings exist', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0, page: 1, page_size: 20, pages: 0 },
      });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(
          screen.getByText('No trainings yet. Create one to get started.')
        ).toBeInTheDocument();
      });
    });

    it('shows search-specific empty message when search yields no results', async () => {
      // First load with data
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      // Type a search term — all subsequent queries return empty
      const user = userEvent.setup();
      const searchInput = screen.getByPlaceholderText('Search trainings...');

      const emptyResponse = { data: { items: [], total: 0, page: 1, page_size: 20, pages: 0 } };
      mockApi.get.mockResolvedValue(emptyResponse);

      await user.type(searchInput, 'xyz');

      await waitFor(() => {
        expect(screen.getByText('No trainings match your search.')).toBeInTheDocument();
      });
    });
  });

  describe('table rendering', () => {
    it('renders table with correct headers', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument();
      });

      expect(screen.getByText('Dates')).toBeInTheDocument();
      expect(screen.getByText('City')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('renders training names and abbreviations', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      expect(screen.getByText('RF')).toBeInTheDocument();
      expect(screen.getByText('Advanced TypeScript')).toBeInTheDocument();
      expect(screen.getByText('AT')).toBeInTheDocument();
      expect(screen.getByText('Node.js Workshop')).toBeInTheDocument();
    });

    it('renders city or dash for missing city', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Berlin')).toBeInTheDocument();
      });

      expect(screen.getByText('Munich')).toBeInTheDocument();
    });

    it('renders status badges', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Upcoming')).toBeInTheDocument();
      });

      expect(screen.getByText('Ongoing')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders team count for each training', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('renders delete button for each training', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons).toHaveLength(3);
    });

    it('disables delete button for active trainings', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      // The second training (Advanced TypeScript) is active
      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons[1]).toBeDisabled();
      expect(deleteButtons[0]).not.toBeDisabled();
    });
  });

  describe('header and new training button', () => {
    it('renders the Trainings heading', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Trainings')).toBeInTheDocument();
      });
    });

    it('renders the New Training button', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });
    });
  });

  describe('search', () => {
    it('renders search input', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search trainings...')).toBeInTheDocument();
      });
    });

    it('calls API with search parameter when user types', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValue({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search trainings...');
      await user.type(searchInput, 'React');

      await waitFor(() => {
        const calls = mockApi.get.mock.calls;
        const lastCall = calls[calls.length - 1][0] as string;
        expect(lastCall).toContain('search=React');
      });
    });

    it('resets page to 1 when searching', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValue({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search trainings...');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        const calls = mockApi.get.mock.calls;
        const lastCall = calls[calls.length - 1][0] as string;
        expect(lastCall).toContain('page=1');
      });
    });
  });

  describe('pagination', () => {
    it('does not render pagination when there is only one page', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });

    it('renders pagination when there are multiple pages', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { ...mockListResponse, total: 50, pages: 3 },
      });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3 (50 total)')).toBeInTheDocument();
      });

      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('disables Previous button on first page', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { ...mockListResponse, total: 50, pages: 3 },
      });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Previous')).toBeInTheDocument();
      });

      expect(screen.getByText('Previous')).toBeDisabled();
    });

    it('navigates to next page when Next is clicked', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { ...mockListResponse, total: 50, pages: 3 },
      });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      mockApi.get.mockResolvedValueOnce({
        data: { ...mockListResponse, page: 2, total: 50, pages: 3 },
      });

      await user.click(screen.getByText('Next'));

      await waitFor(() => {
        const calls = mockApi.get.mock.calls;
        const lastCall = calls[calls.length - 1][0] as string;
        expect(lastCall).toContain('page=2');
      });
    });
  });

  describe('create training flow', () => {
    it('shows create form when New Training is clicked', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Training'));

      expect(screen.getByText('Create Training')).toBeInTheDocument();
      expect(screen.getByText('Name *')).toBeInTheDocument();
      expect(screen.getByText('Abbreviation')).toBeInTheDocument();
    });

    it('hides create form when Cancel is clicked', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Training'));
      expect(screen.getByText('Create Training')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Create Training')).not.toBeInTheDocument();
    });

    it('disables Create button when name is empty', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Training'));

      const createButton = screen.getByText('Create');
      expect(createButton).toBeDisabled();
    });

    it('enables Create button when name is provided', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Training'));

      // Find the Name input (first input in the create form)
      const inputs = screen.getAllByRole('textbox');
      // The name input is within the create form
      const nameInput = inputs.find((input) => {
        const label = input.closest('div')?.querySelector('label');
        return label?.textContent?.includes('Name');
      });

      await user.type(nameInput!, 'New Training Course');

      const createButton = screen.getByText('Create');
      expect(createButton).not.toBeDisabled();
    });

    it('calls API to create training when form is submitted', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValue({ data: mockListResponse });
      mockApi.post.mockResolvedValueOnce({
        data: createTraining({ id: 't-new', name: 'New Course' }),
      });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Training'));

      const inputs = screen.getAllByRole('textbox');
      const nameInput = inputs.find((input) => {
        const label = input.closest('div')?.querySelector('label');
        return label?.textContent?.includes('Name');
      });

      await user.type(nameInput!, 'New Course');

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith('/trainings', {
          name: 'New Course',
          abbreviation: undefined,
        });
      });
    });

    it('sends abbreviation when provided', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValue({ data: mockListResponse });
      mockApi.post.mockResolvedValueOnce({
        data: createTraining({ id: 't-new', name: 'New Course' }),
      });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('New Training')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Training'));

      const inputs = screen.getAllByRole('textbox');
      const nameInput = inputs.find((input) => {
        const label = input.closest('div')?.querySelector('label');
        return label?.textContent?.includes('Name');
      });
      const abbrevInput = inputs.find((input) => {
        const label = input.closest('div')?.querySelector('label');
        return label?.textContent?.includes('Abbreviation');
      });

      await user.type(nameInput!, 'New Course');
      await user.type(abbrevInput!, 'NC');

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith('/trainings', {
          name: 'New Course',
          abbreviation: 'NC',
        });
      });
    });
  });

  describe('delete confirmation', () => {
    it('shows confirm dialog when Delete is clicked', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      // Click the first delete button (not disabled)
      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Delete Training')).toBeInTheDocument();
        expect(
          screen.getByText(
            'Are you sure you want to delete "React Fundamentals"? This action cannot be undone.'
          )
        ).toBeInTheDocument();
      });
    });

    it('calls delete API when confirmed', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValue({ data: mockListResponse });
      mockApi.delete.mockResolvedValueOnce({});

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      // Click the first delete button
      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Delete Training')).toBeInTheDocument();
      });

      // Find the confirm button within the dialog (the one in the dialog, not the table)
      const dialog = screen.getByRole('dialog');
      const confirmButton = dialog.querySelector('button:last-child') as HTMLElement;
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockApi.delete).toHaveBeenCalledWith('/trainings/t-1');
      });
    });

    it('closes confirm dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Delete Training')).toBeInTheDocument();
      });

      // Click Cancel in the dialog
      await user.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('row selection', () => {
    it('calls onSelectTraining when a row is clicked', async () => {
      const user = userEvent.setup();
      const onSelectTraining = vi.fn();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab onSelectTraining={onSelectTraining} />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      await user.click(screen.getByText('React Fundamentals'));

      expect(onSelectTraining).toHaveBeenCalledWith('t-1');
    });

    it('does not throw when onSelectTraining is not provided', async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({ data: mockListResponse });

      renderWithProviders(<TrainingsListTab />);

      await waitFor(() => {
        expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
      });

      // Should not throw
      await user.click(screen.getByText('React Fundamentals'));
    });
  });
});
