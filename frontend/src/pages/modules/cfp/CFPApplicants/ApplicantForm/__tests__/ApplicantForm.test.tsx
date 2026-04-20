import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicantForm } from '../index';
import type { Applicant } from '../../../../../../types';

vi.mock('../../../../../../config/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../../../../../hooks/useAuthMedia', () => ({
  useAuthMedia: () => null,
}));

vi.mock('../../../../../../components/common/RichTextEditor', () => ({
  default: ({ value }: { value: string }) => <div data-testid="rich-text">{value}</div>,
}));

vi.mock('../../../../../../components/PortalAccountCard', () => ({
  default: ({ portalUserId }: { portalUserId: string }) => (
    <div data-testid="portal-account-card">portal:{portalUserId}</div>
  ),
}));

vi.mock('../../../../../../components/CustomerTimelineCard', () => ({
  default: ({ portalUserId }: { portalUserId: string }) => (
    <div data-testid="timeline-card">timeline:{portalUserId}</div>
  ),
}));

vi.mock('../../ApplicantPapers', () => ({
  ApplicantPapers: ({ applicantId }: { applicantId: string }) => (
    <div data-testid="applicant-papers">papers:{applicantId}</div>
  ),
}));

import api from '../../../../../../config/api';

const mockApi = vi.mocked(api);

function makeApplicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: 'app-1',
    tenant_id: 't-1',
    portal_user_id: 'pu-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    pronouns: null,
    email: 'ada@example.com',
    phone: null,
    title: null,
    company: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    postal_code: null,
    country: null,
    bio: null,
    allow_out_of_timeframe: false,
    social_links: {},
    needs_accessibility: false,
    accessibility_details: null,
    agrees_to_recording: false,
    roles: [],
    picture_url: null,
    video_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderForm(applicant: Applicant | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApplicantForm
        applicant={applicant}
        onSave={() => {}}
        onCancel={() => {}}
        isSaving={false}
        error={null}
      />
    </QueryClientProvider>
  );
}

describe('CFP ApplicantForm — conditional tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/pronoun-options')) return Promise.resolve({ data: { items: [] } });
      return Promise.resolve({ data: { items: [] } });
    });
  });

  it('shows the full 4-tab shell when editing an applicant linked to a portal user', async () => {
    renderForm(makeApplicant());
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument()
    );
    for (const label of ['Profile', 'Portal Account', 'Activity', 'Papers']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
  });

  it('shows only Profile + Papers tabs when editing an applicant with no portal_user_id', async () => {
    renderForm(makeApplicant({ portal_user_id: null }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /^Profile/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Papers/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Portal Account/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Activity/ })).toBeNull();
  });

  it('hides the tab bar entirely when creating a new applicant', () => {
    renderForm(null);
    expect(screen.queryByRole('button', { name: /^Profile/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Papers/ })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('switches to the Portal Account tab and renders PortalAccountCard bound to portal_user_id', async () => {
    renderForm(makeApplicant({ portal_user_id: 'pu-42' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Portal Account/ }));
    expect(screen.getByTestId('portal-account-card').textContent).toBe('portal:pu-42');
  });

  it('switches to the Activity tab and renders CustomerTimelineCard bound to portal_user_id', async () => {
    renderForm(makeApplicant({ portal_user_id: 'pu-42' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));
    expect(screen.getByTestId('timeline-card').textContent).toBe('timeline:pu-42');
  });

  it('switches to the Papers tab and renders ApplicantPapers bound to applicant.id', async () => {
    renderForm(makeApplicant({ id: 'app-99' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Papers/ }));
    expect(screen.getByTestId('applicant-papers').textContent).toBe('papers:app-99');
  });

  it('renders Profile form content (Media, Identity, Address sections) on mount', async () => {
    renderForm(makeApplicant());
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Media$/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: /^Identity$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /^Address$/i }).length).toBeGreaterThan(0);
  });
});
