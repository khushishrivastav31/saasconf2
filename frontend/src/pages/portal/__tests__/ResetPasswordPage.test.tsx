import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import ResetPasswordPage from '../ResetPasswordPage';

vi.mock('../../../config/portalApi', () => ({
  default: { post: vi.fn() },
}));

import portalApi from '../../../config/portalApi';
const mockPortalApi = vi.mocked(portalApi);

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(token = 'valid-token', slug = 'acme') {
  return render(
    <MemoryRouter initialEntries={[`/${slug}/portal/reset-password?token=${token}`]}>
      <Routes>
        <Route path=":companySlug/portal/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResetPasswordPage', () => {
  it('renders "Reset your password" heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
  });

  it('shows invalid link message when no token in URL', () => {
    render(
      <MemoryRouter initialEntries={['/acme/portal/reset-password']}>
        <Routes>
          <Route path=":companySlug/portal/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
  });

  it('POSTs to unified/reset-password with token and redirects to login on success', async () => {
    mockPortalApi.post.mockResolvedValueOnce({ data: {} });
    renderPage('abc123', 'acme');

    await userEvent.type(screen.getByLabelText(/new password/i), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockPortalApi.post).toHaveBeenCalledWith('/portal/acme/unified/reset-password', {
        token: 'abc123',
        password: 'Str0ng!Pass',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/acme/portal/user/login',
        expect.objectContaining({ state: expect.objectContaining({ message: expect.any(String) }) })
      );
    });
  });

  it('shows error when passwords do not match', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText(/new password/i), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Different!Pass');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockPortalApi.post).not.toHaveBeenCalled();
  });

  it('shows error on expired token', async () => {
    mockPortalApi.post.mockRejectedValueOnce({
      response: { status: 400, data: { detail: 'Invalid or expired reset link' } },
    });
    renderPage();

    await userEvent.type(screen.getByLabelText(/new password/i), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
  });
});
