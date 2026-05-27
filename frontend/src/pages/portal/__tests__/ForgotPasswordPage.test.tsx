import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import ForgotPasswordPage from '../ForgotPasswordPage';

vi.mock('../../../config/portalApi', () => ({
  default: { post: vi.fn() },
}));

import portalApi from '../../../config/portalApi';
const mockPortalApi = vi.mocked(portalApi);

function renderPage(slug = 'acme') {
  return render(
    <MemoryRouter initialEntries={[`/${slug}/portal/forgot-password`]}>
      <Routes>
        <Route path=":companySlug/portal/forgot-password" element={<ForgotPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('renders an email input and submit button', () => {
    renderPage();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('POSTs to unified/forgot-password and shows confirmation message', async () => {
    mockPortalApi.post.mockResolvedValueOnce({ data: {} });
    renderPage('acme');

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockPortalApi.post).toHaveBeenCalledWith('/portal/acme/unified/forgot-password', {
        email: 'user@example.com',
      });
    });

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it('shows confirmation even when email is not found (no disclosure)', async () => {
    mockPortalApi.post.mockRejectedValueOnce({ response: { status: 404 } });
    renderPage();

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });
});
