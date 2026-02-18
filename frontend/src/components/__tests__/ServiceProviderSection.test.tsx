import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServiceProviderSection from '../ServiceProviderSection';
import api from '../../config/api';
import type { ServiceProvider } from '../../types';

// Mock API
vi.mock('../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock child components
vi.mock('../AttachmentList', () => ({
  default: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid={`attachment-list-${entityId}`}>
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

vi.mock('../ConfirmDialog', () => ({
  default: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{title}</p>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={onCancel}>Cancel Delete</button>
      </div>
    ) : null,
}));

const mockProvider: ServiceProvider = {
  id: 'sp-1',
  tenant_id: 'tenant-1',
  location_id: 'loc-1',
  conference_id: 'conf-1',
  company_name: 'TechServ GmbH',
  service_description: 'AV equipment',
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
  contact_persons: [{ first_name: 'John', last_name: 'Doe', email: 'john@test.com' }],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const mockProvider2: ServiceProvider = {
  ...mockProvider,
  id: 'sp-2',
  company_name: 'Catering Co',
  service_description: 'Lunch catering',
  contact_persons: [],
};

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('ServiceProviderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading message while data is being fetched', () => {
      // Mock API to return a never-resolving promise
      (api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByText('Loading service providers...')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no providers exist', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText(/No service providers yet/)).toBeInTheDocument();
      });
    });

    it('shows + Add Provider button in empty state', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('+ Add Provider')).toBeInTheDocument();
      });
    });
  });

  describe('with providers', () => {
    beforeEach(() => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [mockProvider, mockProvider2], total: 2 },
      });
    });

    it('renders provider list with names', async () => {
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
        expect(screen.getByText('Catering Co')).toBeInTheDocument();
      });
    });

    it('shows provider count badge', async () => {
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('renders contact persons on provider cards', async () => {
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('john@test.com')).toBeInTheDocument();
      });
    });

    it('renders attachment list for each provider', async () => {
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('attachment-list-sp-1')).toBeInTheDocument();
        expect(screen.getByTestId('attachment-list-sp-2')).toBeInTheDocument();
      });
    });

    it('renders Edit and Delete buttons on each provider card', async () => {
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit');
        expect(editButtons).toHaveLength(2);
        const deleteButtons = screen.getAllByTitle('Delete');
        expect(deleteButtons).toHaveLength(2);
      });
    });
  });

  describe('add provider', () => {
    beforeEach(() => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });
    });

    it('shows create form when + Add Provider is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('+ Add Provider')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Provider'));
      expect(screen.getByText('New Service Provider')).toBeInTheDocument();
      expect(screen.getByText('Company Name *')).toBeInTheDocument();
    });

    it('shows Cancel button in create form', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('+ Add Provider')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Provider'));
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('hides create form when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('+ Add Provider')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Provider'));
      expect(screen.getByText('New Service Provider')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('New Service Provider')).not.toBeInTheDocument();
    });

    it('submits create form with data', async () => {
      const user = userEvent.setup();
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockProvider },
      });

      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('+ Add Provider')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Provider'));

      // Find the company name input (the required text input in the create form)
      const form = screen.getByText('New Service Provider').closest('form')!;
      const nameInput = form.querySelector("input[type='text']") as HTMLInputElement;
      await user.type(nameInput, 'New Provider Inc');

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/locations/loc-1/service-providers',
          expect.objectContaining({ company_name: 'New Provider Inc' })
        );
      });
    });
  });

  describe('edit provider', () => {
    beforeEach(() => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [mockProvider], total: 1 },
      });
    });

    it('shows edit form when Edit button is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Edit'));
      expect(screen.getByText('Edit Provider')).toBeInTheDocument();
      expect(screen.getByDisplayValue('TechServ GmbH')).toBeInTheDocument();
    });

    it('hides edit form when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Edit'));
      expect(screen.getByText('Edit Provider')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Edit Provider')).not.toBeInTheDocument();
    });

    it('submits edit form with updated data', async () => {
      const user = userEvent.setup();
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockProvider, company_name: 'Updated Name' },
      });

      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Edit'));

      const nameInput = screen.getByDisplayValue('TechServ GmbH');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      await user.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/locations/loc-1/service-providers/sp-1',
          expect.objectContaining({ company_name: 'Updated Name' })
        );
      });
    });
  });

  describe('delete provider', () => {
    beforeEach(() => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [mockProvider], total: 1 },
      });
    });

    it('shows confirm dialog when Delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Delete'));
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText('Delete Service Provider')).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to delete "TechServ GmbH"/)
      ).toBeInTheDocument();
    });

    it('calls delete API when confirmed', async () => {
      const user = userEvent.setup();
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Delete'));
      await user.click(screen.getByText('Confirm Delete'));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/locations/loc-1/service-providers/sp-1');
      });
    });

    it('closes confirm dialog when cancelled', async () => {
      const user = userEvent.setup();
      render(<ServiceProviderSection locationId="loc-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('TechServ GmbH')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Delete'));
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel Delete'));
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
  });
});
