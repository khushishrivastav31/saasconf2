import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CFPAssignments from '../index';
import type { Paper, Applicant, Cospeaker } from '../../../../../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../../../hooks/useIsAdmin', () => ({ useIsAdmin: () => true }));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../../components/Modal', () => ({
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="modal">{children}</div> : null,
}));

vi.mock('../PaperDetailModal', () => ({
  PaperDetailModal: () => <div data-testid="paper-detail-modal" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeApplicant = (overrides: Partial<Applicant> = {}): Applicant => ({
  id: 'app-1',
  tenant_id: 't-1',
  portal_user_id: null,
  first_name: 'Alice',
  last_name: 'Speaker',
  pronouns: null,
  email: 'alice@example.com',
  phone: null,
  title: null,
  company: null,
  address_line_1: null,
  address_line_2: null,
  city: null,
  postal_code: null,
  country: 'DE',
  bio: null,
  allow_out_of_timeframe: false,
  social_links: {},
  needs_accessibility: false,
  accessibility_details: null,
  agrees_to_recording: true,
  roles: [],
  picture_url: null,
  video_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeCospeaker = (
  name: { first_name: string; last_name: string; country?: string | null },
  invitation_status: Cospeaker['invitation_status']
): Cospeaker => ({
  applicant: makeApplicant({
    id: `app-cs-${name.first_name}`,
    first_name: name.first_name,
    last_name: name.last_name,
    country: name.country ?? 'FR',
  }),
  invitation_status,
  invited_at: '2026-01-01T00:00:00Z',
  responded_at: null,
});

const makePaper = (overrides: Partial<Paper> = {}): Paper => ({
  id: 'paper-1',
  tenant_id: 't-1',
  cfp_id: 'cfp-1',
  cfp_title: null,
  cfp_status: null,
  conference_name: null,
  main_speaker_id: 'app-1',
  main_speaker: makeApplicant({ country: 'DE' }),
  cospeakers: [],
  session_type_id: null,
  session_type_name: null,
  session_type_duration: null,
  topics: [],
  title: 'My Great Talk',
  abstract_short: null,
  abstract_long: null,
  level: null,
  learning_objectives: null,
  status: 'submitted',
  display_status: null,
  video_url: null,
  comments: [],
  must_have_count: 0,
  max_review_score: null,
  review_summaries: [],
  custom_field_answers: null,
  submitted_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeMember = (overrides: Record<string, unknown> = {}) => ({
  id: 'm-1',
  tenant_id: 't-1',
  conference_id: 'conf-1',
  applicant_id: 'app-reviewer',
  role: 'Reviewer',
  expertise_areas: [],
  first_name: 'Bob',
  last_name: 'Reviewer',
  email: 'bob@example.com',
  phone: null,
  title: null,
  company: null,
  picture_url: null,
  topics: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const cfpResponse = {
  items: [
    {
      id: 'cfp-1',
      is_anonymous_review: false,
      reviewers_per_paper: 3,
    },
  ],
  total: 1,
  page: 1,
  page_size: 1,
  pages: 1,
};

const emptyAssignments = { items: [], total: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderComponent(papers: Paper[] = [], members: unknown[] = []) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/cfp?')) return Promise.resolve({ data: cfpResponse });
    if (url.includes('/cfp/papers'))
      return Promise.resolve({ data: { items: papers, total: papers.length } });
    if (url.includes('/cfp/paper-assignments')) return Promise.resolve({ data: emptyAssignments });
    if (url.includes('/cfp/committee-members'))
      return Promise.resolve({ data: { items: members, total: members.length } });
    return Promise.resolve({ data: { items: [], total: 0 } });
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CFPAssignments conferenceId="conf-1" isAdmin={true} />
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PaperAssignmentCard — session type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders session type name and duration badge when both are present', async () => {
    const paper = makePaper({
      session_type_name: 'Workshop',
      session_type_duration: 90,
    });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/Workshop/)).toBeInTheDocument();
      expect(screen.getByText(/90\s*min/i)).toBeInTheDocument();
    });
  });

  it('renders session type name badge when duration is null', async () => {
    const paper = makePaper({ session_type_name: 'Lightning Talk', session_type_duration: null });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/Lightning Talk/)).toBeInTheDocument();
    });
  });

  it('omits the session type badge when session_type_name is null', async () => {
    const paper = makePaper({ session_type_name: null, session_type_duration: 45 });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText('My Great Talk')).toBeInTheDocument();
    });
    // No session type or "min" text should appear
    expect(screen.queryByText(/min/i)).not.toBeInTheDocument();
  });
});

describe('PaperAssignmentCard — co-speaker names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders co-speaker name for pending invitation status', async () => {
    const paper = makePaper({
      cospeakers: [makeCospeaker({ first_name: 'Carol', last_name: 'Pending' }, 'pending')],
    });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/Carol Pending/)).toBeInTheDocument();
    });
  });

  it('renders co-speaker name for accepted invitation status', async () => {
    const paper = makePaper({
      cospeakers: [makeCospeaker({ first_name: 'Dave', last_name: 'Accepted' }, 'accepted')],
    });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/Dave Accepted/)).toBeInTheDocument();
    });
  });

  it('renders co-speaker name for declined invitation status', async () => {
    const paper = makePaper({
      cospeakers: [makeCospeaker({ first_name: 'Eve', last_name: 'Declined' }, 'declined')],
    });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/Eve Declined/)).toBeInTheDocument();
    });
  });

  it('renders invitation status indicator for each co-speaker', async () => {
    const paper = makePaper({
      cospeakers: [
        makeCospeaker({ first_name: 'Frank', last_name: 'A' }, 'accepted'),
        makeCospeaker({ first_name: 'Grace', last_name: 'B' }, 'pending'),
        makeCospeaker({ first_name: 'Heidi', last_name: 'C' }, 'declined'),
      ],
    });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/Frank A/)).toBeInTheDocument();
      expect(screen.getByText(/Grace B/)).toBeInTheDocument();
      expect(screen.getByText(/Heidi C/)).toBeInTheDocument();
    });
  });
});

describe('PaperAssignmentCard — country display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders main speaker country on the card', async () => {
    const paper = makePaper({
      main_speaker: makeApplicant({ first_name: 'Alice', last_name: 'Speaker', country: 'DE' }),
    });
    renderComponent([paper]);

    await waitFor(() => {
      // Should show country code or name (Germany / DE)
      expect(screen.getByText(/Germany|DE/)).toBeInTheDocument();
    });
  });

  it('renders co-speaker country on the card', async () => {
    const paper = makePaper({
      cospeakers: [
        makeCospeaker({ first_name: 'Bob', last_name: 'CoSpeaker', country: 'FR' }, 'accepted'),
      ],
    });
    renderComponent([paper]);

    await waitFor(() => {
      expect(screen.getByText(/France|FR/)).toBeInTheDocument();
    });
  });
});

describe('Assignment conflict tooltip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows speaker conflict reason when member is the main speaker', async () => {
    // Use distinct names so "Bob Reviewer" is not duplicated across member rail + speaker line
    const paper = makePaper({
      main_speaker_id: 'app-reviewer',
      main_speaker: makeApplicant({
        id: 'app-reviewer',
        first_name: 'TestMember',
        last_name: 'Speaker',
      }),
    });
    const member = makeMember({
      first_name: 'TestMember',
      last_name: 'Speaker',
      applicant_id: 'app-reviewer',
    });
    renderComponent([paper], [member]);

    await waitFor(() => {
      expect(screen.getByText('My Great Talk')).toBeInTheDocument();
    });

    // Find the member card (in the reviewer rail — it's a draggable with the member name)
    const allDraggables = document.querySelectorAll('[draggable="true"]');
    // The member rail cards are the ones that are NOT the paper card (paper title is the distinctive thing)
    const paperCard = screen.getByText('My Great Talk').closest('[draggable="true"]');
    const memberCard = Array.from(allDraggables).find(
      (el) => el !== paperCard && el.textContent?.includes('TestMember Speaker')
    );
    expect(memberCard).toBeTruthy();

    await act(async () => {
      fireEvent.dragStart(memberCard!, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });
    });

    await act(async () => {
      fireEvent.dragOver(paperCard!, {
        dataTransfer: { dropEffect: '' },
      });
    });

    // The conflict reason should appear on the paper card
    await waitFor(() => {
      expect(screen.getByText(/reviewer is this paper's speaker/i)).toBeInTheDocument();
    });
  });

  it('shows already-assigned reason when member is already assigned', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cfp?')) return Promise.resolve({ data: cfpResponse });
      if (url.includes('/cfp/papers'))
        return Promise.resolve({
          data: { items: [makePaper()], total: 1 },
        });
      if (url.includes('/cfp/paper-assignments'))
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'assign-1',
                paper_id: 'paper-1',
                paper_title: 'My Great Talk',
                committee_member_id: 'm-1',
                committee_member_first_name: 'UniqueReviewer',
                committee_member_last_name: 'Name',
                is_anonymous: false,
                assigned_at: '2026-01-01T00:00:00Z',
              },
            ],
            total: 1,
          },
        });
      if (url.includes('/cfp/committee-members'))
        return Promise.resolve({
          data: {
            items: [makeMember({ first_name: 'UniqueReviewer', last_name: 'Name' })],
            total: 1,
          },
        });
      return Promise.resolve({ data: { items: [], total: 0 } });
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CFPAssignments conferenceId="conf-1" isAdmin={true} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('My Great Talk')).toBeInTheDocument();
    });

    const allDraggables = document.querySelectorAll('[draggable="true"]');
    const paperCard = screen.getByText('My Great Talk').closest('[draggable="true"]');
    const memberCard = Array.from(allDraggables).find(
      (el) => el !== paperCard && el.textContent?.includes('UniqueReviewer Name')
    );
    expect(memberCard).toBeTruthy();

    await act(async () => {
      fireEvent.dragStart(memberCard!, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });
    });

    await act(async () => {
      fireEvent.dragOver(paperCard!, {
        dataTransfer: { dropEffect: '' },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/already assigned/i)).toBeInTheDocument();
    });
  });
});
