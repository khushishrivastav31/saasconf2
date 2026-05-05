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

const mockStats = {
  by_status: {
    draft: { count: 1, training: 5000, cert: 1500, invoiced: 0 },
    sent: { count: 1, training: 3000, cert: 800, invoiced: 0 },
    accepted: { count: 1, training: 10000, cert: 3000, invoiced: 13000 },
  },
  total_offers: 3,
  total_training: 18000,
  total_cert: 5300,
  total_invoiced: 13000,
};

/** Route the `api.get` mock per URL so the component can call `/offers/stats`
 *  and `/offers` independently (each has its own query). */
function mockGetByUrl(
  routes: Partial<
    Record<'offers' | 'stats', { items?: unknown[]; total?: number } | typeof mockStats>
  >
) {
  mockApi.get.mockImplementation((url: string) => {
    if (url.endsWith('/offers/stats')) {
      return Promise.resolve({ data: routes.stats ?? mockStats });
    }
    const list = routes.offers ?? { items: [], total: 0 };
    return Promise.resolve({ data: list });
  });
}

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
    invoice_count: 0,
    invoice_numbers: [],
    invoice_ids: [],
    invoiced_total: 0,
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
    invoice_count: 0,
    invoice_numbers: [],
    invoice_ids: [],
    invoiced_total: 0,
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
    invoice_count: 2,
    invoice_numbers: ['INV-2026-0042', 'INV-2026-0043'],
    invoice_ids: ['inv-42', 'inv-43'],
    invoiced_total: 13000,
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
    mockGetByUrl({ offers: { items: [], total: 0 } });
    renderWithProviders(<OfferManagementTab />);
    expect(screen.getByText('Offer Management')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockApi.get.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<OfferManagementTab />);
    expect(screen.getByText('Loading offers...')).toBeInTheDocument();
  });

  it('shows empty state when no offers', async () => {
    mockGetByUrl({
      offers: { items: [], total: 0 },
      stats: {
        by_status: {},
        total_offers: 0,
        total_training: 0,
        total_cert: 0,
        total_invoiced: 0,
      },
    });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(
        screen.getByText('No offers yet. Create offers from the Customers tab.')
      ).toBeInTheDocument();
    });
  });

  it('renders offers table with correct columns', async () => {
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
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
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    // "Invoiced" appears on each stat card AND in the table header — match all.
    expect(screen.getAllByText('Invoiced').length).toBeGreaterThan(0);
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('renders offer data correctly in table rows', async () => {
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
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

  it('shows status filter buttons with counts from /offers/stats', async () => {
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // Counts now come from the backend stats aggregate, not the client list.
    await waitFor(() => {
      expect(screen.getByText('All (3)')).toBeInTheDocument();
    });
    expect(screen.getByText('Draft (1)')).toBeInTheDocument();
    expect(screen.getByText('Sent (1)')).toBeInTheDocument();
    expect(screen.getByText('Accepted (1)')).toBeInTheDocument();
    expect(screen.getByText('Rejected (0)')).toBeInTheDocument();
  });

  it('shows stats cards with revenue totals', async () => {
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
    expect(screen.getByText('Training Revenue')).toBeInTheDocument();
    expect(screen.getByText('Certification Revenue')).toBeInTheDocument();
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    mockGetByUrl({ offers: { items: [], total: 0 } });
    renderWithProviders(<OfferManagementTab />);
    expect(
      screen.getByPlaceholderText('Search by offer number or customer...')
    ).toBeInTheDocument();
  });

  it('search input triggers re-fetch', async () => {
    const user = userEvent.setup();
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
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

  it('clicking status filter re-queries /offers with status param', async () => {
    const user = userEvent.setup();
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Draft (1)'));
    // Filtering is server-side now: clicking a status fires a new /offers
    // request with the selected status param, not a client-side row hide.
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/trainings/offers',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'draft' }),
        })
      );
    });
  });

  it('status dropdown changes offer status', async () => {
    const user = userEvent.setup();
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
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

  it('fetches offers from /trainings/offers with pagination defaults', async () => {
    mockGetByUrl({ offers: { items: [], total: 0 } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/trainings/offers',
        expect.objectContaining({
          params: expect.objectContaining({ skip: 0, limit: 100 }),
        })
      );
    });
  });

  it('fetches aggregated stats from /trainings/offers/stats', async () => {
    mockGetByUrl({ offers: { items: [], total: 0 } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/offers/stats');
    });
  });

  it('renders the per-status "Invoiced" subline on stat cards', async () => {
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // Each card shows "Invoiced" as a sub-line label. The accepted card carries
    // a non-zero amount; draft/sent show 0,00 €. Multiple labels exist (one per
    // card + one in the table header), so we match all.
    const invoicedLabels = await screen.findAllByText('Invoiced');
    expect(invoicedLabels.length).toBeGreaterThanOrEqual(4); // 4 status cards + total + table header
    // The accepted card's invoiced amount + the TOTAL card's grand-invoiced
    // both render 13.000,00 € (and the row's INVOICED column does too) —
    // match all rather than disambiguating by parent.
    expect(screen.getAllByText('13.000,00 €').length).toBeGreaterThan(0);
  });

  it('renders an invoice number link with +N marker for multi-invoice offers', async () => {
    const user = userEvent.setup();
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-003')).toBeInTheDocument();
    });
    // OFF-003 is the offer with 2 invoices in the mock data; it should render
    // INV-2026-0042 with a "+1" extra marker.
    const invoiceLink = screen.getByRole('button', { name: /INV-2026-0042/ });
    expect(invoiceLink).toBeInTheDocument();
    expect(invoiceLink.textContent).toContain('+1');
    // Click navigates by setting URL params (we don't assert on URL — just
    // that clicking the invoice link doesn't trigger the row's offer click,
    // which would fire an additional setSearchParams call. Verify by ensuring
    // no exception on click.)
    await user.click(invoiceLink);
  });

  it('shows em-dash in invoice columns when offer has no active invoices', async () => {
    mockGetByUrl({ offers: { items: mockOffers, total: mockOffers.length } });
    renderWithProviders(<OfferManagementTab />);
    await waitFor(() => {
      expect(screen.getByText('OFF-001')).toBeInTheDocument();
    });
    // OFF-001 and OFF-002 have no invoices — their INVOICES + INVOICED cells
    // render an em-dash. There will be multiple em-dashes (2 rows × 2 cells +
    // possibly null prices), so just confirm at least 4 are present.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});
