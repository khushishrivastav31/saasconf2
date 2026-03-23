import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrainingTeamTab from '../TeamTab';
import type { Training } from '../../../../types/training';

// Mock the api module
vi.mock('../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../config/api';

const mockApi = vi.mocked(api);

// Mock validators to return null (valid) by default
vi.mock('../../../../utils/validators', () => ({
  validateEmail: vi.fn(() => null),
  validatePhone: vi.fn(() => null),
}));

function createTraining(overrides: Partial<Training> = {}): Training {
  return {
    id: 't-1',
    tenant_id: 'tenant-1',
    name: 'React Fundamentals',
    abbreviation: 'RF',
    description: null,
    website: null,
    logo_url: null,
    support_email: null,
    contact_email: null,
    phone: null,
    start_date: '2026-04-01',
    end_date: '2026-04-03',
    venue_name: null,
    venue_address: null,
    city: 'Berlin',
    state: null,
    postal_code: null,
    country: null,
    timezone: null,
    locale: null,
    venue_type: 'onsite',
    venue_url: null,
    virtual_platform_url: null,
    social_links: {},
    team_members: [],
    settings: {},
    currency: null,
    invoice_currency: null,
    is_active: false,
    is_published: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    managers_count: 0,
    team_count: 0,
    status: 'upcoming',
    ...overrides,
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

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TrainingTeamTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('no training selected', () => {
    it("shows 'Select a training first' message when no training is provided", () => {
      renderWithProviders(<TrainingTeamTab />);

      expect(screen.getByText('Select a training first to manage its team.')).toBeInTheDocument();
    });

    it('does not render the add member form when no training is provided', () => {
      renderWithProviders(<TrainingTeamTab />);

      expect(screen.queryByText('Add Team Member')).not.toBeInTheDocument();
    });
  });

  describe('with training but no team members', () => {
    it('renders the training name in the header', () => {
      const training = createTraining({ name: 'React Fundamentals' });

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText(/Training Team — React Fundamentals/)).toBeInTheDocument();
    });

    it('renders the add member form', () => {
      const training = createTraining();

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('Add Team Member')).toBeInTheDocument();
      expect(screen.getByText('First Name *')).toBeInTheDocument();
      expect(screen.getByText('Last Name *')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Phone')).toBeInTheDocument();
    });

    it('renders the Training Manager checkbox', () => {
      const training = createTraining();

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByLabelText('Training Manager')).toBeInTheDocument();
    });

    it('renders the Add Member button', () => {
      const training = createTraining();

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('Add Member')).toBeInTheDocument();
    });

    it('disables Add Member button when first name is empty', () => {
      const training = createTraining();

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('Add Member')).toBeDisabled();
    });
  });

  describe('team member list rendering', () => {
    it('renders team members with names', () => {
      const training = createTraining({
        team_members: [
          {
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@example.com',
            phone: '+491234567',
            role: 'Trainer',
            is_manager: false,
          },
          {
            first_name: 'Bob',
            last_name: 'Jones',
            email: 'bob@example.com',
            phone: '',
            role: 'Assistant',
            is_manager: true,
          },
        ],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });

    it('renders member roles', () => {
      const training = createTraining({
        team_members: [
          { first_name: 'Alice', last_name: 'Smith', role: 'Lead Trainer', is_manager: false },
        ],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('Lead Trainer')).toBeInTheDocument();
    });

    it('renders Manager badge for managers', () => {
      const training = createTraining({
        team_members: [{ first_name: 'Bob', last_name: 'Jones', role: 'Admin', is_manager: true }],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('Manager')).toBeInTheDocument();
    });

    it('renders email and phone for members', () => {
      const training = createTraining({
        team_members: [
          {
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@example.com',
            phone: '+491234567',
            is_manager: false,
          },
        ],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('+491234567')).toBeInTheDocument();
    });

    it('renders edit and remove buttons for each member', () => {
      const training = createTraining({
        team_members: [
          { first_name: 'Alice', last_name: 'Smith', is_manager: false },
          { first_name: 'Bob', last_name: 'Jones', is_manager: false },
        ],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      const editButtons = screen.getAllByTitle('Edit');
      const removeButtons = screen.getAllByTitle('Remove');
      expect(editButtons).toHaveLength(2);
      expect(removeButtons).toHaveLength(2);
    });
  });

  describe('add team member', () => {
    // Helper: get inputs in the "Add Team Member" section by finding all textboxes
    function getAddFormInputs() {
      const addSection = screen
        .getByText('Add Team Member')
        .closest('div.bg-blue-50, div.dark\\:bg-blue-900\\/30')!;
      const inputs = within(addSection).getAllByRole('textbox');
      // Order: first_name, last_name, role, email
      return {
        firstNameInput: inputs[0],
        lastNameInput: inputs[1],
        roleInput: inputs[2],
        emailInput: inputs[3],
      };
    }

    it('enables Add Member button when first and last name are provided', async () => {
      const user = userEvent.setup();
      const training = createTraining();

      renderWithProviders(<TrainingTeamTab training={training} />);

      const { firstNameInput, lastNameInput } = getAddFormInputs();

      await user.type(firstNameInput, 'Charlie');
      await user.type(lastNameInput, 'Brown');

      expect(screen.getByText('Add Member')).not.toBeDisabled();
    });

    it('calls API to add a new team member', async () => {
      const user = userEvent.setup();
      const training = createTraining();
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      const { firstNameInput, lastNameInput } = getAddFormInputs();

      await user.type(firstNameInput, 'Charlie');
      await user.type(lastNameInput, 'Brown');

      await user.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(`/trainings/${training.id}`, {
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        });
      });
    });

    it('adds member with role and email', async () => {
      const user = userEvent.setup();
      const training = createTraining();
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: 'charlie@test.com',
              phone: '',
              role: 'Trainer',
              is_manager: false,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      const { firstNameInput, lastNameInput, roleInput, emailInput } = getAddFormInputs();

      await user.type(firstNameInput, 'Charlie');
      await user.type(lastNameInput, 'Brown');
      await user.type(roleInput, 'Trainer');
      await user.type(emailInput, 'charlie@test.com');

      await user.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(`/trainings/${training.id}`, {
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: 'charlie@test.com',
              phone: '',
              role: 'Trainer',
              is_manager: false,
            },
          ],
        });
      });
    });

    it('adds member as manager when checkbox is checked', async () => {
      const user = userEvent.setup();
      const training = createTraining();
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: '',
              phone: '',
              role: '',
              is_manager: true,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      const { firstNameInput, lastNameInput } = getAddFormInputs();

      await user.type(firstNameInput, 'Charlie');
      await user.type(lastNameInput, 'Brown');
      // Find the checkbox in the add section
      const addSection = screen
        .getByText('Add Team Member')
        .closest('div.bg-blue-50, div.dark\\:bg-blue-900\\/30')!;
      const managerCheckbox = within(addSection).getByRole('checkbox');
      await user.click(managerCheckbox);

      await user.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(`/trainings/${training.id}`, {
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: '',
              phone: '',
              role: '',
              is_manager: true,
            },
          ],
        });
      });
    });

    it('clears the form after adding a member', async () => {
      const user = userEvent.setup();
      const training = createTraining();
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      const { firstNameInput, lastNameInput } = getAddFormInputs();

      await user.type(firstNameInput, 'Charlie');
      await user.type(lastNameInput, 'Brown');

      await user.click(screen.getByText('Add Member'));

      await waitFor(() => {
        const inputs = getAddFormInputs();
        expect(inputs.firstNameInput).toHaveValue('');
        expect(inputs.lastNameInput).toHaveValue('');
      });
    });
  });

  describe('edit team member', () => {
    it('shows edit form when Edit button is clicked', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [
          {
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@test.com',
            role: 'Trainer',
            is_manager: false,
          },
        ],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Edit'));

      expect(screen.getByText('Edit Team Member')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('pre-fills edit form with member data', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [
          {
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@test.com',
            role: 'Trainer',
            phone: '+491234567',
            is_manager: true,
          },
        ],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Edit'));

      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Smith')).toBeInTheDocument();
      expect(screen.getByDisplayValue('alice@test.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Trainer')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+491234567')).toBeInTheDocument();
    });

    it('closes edit form when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [{ first_name: 'Alice', last_name: 'Smith', is_manager: false }],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Edit'));
      expect(screen.getByText('Edit Team Member')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Edit Team Member')).not.toBeInTheDocument();
    });

    it('calls API to save edited member', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [
          {
            first_name: 'Alice',
            last_name: 'Smith',
            email: '',
            phone: '',
            role: '',
            is_manager: false,
          },
        ],
      });
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Alice',
              last_name: 'Johnson',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Edit'));

      const lastNameInput = screen.getByDisplayValue('Smith');
      await user.clear(lastNameInput);
      await user.type(lastNameInput, 'Johnson');

      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(`/trainings/${training.id}`, {
          team_members: [
            {
              first_name: 'Alice',
              last_name: 'Johnson',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        });
      });
    });

    it('disables Save Changes when first name is empty', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [{ first_name: 'Alice', last_name: 'Smith', is_manager: false }],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Edit'));

      const firstNameInput = screen.getByDisplayValue('Alice');
      await user.clear(firstNameInput);

      expect(screen.getByText('Save Changes')).toBeDisabled();
    });
  });

  describe('delete team member', () => {
    it('shows confirm dialog when Remove button is clicked', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [{ first_name: 'Alice', last_name: 'Smith', is_manager: false }],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Remove'));

      await waitFor(() => {
        expect(screen.getByText('Remove Team Member')).toBeInTheDocument();
        expect(
          screen.getByText(
            'Are you sure you want to remove "Alice Smith" from this training\'s team?'
          )
        ).toBeInTheDocument();
      });
    });

    it('calls API to remove member when confirmed', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [
          {
            first_name: 'Alice',
            last_name: 'Smith',
            email: '',
            phone: '',
            role: '',
            is_manager: false,
          },
          {
            first_name: 'Bob',
            last_name: 'Jones',
            email: '',
            phone: '',
            role: '',
            is_manager: false,
          },
        ],
      });
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Bob',
              last_name: 'Jones',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      // Click remove on Alice (first member)
      const removeButtons = screen.getAllByTitle('Remove');
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Remove Team Member')).toBeInTheDocument();
      });

      // Click the confirm button in the dialog
      const dialog = screen.getByRole('dialog');
      const confirmButton = dialog.querySelector('button:last-child') as HTMLElement;
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(`/trainings/${training.id}`, {
          team_members: [
            {
              first_name: 'Bob',
              last_name: 'Jones',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        });
      });
    });

    it('closes confirm dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const training = createTraining({
        team_members: [{ first_name: 'Alice', last_name: 'Smith', is_manager: false }],
      });

      renderWithProviders(<TrainingTeamTab training={training} />);

      await user.click(screen.getByTitle('Remove'));

      await waitFor(() => {
        expect(screen.getByText('Remove Team Member')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('save status indicators', () => {
    it('shows help text about team members', () => {
      const training = createTraining();

      renderWithProviders(<TrainingTeamTab training={training} />);

      expect(screen.getByText(/Team members for this training/)).toBeInTheDocument();
    });
  });

  describe('updates team members when training prop changes', () => {
    it('updates displayed members when training changes', () => {
      const training1 = createTraining({
        id: 't-1',
        name: 'Training 1',
        team_members: [{ first_name: 'Alice', last_name: 'Smith', is_manager: false }],
      });
      const training2 = createTraining({
        id: 't-2',
        name: 'Training 2',
        team_members: [{ first_name: 'Bob', last_name: 'Jones', is_manager: true }],
      });

      const queryClient = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TrainingTeamTab training={training1} />
        </QueryClientProvider>
      );

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();

      rerender(
        <QueryClientProvider client={queryClient}>
          <TrainingTeamTab training={training2} />
        </QueryClientProvider>
      );

      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    });
  });

  describe('onUpdate callback', () => {
    it('calls onUpdate after successful member addition', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const training = createTraining();
      mockApi.put.mockResolvedValueOnce({
        data: createTraining({
          team_members: [
            {
              first_name: 'Charlie',
              last_name: 'Brown',
              email: '',
              phone: '',
              role: '',
              is_manager: false,
            },
          ],
        }),
      });

      renderWithProviders(<TrainingTeamTab training={training} onUpdate={onUpdate} />);

      const addSection = screen
        .getByText('Add Team Member')
        .closest('div.bg-blue-50, div.dark\\:bg-blue-900\\/30')!;
      const inputs = within(addSection).getAllByRole('textbox');
      await user.type(inputs[0], 'Charlie');
      await user.type(inputs[1], 'Brown');
      await user.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
      });
    });
  });
});
