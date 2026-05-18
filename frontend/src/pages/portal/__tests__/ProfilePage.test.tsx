import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ProfilePage from '../ProfilePage';
import { ApplicantAuthContext } from '../../../contexts/ApplicantAuthContext';
import { ToastProvider } from '../../../components/Toast';
import type { ApplicantProfile, PortalMe } from '../../../types/portal';
import { createTestQueryClient } from '../../../test-utils';

// Mock portalApi
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock heavy sub-components
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

vi.mock('../../../components/MediaPreviewModal', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="media-preview-modal" /> : null,
}));

vi.mock('../ProgramCommitteeTab', () => ({
  default: () => <div data-testid="program-committee-tab" />,
}));

vi.mock('../../../hooks/usePortalAuthMedia', () => ({
  usePortalAuthMedia: () => null,
}));

vi.mock('../../../components/portal/VolunteerProfileSection', () => ({
  default: () => <div data-testid="volunteer-profile-section" />,
}));

vi.mock('../../../utils/mediaValidation', () => ({
  validateImage: vi.fn().mockResolvedValue(null),
  validateVideo: vi.fn().mockReturnValue(null),
  ACCEPTED_IMAGE_FORMATS: '.jpg,.jpeg,.png,.webp,.tiff,.bmp',
  ACCEPTED_VIDEO_FORMATS: '.mp4,.mov,.webm,.avi,.mkv',
}));

// Standard mock applicant profile
const mockApplicant: ApplicantProfile = {
  id: 'applicant-123',
  email: 'jane.doe@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  pronouns: 'she/her',
  phone: '+1 555 000 1234',
  title: 'Senior Engineer',
  company: 'Acme Corp',
  bio: '<p>Bio text here</p>',
  social_links: {},
  needs_accessibility: false,
  accessibility_details: null,
  agrees_to_recording: false,
  allow_out_of_timeframe: false,
  message_notifications_enabled: true,
  theme_preference: null,
  picture_url: null,
  video_url: null,
  created_at: '2025-01-01T00:00:00Z',
};

const mockRefreshApplicant = vi.fn().mockResolvedValue(undefined);

// Attendee-only portalMe (no CFP applicant)
const mockPortalMe: PortalMe = {
  id: 'portal-user-456',
  email: 'attendee@example.com',
  first_name: 'Alex',
  last_name: 'Attendee',
  phone: '+1 555 999 0001',
  pronouns: 'they/them',
  title: 'Designer',
  company: 'Widgets Inc',
  bio: '<p>Attendee bio</p>',
  social_links: {},
  address_line_1: '42 Elm St',
  address_line_2: null,
  city: 'Austin',
  postal_code: '73301',
  country: 'US',
  theme_preference: null,
  is_active: true,
  email_verified: true,
  last_login_at: null,
  created_at: '2025-01-01T00:00:00Z',
  has_conference_account: false,
  has_training_account: false,
  cfp_applicant_id: null,
  training_attendee_id: null,
  training_attendee_status: null,
  is_conference_attendee: true,
  is_committee_member: false,
  has_papers: false,
  has_invoices: false,
  has_any_role: true,
};

function buildAuthContext(
  applicant: ApplicantProfile | null = mockApplicant,
  portalMe: PortalMe | null = null
) {
  return {
    applicant,
    portalMe,
    isLoading: false,
    tenantSlug: 'acme',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshApplicant: mockRefreshApplicant,
  };
}

function renderWithProviders(
  ui: React.ReactElement,
  applicant: ApplicantProfile | null = mockApplicant,
  portalMe: PortalMe | null = null
) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ApplicantAuthContext.Provider value={buildAuthContext(applicant, portalMe)}>
            {ui}
          </ApplicantAuthContext.Provider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub pronoun-options fetch used by the page's own useEffect
    mockPortalApi.get.mockResolvedValue({ data: [] });
  });

  describe('null applicant guard', () => {
    it('renders nothing when applicant is null', () => {
      const { container } = renderWithProviders(<ProfilePage />, null);
      // The form and heading should not appear
      expect(container.firstChild).toBeNull();
    });
  });

  describe('personal info tab (default)', () => {
    it('renders the My Profile heading', async () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByText('My Profile')).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the email field pre-filled and disabled', async () => {
      renderWithProviders(<ProfilePage />);
      const emailInput = screen.getByDisplayValue('jane.doe@example.com');
      expect(emailInput).toBeDisabled();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders first name and last name inputs with applicant data', async () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the pronouns select field', async () => {
      renderWithProviders(<ProfilePage />);
      // The page has a "Select pronouns..." placeholder option; confirm the select renders
      expect(screen.getByRole('option', { name: /select pronouns/i })).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the bio rich text editor', async () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the Save Profile button', async () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the tab navigation', async () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByRole('button', { name: /personal info/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /program committee/i })).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the accessibility checkbox unchecked by default', async () => {
      renderWithProviders(<ProfilePage />);
      const checkbox = screen.getByRole('checkbox', {
        name: /i need accessibility accommodations/i,
      });
      expect(checkbox).not.toBeChecked();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('reveals the accessibility details textarea when checkbox is checked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProfilePage />);

      const checkbox = screen.getByRole('checkbox', {
        name: /i need accessibility accommodations/i,
      });
      await user.click(checkbox);

      expect(screen.getByPlaceholderText(/wheelchair access/i)).toBeInTheDocument();
    });

    it('renders the recording consent checkbox', async () => {
      renderWithProviders(<ProfilePage />);
      const checkbox = screen.getByRole('checkbox', {
        name: /i agree to being recorded/i,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the message notifications checkbox checked by default', async () => {
      renderWithProviders(<ProfilePage />);
      const checkbox = screen.getByRole('checkbox', {
        name: /email notifications for new messages/i,
      });
      expect(checkbox).toBeChecked();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });
  });

  describe('form submission', () => {
    it('calls the update API with the correct payload on submit', async () => {
      const user = userEvent.setup();
      mockPortalApi.put.mockResolvedValueOnce({ data: mockApplicant });

      renderWithProviders(<ProfilePage />);

      const saveButton = screen.getByRole('button', { name: /save profile/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockPortalApi.put).toHaveBeenCalledWith(
          '/portal/me',
          expect.objectContaining({
            first_name: 'Jane',
            last_name: 'Doe',
          })
        );
      });
    });

    it('calls refreshApplicant after a successful save', async () => {
      const user = userEvent.setup();
      mockPortalApi.put.mockResolvedValueOnce({ data: mockApplicant });

      renderWithProviders(<ProfilePage />);

      await user.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => {
        expect(mockRefreshApplicant).toHaveBeenCalled();
      });
    });

    it('shows Saved feedback after a successful save', async () => {
      const user = userEvent.setup();
      mockPortalApi.put.mockResolvedValueOnce({ data: mockApplicant });

      renderWithProviders(<ProfilePage />);

      await user.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saved/i })).toBeInTheDocument();
      });
    });

    it('shows Save failed feedback when the API errors', async () => {
      const user = userEvent.setup();
      mockPortalApi.put.mockRejectedValueOnce(new Error('Server error'));

      renderWithProviders(<ProfilePage />);

      await user.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save failed/i })).toBeInTheDocument();
      });
    });

    it('updates the first name state when the user types in the field', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProfilePage />);

      const firstNameInput = screen.getByDisplayValue('Jane');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Alice');

      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    });
  });

  describe('tab navigation', () => {
    it('switches to Program Committee tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProfilePage />);

      await user.click(screen.getByRole('button', { name: /program committee/i }));

      expect(screen.getByTestId('program-committee-tab')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
    });

    it('returns to Personal Info tab when clicked after switching', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProfilePage />);

      await user.click(screen.getByRole('button', { name: /program committee/i }));
      await user.click(screen.getByRole('button', { name: /personal info/i }));

      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument();
    });
  });

  describe('social links', () => {
    it('shows empty state message when no social links are present', async () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByText(/no social media links added yet/i)).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('renders the platform selector for adding links', async () => {
      renderWithProviders(<ProfilePage />);
      // The "add platform" select has a "Select platform..." default option
      expect(screen.getByRole('option', { name: /select platform/i })).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('adds a social link row when a platform is selected and Add is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProfilePage />);

      // The "add platform" select contains "Select platform..." as the first option
      const platformSelect = screen
        .getByRole('option', { name: /select platform/i })
        .closest('select') as HTMLSelectElement;

      // Select Twitter/X by its option value (key = "twitter")
      await user.selectOptions(platformSelect, 'twitter');

      const addButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(addButton);

      // A URL input for twitter should now appear
      expect(screen.getByPlaceholderText(/twitter\.com/i)).toBeInTheDocument();
    });
  });

  describe('attendee-only branch (applicant=null, is_conference_attendee=true)', () => {
    it('renders the profile form seeded from portalMe when applicant is null', async () => {
      renderWithProviders(<ProfilePage />, null, mockPortalMe);
      expect(screen.getByDisplayValue('Alex')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Attendee')).toBeInTheDocument();
      await waitFor(() => expect(mockPortalApi.get).toHaveBeenCalled());
    });

    it('calls PATCH /portal/unified/me (not PUT /portal/me) on save', async () => {
      const user = userEvent.setup();
      mockPortalApi.patch.mockResolvedValueOnce({ data: {} });

      renderWithProviders(<ProfilePage />, null, mockPortalMe);

      await user.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => {
        expect(mockPortalApi.patch).toHaveBeenCalledWith(
          '/portal/unified/me',
          expect.objectContaining({ first_name: 'Alex', last_name: 'Attendee' })
        );
      });
      expect(mockPortalApi.put).not.toHaveBeenCalled();
    });

    it('calls refreshApplicant after a successful attendee save', async () => {
      const user = userEvent.setup();
      mockPortalApi.patch.mockResolvedValueOnce({ data: {} });

      renderWithProviders(<ProfilePage />, null, mockPortalMe);

      await user.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => {
        expect(mockRefreshApplicant).toHaveBeenCalled();
      });
    });

    it('renders nothing when applicant is null and portalMe has is_conference_attendee=false', () => {
      const nonAttendeePortalMe: PortalMe = { ...mockPortalMe, is_conference_attendee: false };
      const { container } = renderWithProviders(<ProfilePage />, null, nonAttendeePortalMe);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('pronoun options', () => {
    it('fetches pronoun options on mount', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [
          { id: '1', name: 'she/her' },
          { id: '2', name: 'he/him' },
        ],
      });

      renderWithProviders(<ProfilePage />);

      await waitFor(() => {
        expect(mockPortalApi.get).toHaveBeenCalledWith('/portal/pronoun-options');
      });
    });

    it('renders pronoun options returned from the API', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [
          { id: '1', name: 'she/her' },
          { id: '2', name: 'he/him' },
          { id: '3', name: 'they/them' },
        ],
      });

      renderWithProviders(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'she/her' })).toBeInTheDocument();
      });

      expect(screen.getByRole('option', { name: 'he/him' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'they/them' })).toBeInTheDocument();
    });
  });
});
