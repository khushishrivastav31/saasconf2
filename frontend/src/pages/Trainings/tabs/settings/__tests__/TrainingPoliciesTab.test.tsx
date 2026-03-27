import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PoliciesTab from '../PoliciesTab';

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

const defaultPolicies = {
  privacy_policy: { type: null, url: null, content: null, enabled: false },
  cookies_policy: { type: null, url: null, content: null, enabled: false },
  imprint: { type: null, url: null, content: null, enabled: false },
  terms_and_conditions: { type: null, url: null, content: null, enabled: false },
  code_of_conduct: { type: null, url: null, content: null, enabled: false },
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Training PoliciesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: defaultPolicies });
  });

  it('renders "Policies" heading', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Policies')).toBeInTheDocument();
    });
  });

  it('renders description text', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(
        screen.getByText(
          'Configure legal and compliance policies displayed on the training registration portal.'
        )
      ).toBeInTheDocument();
    });
  });

  it('renders all 5 policy cards', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });
    expect(screen.getByText('Cookies Policy')).toBeInTheDocument();
    expect(screen.getByText('Imprint')).toBeInTheDocument();
    expect(screen.getByText('Terms and Conditions')).toBeInTheDocument();
    expect(screen.getByText('Code of Conduct')).toBeInTheDocument();
  });

  it('shows Save Changes button', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  it('save button is disabled when no changes', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Policies')).toBeInTheDocument();
    });
    const saveBtn = screen.getByText('Save Changes');
    expect(saveBtn).toBeDisabled();
  });

  it('fetches from /trainings/policies', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/policies');
    });
  });

  it('shows info box about policy display', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('How policies are displayed')).toBeInTheDocument();
    });
  });
});
