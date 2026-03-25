import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import api from '../../../../../config/api';

const mockApi = vi.mocked(api);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const defaultPolicies = {
  privacy_policy: { type: null, url: null, content: null, enabled: false },
  cookies_policy: { type: null, url: null, content: null, enabled: false },
  imprint: { type: null, url: null, content: null, enabled: false },
  terms_and_conditions: { type: null, url: null, content: null, enabled: false },
  code_of_conduct: { type: null, url: null, content: null, enabled: false },
};

describe('Training PoliciesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: defaultPolicies });
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

  it('fetches policies from /trainings/policies', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/policies');
    });
  });

  it('shows save button disabled when no changes', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('enables save button after toggling a policy', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });
    // All toggles start as "Hidden" checkboxes
    const toggles = screen.getAllByRole('checkbox');
    await user.click(toggles[0]);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeEnabled();
  });

  it('shows info box about shared policies', async () => {
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText(/shared across all trainings/i)).toBeInTheDocument();
    });
  });

  it('saves policies via PUT /trainings/policies', async () => {
    const user = userEvent.setup();
    mockApi.put.mockResolvedValue({ data: defaultPolicies });
    renderWithProviders(<PoliciesTab />);
    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });
    // Toggle privacy policy on
    const toggles = screen.getAllByRole('checkbox');
    await user.click(toggles[0]);
    // Save
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith(
        '/trainings/policies',
        expect.objectContaining({
          privacy_policy: expect.objectContaining({ enabled: true }),
        })
      );
    });
  });
});
