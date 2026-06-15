/**
 * Tests for MyCompany deep-link via ?tab=privacy URL param.
 * RED phase: fails until MyCompany/index.tsx seeds activeTab from URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import MyCompany from '../index';

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

vi.mock('../CompanyForm', () => ({
  default: () => <div data-testid="company-form" />,
}));

vi.mock('../EmailSettingsTab', () => ({
  default: () => <div data-testid="email-settings-tab" />,
}));

vi.mock('../UsersTab', () => ({
  default: () => <div data-testid="users-tab" />,
}));

vi.mock('../PrivacyRequestsTab', () => ({
  default: () => <div data-testid="privacy-requests-tab" />,
}));

import api from '../../../config/api';

const mockApi = vi.mocked(api);

const sampleTenant = {
  id: 'tenant-1',
  name: 'Test Corp',
  slug: 'test-corp',
  is_active: true,
  contact_persons: [],
  resend_api_key: null,
  resend_from_email: null,
  resend_from_name: null,
};

function renderAtPath(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/my-company" element={<MyCompany />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MyCompany URL tab deep-link', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue({ data: sampleTenant });
  });

  it('shows Company tab by default', async () => {
    renderAtPath('/my-company');
    await waitFor(() => expect(screen.getByTestId('company-form')).toBeInTheDocument());
    expect(screen.queryByTestId('privacy-requests-tab')).not.toBeInTheDocument();
  });

  it('opens Privacy Requests tab when ?tab=privacy is in the URL', async () => {
    renderAtPath('/my-company?tab=privacy');
    await waitFor(() => expect(screen.getByTestId('privacy-requests-tab')).toBeInTheDocument());
    expect(screen.queryByTestId('company-form')).not.toBeInTheDocument();
  });

  it('privacy tab button is highlighted when ?tab=privacy', async () => {
    renderAtPath('/my-company?tab=privacy');
    await waitFor(() => screen.getByText('Privacy Requests'));
    const btn = screen.getByRole('button', { name: /privacy requests/i });
    expect(btn.className).toContain('border-primary-500');
  });
});
