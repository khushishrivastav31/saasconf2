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
