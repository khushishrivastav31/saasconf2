import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import SetPasswordPage from '../SetPasswordPage';

vi.mock('../../../config/portalApi', () => ({
  default: {
    post: vi.fn(),
  },
}));

import portalApi from '../../../config/portalApi';
const mockPortalApi = vi.mocked(portalApi);

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(token = 'valid-raw-token', slug = 'test-corp') {
  return render(
    <MemoryRouter initialEntries={[`/${slug}/portal/set-password?token=${token}`]}>
      <Routes>
        <Route path=":companySlug/portal/set-password" element={<SetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SetPasswordPage', () => {
  it('renders "Set your password" heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /set your password/i })).toBeInTheDocument();
  });

  it('does not render admin navigation', () => {
    renderPage();
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /dashboard/i })).toBeNull();
  });

  it('submits to setup-password endpoint and redirects to portal login on success', async () => {
    mockPortalApi.post.mockResolvedValueOnce({ data: { message: 'Password set successfully.' } });
    renderPage('valid-token', 'acme');

    await userEvent.type(screen.getByLabelText(/new password/i), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(mockPortalApi.post).toHaveBeenCalledWith('/portal/acme/unified/setup-password', {
        token: 'valid-token',
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
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockPortalApi.post).not.toHaveBeenCalled();
  });

  it('shows "Link expired" error on 400 response', async () => {
    mockPortalApi.post.mockRejectedValueOnce({
      response: { status: 400, data: { detail: 'Invalid or expired setup link' } },
    });
    renderPage();

    await userEvent.type(screen.getByLabelText(/new password/i), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
  });

  it('shows invalid link message when no token in URL', () => {
    render(
      <MemoryRouter initialEntries={['/test-corp/portal/set-password']}>
        <Routes>
          <Route path=":companySlug/portal/set-password" element={<SetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
  });

  it('"Go to login" link points to portal login page', async () => {
    mockPortalApi.post.mockResolvedValueOnce({ data: { message: 'Password set successfully.' } });
    renderPage('valid-token', 'acme');

    await userEvent.type(screen.getByLabelText(/new password/i), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/acme/portal/user/login', expect.anything());
    });
  });
});
