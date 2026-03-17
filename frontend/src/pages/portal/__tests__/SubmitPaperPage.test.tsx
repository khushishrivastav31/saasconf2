import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import SubmitPaperPage from '../SubmitPaperPage';
import {
  screen,
  waitFor,
  makeApplicantAuthContext,
  renderWithPortalProviders,
} from '../../../test-utils';

// Mock the portalApi module
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock RichTextEditor so we can interact with it via a plain textarea
vi.mock('../../../components/common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (val: string) => void;
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

// ----- Fixtures -----

const mockConferences = [
  {
    id: 'conf-1',
    name: 'PyCon 2025',
    abbreviation: 'PyCon',
    description: null,
    start_date: '2025-09-01',
    end_date: '2025-09-03',
    city: 'Berlin',
    country: 'DE',
    venue_type: 'onsite',
    logo_url: null,
    registration_open: true,
    is_registered: false,
    is_speaker: false,
    expenses_enabled: false,
    cfps: [
      {
        id: 'cfp-1',
        title: 'PyCon 2025 CFP',
        description: null,
        status: 'open',
        open_date: null,
        close_date: '2025-06-01',
        required_speaker_fields: [],
        required_paper_fields: [],
        guidelines_for_submissions: null,
        tips_for_submission: null,
        code_of_conduct: null,
        incentives_conditions: null,
        faqs: null,
      },
    ],
  },
];

const mockFormSchema = {
  fields: [],
  builtin_fields_config: {
    title: { visible: true, required: true, display_order: 0 },
    abstract_short: { visible: true, required: false, display_order: 1 },
    abstract_long: { visible: false, required: false, display_order: 2 },
    level: { visible: false, required: false, display_order: 3 },
    learning_objectives: { visible: false, required: false, display_order: 4 },
    session_type: { visible: false, required: false, display_order: 5 },
    topics: { visible: false, required: false, display_order: 6 },
  },
};

const mockConferenceDetail = {
  id: 'conf-1',
  name: 'PyCon 2025',
  abbreviation: 'PyCon',
  cfps: mockConferences[0].cfps,
  session_types: [],
};

// ----- Helpers -----

function renderWithProviders(
  ui: React.ReactElement,
  { authContext = makeApplicantAuthContext() } = {}
) {
  return renderWithPortalProviders(ui, {
    authContext,
    route: '/acme/portal/papers/new',
    path: '/:companySlug/portal/papers/new',
  });
}

// ----- Tests -----

describe('SubmitPaperPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render', () => {
    it('renders the page heading', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      expect(screen.getByText('Submit New Paper')).toBeInTheDocument();
    });

    it('renders the conference dropdown', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      expect(screen.getByText('Conference')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders the co-speakers section', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      expect(screen.getAllByText(/co-speakers/i).length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText('Co-speaker email')).toBeInTheDocument();
    });

    it('renders Cancel and Save as Draft buttons', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save as Draft' })).toBeInTheDocument();
    });
  });

  describe('conference selection', () => {
    it('populates the conference dropdown after API resolves', async () => {
      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: mockConferences });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      renderWithProviders(<SubmitPaperPage />);

      await waitFor(() => {
        expect(screen.getByText('PyCon 2025 (PyCon)')).toBeInTheDocument();
      });
    });

    it('shows the CFP info panel after a conference is selected', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: mockConferences });
        }
        if (url.includes('/conferences/conf-1')) {
          return Promise.resolve({ data: mockConferenceDetail });
        }
        if (url.includes('/cfp/cfp-1/paper-form-schema')) {
          return Promise.resolve({ data: mockFormSchema });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      renderWithProviders(<SubmitPaperPage />);

      await waitFor(() => {
        expect(screen.getByText('PyCon 2025 (PyCon)')).toBeInTheDocument();
      });

      const conferenceSelect = screen.getByRole('combobox');
      await user.selectOptions(conferenceSelect, 'conf-1');

      await waitFor(() => {
        expect(screen.getByText('Call for Papers')).toBeInTheDocument();
      });
    });

    it('shows "No open CFPs" when conference has no open CFPs', async () => {
      const user = userEvent.setup();

      const conferenceWithClosedCfp = [
        {
          ...mockConferences[0],
          cfps: [{ ...mockConferences[0].cfps[0], status: 'closed' }],
        },
      ];

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: conferenceWithClosedCfp });
        }
        return Promise.resolve({ data: mockConferenceDetail });
      });

      renderWithProviders(<SubmitPaperPage />);

      await waitFor(() => {
        expect(screen.getByText('PyCon 2025 (PyCon)')).toBeInTheDocument();
      });

      const conferenceSelect = screen.getByRole('combobox');
      await user.selectOptions(conferenceSelect, 'conf-1');

      await waitFor(() => {
        expect(screen.getByText('No open CFPs for this conference.')).toBeInTheDocument();
      });
    });
  });

  describe('title field validation', () => {
    it('shows error when submitting without selecting a conference or providing a title', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockResolvedValue({ data: mockConferences });

      renderWithProviders(<SubmitPaperPage />);

      await user.click(screen.getByRole('button', { name: 'Save as Draft' }));

      expect(screen.getByText('Please select a CFP and provide a title')).toBeInTheDocument();
    });

    it('shows error when a conference is selected but title is empty', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: mockConferences });
        }
        if (url.includes('/conferences/conf-1')) {
          return Promise.resolve({ data: mockConferenceDetail });
        }
        if (url.includes('/cfp/cfp-1/paper-form-schema')) {
          return Promise.resolve({ data: mockFormSchema });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      renderWithProviders(<SubmitPaperPage />);

      await waitFor(() => {
        expect(screen.getByText('PyCon 2025 (PyCon)')).toBeInTheDocument();
      });

      const conferenceSelect = screen.getByRole('combobox');
      await user.selectOptions(conferenceSelect, 'conf-1');

      // Wait for the title field to appear
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Your paper title')).toBeInTheDocument();
      });

      // Try to submit with empty title
      await user.click(screen.getByRole('button', { name: 'Save as Draft' }));

      expect(screen.getByText('Please select a CFP and provide a title')).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
      // Conference dropdown loads
      await waitFor(() => {
        expect(screen.getByText('PyCon 2025 (PyCon)')).toBeInTheDocument();
      });

      const conferenceSelect = screen.getByRole('combobox');
      await user.selectOptions(conferenceSelect, 'conf-1');

      // Wait for the title field to appear (CFP auto-selected)
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Your paper title')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Your paper title'), 'My Test Paper');
    }

    it('calls the papers API with correct data on successful submit', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: mockConferences });
        }
        if (url.includes('/conferences/conf-1')) {
          return Promise.resolve({ data: mockConferenceDetail });
        }
        if (url.includes('/cfp/cfp-1/paper-form-schema')) {
          return Promise.resolve({ data: mockFormSchema });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      mockPortalApi.post.mockResolvedValueOnce({
        data: {
          id: 'paper-new',
          cfp_id: 'cfp-1',
          title: 'My Test Paper',
          status: 'draft',
          cospeakers: [],
          is_main_speaker: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          submitted_at: null,
          conference_id: 'conf-1',
          conference_name: 'PyCon 2025',
          cfp_title: 'PyCon 2025 CFP',
          session_type_id: null,
          session_type_name: null,
          abstract_short: null,
          abstract_long: null,
          level: null,
          learning_objectives: null,
          video_url: null,
          main_speaker_first_name: null,
          main_speaker_last_name: null,
          custom_field_answers: null,
        },
      });

      renderWithProviders(<SubmitPaperPage />);

      await fillAndSubmit(user);

      await user.click(screen.getByRole('button', { name: 'Save as Draft' }));

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith(
          '/portal/papers',
          expect.objectContaining({
            cfp_id: 'cfp-1',
            title: 'My Test Paper',
          })
        );
      });
    });

    it('shows "Saving..." on the button while submission is pending', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: mockConferences });
        }
        if (url.includes('/conferences/conf-1')) {
          return Promise.resolve({ data: mockConferenceDetail });
        }
        if (url.includes('/cfp/cfp-1/paper-form-schema')) {
          return Promise.resolve({ data: mockFormSchema });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      let resolvePost: (val: unknown) => void;
      mockPortalApi.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

      renderWithProviders(<SubmitPaperPage />);

      await fillAndSubmit(user);

      await user.click(screen.getByRole('button', { name: 'Save as Draft' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument();
      });

      resolvePost!({ data: { id: 'paper-new', cospeakers: [] } });
    });

    it('shows error message when submission fails', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: mockConferences });
        }
        if (url.includes('/conferences/conf-1')) {
          return Promise.resolve({ data: mockConferenceDetail });
        }
        if (url.includes('/cfp/cfp-1/paper-form-schema')) {
          return Promise.resolve({ data: mockFormSchema });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      mockPortalApi.post.mockRejectedValueOnce(new Error('Submission failed'));

      renderWithProviders(<SubmitPaperPage />);

      await fillAndSubmit(user);

      await user.click(screen.getByRole('button', { name: 'Save as Draft' }));

      await waitFor(() => {
        expect(screen.getByText('Submission failed')).toBeInTheDocument();
      });
    });
  });

  describe('co-speaker management', () => {
    it('adds a co-speaker email when Add button is clicked', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      const emailInput = screen.getByPlaceholderText('Co-speaker email');
      await user.type(emailInput, 'cospeaker@example.com');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('cospeaker@example.com')).toBeInTheDocument();
    });

    it('shows error when adding own email as co-speaker', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      const emailInput = screen.getByPlaceholderText('Co-speaker email');
      // mockApplicant.email is 'speaker@example.com'
      await user.type(emailInput, 'speaker@example.com');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('You cannot add yourself as a co-speaker')).toBeInTheDocument();
    });

    it('removes a co-speaker when the × button is clicked', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      const emailInput = screen.getByPlaceholderText('Co-speaker email');
      await user.type(emailInput, 'cospeaker@example.com');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('cospeaker@example.com')).toBeInTheDocument();

      // Click the × remove button (rendered as ×)
      const removeButton = screen.getByRole('button', { name: '×' });
      await user.click(removeButton);

      expect(screen.queryByText('cospeaker@example.com')).not.toBeInTheDocument();
    });

    it('shows error when adding a duplicate co-speaker email', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      const emailInput = screen.getByPlaceholderText('Co-speaker email');
      await user.type(emailInput, 'dup@example.com');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Try adding the same email again
      await user.type(emailInput, 'dup@example.com');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('This email is already added')).toBeInTheDocument();
    });

    it('disables the Add button and input after 3 co-speakers are added', async () => {
      const user = userEvent.setup();

      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SubmitPaperPage />);

      const emailInput = screen.getByPlaceholderText('Co-speaker email');

      for (const email of ['one@example.com', 'two@example.com', 'three@example.com']) {
        await user.type(emailInput, email);
        await user.click(screen.getByRole('button', { name: 'Add' }));
      }

      expect(emailInput).toBeDisabled();
    });
  });

  describe('missing speaker profile fields warning', () => {
    it('shows warning when CFP requires speaker bio and applicant has none', async () => {
      const user = userEvent.setup();

      const cfpRequiringBio = {
        ...mockConferences[0].cfps[0],
        required_speaker_fields: ['bio'],
      };
      const conferencesWithBioReq = [{ ...mockConferences[0], cfps: [cfpRequiringBio] }];

      mockPortalApi.get.mockImplementation((url: string) => {
        if (url === '/portal/conferences') {
          return Promise.resolve({ data: conferencesWithBioReq });
        }
        if (url.includes('/conferences/conf-1')) {
          return Promise.resolve({ data: mockConferenceDetail });
        }
        if (url.includes('/cfp/cfp-1/paper-form-schema')) {
          return Promise.resolve({ data: mockFormSchema });
        }
        return Promise.resolve({ data: mockFormSchema });
      });

      // Render with an applicant that has no bio
      renderWithProviders(<SubmitPaperPage />, {
        authContext: makeApplicantAuthContext({ bio: null }),
      });

      await waitFor(() => {
        expect(screen.getByText('PyCon 2025 (PyCon)')).toBeInTheDocument();
      });

      const conferenceSelect = screen.getByRole('combobox');
      await user.selectOptions(conferenceSelect, 'conf-1');

      await waitFor(() => {
        expect(screen.getByText(/missing required profile fields/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/short bio/i)).toBeInTheDocument();
    });
  });
});
