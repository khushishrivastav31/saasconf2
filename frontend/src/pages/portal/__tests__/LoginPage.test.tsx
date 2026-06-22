import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import LoginPage from '../LoginPage';
import type { PortalMe } from '../../../types/portal';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../config/portalApi', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

const mockLogin = vi.fn();
vi.mock('../../../hooks/useApplicantAuth', () => ({
  useApplicantAuth: () => ({ login: mockLogin }),
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

const baseMe: PortalMe = {
  id: 'u1',
  email: 'speaker@example.com',
  first_name: 'Alice',
  last_name: 'Speaker',
  phone: null,
  pronouns: null,
  title: null,
  company: null,
  bio: null,
  social_links: {},
  address_line_1: null,
  address_line_2: null,
  city: null,
  postal_code: null,
  country: null,
  theme_preference: null,
  is_active: true,
  email_verified: true,
  last_login_at: null,
  created_at: '2025-01-01T00:00:00Z',
  has_conference_account: true,
  has_training_account: false,
  cfp_applicant_id: 'applicant-1',
  training_attendee_id: null,
  training_attendee_status: null,
  is_conference_attendee: false,
  is_committee_member: false,
  has_papers: false,
  has_invoices: false,
  has_any_role: false,
};

function renderPage(
  slug = 'acme',
  locationState?: { from?: { pathname: string; search: string } }
) {
  const entry = locationState
    ? { pathname: `/${slug}/portal/user/login`, state: locationState }
    : `/${slug}/portal/user/login`;
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path=":companySlug/portal/user/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function submitForm(email = 'speaker@example.com', password = 'Password1!') {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
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

describe('LoginPage — post-login redirect-back (MAIN-13342)', () => {
  it('navigates to state.from when it is inside the portal', async () => {
    mockLogin.mockResolvedValueOnce(baseMe);
    renderPage('acme', {
      from: { pathname: '/acme/portal/messages', search: '?thread=abc123' },
    });

    await submitForm();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/acme/portal/messages?thread=abc123');
    });
  });

  it('falls back to /news for a conference user when no state.from', async () => {
    mockLogin.mockResolvedValueOnce(baseMe); // has_conference_account: true
    renderPage('acme');

    await submitForm();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/acme/portal/news');
    });
  });

  it('falls back to /trainings for training-only user when no state.from', async () => {
    mockLogin.mockResolvedValueOnce({
      ...baseMe,
      has_conference_account: false,
      has_training_account: true,
    });
    renderPage('acme');

    await submitForm();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/acme/portal/trainings');
    });
  });

  it('ignores state.from outside the portal base path (open-redirect guard)', async () => {
    mockLogin.mockResolvedValueOnce(baseMe);
    renderPage('acme', {
      from: { pathname: '/evil.example.com/steal', search: '' },
    });

    await submitForm();

    await waitFor(() => {
      // Must NOT navigate to the evil URL; falls back to /news
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('evil.example.com'));
      expect(mockNavigate).toHaveBeenCalledWith('/acme/portal/news');
    });
  });
});
