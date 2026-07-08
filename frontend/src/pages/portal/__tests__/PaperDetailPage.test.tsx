import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import PaperDetailPage from '../PaperDetailPage';
import { screen, waitFor, renderWithPortalProviders } from '../../../test-utils';

vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

vi.mock('../../../components/common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('../../../components/PaperStatusLifeline', () => ({
  default: ({ status }: { status: string }) => (
    <span data-testid={`status-${status}`}>{status}</span>
  ),
}));

vi.mock('../../../components/MediaPreviewModal', () => ({
  default: () => null,
}));

vi.mock('../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel dialog</button>
      </div>
    ) : null,
}));

// ----- Fixtures -----

function makePaper(overrides: Record<string, unknown> = {}) {
  return {
    id: 'paper-1',
    cfp_id: 'cfp-1',
    cfp_title: 'TestConf CFP',
    conference_id: 'conf-1',
    conference_name: 'TestConf 2025',
    form_variant_id: null,
    session_type_id: null,
    session_type_name: null,
    title: 'My Draft Paper',
    abstract_short: 'A short abstract.',
    abstract_long: null,
    level: null,
    learning_objectives: null,
    status: 'draft',
    video_url: null,
    is_main_speaker: true,
    main_speaker_first_name: 'Jane',
    main_speaker_last_name: 'Speaker',
    cospeakers: [],
    topics: [],
    custom_field_answers: null,
    submitted_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockFormSchema = {
  fields: [],
  builtin_fields_config: {
    title: { visible: true, required: true, display_order: 0 },
    abstract_short: { visible: true, required: false, display_order: 1 },
  },
  variants: [],
};

// ----- Helpers -----

function mockApiGet(
  paper = makePaper(),
  notificationPreview: { subject: string; body_html: string } | null = null
) {
  mockPortalApi.get.mockImplementation((url: string) => {
    if (url.includes('/notification-preview')) {
      return notificationPreview
        ? Promise.resolve({ data: notificationPreview })
        : Promise.reject(new Error('No decision notification available for this paper yet'));
    }
    if (url.includes('/portal/papers/paper-1/feedback')) {
      return Promise.resolve({ data: { items: [], total: 0 } });
    }
    if (url.includes('/portal/papers/paper-1')) {
      return Promise.resolve({ data: paper });
    }
    if (url.includes('/portal/conferences/conf-1')) {
      return Promise.resolve({ data: { id: 'conf-1', name: 'TestConf 2025', session_types: [] } });
    }
    if (url.includes('/portal/cfp/cfp-1/paper-form-schema')) {
      return Promise.resolve({ data: mockFormSchema });
    }
    if (url.includes('/portal/topics')) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderPaperDetail() {
  return renderWithPortalProviders(<PaperDetailPage />, {
    route: '/acme/portal/papers/paper-1',
    path: '/:companySlug/portal/papers/:paperId',
  });
}

// Wait until the component has loaded the paper and auto-entered edit mode.
// The Save Changes button is always present in the form footer once editing starts.
async function waitForEditMode() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });
}

// ----- Tests -----

describe('PaperDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('draft paper — edit mode (auto-entered on load)', () => {
    it('does not show Submit Paper while in edit mode', async () => {
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();

      expect(screen.queryByRole('button', { name: 'Submit Paper' })).not.toBeInTheDocument();
    });

    it('shows Save Changes button in edit mode', async () => {
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();

      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('shows Cancel button in edit mode', async () => {
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });

  describe('draft paper — view mode (after cancelling edit)', () => {
    it('shows Submit Paper in the header after cancelling edit mode', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Paper' })).toBeInTheDocument();
      });
    });

    it('does not show Save Changes in view mode', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Paper' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    });

    it('shows Edit button in view mode', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      });
    });

    it('clicking Edit returns to edit mode and hides Submit Paper again', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();

      await waitForEditMode();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Paper' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Submit Paper' })).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });
  });

  describe('Add button affordance', () => {
    it('Add button is grey when both co-speaker fields are empty', async () => {
      mockApiGet();
      renderPaperDetail();
      await waitForEditMode();

      const addButton = screen.getByRole('button', { name: 'Add' });
      expect(addButton).toHaveClass('bg-gray-100');
      expect(addButton).not.toHaveClass('bg-primary-600');
    });

    it('Add button turns blue when first name is typed', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();
      await waitForEditMode();

      await user.type(screen.getByPlaceholderText('First name'), 'Alice');

      const addButton = screen.getByRole('button', { name: 'Add' });
      expect(addButton).toHaveClass('bg-primary-600');
      expect(addButton).not.toHaveClass('bg-gray-100');
    });
  });

  describe('unadded co-speaker guard', () => {
    it('blocks Save Changes and shows error when first name typed but Add not pressed', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();
      await waitForEditMode();

      await user.type(screen.getByPlaceholderText('First name'), 'Alice');
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      const errorMessages = screen.getAllByText(
        /you've typed a co-speaker but haven't added them/i
      );
      expect(errorMessages.length).toBeGreaterThan(0);
      expect(mockPortalApi.put).not.toHaveBeenCalled();
    });

    it('blocks Save Changes and shows error when email typed but Add not pressed', async () => {
      const user = userEvent.setup();
      mockApiGet();
      renderPaperDetail();
      await waitForEditMode();

      await user.type(screen.getByPlaceholderText('Email'), 'alice@example.com');
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      const errorMessages = screen.getAllByText(
        /you've typed a co-speaker but haven't added them/i
      );
      expect(errorMessages.length).toBeGreaterThan(0);
      expect(mockPortalApi.put).not.toHaveBeenCalled();
    });
  });

  describe('submitted paper', () => {
    it('shows Revert to Draft button, not Submit Paper', async () => {
      mockApiGet(makePaper({ status: 'submitted', submitted_at: '2025-01-02T00:00:00Z' }));
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Revert to Draft' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Submit Paper' })).not.toBeInTheDocument();
    });

    it('does not show Save Changes for a submitted paper', async () => {
      mockApiGet(makePaper({ status: 'submitted', submitted_at: '2025-01-02T00:00:00Z' }));
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Revert to Draft' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    });
  });

  describe('notification preview', () => {
    it('shows the "View your notification" link for an accepted paper', async () => {
      mockApiGet(makePaper({ status: 'accepted' }));
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'View your notification' })).toBeInTheDocument();
      });
    });

    it('does not show the link for a paper still in final consideration', async () => {
      mockApiGet(makePaper({ status: 'final_consideration' }));
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByTestId('status-final_consideration')).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('button', { name: 'View your notification' })
      ).not.toBeInTheDocument();
    });

    it('renders the rendered subject and body when opened', async () => {
      const user = userEvent.setup();
      mockApiGet(makePaper({ status: 'accepted' }), {
        subject: 'Paper Acceptance - TestConf 2025',
        body_html: '<p>Congratulations Jane!</p>',
      });
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'View your notification' })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: 'View your notification' }));

      await waitFor(() => {
        expect(screen.getByText('Paper Acceptance - TestConf 2025')).toBeInTheDocument();
      });
      expect(screen.getByText('Congratulations Jane!')).toBeInTheDocument();
    });
  });
});
