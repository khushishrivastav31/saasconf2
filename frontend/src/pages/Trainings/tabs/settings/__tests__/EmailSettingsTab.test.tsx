import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmailSettingsTab from '../EmailSettingsTab';

vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../../../components/common/RichTextEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import api from '../../../../../config/api';

const mockApi = vi.mocked(api);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Training EmailSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      data: {
        email_sending_enabled: true,
        email_header_html: '',
        email_footer_html: '',
      },
    });
  });

  it('renders email settings heading', async () => {
    renderWithProviders(<EmailSettingsTab />);
    await waitFor(() => {
      expect(screen.getByText('Email Settings')).toBeInTheDocument();
    });
  });

  it('renders sending toggle', async () => {
    renderWithProviders(<EmailSettingsTab />);
    await waitFor(() => {
      expect(screen.getByLabelText(/enable email sending/i)).toBeInTheDocument();
    });
  });

  it('renders header and footer editors', async () => {
    renderWithProviders(<EmailSettingsTab />);
    await waitFor(() => {
      expect(screen.getByText('Email Header')).toBeInTheDocument();
    });
    expect(screen.getByText('Email Footer')).toBeInTheDocument();
  });

  it('fetches from /trainings/email-settings', async () => {
    renderWithProviders(<EmailSettingsTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/email-settings');
    });
  });
});
