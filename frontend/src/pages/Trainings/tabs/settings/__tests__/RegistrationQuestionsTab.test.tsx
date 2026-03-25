import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegistrationQuestionsTab from '../RegistrationQuestionsTab';

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

const defaultSettings = {
  enabled: false,
  questions: [],
};

const defaultPolicies = {
  privacy_policy: { type: null, url: null, content: null, enabled: false },
  cookies_policy: { type: null, url: null, content: null, enabled: false },
  imprint: { type: null, url: null, content: null, enabled: false },
  terms_and_conditions: { type: null, url: null, content: null, enabled: false },
  code_of_conduct: { type: null, url: null, content: null, enabled: false },
};

describe('Training RegistrationQuestionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('policies')) return Promise.resolve({ data: defaultPolicies });
      return Promise.resolve({ data: defaultSettings });
    });
  });

  it('renders header and disabled state', async () => {
    renderWithProviders(<RegistrationQuestionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Registration Questions')).toBeInTheDocument();
    });
    expect(screen.getByText(/apply to all trainings/i)).toBeInTheDocument();
  });

  it('fetches from /trainings/registration-questions', async () => {
    renderWithProviders(<RegistrationQuestionsTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/registration-questions');
    });
  });

  it('shows save button disabled when no changes', async () => {
    renderWithProviders(<RegistrationQuestionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Registration Questions')).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('enables save after toggling enabled checkbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistrationQuestionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Registration Questions')).toBeInTheDocument();
    });
    const enabledCheckbox = screen.getByRole('checkbox', { name: /enabled/i });
    await user.click(enabledCheckbox);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeEnabled();
  });

  it('shows empty state when enabled with no questions', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('policies')) return Promise.resolve({ data: defaultPolicies });
      return Promise.resolve({ data: { enabled: true, questions: [] } });
    });
    renderWithProviders(<RegistrationQuestionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/No questions defined yet/i)).toBeInTheDocument();
    });
  });
});
