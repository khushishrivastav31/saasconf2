import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ServiceProviderDetailPanel from '../ServiceProviderDetailPanel';
import type { ServiceProvider } from '../../types';

// Mock child components
vi.mock('../AttachmentList', () => ({
  default: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="attachment-list">
      Attachments: {entityType}/{entityId}
    </div>
  ),
}));

vi.mock('../ContactPersonList', () => ({
  default: ({ contacts }: { contacts: unknown[]; [key: string]: unknown }) => (
    <div data-testid="contact-person-list">
      <span>Contacts: {contacts.length}</span>
    </div>
  ),
}));

vi.mock('../common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (html: string) => void;
    rows?: number;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../DetailPanelWrapper', () => ({
  default: ({
    title,
    tabs,
    formId,
    onDelete,
    saveDisabled,
    saveStatus,
  }: {
    title: string;
    tabs: { id: string; label: string; content: React.ReactNode }[];
    formId?: string;
    onDelete?: () => void;
    saveDisabled?: boolean;
    saveStatus: string;
    [key: string]: unknown;
  }) => (
    <div data-testid="detail-panel-wrapper">
      <h3>{title}</h3>
      <span data-testid="save-status">{saveStatus}</span>
      <span data-testid="save-disabled">{String(!!saveDisabled)}</span>
      {tabs.map((tab) => (
        <div key={tab.id} data-testid={`tab-${tab.id}`}>
          <span>{tab.label}</span>
          {tab.content}
        </div>
      ))}
      {onDelete && (
        <button data-testid="delete-btn" onClick={onDelete}>
          Delete
        </button>
      )}
      {formId && (
        <button type="submit" form={formId} data-testid="save-btn">
          Save
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../utils/validators', () => ({
  validatePhone: vi.fn((phone: string) => {
    if (!phone) return null;
    if (!phone.startsWith('+') && !phone.startsWith('00')) {
      return 'Phone must start with + or 00';
    }
    return null;
  }),
}));

const createProvider = (overrides: Partial<ServiceProvider> = {}): ServiceProvider => ({
  id: 'sp-1',
  tenant_id: 'tenant-1',
  location_id: 'loc-1',
  conference_id: 'conf-1',
  company_name: 'TechServ GmbH',
  service_description: 'AV equipment rental',
  phone: null,
  email: null,
  website: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  vat_number: null,
  contact_persons: [],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
});

describe('ServiceProviderDetailPanel', () => {
  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();

  const defaultProps = {
    provider: createProvider(),
    onSave: mockOnSave,
    onDelete: mockOnDelete,
    isSaving: false,
    saveError: false,
    saveSuccess: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the provider company name as title', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
    });

    it('renders three tabs: Details, Contacts, Documents', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByTestId('tab-details')).toBeInTheDocument();
      expect(screen.getByTestId('tab-contacts')).toBeInTheDocument();
      expect(screen.getByTestId('tab-documents')).toBeInTheDocument();
    });

    it('renders Company Name input with value', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByDisplayValue('TechServ GmbH')).toBeInTheDocument();
    });

    it('renders Service Description rich text editor', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    });

    it('renders phone input', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByPlaceholderText('+491234545 or 00491234566')).toBeInTheDocument();
    });

    it('renders email input', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('renders website input', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByPlaceholderText('https://')).toBeInTheDocument();
    });

    it('renders VAT Number input', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByPlaceholderText('e.g., DE123456789')).toBeInTheDocument();
    });

    it('renders address fields', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByText('Address Line 1')).toBeInTheDocument();
      expect(screen.getByText('Address Line 2')).toBeInTheDocument();
      expect(screen.getByText('City')).toBeInTheDocument();
      expect(screen.getByText('State')).toBeInTheDocument();
      expect(screen.getByText('Postal Code')).toBeInTheDocument();
      expect(screen.getByText('Country')).toBeInTheDocument();
    });

    it('renders AttachmentList in documents tab', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByText('Attachments: service_provider/sp-1')).toBeInTheDocument();
    });

    it('renders ContactPersonList in contacts tab', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByTestId('contact-person-list')).toBeInTheDocument();
    });

    it('renders delete button when onDelete is provided', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByTestId('delete-btn')).toBeInTheDocument();
    });

    it('does not render delete button when onDelete is not provided', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} onDelete={undefined} />);
      expect(screen.queryByTestId('delete-btn')).not.toBeInTheDocument();
    });
  });

  describe('form interaction', () => {
    it('updates company name on input change', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderDetailPanel {...defaultProps} />);

      const input = screen.getByDisplayValue('TechServ GmbH');
      await user.clear(input);
      await user.type(input, 'New Provider');
      expect(screen.getByDisplayValue('New Provider')).toBeInTheDocument();
    });

    it('shows phone validation error for invalid phone', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderDetailPanel {...defaultProps} />);

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      expect(screen.getByText('Phone must start with + or 00')).toBeInTheDocument();
    });

    it('sets saveDisabled when phone has error or isSaving', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderDetailPanel {...defaultProps} />);

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      expect(screen.getByTestId('save-disabled')).toHaveTextContent('true');
    });

    it('sets saveDisabled when isSaving is true', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} isSaving={true} />);
      expect(screen.getByTestId('save-disabled')).toHaveTextContent('true');
    });
  });

  describe('form submission', () => {
    it('calls onSave on form submit', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);

      const form = screen.getByTestId('tab-details').querySelector('form');
      fireEvent.submit(form!);

      expect(mockOnSave).toHaveBeenCalled();
    });

    it('does not call onSave when phone has error', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderDetailPanel {...defaultProps} />);

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');

      const form = screen.getByTestId('tab-details').querySelector('form');
      fireEvent.submit(form!);

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('save status from props', () => {
    it('reflects saving state when isSaving is true', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} isSaving={true} />);
      expect(screen.getByTestId('save-status')).toHaveTextContent('saving');
    });

    it('reflects saved state when saveSuccess is true', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} saveSuccess={true} />);
      expect(screen.getByTestId('save-status')).toHaveTextContent('saved');
    });

    it('reflects error state when saveError is true', () => {
      render(<ServiceProviderDetailPanel {...defaultProps} saveError={true} />);
      expect(screen.getByTestId('save-status')).toHaveTextContent('error');
    });
  });

  describe('delete', () => {
    it('calls onDelete with provider id', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderDetailPanel {...defaultProps} />);

      await user.click(screen.getByTestId('delete-btn'));
      expect(mockOnDelete).toHaveBeenCalledWith('sp-1');
    });
  });

  describe('contacts tab label', () => {
    it('shows count when contacts exist', () => {
      render(
        <ServiceProviderDetailPanel
          {...defaultProps}
          provider={createProvider({
            contact_persons: [
              { first_name: 'Alice', last_name: 'Brown' },
              { first_name: 'Bob', last_name: 'White' },
              { first_name: 'Charlie', last_name: 'Green' },
            ],
          })}
        />
      );
      expect(screen.getByText('Contacts (3)')).toBeInTheDocument();
    });

    it("shows 'Contacts' without count when no contacts", () => {
      render(<ServiceProviderDetailPanel {...defaultProps} />);
      const contactsTab = screen.getByTestId('tab-contacts');
      expect(contactsTab.textContent).toContain('Contacts');
      expect(contactsTab.textContent).not.toContain('Contacts (');
    });
  });

  describe('provider change resets form', () => {
    it('resets form when provider id changes', () => {
      const { rerender } = render(<ServiceProviderDetailPanel {...defaultProps} />);
      expect(screen.getByDisplayValue('TechServ GmbH')).toBeInTheDocument();

      rerender(
        <ServiceProviderDetailPanel
          {...defaultProps}
          provider={createProvider({ id: 'sp-2', company_name: 'Other Services' })}
        />
      );
      expect(screen.getByDisplayValue('Other Services')).toBeInTheDocument();
    });
  });
});
