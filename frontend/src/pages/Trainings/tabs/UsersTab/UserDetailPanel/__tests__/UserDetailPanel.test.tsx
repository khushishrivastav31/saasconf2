import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserDetailPanel from '../index';
import type { PortalUser } from '../../types';

vi.mock('../../../../../../config/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../../../../hooks/useAuthMedia', () => ({
  useAuthMedia: () => null,
}));

vi.mock('../../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../../../../components/common/RichTextEditor', () => ({
  default: ({ value }: { value: string }) => <div data-testid="rich-text">{value}</div>,
}));

vi.mock('../../../../../../components/CustomerTimelineCard', () => ({
  default: ({ portalUserId }: { portalUserId: string }) => (
    <div data-testid="timeline-card">timeline:{portalUserId}</div>
  ),
}));

vi.mock('../../MergeDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="merge-dialog">
      <button onClick={onClose}>close merge</button>
    </div>
  ),
}));

import api from '../../../../../../config/api';

const mockApi = vi.mocked(api);

const profileBase = {
  id: 'att-1',
  first_name: 'Jane',
  last_name: 'Trainee',
  email: 'jane@example.com',
  status: 'active',
  portal_user_id: 'pu-1',
  portal_account: {
    id: 'pu-1',
    email: 'jane@example.com',
    is_active: true,
    has_password: true,
    email_verified: true,
    last_login_at: '2026-04-01T10:00:00Z',
    created_at: '2026-01-01T10:00:00Z',
  },
  registrations: [
    {
      registration_id: 'r1',
      status: 'registered',
      training_name: 'Kubernetes 101',
      training_date: '2026-05-01',
      location_name: 'Berlin',
      location_city: 'Berlin',
      contact_first_name: 'Jane',
      contact_last_name: 'Trainee',
      contact_email: 'jane@example.com',
      contact_phone: null,
      company_name: 'Acme',
      street: null,
      postal_code: null,
      city: null,
      country: null,
      vat_number: null,
      payment_method: null,
      po_number: null,
      discount_code: null,
      subtotal: null,
      vat_amount: null,
      total: null,
      currency: null,
      exam_mode: null,
      exam_language: null,
      extra_time: false,
      notes: null,
      created_at: '2026-04-01T00:00:00Z',
    },
  ],
  offer_links: [],
  history: [],
};

const editableBase = {
  first_name: 'Jane',
  last_name: 'Trainee',
  email: 'jane@example.com',
  pronouns: '',
  phone: '',
  title: '',
  company: 'Acme',
  bio: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  postal_code: '',
  country: '',
  picture_url: null,
  video_url: null,
};

function setupApi(profile = profileBase, editable: typeof editableBase | null = editableBase) {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes('/profile')) return Promise.resolve({ data: profile });
    if (url.startsWith('/trainings/users/')) return Promise.resolve({ data: editable });
    return Promise.resolve({ data: null });
  });
}

function renderPanel(selected: Partial<PortalUser> = {}) {
  const user: PortalUser = {
    id: 'att-1',
    first_name: 'Jane',
    last_name: 'Trainee',
    email: 'jane@example.com',
    status: 'active',
    notes: null,
    current_training: '',
    current_training_date: null,
    portal_user_id: 'pu-1',
    created_at: null,
    history: [],
    ...selected,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserDetailPanel selectedUser={user} items={[user]} onBack={() => {}} />
    </QueryClientProvider>
  );
}

describe('Trainings UserDetailPanel — 4-tab shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header, 4 tabs, and shows Profile form by default when portal account exists', async () => {
    setupApi();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    for (const label of ['Profile', 'Portal Account', 'Activity', 'Registrations']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText(/^Media$/i)).toBeInTheDocument());
  });

  it('switches to Portal Account tab to show status + 5 admin actions', async () => {
    setupApi();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Portal Account/ }));

    expect(screen.getByRole('heading', { name: /Portal Account/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toggle Access/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend Invite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset Password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Impersonate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merge with/i })).toBeInTheDocument();
  });

  it('switches to Activity tab and renders the CustomerTimelineCard bound to portal_user_id', async () => {
    setupApi();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));

    expect(screen.getByTestId('timeline-card').textContent).toBe('timeline:pu-1');
  });

  it('switches to Registrations tab and lists the registrations', async () => {
    setupApi();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Registrations/ }));

    expect(screen.getByText(/Kubernetes 101/)).toBeInTheDocument();
  });

  it('shows the Registrations tab count from profile data', async () => {
    setupApi();
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    const regBtn = screen.getByRole('button', { name: /Registrations/ });
    expect(regBtn.textContent).toMatch(/Registrations\s*\(1\)/);
  });

  it('opens the Merge dialog when clicking "Merge with…" on the Portal tab', async () => {
    setupApi();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Portal Account$/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Portal Account$/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /Merge with/ }));

    await waitFor(() => expect(screen.getByTestId('merge-dialog')).toBeInTheDocument());
  });

  it('when there is no portal account: Profile shows a prompt linking to Portal Account tab, and Portal tab shows the "Create portal account" notice', async () => {
    const profile = { ...profileBase, portal_user_id: null, portal_account: null };
    setupApi(profile, null);
    renderPanel({ portal_user_id: null });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );

    expect(
      screen.getByText(/Profile editing is available once a portal account is linked/)
    ).toBeInTheDocument();
    const portalButtons = screen.getAllByRole('button', { name: /^Portal Account$/ });
    expect(portalButtons.length).toBeGreaterThanOrEqual(2);
    // First matches the tab bar button; clicking it switches to the Portal tab.
    fireEvent.click(portalButtons[0]);
    expect(screen.getByRole('button', { name: /Create Portal Account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Activity$/ }));
    expect(
      screen.getByText(/Activity is available once a portal account is linked/)
    ).toBeInTheDocument();
  });

  it('renders a "Reactivate" primary action in the header when the user is inactive', async () => {
    const profile = { ...profileBase, status: 'inactive' };
    setupApi(profile);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Jane Trainee/ })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /^Reactivate$/ })).toBeInTheDocument();
    expect(screen.getByText(/Inactive/)).toBeInTheDocument();
  });
});
