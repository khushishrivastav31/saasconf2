import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompanyForm from '../CompanyForm';
import type { Tenant } from '../../../types';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { baseURL: '' },
  },
}));

vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// The rich-text editor pulls in heavy transitive deps; stub it since the
// Accounting Email flow doesn't interact with it.
vi.mock('../../../components/common/RichTextEditor', () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));

import api from '../../../config/api';

const mockApi = vi.mocked(api);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-1',
    name: 'Acme Corp',
    slug: 'acme',
    is_active: true,
    settings: {},
    address: null,
    postal_code: null,
    city: null,
    country: null,
    phone: null,
    vat_number: null,
    website: null,
    logo_url: null,
    email_domain: null,
    accounting_email: null,
    resend_api_key: null,
    resend_from_email: null,
    resend_from_name: null,
    contact_persons: [],
    comments: null,
    super_user_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user_count: 0,
    module_count: 0,
    ...overrides,
  };
}

describe('CompanyForm — Accounting Email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Accounting Email input with helper text', () => {
    renderWithProviders(<CompanyForm tenant={makeTenant()} onUpdate={() => {}} />);
    expect(screen.getByLabelText(/accounting email/i)).toBeInTheDocument();
    expect(screen.getByText(/cc'd on all invoices and credit notes/i)).toBeInTheDocument();
  });

  it('pre-fills the existing accounting_email from the tenant', () => {
    renderWithProviders(
      <CompanyForm
        tenant={makeTenant({ accounting_email: 'finance@example.com' })}
        onUpdate={() => {}}
      />
    );
    const input = screen.getByLabelText(/accounting email/i) as HTMLInputElement;
    expect(input.value).toBe('finance@example.com');
  });

  it('shows an inline error for invalid email on blur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompanyForm tenant={makeTenant()} onUpdate={() => {}} />);
    const input = screen.getByLabelText(/accounting email/i);
    await user.type(input, 'not-an-email');
    await user.tab();
    await waitFor(() => {
      expect(screen.getByText(/invalid email address format/i)).toBeInTheDocument();
    });
  });

  it('submits accounting_email with the PUT payload on save', async () => {
    const user = userEvent.setup();
    mockApi.put.mockResolvedValue({ data: {} });
    renderWithProviders(<CompanyForm tenant={makeTenant()} onUpdate={() => {}} />);
    await user.type(screen.getByLabelText(/accounting email/i), 'finance@example.com');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith(
        '/my-company',
        expect.objectContaining({ accounting_email: 'finance@example.com' })
      );
    });
  });

  it('submits null to clear accounting_email when field is emptied', async () => {
    const user = userEvent.setup();
    mockApi.put.mockResolvedValue({ data: {} });
    renderWithProviders(
      <CompanyForm
        tenant={makeTenant({ accounting_email: 'finance@example.com' })}
        onUpdate={() => {}}
      />
    );
    await user.clear(screen.getByLabelText(/accounting email/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith(
        '/my-company',
        expect.objectContaining({ accounting_email: null })
      );
    });
  });
});
