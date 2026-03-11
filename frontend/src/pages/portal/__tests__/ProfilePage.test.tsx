import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ProfilePage from '../ProfilePage';
import { ApplicantAuthContext } from '../../../contexts/ApplicantAuthContext';
import type { ApplicantProfile } from '../../../types/portal';

// Mock portalApi
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
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

vi.mock('../PortalInvoicesTab', () => ({
  default: () => <div data-testid="portal-invoices-tab" />,
}));

vi.mock('../../../hooks/usePortalAuthMedia', () => ({
  usePortalAuthMedia: () => null,
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
  message_notifications_enabled: true,
  theme_preference: null,
  picture_url: null,
  video_url: null,
  created_at: '2025-01-01T00:00:00Z',
};

const mockRefreshApplicant = vi.fn().mockResolvedValue(undefined);

function buildAuthContext(applicant: ApplicantProfile | null = mockApplicant) {
  return {
    applicant,
    isLoading: false,
    tenantSlug: 'acme',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshApplicant: mockRefreshApplicant,
  };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(
  ui: React.ReactElement,
  applicant: ApplicantProfile | null = mockApplicant
) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ApplicantAuthContext.Provider value={buildAuthContext(applicant)}>
          {ui}
        </ApplicantAuthContext.Provider>
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
    it('renders the My Profile heading', () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByText('My Profile')).toBeInTheDocument();
    });

    it('renders the email field pre-filled and disabled', () => {
      renderWithProviders(<ProfilePage />);
      const emailInput = screen.getByDisplayValue('jane.doe@example.com');
      expect(emailInput).toBeDisabled();
    });

    it('renders first name and last name inputs with applicant data', () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    });

    it('renders the pronouns select field', () => {
      renderWithProviders(<ProfilePage />);
      // The page has a "Select pronouns..." placeholder option; confirm the select renders
      expect(screen.getByRole('option', { name: /select pronouns/i })).toBeInTheDocument();
    });

    it('renders the bio rich text editor', () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    });

    it('renders the Save Profile button', () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument();
    });

    it('renders the tab navigation', () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByRole('button', { name: /personal info/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /program committee/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /invoices/i })).toBeInTheDocument();
    });

    it('renders the accessibility checkbox unchecked by default', () => {
      renderWithProviders(<ProfilePage />);
      const checkbox = screen.getByRole('checkbox', {
        name: /i need accessibility accommodations/i,
      });
      expect(checkbox).not.toBeChecked();
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

    it('renders the recording consent checkbox', () => {
      renderWithProviders(<ProfilePage />);
      const checkbox = screen.getByRole('checkbox', {
        name: /i agree to being recorded/i,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });

    it('renders the message notifications checkbox checked by default', () => {
      renderWithProviders(<ProfilePage />);
      const checkbox = screen.getByRole('checkbox', {
        name: /email notifications for new messages/i,
      });
      expect(checkbox).toBeChecked();
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

    it('switches to Invoices tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProfilePage />);

      await user.click(screen.getByRole('button', { name: /invoices/i }));

      expect(screen.getByTestId('portal-invoices-tab')).toBeInTheDocument();
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
    it('shows empty state message when no social links are present', () => {
      renderWithProviders(<ProfilePage />);
      expect(screen.getByText(/no social media links added yet/i)).toBeInTheDocument();
    });

    it('renders the platform selector for adding links', () => {
      renderWithProviders(<ProfilePage />);
      // The "add platform" select has a "Select platform..." default option
      expect(screen.getByRole('option', { name: /select platform/i })).toBeInTheDocument();
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
