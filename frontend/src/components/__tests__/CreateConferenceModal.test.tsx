import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateConferenceModal from '../CreateConferenceModal';

// Mock the RichTextEditor component
vi.mock('../common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    rows,
  }: {
    value: string;
    onChange: (html: string) => void;
    rows?: number;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
    />
  ),
}));

describe('CreateConferenceModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(<CreateConferenceModal {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with title when open', () => {
    render(<CreateConferenceModal {...defaultProps} />);
    // The title appears in h3 and also as button text
    expect(screen.getByRole('heading', { name: 'Create Conference' })).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    expect(screen.getByText('Conference Name *')).toBeInTheDocument();
    expect(screen.getByText('Abbreviation')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
    expect(screen.getByText('Venue Name')).toBeInTheDocument();
    // City appears once
    expect(screen.getAllByText('City')).toHaveLength(1);
    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(screen.getByText('Venue Type')).toBeInTheDocument();
  });

  it('renders section headers', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    expect(screen.getByText('Conference Dates')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('renders Cancel and Create Conference buttons', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // The submit button in the form footer
    const footer = screen.getByRole('button', { name: 'Cancel' }).parentElement;
    expect(within(footer!).getByRole('button', { name: 'Create Conference' })).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateConferenceModal {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires conference name field', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    // Get all text inputs
    const textInputs = screen.getAllByRole('textbox');
    // The first text input should be the name field and it should be required
    expect(textInputs[0]).toBeRequired();
  });

  it('updates form state when typing in name field', async () => {
    const user = userEvent.setup();
    render(<CreateConferenceModal {...defaultProps} />);

    const textInputs = screen.getAllByRole('textbox');
    const nameInput = textInputs[0]; // First input is name
    await user.type(nameInput, 'My New Conference');

    expect(nameInput).toHaveValue('My New Conference');
  });

  it('updates form state when typing in abbreviation field', async () => {
    const user = userEvent.setup();
    render(<CreateConferenceModal {...defaultProps} />);

    const abbrevInput = screen.getByPlaceholderText('e.g., ICML_2026');
    await user.type(abbrevInput, 'MNC_2026');

    expect(abbrevInput).toHaveValue('MNC_2026');
  });

  it('updates form state when typing in website field', async () => {
    const user = userEvent.setup();
    render(<CreateConferenceModal {...defaultProps} />);

    const websiteInput = screen.getByPlaceholderText('www.conference.com');
    await user.type(websiteInput, 'www.myconference.com');

    expect(websiteInput).toHaveValue('www.myconference.com');
  });

  it('updates form state when selecting dates', async () => {
    const user = userEvent.setup();
    const { container } = render(<CreateConferenceModal {...defaultProps} />);

    // Get date inputs by type
    const dateInputs = container.querySelectorAll('input[type="date"]');
    const startDateInput = dateInputs[0] as HTMLInputElement;
    await user.type(startDateInput, '2026-06-01');

    expect(startDateInput).toHaveValue('2026-06-01');
  });

  it('updates form state when changing venue type', async () => {
    const user = userEvent.setup();
    render(<CreateConferenceModal {...defaultProps} />);

    const venueTypeSelect = screen.getByRole('combobox');
    await user.selectOptions(venueTypeSelect, 'virtual');

    expect(venueTypeSelect).toHaveValue('virtual');
  });

  it('renders venue type options', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    const venueTypeSelect = screen.getByRole('combobox');
    expect(venueTypeSelect).toHaveValue('onsite'); // Default value

    expect(screen.getByRole('option', { name: 'Onsite' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Virtual' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hybrid' })).toBeInTheDocument();
  });

  it('calls onSubmit with form data when form is submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateConferenceModal {...defaultProps} onSubmit={onSubmit} />);

    const textInputs = screen.getAllByRole('textbox');
    const nameInput = textInputs[0]; // First input is name
    await user.type(nameInput, 'Test Conference');

    const submitButton = screen.getByRole('button', { name: 'Create Conference' });
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Conference',
        venue_type: 'onsite',
      })
    );
  });

  it('includes optional fields in submit only when filled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(<CreateConferenceModal {...defaultProps} onSubmit={onSubmit} />);

    const textInputs = screen.getAllByRole('textbox');
    const nameInput = textInputs[0]; // First input is name
    await user.type(nameInput, 'Test Conference');

    // Find city input - it's within the Location section
    const locationSection = container.querySelector('.border-t.border-gray-200.pt-4:last-of-type');
    const cityInputs = locationSection?.querySelectorAll('input[type="text"]');
    if (cityInputs && cityInputs.length >= 2) {
      const cityInput = cityInputs[1] as HTMLInputElement; // City is second after Venue Name
      await user.type(cityInput, 'San Francisco');
    }

    const submitButton = screen.getByRole('button', { name: 'Create Conference' });
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Conference',
        city: 'San Francisco',
      })
    );
  });

  it('shows loading state on submit button', () => {
    render(<CreateConferenceModal {...defaultProps} isLoading={true} />);

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
  });

  it('disables submit button when loading', () => {
    render(<CreateConferenceModal {...defaultProps} isLoading={true} />);

    const submitButton = screen.getByRole('button', { name: 'Creating...' });
    expect(submitButton).toBeDisabled();
  });

  it('displays error message when error prop is provided', () => {
    render(<CreateConferenceModal {...defaultProps} error="Failed to create conference" />);

    expect(screen.getByText('Failed to create conference')).toBeInTheDocument();
  });

  it('renders error with appropriate styling', () => {
    render(<CreateConferenceModal {...defaultProps} error="Something went wrong" />);

    const errorDiv = screen.getByText('Something went wrong').closest('div');
    expect(errorDiv?.className).toContain('bg-red-50');
    expect(errorDiv?.className).toContain('text-red-700');
  });

  it('does not show error when error is null', () => {
    const { container } = render(<CreateConferenceModal {...defaultProps} error={null} />);

    const errorDiv = container.querySelector('.bg-red-50');
    expect(errorDiv).not.toBeInTheDocument();
  });

  it('renders rich text editor for description', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
  });

  it('updates description via rich text editor', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateConferenceModal {...defaultProps} onSubmit={onSubmit} />);

    const textInputs = screen.getAllByRole('textbox');
    const nameInput = textInputs[0]; // First input is name
    await user.type(nameInput, 'Test Conference');

    const descEditor = screen.getByTestId('rich-text-editor');
    await user.type(descEditor, 'This is a description');

    const submitButton = screen.getByRole('button', { name: 'Create Conference' });
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Conference',
        description: 'This is a description',
      })
    );
  });

  it('shows abbreviation placeholder text', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    const abbrevInput = screen.getByPlaceholderText('e.g., ICML_2026');
    expect(abbrevInput).toBeInTheDocument();
  });

  it('shows website placeholder text', () => {
    render(<CreateConferenceModal {...defaultProps} />);

    const websiteInput = screen.getByPlaceholderText('www.conference.com');
    expect(websiteInput).toBeInTheDocument();
  });

  it('calls onClose when modal close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateConferenceModal {...defaultProps} onClose={onClose} />);

    // Click the X button in the modal header (first button with SVG)
    const allButtons = screen.getAllByRole('button');
    const closeButton = allButtons[0]; // The X button is the first button
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prevents form submission without required name field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateConferenceModal {...defaultProps} onSubmit={onSubmit} />);

    // Try to submit without filling required field
    const submitButton = screen.getByRole('button', { name: 'Create Conference' });
    await user.click(submitButton);

    // Form validation should prevent submission
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
