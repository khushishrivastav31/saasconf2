import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ConferenceDetail from '../index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockShowToast = vi.fn();
vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-router', () => ({
  useParams: () => ({ conferenceId: 'conf-1' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('../useConferenceDetail', () => ({
  useConferenceDetail: () => ({
    conference: { id: 'conf-1', name: 'TestConf 2026', status: 'upcoming' },
    isLoading: true, // prevents full sidebar/tab render
    isError: false,
    isAdmin: true,
    handleUpdate: vi.fn(),
    activeSection: 'details',
    setActiveSection: vi.fn(),
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    expandedSections: {},
    setExpandedSections: vi.fn(),
    filteredGroups: [],
    navigate: vi.fn(),
    setIsDirty: vi.fn(),
    showUnsavedDialog: false,
    confirmLeaveTab: vi.fn(),
    cancelLeaveTab: vi.fn(),
  }),
}));

vi.mock('../SelectionContext', () => ({
  SelectionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSelection: () => ({
    setSelectedCommitteeMemberId: vi.fn(),
    setSelectedApplicantId: vi.fn(),
  }),
}));

vi.mock('../DirtyContext', () => ({
  DirtyContext: React.createContext(vi.fn()),
}));

vi.mock('../../../../components/UnsavedChangesDialog', () => ({
  default: () => null,
}));

const mockGet = vi.fn();
const mockPatch = vi.fn();
vi.mock('../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function makeDeadline(overrides: {
  due_date: string;
  is_active?: boolean;
  id?: string;
  title?: string;
}) {
  return {
    id: 'dl-1',
    title: 'CFP Submission Deadline',
    is_active: true,
    ...overrides,
  };
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deadline overdue toast — MAIN-13314', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockPatch.mockResolvedValue({ data: {} });
  });

  it('[RED] fires toast for overdue deadline within 30-day cutoff and includes Mark as resolved action', async () => {
    mockGet.mockResolvedValue({
      data: { items: [makeDeadline({ due_date: days(-3) })], total: 1 },
    });

    render(<ConferenceDetail />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('CFP Submission Deadline'),
        'warning',
        expect.objectContaining({ label: 'Mark as resolved' })
      );
    });
  });

  it('[RED] suppresses toast for deadline overdue by more than 30 days', async () => {
    mockGet.mockResolvedValue({
      data: { items: [makeDeadline({ due_date: days(-31) })], total: 1 },
    });

    render(<ConferenceDetail />, { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 200));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('[RED] does not re-fire toast on re-mount within the same session', async () => {
    mockGet.mockResolvedValue({
      data: { items: [makeDeadline({ due_date: days(-3) })], total: 1 },
    });

    const { unmount } = render(<ConferenceDetail />, { wrapper: createWrapper() });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));

    unmount();
    vi.clearAllMocks();
    // sessionStorage key persists — simulates login-then-navigate-back scenario
    mockGet.mockResolvedValue({
      data: { items: [makeDeadline({ due_date: days(-3) })], total: 1 },
    });

    render(<ConferenceDetail />, { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 200));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('does not show Mark as resolved action for approaching (not yet overdue) deadlines', async () => {
    mockGet.mockResolvedValue({
      data: { items: [makeDeadline({ due_date: days(3) })], total: 1 },
    });

    render(<ConferenceDetail />, { wrapper: createWrapper() });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(mockShowToast).not.toHaveBeenCalledWith(
      expect.any(String),
      'warning',
      expect.objectContaining({ label: 'Mark as resolved' })
    );
  });

  it('suppresses toast for inactive (resolved) deadlines', async () => {
    mockGet.mockResolvedValue({
      data: { items: [makeDeadline({ due_date: days(-3), is_active: false })], total: 1 },
    });

    render(<ConferenceDetail />, { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 200));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('shows single summary toast when 3 or more deadlines are approaching', async () => {
    mockGet.mockResolvedValue({
      data: {
        items: [
          makeDeadline({ id: 'dl-1', title: 'DL 1', due_date: days(-1) }),
          makeDeadline({ id: 'dl-2', title: 'DL 2', due_date: days(2) }),
          makeDeadline({ id: 'dl-3', title: 'DL 3', due_date: days(5) }),
        ],
        total: 3,
      },
    });

    render(<ConferenceDetail />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('3 deadlines'), 'warning');
    });
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });
});
