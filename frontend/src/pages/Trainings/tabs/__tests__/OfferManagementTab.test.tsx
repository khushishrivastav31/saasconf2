import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import OfferManagementTab from '../OfferManagementTab';

vi.mock('../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../../../config/api';

const mockApi = vi.mocked(api);

const mockOffers = [
  {
    id: 'offer-1',
    tenant_id: 'tenant-1',
    customer_id: 'cust-1',
    customer_name: 'Acme Corp',
    offer_type: 'inhouse',
    offer_number: 'OFF-001',
    status: 'draft',
    attendees: 10,
    training_price: 5000,
    certification_price: 1500,
    currency: 'EUR',
    comments: null,
    notes: null,
    placements: [{ id: 'p1', training_name: 'Scrum' }],
    attendee_count: 3,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  },
  {
    id: 'offer-2',
    tenant_id: 'tenant-1',
    customer_id: 'cust-2',
    customer_name: 'Beta Inc',
    offer_type: 'open',
    offer_number: 'OFF-002',
    status: 'sent',
    attendees: 5,
    training_price: 3000,
    certification_price: 800,
    currency: 'EUR',
    comments: null,
    notes: null,
    placements: [
      { id: 'p2', training_name: 'Kanban' },
      { id: 'p3', training_name: 'SAFe' },
    ],
    attendee_count: 5,
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-10T10:00:00Z',
  },
  {
    id: 'offer-3',
    tenant_id: 'tenant-1',
    customer_id: 'cust-3',
    customer_name: 'Gamma LLC',
    offer_type: 'inhouse',
    offer_number: 'OFF-003',
    status: 'accepted',
    attendees: 20,
    training_price: 10000,
    certification_price: 3000,
    currency: 'EUR',
    comments: null,
    notes: null,
    placements: [],
    attendee_count: 0,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OfferManagementTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Offer Management" heading', async () => {
    mockApi.get.mockResolvedValue({ data: { items: [] } });
    renderWithProviders(<OfferManagementTab />);
    expect(screen.getByText('Offer Management')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockApi.get.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<OfferManagementTab />);
    expect(screen.getByText('Loading offers...')).toBeInTheDocument();
  });

  it('shows empty state when no offers', async () => {
    mockApi.get.mockResolvedValue({ data: { items: [] } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(
        screen.getByText('No offers yet. Create offers from the Customers tab.')
      ).toBeInTheDocument();
    });
  });

  it('renders offers table with correct columns', async () => {
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // Check column headers
    expect(screen.getByText('Offer #')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Trainings')).toBeInTheDocument();
    expect(screen.getByText('Training Price')).toBeInTheDocument();
    expect(screen.getByText('Cert. Price')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('renders offer data correctly in table rows', async () => {
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    expect(screen.getByText('Gamma LLC')).toBeInTheDocument();
    expect(screen.getByText('OFF-002')).toBeInTheDocument();
    expect(screen.getByText('OFF-003')).toBeInTheDocument();
  });

  it('shows status filter buttons with counts', async () => {
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // All filter button with total count
    expect(screen.getByText('All (3)')).toBeInTheDocument();
    // Individual status filter buttons
    expect(screen.getByText('Draft (1)')).toBeInTheDocument();
    expect(screen.getByText('Sent (1)')).toBeInTheDocument();
    expect(screen.getByText('Accepted (1)')).toBeInTheDocument();
    expect(screen.getByText('Rejected (0)')).toBeInTheDocument();
  });

  it('shows stats cards with revenue totals', async () => {
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // Total stats card
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Training Revenue')).toBeInTheDocument();
    expect(screen.getByText('Certification Revenue')).toBeInTheDocument();
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    mockApi.get.mockResolvedValue({ data: { items: [] } });
    renderWithProviders(<OfferManagementTab />);
    expect(
      screen.getByPlaceholderText('Search by offer number or customer...')
    ).toBeInTheDocument();
  });

  it('search input triggers re-fetch', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText('Search by offer number or customer...');
    await user.type(searchInput, 'Acme');
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/trainings/offers',
        expect.objectContaining({
          params: expect.objectContaining({ search: 'Acme' }),
        })
      );
    });
  });

  it('clicking status filter filters the offers', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // Click "Draft" filter
    await user.click(screen.getByText('Draft (1)'));
    // Should only show draft offer
    expect(screen.getByText('OFF-001')).toBeInTheDocument();
    expect(screen.queryByText('OFF-002')).not.toBeInTheDocument();
    expect(screen.queryByText('OFF-003')).not.toBeInTheDocument();
  });

  it('status dropdown changes offer status', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ data: { items: mockOffers } });
    mockApi.put.mockResolvedValue({ data: {} });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // Find the status dropdowns (one per offer row)
    const statusSelects = screen.getAllByRole('combobox');
    // Change the first one to 'sent'
    await user.selectOptions(statusSelects[0], 'sent');
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/trainings/offers/offer-1', { status: 'sent' });
    });
  });

  it('fetches offers from /trainings/offers', async () => {
    mockApi.get.mockResolvedValue({ data: { items: [] } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/trainings/offers',
        expect.objectContaining({
          params: expect.objectContaining({ limit: '500' }),
        })
      );
    });
  });
});
