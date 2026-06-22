import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CFPProgramCommittee from '../CFPProgramCommittee';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../../hooks/useIsAdmin', () => ({ useIsAdmin: () => true }));
vi.mock('../../../../hooks/useSaveStatus', () => ({
  useSaveStatus: () => ({
    saveStatus: 'idle' as const,
    setSaving: vi.fn(),
    setSaved: vi.fn(),
    setError: vi.fn(),
  }),
}));
vi.mock('../../../../hooks/useAuthMedia', () => ({ useAuthMedia: () => null }));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../ConferenceDetail/icons', () => ({
  DeleteIcon: () => <span>Delete</span>,
}));

vi.mock('../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>ConfirmRemove</button>
        <button onClick={onCancel}>CancelRemove</button>
      </div>
    ) : null,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockMember = {
  id: 'm-1',
  tenant_id: 't-1',
  conference_id: 'conf-1',
  applicant_id: 'app-1',
  role: 'Reviewer',
  expertise_areas: [],
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@example.com',
  phone: null,
  title: null,
  company: 'Acme',
  picture_url: null,
  topics: [
    {
      id: 'topic-1',
      name: 'Security',
      tenant_id: 't-1',
      description: null,
      created_at: '',
      updated_at: '',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const emptyListResponse = { items: [], total: 0 };
const listWithMemberResponse = { items: [mockMember], total: 1 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderComponent(isAdmin = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CFPProgramCommittee conferenceId="conf-1" isAdmin={isAdmin} />
    </QueryClientProvider>
  );
}

// ── Phase 1: Navigation label / heading ──────────────────────────────────────

describe('CFPProgramCommittee — heading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: emptyListResponse });
  });

  it('renders "Program Committee" as the section heading', async () => {
    renderComponent();
    expect(await screen.findByText('Program Committee')).toBeTruthy();
  });
});

// ── Phase 2: Add Member button prominence ─────────────────────────────────────

describe('CFPProgramCommittee — Add Member button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: emptyListResponse });
  });

  it('shows an "Add Member" button for admins', async () => {
    renderComponent();
    expect(await screen.findByRole('button', { name: /add member/i })).toBeTruthy();
  });

  it('"Add Member" button uses solid primary style (not ghost/outline)', async () => {
    renderComponent();
    const btn = await screen.findByRole('button', { name: /add member/i });
    // Should have a solid primary background, not the ghost bg-primary-50 style
    expect(btn.className).toMatch(/bg-primary-600|bg-blue-600/);
  });

  it('does not show "Add Member" button for non-admins', async () => {
    renderComponent(false);
    await screen.findByText('Program Committee');
    expect(screen.queryByRole('button', { name: /add member/i })).toBeNull();
  });

  it('clicking "Add Member" shows the add form', async () => {
    renderComponent();
    fireEvent.click(await screen.findByRole('button', { name: /add member/i }));
    expect(await screen.findByText('Add Committee Member')).toBeTruthy();
  });
});

// ── Phase 3: Topic assignment in form ────────────────────────────────────────

describe('CFPProgramCommittee — topic assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/committee-members')) return Promise.resolve({ data: emptyListResponse });
      if (url.includes('/cfp/topics'))
        return Promise.resolve({
          data: { items: [{ id: 'topic-1', name: 'Security' }], total: 1 },
        });
      if (url.includes('/committee-roles'))
        return Promise.resolve({ data: { items: [], total: 0 } });
      if (url.includes('/cfp/applicants'))
        return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
  });

  it('topic chips appear in the add form', async () => {
    renderComponent();
    fireEvent.click(await screen.findByRole('button', { name: /add member/i }));
    expect(await screen.findByText('Security')).toBeTruthy();
  });
});

// ── Phase 3c: Role descriptions legend ────────────────────────────────────────

describe('CFPProgramCommittee — role descriptions', () => {
  const roles = [
    {
      id: 'r-1',
      name: 'Chair',
      description: 'Overall program committee leadership',
      is_active: true,
    },
    {
      id: 'r-2',
      name: 'Co-Chair',
      description: 'Assists the chair with program decisions',
      is_active: true,
    },
    {
      id: 'r-3',
      name: 'Reviewer',
      description: 'Reviews and scores paper submissions',
      is_active: true,
    },
    { id: 'r-4', name: 'Track Lead', description: 'Leads a specific topic track', is_active: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/committee-members')) return Promise.resolve({ data: emptyListResponse });
      if (url.includes('/committee-roles'))
        return Promise.resolve({ data: { items: roles, total: roles.length } });
      return Promise.resolve({ data: { items: [], total: 0 } });
    });
  });

  it('add form lists every role name with its description', async () => {
    renderComponent();
    fireEvent.click(await screen.findByRole('button', { name: /add member/i }));
    // Wait for the async committee-roles query to resolve and the legend to render.
    await screen.findByText(roles[0].description);
    for (const r of roles) {
      expect(screen.getByText(r.name, { selector: 'dt' })).toBeTruthy();
      expect(screen.getByText(r.description)).toBeTruthy();
    }
  });

  it('shows a note that roles do not change member access', async () => {
    renderComponent();
    fireEvent.click(await screen.findByRole('button', { name: /add member/i }));
    expect(await screen.findByText(/don't change a member's access/i)).toBeTruthy();
  });

  it('does not render a description entry for inactive roles', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/committee-members')) return Promise.resolve({ data: emptyListResponse });
      if (url.includes('/committee-roles'))
        return Promise.resolve({
          data: {
            items: [
              ...roles,
              { id: 'r-5', name: 'Retired', description: 'Should not show', is_active: false },
            ],
            total: roles.length + 1,
          },
        });
      return Promise.resolve({ data: { items: [], total: 0 } });
    });
    renderComponent();
    fireEvent.click(await screen.findByRole('button', { name: /add member/i }));
    await screen.findByText('Add Committee Member');
    expect(screen.queryByText('Should not show')).toBeNull();
  });
});

// ── Phase 3b: Topic chips in member list row ──────────────────────────────────

describe('CFPProgramCommittee — topic chips in list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/committee-members'))
        return Promise.resolve({ data: listWithMemberResponse });
      return Promise.resolve({ data: { items: [], total: 0 } });
    });
  });

  it('member row shows assigned topic chips', async () => {
    renderComponent();
    expect(await screen.findByText('Security')).toBeTruthy();
  });
});
