import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SystemEmailTemplates from '../SystemEmailTemplates';

vi.mock('../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../components/Modal', () => ({
  default: ({
    open,
    children,
    title,
    onClose,
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

vi.mock('../../components/common/RichTextEditor', () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));

vi.mock('../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../components/common/ModalFooter', () => ({
  default: ({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) => (
    <div>
      <button onClick={onCancel}>Cancel</button>
      <button type="submit">{submitLabel}</button>
    </div>
  ),
}));

vi.mock('../../components/common/StatusBadge', () => ({
  default: ({ isActive }: { isActive: boolean }) => <span>{isActive ? 'Active' : 'Inactive'}</span>,
}));

vi.mock('../../utils/richText', () => ({
  sanitizeHtml: (html: string) => html,
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

const sampleTemplate = {
  id: 'tpl-1',
  template_type: 'tenant_user_welcome',
  display_name: 'User Invitation',
  subject: 'Welcome to the platform',
  body_html: '<p>Welcome!</p>',
  body_text: 'Welcome!',
  is_active: true,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SystemEmailTemplates — editor wrapper padding (QA 1.4.4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: [sampleTemplate] });
  });

  it('renders the template list', async () => {
    renderWithProviders(<SystemEmailTemplates />);
    await waitFor(() => {
      expect(screen.getByText('User Invitation')).toBeInTheDocument();
    });
  });

  it('form body has px-6 padding so all fields are consistently inset from the modal edge (QA 1.4.4.2)', async () => {
    renderWithProviders(<SystemEmailTemplates />);

    await waitFor(() => {
      expect(screen.getByText('User Invitation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit template'));

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    const formBody = screen.getByTestId('email-form-body');
    expect(formBody.className).toContain('px-6');
  });
});
