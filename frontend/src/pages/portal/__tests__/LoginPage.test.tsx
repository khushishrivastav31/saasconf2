import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import LoginPage from '../LoginPage';

vi.mock('../../../config/portalApi', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock('../../../hooks/useApplicantAuth', () => ({
  useApplicantAuth: () => ({ login: vi.fn() }),
}));

vi.mock('../../../components/ConferenceLogo', () => ({
  default: () => null,
}));

vi.mock('../../../components/ThemeToggle', () => ({
  default: () => null,
}));

vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../PublicRegistration/components/PolicyLinks', () => ({
  default: () => null,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({ data: undefined, isLoading: false }),
  };
});

function renderPage(slug = 'acme') {
  return render(
    <MemoryRouter initialEntries={[`/${slug}/portal/user/login`]}>
      <Routes>
        <Route path=":companySlug/portal/user/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage — forgot password link (QA 019)', () => {
  it('renders a "Forgot password?" link pointing to the portal forgot-password page', () => {
    renderPage('acme');

    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/acme/portal/forgot-password');
  });
});
