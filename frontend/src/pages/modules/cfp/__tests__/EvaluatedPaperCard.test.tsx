import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EvaluatedPaperCard from '../EvaluatedPaperCard';
import type { Paper, Applicant, PaperFormField } from '../../../../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../hooks/useAuthMedia', () => ({
  useAuthMedia: (url: string | null) => (url ? 'blob:mock-video-src' : null),
}));

vi.mock('../ReviewsPanel', () => ({
  default: () => <div data-testid="reviews-panel" />,
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

const makeCustomField = (overrides: Partial<PaperFormField> = {}): PaperFormField => ({
  id: 'field-1',
  tenant_id: 't-1',
  schema_id: 'schema-1',
  field_key: 'field_key_1',
  field_type: 'text',
  label: 'Custom Field',
  description: null,
  placeholder: null,
  help_text: null,
  display_order: 0,
  is_visible: true,
  is_required: false,
  visible_to_reviewer: true,
  validation_rules: null,
  options: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function renderCard(paper: Paper, customFields: PaperFormField[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EvaluatedPaperCard
        paper={paper}
        customFields={customFields}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    </QueryClientProvider>
  );
  // Expand the card
  fireEvent.click(screen.getByText('My Great Talk'));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('EvaluatedPaperCard — detail parity with reviewer view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows learning objectives when present', () => {
    const paper = makePaper({ learning_objectives: 'Understand the thing.' });
    renderCard(paper);

    expect(screen.getByText('Learning Objectives')).toBeInTheDocument();
    expect(screen.getByText('Understand the thing.')).toBeInTheDocument();
  });

  it('omits learning objectives block when absent', () => {
    const paper = makePaper({ learning_objectives: null });
    renderCard(paper);

    expect(screen.queryByText('Learning Objectives')).not.toBeInTheDocument();
  });

  it('shows the video block with a link to the resolved video source', async () => {
    const paper = makePaper({ video_url: '/attachments/video-1/stream' });
    renderCard(paper);

    expect(screen.getByText('Video')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /open video/i })).toHaveAttribute(
        'href',
        'blob:mock-video-src'
      );
    });
  });

  it('omits the video block when absent', () => {
    const paper = makePaper({ video_url: null });
    renderCard(paper);

    expect(screen.queryByText('Video')).not.toBeInTheDocument();
  });

  it('shows custom field answers with their form-defined labels', () => {
    const paper = makePaper({ custom_field_answers: { field_key_1: 'Full day session' } });
    const fields = [makeCustomField({ field_key: 'field_key_1', label: 'Session Length' })];
    renderCard(paper, fields);

    expect(screen.getByText('Session Length')).toBeInTheDocument();
    expect(screen.getByText('Full day session')).toBeInTheDocument();
  });

  it('renders a download action for file_upload custom fields', () => {
    const paper = makePaper({
      custom_field_answers: {
        slides: { attachment_id: 'att-1', filename: 'slides.pdf' },
      },
    });
    const fields = [
      makeCustomField({ field_key: 'slides', label: 'Slides', field_type: 'file_upload' }),
    ];
    renderCard(paper, fields);

    expect(screen.getByText('Slides')).toBeInTheDocument();
    expect(screen.getByText('slides.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('skips custom fields with no answer', () => {
    const paper = makePaper({ custom_field_answers: {} });
    const fields = [makeCustomField({ field_key: 'field_key_1', label: 'Session Length' })];
    renderCard(paper, fields);

    expect(screen.queryByText('Session Length')).not.toBeInTheDocument();
  });
});
