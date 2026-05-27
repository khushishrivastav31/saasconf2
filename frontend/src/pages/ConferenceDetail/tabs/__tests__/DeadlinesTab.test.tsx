import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeadlinesTab from '../DeadlinesTab';

const mockShowToast = vi.fn();
vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../utils/formatDate', () => ({
  formatDateTime: (d: string) => new Date(d).toLocaleString('en-US'),
}));

vi.mock('../../../../components/Modal', () => ({
  default: ({
    open,
    title,
    onClose,
    children,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal">
        <span>{title}</span>
        <button onClick={onClose}>CloseModal</button>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../../components/ConfirmDialog', () => ({
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
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <span>{message}</span>
        <button onClick={onConfirm}>ConfirmDelete</button>
        <button onClick={onCancel}>CancelDelete</button>
      </div>
    ) : null,
}));

vi.mock('../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockConference = { id: 'conf-1', name: 'TestConf 2026' };

const now = new Date();
const future30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
const future3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
const past1d = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

const sampleDeadlines = [
  {
    id: 'dl-1',
    tenant_id: 't-1',
    conference_id: 'conf-1',
    title: 'Sponsor Contract',
    description: 'Sign sponsor agreement',
    due_date: future30d,
    is_active: true,
    reminder_7d_sent: false,
    reminder_1d_sent: false,
    reminder_due_sent: false,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'dl-2',
    tenant_id: 't-1',
    conference_id: 'conf-1',
    title: 'Venue Booking',
    description: 'Confirm venue reservation',
    due_date: future3d,
    is_active: true,
    reminder_7d_sent: true,
    reminder_1d_sent: false,
    reminder_due_sent: false,
    created_by: 'user-1',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'dl-3',
    tenant_id: 't-1',
    conference_id: 'conf-1',
    title: 'Overdue Task',
    description: null,
    due_date: past1d,
    is_active: true,
    reminder_7d_sent: true,
    reminder_1d_sent: true,
    reminder_due_sent: true,
    created_by: 'user-1',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 'dl-4',
    tenant_id: 't-1',
    conference_id: 'conf-1',
    title: 'Resolved Task',
    description: 'Already done',
    due_date: past1d,
    is_active: false,
    reminder_7d_sent: true,
    reminder_1d_sent: true,
    reminder_due_sent: true,
    created_by: 'user-1',
    created_at: '2026-01-04T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
  },
];

describe('DeadlinesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
  });

  it('shows empty state when no deadlines exist', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No deadlines yet')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Create your first deadline to track important dates.')
    ).toBeInTheDocument();
  });

  it('shows different empty message for non-admin', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<DeadlinesTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(
        screen.getByText('No deadlines have been set for this conference.')
      ).toBeInTheDocument();
    });
  });

  it('shows "New Deadline" button for admin', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('New Deadline')).toBeInTheDocument();
    });
  });

  it('hides "New Deadline" button for non-admin', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<DeadlinesTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No deadlines yet')).toBeInTheDocument();
    });
    expect(screen.queryByText('New Deadline')).not.toBeInTheDocument();
  });

  it('renders deadline titles', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleDeadlines, total: 4 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
    });
    expect(screen.getByText('Venue Booking')).toBeInTheDocument();
    expect(screen.getByText('Overdue Task')).toBeInTheDocument();
    expect(screen.getByText('Resolved Task')).toBeInTheDocument();
  });

  it('renders descriptions', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleDeadlines, total: 4 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sign sponsor agreement')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirm venue reservation')).toBeInTheDocument();
  });

  it('displays correct status badges', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleDeadlines, total: 4 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeInTheDocument();
    });
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('sorts deadlines: overdue first, then due-soon, active, resolved', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleDeadlines, total: 4 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Overdue Task')).toBeInTheDocument();
    });

    const titles = screen.getAllByRole('heading', { level: 4 }).map((el) => el.textContent);
    expect(titles[0]).toBe('Overdue Task');
    expect(titles[1]).toBe('Venue Booking');
    expect(titles[2]).toBe('Sponsor Contract');
    expect(titles[3]).toBe('Resolved Task');
  });

  it('opens create modal when clicking New Deadline', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('New Deadline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Deadline'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByText('New Deadline', { selector: 'span' })).toBeInTheDocument();
  });

  it('opens edit modal when clicking edit button', async () => {
    mockGet.mockResolvedValue({
      data: { items: [sampleDeadlines[0]], total: 1 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByText('Edit Deadline')).toBeInTheDocument();
  });

  it('closes modal when clicking CloseModal', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('New Deadline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Deadline'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('CloseModal'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('submits create form', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    mockPost.mockResolvedValue({ data: {} });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('New Deadline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Deadline'));

    const titleInput = screen.getByPlaceholderText('e.g., Sponsor contract deadline');
    const descInput = screen.getByPlaceholderText('Optional details about this deadline...');
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: 'My Deadline' } });
    fireEvent.change(descInput, { target: { value: 'Important task' } });
    fireEvent.change(dateInput, { target: { value: '2026-06-15T10:00' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/conferences/conf-1/deadlines', {
        title: 'My Deadline',
        description: 'Important task',
        due_date: expect.any(String),
      });
    });
  });

  it('shows delete confirm dialog and deletes on confirm', async () => {
    mockGet.mockResolvedValue({
      data: { items: [sampleDeadlines[0]], total: 1 },
    });
    mockDelete.mockResolvedValue({ data: {} });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Deadline')).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete "Sponsor Contract"/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('ConfirmDelete'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/conferences/conf-1/deadlines/dl-1');
    });
  });

  it('cancels delete dialog', async () => {
    mockGet.mockResolvedValue({
      data: { items: [sampleDeadlines[0]], total: 1 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('CancelDelete'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('calls toggle mutation when clicking resolve button', async () => {
    mockGet.mockResolvedValue({
      data: { items: [sampleDeadlines[0]], total: 1 },
    });
    mockPatch.mockResolvedValue({ data: {} });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Mark as resolved'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/conferences/conf-1/deadlines/dl-1/toggle');
    });
  });

  it('shows reactivate button for resolved deadlines', async () => {
    mockGet.mockResolvedValue({
      data: { items: [sampleDeadlines[3]], total: 1 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Resolved Task')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Reactivate')).toBeInTheDocument();
  });

  it('hides action buttons for non-admin', async () => {
    mockGet.mockResolvedValue({
      data: { items: [sampleDeadlines[0]], total: 1 },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mark as resolved')).not.toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows error banner on create failure', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    mockPost.mockRejectedValue({
      response: { data: { detail: 'Server error' } },
    });

    render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('New Deadline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Deadline'));

    const titleInput = screen.getByPlaceholderText('e.g., Sponsor contract deadline');
    fireEvent.change(titleInput, { target: { value: 'Fail Test' } });

    // Need to also set due_date for submit to work
    const dateInputs = screen.getAllByDisplayValue('');
    const dateInput = dateInputs.find((el) => el.getAttribute('type') === 'datetime-local');
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: '2026-06-15T10:00' } });
    }

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('form field CSS consistency (QA 1.5.1)', () => {
    it('all three modal inputs use the shared component class signature (shadow-sm + rounded-md)', async () => {
      mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
      render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(screen.getByText('New Deadline')).toBeInTheDocument());
      fireEvent.click(screen.getByText('New Deadline'));

      const titleInput = screen.getByPlaceholderText('e.g., Sponsor contract deadline');
      const descInput = screen.getByPlaceholderText('Optional details about this deadline...');
      const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLElement;

      for (const el of [titleInput, descInput, dateInput]) {
        expect(el.className).toContain('shadow-sm');
        expect(el.className).toContain('rounded-md');
      }
    });
  });

  describe('toast feedback', () => {
    it('shows success toast after creating a deadline', async () => {
      mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
      mockPost.mockResolvedValue({ data: {} });

      render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('New Deadline')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('New Deadline'));

      const titleInput = screen.getByPlaceholderText('e.g., Sponsor contract deadline');
      fireEvent.change(titleInput, { target: { value: 'My Deadline' } });

      const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: '2026-06-15T10:00' } });

      fireEvent.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Deadline created', 'success');
      });
    });

    it('shows success toast after updating a deadline', async () => {
      mockGet.mockResolvedValue({ data: { items: [sampleDeadlines[0]], total: 1 } });
      mockPut.mockResolvedValue({ data: {} });

      render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Edit'));

      const titleInput = screen.getByDisplayValue('Sponsor Contract');
      fireEvent.change(titleInput, { target: { value: 'Sponsor Contract Updated' } });

      fireEvent.click(screen.getByText('Update'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Deadline updated', 'success');
      });
    });

    it('shows success toast after deleting a deadline', async () => {
      mockGet.mockResolvedValue({ data: { items: [sampleDeadlines[0]], total: 1 } });
      mockDelete.mockResolvedValue({ data: {} });

      render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Sponsor Contract')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete'));
      fireEvent.click(screen.getByText('ConfirmDelete'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Deadline deleted', 'success');
      });
    });

    it('shows error toast when create fails', async () => {
      mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
      mockPost.mockRejectedValue({ response: { data: { detail: 'Server error' } } });

      render(<DeadlinesTab conference={mockConference} isAdmin={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('New Deadline')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('New Deadline'));

      const titleInput = screen.getByPlaceholderText('e.g., Sponsor contract deadline');
      fireEvent.change(titleInput, { target: { value: 'Fail Test' } });

      const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: '2026-06-15T10:00' } });

      fireEvent.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Server error'),
          'error'
        );
      });
    });
  });
});

describe('DeadlinesTab — status badge tooltips (QA 1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('each status badge has a title attribute matching its status label', async () => {
    mockGet.mockResolvedValue({ data: { items: sampleDeadlines, total: sampleDeadlines.length } });
    render(<DeadlinesTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('Sponsor Contract')).toBeInTheDocument());

    expect(screen.getByText('Active')).toHaveAttribute('title', 'Active');
    expect(screen.getByText('Due soon')).toHaveAttribute('title', 'Due soon');
    expect(screen.getByText('Overdue')).toHaveAttribute('title', 'Overdue');
    expect(screen.getByText('Resolved')).toHaveAttribute('title', 'Resolved');
  });
});
