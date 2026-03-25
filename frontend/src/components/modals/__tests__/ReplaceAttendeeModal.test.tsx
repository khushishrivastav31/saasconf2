import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReplaceAttendeeModal from '../ReplaceAttendeeModal';
import api from '../../../config/api';

vi.mock('../../../config/api');

const mockRegistration = {
  id: 'reg-123',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  booking_option_name: 'Full Conference Pass',
  items: [
    { id: 'item-1', item_name: 'Workshop Access' },
    { id: 'item-2', item_name: 'Dinner Ticket' },
  ],
};

const mockPronounOptions = [
  { id: 'p1', name: 'he/him', is_active: true },
  { id: 'p2', name: 'she/her', is_active: true },
  { id: 'p3', name: 'they/them', is_active: true },
  { id: 'p4', name: 'other', is_active: false }, // Should be filtered out
];

const mockBookingOptions = [
  { id: 'bo1', name: 'VIP Pass', is_active: true },
  { id: 'bo2', name: 'Tutorial Access', is_active: true },
  { id: 'bo3', name: 'Archived Pass', is_active: false }, // Should be filtered out
];

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function getFields() {
  const textboxes = screen.getAllByRole('textbox');
  return {
    firstName: textboxes[0],
    lastName: textboxes[1],
    email: textboxes[2],
    phone: screen.getByPlaceholderText('+1234567890'),
    jobTitle: textboxes[4],
    department: textboxes[5],
    replacementReason: screen.getByPlaceholderText(/Employee transfer/),
    cancellationMessage: screen.getByPlaceholderText(/Optional message/),
  };
}

describe('ReplaceAttendeeModal', () => {
  const mockOnClose = vi.fn();
  const conferenceId = 'conf-123';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/pronoun-options') {
        return Promise.resolve({ data: { items: mockPronounOptions } });
      }
      if (url.includes('/booking-options')) {
        return Promise.resolve({ data: { items: mockBookingOptions } });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={false}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      expect(screen.queryByRole('heading', { name: 'Replace Attendee' })).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      expect(screen.getByRole('heading', { name: 'Replace Attendee' })).toBeInTheDocument();
      expect(screen.getByText(/Replace John Doe with a new attendee/)).toBeInTheDocument();
    });

    it('should display current booking information', () => {
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      expect(screen.getByText('Current Booking (Will Be Kept)')).toBeInTheDocument();
      expect(screen.getByText('Full Conference Pass')).toBeInTheDocument();
      expect(screen.getByText('Workshop Access')).toBeInTheDocument();
      expect(screen.getByText('Dinner Ticket')).toBeInTheDocument();
    });

    it('should display N/A when no booking option', () => {
      const regWithoutBooking = { ...mockRegistration, booking_option_name: null };

      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={regWithoutBooking}
          conferenceId={conferenceId}
        />
      );

      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('should not display add-ons section when items array is empty', () => {
      const regWithoutItems = { ...mockRegistration, items: [] };

      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={regWithoutItems}
          conferenceId={conferenceId}
        />
      );

      expect(screen.queryByText('Add-ons:')).not.toBeInTheDocument();
    });

    it('should load pronoun and booking options from API', async () => {
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(vi.mocked(api.get)).toHaveBeenCalledWith(`/pronoun-options`);
        expect(vi.mocked(api.get)).toHaveBeenCalledWith(
          `/conferences/${conferenceId}/booking-options`
        );
      });
    });
  });

  describe('Form Inputs', () => {
    it('should update all text fields', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();

      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');
      await user.type(fields.phone, '+1234567890');
      await user.type(fields.jobTitle, 'Engineer');
      await user.type(fields.department, 'Engineering');
      await user.type(fields.replacementReason, 'Transfer');
      await user.type(fields.cancellationMessage, 'Thanks');

      expect(fields.firstName).toHaveValue('Jane');
      expect(fields.lastName).toHaveValue('Smith');
      expect(fields.email).toHaveValue('jane@example.com');
      expect(fields.phone).toHaveValue('+1234567890');
      expect(fields.jobTitle).toHaveValue('Engineer');
      expect(fields.department).toHaveValue('Engineering');
      expect(fields.replacementReason).toHaveValue('Transfer');
      expect(fields.cancellationMessage).toHaveValue('Thanks');
    });

    it('should update pronouns select field', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      // Wait for pronoun options to load by checking if "she/her" option exists
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'she/her' })).toBeInTheDocument();
      });

      const pronounSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(pronounSelect, 'she/her');

      expect(pronounSelect).toHaveValue('she/her');
    });
  });

  describe('Email Validation', () => {
    it('should show error for invalid email', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const emailField = getFields().email;
      await user.type(emailField, 'invalid-email');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });

      expect(emailField).toHaveClass('border-red-500');
    });

    it('should clear error when email is corrected', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const emailField = getFields().email;
      await user.type(emailField, 'invalid');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });

      await user.clear(emailField);
      await user.type(emailField, 'valid@example.com');

      await waitFor(() => {
        expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Phone Validation', () => {
    it('should show error for invalid phone', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const phoneField = getFields().phone;
      await user.type(phoneField, 'invalid');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/valid phone/i)).toBeInTheDocument();
      });

      expect(phoneField).toHaveClass('border-red-500');
    });

    it('should not validate empty phone field', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const phoneField = getFields().phone;
      await user.click(phoneField);
      await user.tab();

      await waitFor(() => {
        expect(screen.queryByText(/valid phone/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Additional Items', () => {
    it('should show and hide add item form', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('+ Add Item')).toBeInTheDocument();
      });

      // Open form
      const addButton = screen.getByText('+ Add Item');
      await user.click(addButton);
      expect(screen.getByText('Type')).toBeInTheDocument();

      // Close form - button text changes to "Cancel"
      // There are now two "Cancel" buttons: one for add item form, one for modal footer
      // The add item cancel button is the first one
      const cancelButtons = screen.getAllByText('Cancel');
      await user.click(cancelButtons[0]);
      expect(screen.queryByText('Type')).not.toBeInTheDocument();
      // Button text changes back
      expect(screen.getByText('+ Add Item')).toBeInTheDocument();
    });

    it('should add booking option to additional items', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(vi.mocked(api.get)).toHaveBeenCalledWith(
          `/conferences/${conferenceId}/booking-options`
        );
      });

      // Open add item form
      await user.click(screen.getByText('+ Add Item'));

      // Get the comboboxes (first is pronouns, last ones are for add item)
      const comboboxes = screen.getAllByRole('combobox');
      const optionSelect = comboboxes[comboboxes.length - 1];

      await user.selectOptions(optionSelect, 'bo1');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Verify item was added
      expect(screen.getByText('VIP Pass')).toBeInTheDocument();
      expect(screen.getByText(/A new invoice will be created for 1 item/)).toBeInTheDocument();
    });

    it('should remove item when clicking Remove button', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(vi.mocked(api.get)).toHaveBeenCalled();
      });

      // Add item
      await user.click(screen.getByText('+ Add Item'));
      const comboboxes = screen.getAllByRole('combobox');
      await user.selectOptions(comboboxes[comboboxes.length - 1], 'bo1');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('VIP Pass')).toBeInTheDocument();

      // Remove item
      await user.click(screen.getByText('Remove'));

      expect(screen.queryByText('VIP Pass')).not.toBeInTheDocument();
      expect(screen.queryByText(/A new invoice will be created/)).not.toBeInTheDocument();
    });

    it('should filter out inactive booking options', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(vi.mocked(api.get)).toHaveBeenCalled();
      });

      await user.click(screen.getByText('+ Add Item'));

      // Check that active options are present and inactive ones are not
      expect(screen.getByText('VIP Pass')).toBeInTheDocument();
      expect(screen.getByText('Tutorial Access')).toBeInTheDocument();
      expect(screen.queryByText('Archived Pass')).not.toBeInTheDocument();
    });
  });

  describe('Summary Section', () => {
    it('should show default billing message when no additional items', () => {
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText(/No changes to existing invoice/)).toBeInTheDocument();
    });

    it('should show invoice creation message when additional items added', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(vi.mocked(api.get)).toHaveBeenCalled();
      });

      // Add item
      await user.click(screen.getByText('+ Add Item'));
      const comboboxes = screen.getAllByRole('combobox');
      await user.selectOptions(comboboxes[comboboxes.length - 1], 'bo1');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Check summary - there are two instances of this text now
      const messages = screen.getAllByText(/New invoice will be created for 1 item/);
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Form Submission', () => {
    it('should disable submit button when form is invalid', () => {
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Replace Attendee' });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when required fields are filled', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: 'Replace Attendee' });
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('should submit with required fields only', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      await waitFor(() => {
        expect(vi.mocked(api.post)).toHaveBeenCalledWith(
          `/conferences/${conferenceId}/registrations/${mockRegistration.id}/replace`,
          expect.objectContaining({
            new_attendee: expect.objectContaining({
              first_name: 'Jane',
              last_name: 'Smith',
              email: 'jane@example.com',
            }),
            additional_items: [],
          })
        );
      });
    });

    it('should submit with pronoun field selected', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      // Wait for pronoun options to load
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'she/her' })).toBeInTheDocument();
      });

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      const pronounSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(pronounSelect, 'she/her');

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      await waitFor(() => {
        expect(vi.mocked(api.post)).toHaveBeenCalledWith(
          `/conferences/${conferenceId}/registrations/${mockRegistration.id}/replace`,
          expect.objectContaining({
            new_attendee: expect.objectContaining({
              first_name: 'Jane',
              last_name: 'Smith',
              email: 'jane@example.com',
              pronouns: 'she/her',
            }),
          })
        );
      });
    });

    it('should submit with additional items', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await waitFor(() => {
        expect(vi.mocked(api.get)).toHaveBeenCalled();
      });

      // Fill required fields
      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      // Add item
      await user.click(screen.getByText('+ Add Item'));
      const comboboxes = screen.getAllByRole('combobox');
      await user.selectOptions(comboboxes[comboboxes.length - 1], 'bo1');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      await waitFor(() => {
        expect(vi.mocked(api.post)).toHaveBeenCalledWith(
          `/conferences/${conferenceId}/registrations/${mockRegistration.id}/replace`,
          expect.objectContaining({
            additional_items: [
              {
                item_type: 'booking_option',
                booking_option_id: 'bo1',
                item_name: 'VIP Pass',
              },
            ],
          })
        );
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 100))
      );

      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      expect(screen.getByText('Replacing...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replacing...' })).toBeDisabled();

      await waitFor(
        () => {
          expect(screen.queryByText('Replacing...')).not.toBeInTheDocument();
        },
        { timeout: 200 }
      );
    });

    it('should close modal on successful submission', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should show error message on submission failure', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Close', () => {
    it('should close modal when clicking Cancel button', async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable cancel button during submission', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 100))
      );

      renderWithQueryClient(
        <ReplaceAttendeeModal
          isOpen={true}
          onClose={mockOnClose}
          registration={mockRegistration}
          conferenceId={conferenceId}
        />
      );

      const fields = getFields();
      await user.type(fields.firstName, 'Jane');
      await user.type(fields.lastName, 'Smith');
      await user.type(fields.email, 'jane@example.com');

      await user.click(screen.getByRole('button', { name: 'Replace Attendee' }));

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelButton).toBeDisabled();

      await waitFor(
        () => {
          expect(cancelButton).not.toBeDisabled();
        },
        { timeout: 200 }
      );
    });
  });
});
