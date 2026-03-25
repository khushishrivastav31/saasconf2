import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SystemEmailTemplatesTab from '../SystemEmailTemplatesTab';

vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../../../../config/api';

const mockApi = vi.mocked(api);

const sampleTemplates = [
  {
    template_type: 'training_registration_confirmation',
    display_name: 'Registration Confirmation',
    subject: 'Registration Confirmed — [Training Name]',
    body_html: '<p>Confirmed</p>',
    body_text: 'Confirmed',
    is_active: true,
    is_default: true,
  },
  {
    template_type: 'training_invoice_send',
    display_name: 'Invoice Send',
    subject: 'Invoice [Invoice Number]',
    body_html: '<p>Invoice</p>',
    body_text: 'Invoice',
    is_active: true,
    is_default: false,
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Training SystemEmailTemplatesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: sampleTemplates });
  });

  it('renders template list heading', async () => {
    renderWithProviders(<SystemEmailTemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('Email Templates')).toBeInTheDocument();
    });
  });

  it('renders template rows', async () => {
    renderWithProviders(<SystemEmailTemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('Registration Confirmation')).toBeInTheDocument();
    });
    expect(screen.getByText('Invoice Send')).toBeInTheDocument();
  });

  it('shows Customized badge for non-default templates', async () => {
    renderWithProviders(<SystemEmailTemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('Customized')).toBeInTheDocument();
    });
  });

  it('fetches from /trainings/email-templates', async () => {
    renderWithProviders(<SystemEmailTemplatesTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/email-templates');
    });
  });
});
