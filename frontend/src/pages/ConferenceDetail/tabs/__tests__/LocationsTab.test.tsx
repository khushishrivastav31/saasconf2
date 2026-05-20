import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectionProvider } from '../../SelectionContext';
import ConferenceLocationsTab from '../LocationsTab';
import type { Conference } from '../../../../types';

const mockShowToast = vi.fn();
vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../components/LocationDetailPanel', () => ({
  default: ({
    onSave,
    onDelete,
  }: {
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onDelete: () => void;
  }) => (
    <div data-testid="location-detail-panel">
      <button onClick={() => onSave({ name: 'Updated Name' })}>SaveLocation</button>
      <button onClick={onDelete}>DeleteLocation</button>
    </div>
  ),
}));

vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: ({ onChange }: { onChange: (val: string) => void }) => (
    <div
      data-testid="rich-text-editor"
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange((e.target as HTMLElement).textContent || '')}
    />
  ),
}));

vi.mock('../../../../components/ContactPersonList', () => ({
  default: () => <div data-testid="contact-person-list" />,
}));

vi.mock('../../../../components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>ConfirmDelete</button>
        <button onClick={onCancel}>CancelDelete</button>
      </div>
    ) : null,
}));

const mockConference = {
  id: 'conf-1',
  name: 'TestConf 2026',
} as unknown as Conference;

const locationBase = {
  code: '',
  description: '',
  building: '',
  floor: '',
  city: '',
  virtual_url: null,
  virtual_platform: null,
  contact_persons: [],
  tenant_id: 't-1',
  conference_id: 'conf-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const venueA = {
  ...locationBase,
  id: 'loc-a',
  name: 'Main Building',
  location_type: 'venue',
  is_active: true,
  parent_id: null,
  capacity: 500,
};
const roomB = {
  ...locationBase,
  id: 'loc-b',
  name: 'Room 101',
  location_type: 'room',
  is_active: true,
  parent_id: 'loc-a',
  capacity: 30,
};
const roomC = {
  ...locationBase,
  id: 'loc-c',
  name: 'Room 102',
  location_type: 'room',
  is_active: true,
  parent_id: 'loc-a',
  capacity: 25,
};
const orphanRoom = {
  ...locationBase,
  id: 'loc-d',
  name: 'Lost Room',
  location_type: 'room',
  is_active: true,
  parent_id: 'missing-venue-id',
  capacity: 10,
};

const sampleLocation = {
  id: 'loc-1',
  name: 'Main Hall',
  location_type: 'room',
  is_active: true,
  parent_id: null,
  capacity: 100,
  code: 'MH',
  description: '',
  building: '',
  floor: '',
  city: '',
  virtual_url: null,
  virtual_platform: null,
  contact_persons: [],
  tenant_id: 't-1',
  conference_id: 'conf-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SelectionProvider>{children}</SelectionProvider>
    </QueryClientProvider>
  );
}

function defaultMockGet(url: string) {
  if (url.includes('settings/location-types')) {
    return Promise.resolve({
      data: { items: [{ id: 'lt-1', name: 'Room', slug: 'room', is_active: true }], total: 1 },
    });
  }
  return Promise.resolve({ data: { items: [], total: 0 } });
}

describe('ConferenceLocationsTab — toast feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(defaultMockGet);
  });

  it('shows success toast after creating a location', async () => {
    mockPost.mockResolvedValue({ data: { ...sampleLocation, id: 'loc-new' } });

    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No locations linked yet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create New'));

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Room' } });

    const typeSelect = document.querySelector('select[required]') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'room' } });

    fireEvent.click(screen.getByText('Create Location'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Location created', 'success');
    });
  });

  it('shows success toast after updating a location', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === `/conferences/conf-1/locations`) {
        return Promise.resolve({ data: { items: [sampleLocation], total: 1 } });
      }
      return defaultMockGet(url);
    });
    mockPut.mockResolvedValue({ data: {} });

    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Main Hall'));

    await waitFor(() => {
      expect(screen.getByTestId('location-detail-panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('SaveLocation'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Location updated', 'success');
    });
  });

  it('shows success toast after deleting a location', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === `/conferences/conf-1/locations`) {
        return Promise.resolve({ data: { items: [sampleLocation], total: 1 } });
      }
      return defaultMockGet(url);
    });
    mockDelete.mockResolvedValue({ data: {} });

    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Main Hall'));

    await waitFor(() => {
      expect(screen.getByTestId('location-detail-panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('DeleteLocation'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ConfirmDelete'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Location deleted', 'success');
    });
  });

  it('shows error toast when create fails', async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: 'Server error' } } });

    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No locations linked yet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create New'));

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Fail Room' } });

    const typeSelect = document.querySelector('select[required]') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'room' } });

    fireEvent.click(screen.getByText('Create Location'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Server error'), 'error');
    });
  });
});

describe('ConferenceLocationsTab — location hierarchy', () => {
  function mockWithLocations(items: (typeof venueA)[]) {
    mockGet.mockImplementation((url: string) => {
      if (url === `/conferences/conf-1/locations`) {
        return Promise.resolve({ data: { items, total: items.length } });
      }
      if (url.includes('settings/location-types')) {
        return Promise.resolve({
          data: { items: [{ id: 'lt-1', name: 'Room', slug: 'room', is_active: true }], total: 1 },
        });
      }
      return Promise.resolve({ data: { items: [], total: 0 } });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders venue at top level and child rooms indented beneath it, not as venue rows', async () => {
    mockWithLocations([venueA, roomB, roomC]);
    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('Main Building')).toBeInTheDocument());

    const venueRows = screen.getAllByTestId('venue-row');
    expect(venueRows).toHaveLength(1);
    expect(venueRows[0]).toHaveTextContent('Main Building');

    const childRows = screen.getAllByTestId('child-row');
    expect(childRows).toHaveLength(2);
    expect(childRows[0]).toHaveTextContent('Room 101');
    expect(childRows[1]).toHaveTextContent('Room 102');

    // Rooms must not appear as top-level venue rows
    expect(venueRows.map((r) => r.textContent).some((t) => t?.includes('Room 101'))).toBe(false);
    expect(venueRows.map((r) => r.textContent).some((t) => t?.includes('Room 102'))).toBe(false);
  });

  it('starts with all venues expanded; toggle collapses then re-expands child rooms', async () => {
    mockWithLocations([venueA, roomB, roomC]);
    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('Main Building')).toBeInTheDocument());

    // Default: expanded — child rows visible
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Room 102')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByRole('button', { name: /collapse main building/i }));
    expect(screen.queryByText('Room 101')).not.toBeInTheDocument();
    expect(screen.queryByText('Room 102')).not.toBeInTheDocument();

    // Expand again
    fireEvent.click(screen.getByRole('button', { name: /expand main building/i }));
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Room 102')).toBeInTheDocument();
  });

  it('renders orphaned rooms in a separate warning section, not as a venue row', async () => {
    mockWithLocations([venueA, roomB, orphanRoom]);
    render(<ConferenceLocationsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('Main Building')).toBeInTheDocument());

    expect(screen.getByText('Orphaned rooms')).toBeInTheDocument();

    const orphanedRows = screen.getAllByTestId('orphaned-row');
    expect(orphanedRows).toHaveLength(1);
    expect(orphanedRows[0]).toHaveTextContent('Lost Room');

    // Must not appear as a venue row
    const venueRows = screen.getAllByTestId('venue-row');
    expect(venueRows.map((r) => r.textContent).some((t) => t?.includes('Lost Room'))).toBe(false);
  });
});
