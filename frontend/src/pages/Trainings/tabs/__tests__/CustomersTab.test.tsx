import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import CustomersTab from '../CustomersTab';

vi.mock('../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../../../../components/common/VatNumberInput', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      data-testid="vat-number-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../../../../components/ContactPersonList', () => ({
  default: () => <div data-testid="contact-person-list" />,
}));

vi.mock('../CustomerDetailPanel', () => ({
  default: () => <div data-testid="customer-detail-panel">Customer Detail Panel</div>,
}));

import api from '../../../../config/api';

const mockApi = vi.mocked(api);

const mockCustomers = [
  {
    id: 'cust-1',
    tenant_id: 'tenant-1',
    name: 'Acme Corp',
    contact_person: 'John Doe',
    email: 'john@acme.com',
    phone: '+49123456',
    website: 'acme.com',
    address_line1: 'Street 1',
    address_line2: null,
    city: 'Berlin',
    state: null,
    postal_code: '10115',
    country: 'DE',
    vat_number: 'DE123456789',
    comments: null,
    contact_persons: [],
    price: null,
    currency: null,
    notes: null,
    is_active: true,
    has_inhouse_trainings: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cust-2',
    tenant_id: 'tenant-1',
    name: 'Beta Inc',
    contact_person: null,
    email: null,
    phone: null,
    website: null,
    address_line1: null,
    address_line2: null,
    city: 'Munich',
    state: null,
    postal_code: null,
    country: 'DE',
    vat_number: null,
    comments: null,
    contact_persons: [],
    price: null,
    currency: null,
    notes: null,
    is_active: false,
    has_inhouse_trainings: false,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
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

describe('CustomersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      data: { items: mockCustomers, total: 2, page: 1, page_size: 500 },
    });
  });

  it('renders "Customers" heading', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('Customers')).toBeInTheDocument();
    });
  });

  it('shows search input', async () => {
    renderWithProviders(<CustomersTab />);
    expect(screen.getByPlaceholderText('Search customers...')).toBeInTheDocument();
  });

  it('shows "+ Add Customer" button', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Customer')).toBeInTheDocument();
    });
  });

  it('renders customer table with customer data', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Munich')).toBeInTheDocument();
  });

  it('renders table column headers', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('Company')).toBeInTheDocument();
    });
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows active/inactive status badges', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows customer count badge', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('create form shows on "+ Add Customer" button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Customer')).toBeInTheDocument();
    });
    await user.click(screen.getByText('+ Add Customer'));
    expect(screen.getByText('New Customer')).toBeInTheDocument();
    expect(screen.getByText('Company Name *')).toBeInTheDocument();
  });

  it('create form has Cancel button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Customer')).toBeInTheDocument();
    });
    await user.click(screen.getByText('+ Add Customer'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('create form Cancel closes the form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Customer')).toBeInTheDocument();
    });
    await user.click(screen.getByText('+ Add Customer'));
    expect(screen.getByText('New Customer')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Customer')).not.toBeInTheDocument();
  });

  it('shows empty state when no customers', async () => {
    mockApi.get.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 500 },
    });
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText(/No customers yet/)).toBeInTheDocument();
    });
  });

  it('customer detail panel opens on row click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Acme Corp'));
    expect(screen.getByTestId('customer-detail-panel')).toBeInTheDocument();
  });

  it('fetches customers from /trainings/customers', async () => {
    renderWithProviders(<CustomersTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/trainings/customers',
        expect.objectContaining({
          params: expect.objectContaining({ page_size: '500' }),
        })
      );
    });
  });

  it('shows description text', async () => {
    renderWithProviders(<CustomersTab />);
    expect(screen.getByText('Manage B2B customers for trainings.')).toBeInTheDocument();
  });
});
