import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LocationDetailPanel from '../LocationDetailPanel';
import type { Location, TenantLocationType } from '../../types';

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
    subtitle,
    tabs,
    formId,
    onDelete,
    showSave,
    saveDisabled,
    saveStatus,
  }: {
    title: string;
    subtitle?: string;
    tabs: { id: string; label: string; content: React.ReactNode }[];
    formId?: string;
    onDelete?: () => void;
    showSave?: boolean;
    saveDisabled?: boolean;
    saveStatus: string;
    [key: string]: unknown;
  }) => (
    <div data-testid="detail-panel-wrapper">
      <h3>{title}</h3>
      {subtitle && <p data-testid="subtitle">{subtitle}</p>}
      <span data-testid="save-status">{saveStatus}</span>
      <span data-testid="save-disabled">{String(!!saveDisabled)}</span>
      <span data-testid="show-save">{String(showSave !== false)}</span>
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

vi.mock('../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const createLocation = (overrides: Partial<Location> = {}): Location => ({
  id: 'loc-1',
  tenant_id: 'tenant-1',
  parent_id: null,
  name: 'Main Hall',
  code: 'MH-01',
  location_type: 'room',
  description: null,
  capacity: 200,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  full_address: null,
  latitude: null,
  longitude: null,
  building: null,
  floor: null,
  phone: null,
  website: null,
  vat_number: null,
  amenities: [],
  accessibility_features: [],
  virtual_url: null,
  virtual_platform: null,
  is_active: true,
  settings: {},
  contact_persons: [],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  children_count: 0,
  conference_ids: ['conf-1'],
  ...overrides,
});

const createLocationType = (overrides: Partial<TenantLocationType> = {}): TenantLocationType => ({
  id: 'lt-1',
  tenant_id: 'tenant-1',
  conference_id: 'conf-1',
  name: 'Room',
  slug: 'room',
  description: null,
  is_active: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  usage_count: 0,
  ...overrides,
});

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('LocationDetailPanel', () => {
  const mockOnSave = vi.fn().mockResolvedValue(undefined);
  const mockOnDelete = vi.fn();

  const locationTypes: TenantLocationType[] = [
    createLocationType({ id: 'lt-1', name: 'Room', slug: 'room' }),
    createLocationType({ id: 'lt-2', name: 'Hall', slug: 'hall' }),
    createLocationType({ id: 'lt-3', name: 'Virtual', slug: 'virtual' }),
    createLocationType({
      id: 'lt-inactive',
      name: 'Inactive Type',
      slug: 'inactive',
      is_active: false,
    }),
  ];

  const allLocations: Location[] = [
    createLocation({ id: 'loc-1', name: 'Main Hall' }),
    createLocation({ id: 'loc-2', name: 'Building A', parent_id: null }),
  ];

  const defaultProps = {
    location: createLocation(),
    onSave: mockOnSave,
    onDelete: mockOnDelete,
    locationTypes,
    allLocations,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the location name as title', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });

    it('renders code as subtitle when present', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByTestId('subtitle')).toHaveTextContent('MH-01');
    });

    it('does not render subtitle when code is null', () => {
      render(<LocationDetailPanel {...defaultProps} location={createLocation({ code: null })} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.queryByTestId('subtitle')).not.toBeInTheDocument();
    });

    it('renders three tabs: Details, Contacts, Documents', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByTestId('tab-details')).toBeInTheDocument();
      expect(screen.getByTestId('tab-contacts')).toBeInTheDocument();
      expect(screen.getByTestId('tab-documents')).toBeInTheDocument();
    });

    it('renders Name input with value', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByDisplayValue('Main Hall')).toBeInTheDocument();
    });

    it('renders Code input with placeholder', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByPlaceholderText('e.g., ROOM-A1')).toBeInTheDocument();
    });

    it('renders location type select with active types only', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByText('Room')).toBeInTheDocument();
      expect(screen.getByText('Hall')).toBeInTheDocument();
      expect(screen.getByText('Virtual')).toBeInTheDocument();
      // Inactive types should not appear
      expect(screen.queryByText('Inactive Type')).not.toBeInTheDocument();
    });

    it('renders parent location select', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByText('None (top-level venue)')).toBeInTheDocument();
    });

    it('renders capacity input', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByDisplayValue('200')).toBeInTheDocument();
    });

    it('renders Active checkbox', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByLabelText('Active')).toBeInTheDocument();
    });

    it('renders AttachmentList in documents tab', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByText('Attachments: location/loc-1')).toBeInTheDocument();
    });

    it('renders ContactPersonList in contacts tab', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByTestId('contact-person-list')).toBeInTheDocument();
    });
  });

  describe('physical location fields', () => {
    it('shows address fields for non-virtual location', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByText('Address Line 1')).toBeInTheDocument();
      expect(screen.getByText('Address Line 2')).toBeInTheDocument();
      expect(screen.getByText('City')).toBeInTheDocument();
      expect(screen.getByText('State')).toBeInTheDocument();
      expect(screen.getByText('Postal Code')).toBeInTheDocument();
      expect(screen.getByText('Country')).toBeInTheDocument();
      expect(screen.getByText('Building')).toBeInTheDocument();
      expect(screen.getByText('Floor')).toBeInTheDocument();
    });

    it('does not show virtual fields for physical location', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.queryByText('Platform')).not.toBeInTheDocument();
      expect(screen.queryByText('Select platform')).not.toBeInTheDocument();
    });
  });

  describe('virtual location fields', () => {
    it('shows platform and URL fields for virtual location', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      // Change location type to virtual
      const typeSelect = screen.getByDisplayValue('Room');
      await user.selectOptions(typeSelect, 'virtual');

      expect(screen.getByText('Platform')).toBeInTheDocument();
      expect(screen.getByText('Select platform')).toBeInTheDocument();
      // Address fields should be hidden
      expect(screen.queryByText('Building')).not.toBeInTheDocument();
    });
  });

  describe('form interaction', () => {
    it('updates name on input change', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const input = screen.getByDisplayValue('Main Hall');
      await user.clear(input);
      await user.type(input, 'New Hall');
      expect(screen.getByDisplayValue('New Hall')).toBeInTheDocument();
    });

    it('updates capacity on input change', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const capacityInput = screen.getByDisplayValue('200');
      await user.clear(capacityInput);
      await user.type(capacityInput, '500');
      expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    });

    it('toggles active checkbox', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const checkbox = screen.getByLabelText('Active');
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('shows phone error for invalid phone', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      fireEvent.blur(phoneInput);
      expect(screen.getByText('Phone must start with + or 00')).toBeInTheDocument();
    });

    it('sets saveDisabled when phone has error', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      fireEvent.blur(phoneInput);
      expect(screen.getByTestId('save-disabled')).toHaveTextContent('true');
    });
  });

  describe('form submission', () => {
    it('calls onSave on form submit', async () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const form = screen.getByTestId('tab-details').querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });

    it('does not submit when phone has error', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      const phoneInput = screen.getByPlaceholderText('+491234545 or 00491234566');
      await user.type(phoneInput, 'invalid');
      fireEvent.blur(phoneInput);

      const form = screen.getByTestId('tab-details').querySelector('form');
      fireEvent.submit(form!);

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('calls onDelete with location id', async () => {
      const user = userEvent.setup();
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByTestId('delete-btn'));
      expect(mockOnDelete).toHaveBeenCalledWith('loc-1');
    });
  });

  describe('showSave', () => {
    it('shows save when onSave is provided', () => {
      render(<LocationDetailPanel {...defaultProps} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByTestId('show-save')).toHaveTextContent('true');
    });

    it('hides save when onSave is not provided', () => {
      render(<LocationDetailPanel {...defaultProps} onSave={undefined} />, {
        wrapper: createQueryWrapper(),
      });
      expect(screen.getByTestId('show-save')).toHaveTextContent('false');
    });
  });

  describe('contacts tab label', () => {
    it('shows count when contacts exist', () => {
      render(
        <LocationDetailPanel
          {...defaultProps}
          location={createLocation({
            contact_persons: [{ first_name: 'John', last_name: 'Doe' }],
          })}
        />,
        { wrapper: createQueryWrapper() }
      );
      expect(screen.getByText('Contacts (1)')).toBeInTheDocument();
    });
  });

  describe('location change resets form', () => {
    it('resets form when location id changes', () => {
      const Wrapper = createQueryWrapper();
      const { rerender } = render(
        <Wrapper>
          <LocationDetailPanel {...defaultProps} />
        </Wrapper>
      );
      expect(screen.getByDisplayValue('Main Hall')).toBeInTheDocument();

      rerender(
        <Wrapper>
          <LocationDetailPanel
            {...defaultProps}
            location={createLocation({ id: 'loc-2', name: 'Room B' })}
          />
        </Wrapper>
      );
      expect(screen.getByDisplayValue('Room B')).toBeInTheDocument();
    });
  });
});
