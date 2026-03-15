import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import SponsorDetailPanel from '../SponsorDetailPanel';
import type { Sponsor, SponsorPackage, PlatformCurrency } from '../../types';

// Mock child components
vi.mock('../SponsorLogoUpload', () => ({
  default: ({ sponsorId }: { sponsorId: string }) => (
    <div data-testid="sponsor-logo-upload">Logo Upload: {sponsorId}</div>
  ),
}));

vi.mock('../AttachmentList', () => ({
  default: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="attachment-list">
      Attachments: {entityType}/{entityId}
    </div>
  ),
}));

vi.mock('../ContactPersonList', () => ({
  default: ({
    contacts,
    addContact,
    removeContact,
  }: {
    contacts: unknown[];
    addContact: () => void;
    removeContact: (i: number) => void;
    [key: string]: unknown;
  }) => (
    <div data-testid="contact-person-list">
      <span>Contacts: {contacts.length}</span>
      <button onClick={addContact}>Add</button>
      <button onClick={() => removeContact(0)}>Remove</button>
    </div>
  ),
}));

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: () => <div data-testid="pdf-page" />,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));

vi.mock('../../pages/ConferenceDetail/SelectionContext', () => ({
  useSelection: () => ({ setSelectedInvoiceId: vi.fn() }),
}));

vi.mock('../Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../SponsorContractTab', () => ({
  default: ({ sponsor, conferenceId }: { sponsor: { id: string }; conferenceId: string }) => (
    <div data-testid="sponsor-contract-tab">
      Contract: {sponsor.id}/{conferenceId}
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
    subtitle,
    tabs,
    formId,
    onDelete,
    saveDisabled,
    saveStatus,
  }: {
    title: string;
    subtitle?: string;
    tabs: { id: string; label: string; content: React.ReactNode }[];
    formId?: string;
    onDelete?: () => void;
    saveDisabled?: boolean;
    saveStatus: string;
    [key: string]: unknown;
  }) => (
    <div data-testid="detail-panel-wrapper">
      <h3>{title}</h3>
      {subtitle && <p data-testid="subtitle">{subtitle}</p>}
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
  normalizeUrl: vi.fn((value: string) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }),
}));

const createSponsor = (overrides: Partial<Sponsor> = {}): Sponsor => ({
  id: 'sp-1',
  tenant_id: 'tenant-1',
  conference_id: 'conf-1',
  sponsor_package_id: null,
  sponsor_package_name: null,
  company_name: 'Acme Corp',
  phone: null,
  website: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  vat_number: null,
  price: null,
  currency: null,
  comments: null,
  contact_persons: [],
  is_active: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
});

const createPackage = (overrides: Partial<SponsorPackage> = {}): SponsorPackage => ({
  id: 'pkg-1',
  tenant_id: 'tenant-1',
  conference_id: 'conf-1',
  name: 'Gold',
  description: null,
  price: 5000,
  currency: 'EUR',
  is_active: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
});

const createCurrency = (overrides: Partial<PlatformCurrency> = {}): PlatformCurrency => ({
  id: 'cur-1',
  code: 'EUR',
  name: 'Euro',
  symbol: '\u20ac',
  is_active: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('SponsorDetailPanel', () => {
  const mockOnSave = vi.fn().mockResolvedValue(undefined);
  const mockOnDelete = vi.fn();

  const defaultProps = {
    sponsor: createSponsor(),
    sponsorPackages: [createPackage()],
    currencies: [createCurrency()],
    defaultCurrency: 'EUR',
    conferenceId: 'conf-1',
    onSave: mockOnSave,
    onDelete: mockOnDelete,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the sponsor company name as title', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('renders subtitle when sponsor has a package name', () => {
      render(
        <SponsorDetailPanel
          {...defaultProps}
          sponsor={createSponsor({ sponsor_package_name: 'Gold Sponsor' })}
        />,
        { wrapper }
      );
      expect(screen.getByTestId('subtitle')).toHaveTextContent('Gold Sponsor');
    });

    it('renders three tabs: Details, Contacts, Documents', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByTestId('tab-details')).toBeInTheDocument();
      expect(screen.getByTestId('tab-contacts')).toBeInTheDocument();
      expect(screen.getByTestId('tab-documents')).toBeInTheDocument();
    });

    it('renders SponsorLogoUpload in details tab', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByTestId('sponsor-logo-upload')).toBeInTheDocument();
    });

    it('renders Company Name input with value', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      const input = screen.getByDisplayValue('Acme Corp');
      expect(input).toBeInTheDocument();
    });

    it('renders sponsor package select with options', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByText('-- No Package --')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
    });

    it('renders Visible checkbox', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByText('Visible')).toBeInTheDocument();
    });

    it('renders phone input', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      expect(phoneInput).toBeInTheDocument();
    });

    it('renders website input', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      const websiteInput = screen.getByPlaceholderText('example.com');
      expect(websiteInput).toBeInTheDocument();
    });

    it('renders VAT Number input', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      const vatInput = screen.getByPlaceholderText('e.g., DE123456789');
      expect(vatInput).toBeInTheDocument();
    });

    it('renders AttachmentList in documents tab', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByText('Attachments: sponsor/sp-1')).toBeInTheDocument();
    });

    it('renders ContactPersonList in contacts tab', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByTestId('contact-person-list')).toBeInTheDocument();
    });

    it('renders delete button when onDelete is provided', () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByTestId('delete-btn')).toBeInTheDocument();
    });

    it('does not render delete button when onDelete is not provided', () => {
      render(<SponsorDetailPanel {...defaultProps} onDelete={undefined} />, { wrapper });
      expect(screen.queryByTestId('delete-btn')).not.toBeInTheDocument();
    });
  });

  describe('form interaction', () => {
    it('updates company name on input change', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const input = screen.getByDisplayValue('Acme Corp');
      await user.clear(input);
      await user.type(input, 'New Corp');
      expect(screen.getByDisplayValue('New Corp')).toBeInTheDocument();
    });

    it('updates price on input change', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const priceInput = screen.getByRole('spinbutton');
      await user.type(priceInput, '1000');
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    it('shows currency display from package', () => {
      render(
        <SponsorDetailPanel
          {...defaultProps}
          sponsor={createSponsor({ sponsor_package_id: 'pkg-1' })}
        />,
        { wrapper }
      );
      expect(screen.getByText('EUR - Euro')).toBeInTheDocument();
    });

    it('shows dash when no currency is available', () => {
      render(<SponsorDetailPanel {...defaultProps} defaultCurrency={undefined} currencies={[]} />, {
        wrapper,
      });
      expect(screen.getByText('\u2014')).toBeInTheDocument();
    });

    it('toggles is_active checkbox', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('shows phone error for invalid phone', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, '123invalid');
      fireEvent.blur(phoneInput);
      expect(screen.getByText('Phone must start with + or 00')).toBeInTheDocument();
    });

    it('sets saveDisabled to true when phone has error', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      fireEvent.blur(phoneInput);
      expect(screen.getByTestId('save-disabled')).toHaveTextContent('true');
    });
  });

  describe('package change', () => {
    it('auto-fills price when package is selected and price is empty', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const select = screen.getByDisplayValue('-- No Package --');
      await user.selectOptions(select, 'pkg-1');

      // Price should auto-fill from package
      expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    });

    it('clears package when no-package option selected', async () => {
      const user = userEvent.setup();
      render(
        <SponsorDetailPanel
          {...defaultProps}
          sponsor={createSponsor({ sponsor_package_id: 'pkg-1' })}
        />,
        { wrapper }
      );

      const select = screen.getByDisplayValue('Gold');
      await user.selectOptions(select, '');
      expect(screen.getByDisplayValue('-- No Package --')).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('calls onSave on form submit', async () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const form = screen.getByTestId('tab-details').querySelector('form');
      expect(form).not.toBeNull();
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });

    it('does not call onSave when phone has error', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      fireEvent.blur(phoneInput);

      const form = screen.getByTestId('tab-details').querySelector('form');
      fireEvent.submit(form!);

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('calls onDelete with sponsor id', async () => {
      const user = userEvent.setup();
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });

      await user.click(screen.getByTestId('delete-btn'));
      expect(mockOnDelete).toHaveBeenCalledWith('sp-1');
    });
  });

  describe('contacts tab label', () => {
    it('shows count in contacts tab when contacts exist', () => {
      render(
        <SponsorDetailPanel
          {...defaultProps}
          sponsor={createSponsor({
            contact_persons: [
              { first_name: 'John', last_name: 'Doe' },
              { first_name: 'Jane', last_name: 'Smith' },
            ],
          })}
        />,
        { wrapper }
      );
      expect(screen.getByText('Contacts (2)')).toBeInTheDocument();
    });

    it("shows 'Contacts' without count when no contacts", () => {
      render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      // Should just be "Contacts" without a number
      const contactsTab = screen.getByTestId('tab-contacts');
      expect(contactsTab.textContent).toContain('Contacts');
      expect(contactsTab.textContent).not.toContain('Contacts (');
    });
  });

  describe('sponsor change resets form', () => {
    it('resets form data when sponsor id changes', () => {
      const { rerender } = render(<SponsorDetailPanel {...defaultProps} />, { wrapper });
      expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();

      rerender(
        <SponsorDetailPanel
          {...defaultProps}
          sponsor={createSponsor({ id: 'sp-2', company_name: 'Other Corp' })}
        />
      );
      expect(screen.getByDisplayValue('Other Corp')).toBeInTheDocument();
    });
  });
});
