import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import CFPEvaluatedPapers from '../CFPEvaluatedPapers';
import type { Paper, Applicant } from '../../../../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../EvaluatedPaperCard', () => ({
  default: ({ paper }: { paper: Paper }) => <div data-testid="paper-card">{paper.title}</div>,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

const makePaper = (overrides: Partial<Paper> = {}): Paper => ({
  id: 'paper-1',
  tenant_id: 't-1',
  cfp_id: 'cfp-1',
  cfp_title: null,
  cfp_status: null,
  conference_name: null,
  main_speaker_id: 'app-1',
  main_speaker: makeApplicant(),
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
  status: 'final_consideration',
  display_status: null,
  video_url: null,
  comments: [],
  must_have_count: 0,
  max_review_score: 10,
  review_summaries: [],
  custom_field_answers: null,
  submitted_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const emptyFormSchema = {
  id: 'schema-1',
  tenant_id: 't-1',
  conference_id: 'conf-1',
  version: 1,
  builtin_fields_config: {},
  fields: [],
  variants: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderComponent(papers: Paper[]) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/cfp/papers'))
      return Promise.resolve({ data: { items: papers, total: papers.length } });
    if (url.includes('/paper-form-schema')) return Promise.resolve({ data: emptyFormSchema });
    return Promise.resolve({ data: { items: [], total: 0 } });
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/conferences/conf-1/evaluated-papers']}>
        <Routes>
          <Route
            path="/conferences/:conferenceId/evaluated-papers"
            element={<CFPEvaluatedPapers />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function cardTitles() {
  return screen.getAllByTestId('paper-card').map((el) => el.textContent);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CFPEvaluatedPapers — sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts by session type ascending and descending', async () => {
    const papers = [
      makePaper({ id: 'p1', title: 'Talk A', session_type_name: 'Workshop' }),
      makePaper({ id: 'p2', title: 'Talk B', session_type_name: 'Keynote' }),
      makePaper({ id: 'p3', title: 'Talk C', session_type_name: 'Lightning Talk' }),
    ];
    renderComponent(papers);

    await waitFor(() => expect(cardTitles()).toHaveLength(3));

    const select = screen.getByLabelText(/sort by/i);
    fireEvent.change(select, { target: { value: 'session_type_asc' } });
    await waitFor(() => {
      expect(cardTitles()).toEqual(['Talk B', 'Talk C', 'Talk A']);
    });

    fireEvent.change(select, { target: { value: 'session_type_desc' } });
    await waitFor(() => {
      expect(cardTitles()).toEqual(['Talk A', 'Talk C', 'Talk B']);
    });
  });

  it('sorts by average score, placing unscored papers last regardless of direction', async () => {
    const papers = [
      makePaper({
        id: 'p1',
        title: 'High Score',
        review_summaries: [
          {
            reviewer_first_name: 'A',
            reviewer_last_name: null,
            total_score: 9,
            internal_comment: null,
            must_have: false,
            last_edited_at: null,
            edit_count: 0,
          },
        ],
      }),
      makePaper({
        id: 'p2',
        title: 'No Reviews',
        review_summaries: [],
      }),
      makePaper({
        id: 'p3',
        title: 'Low Score',
        review_summaries: [
          {
            reviewer_first_name: 'A',
            reviewer_last_name: null,
            total_score: 3,
            internal_comment: null,
            must_have: false,
            last_edited_at: null,
            edit_count: 0,
          },
        ],
      }),
    ];
    renderComponent(papers);

    await waitFor(() => expect(cardTitles()).toHaveLength(3));

    const select = screen.getByLabelText(/sort by/i);
    fireEvent.change(select, { target: { value: 'avg_score_desc' } });
    await waitFor(() => {
      expect(cardTitles()).toEqual(['High Score', 'Low Score', 'No Reviews']);
    });

    fireEvent.change(select, { target: { value: 'avg_score_asc' } });
    await waitFor(() => {
      expect(cardTitles()).toEqual(['Low Score', 'High Score', 'No Reviews']);
    });
  });
});
