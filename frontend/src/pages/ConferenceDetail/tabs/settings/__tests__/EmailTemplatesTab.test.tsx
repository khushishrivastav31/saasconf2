import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmailTemplatesTab from '../EmailTemplatesTab';
import type { Conference } from '../../../../../types';

const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../../components/common/RichTextEditor', () => ({
  default: ({ onChange }: { onChange: (val: string) => void }) => (
    <div
      data-testid="rich-text-editor"
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange((e.target as HTMLElement).textContent || '')}
    />
  ),
}));

vi.mock('../../../../../components/Modal', () => ({
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

vi.mock('../../../../../components/OverlaySelector', () => ({
  default: () => <div data-testid="overlay-selector" />,
}));

vi.mock('../../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../../components/common/ModalFooter', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../../components/common/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('../../../../../utils/richText', () => ({
  sanitizeHtml: (html: string) => html,
}));

const mockConference = {
  id: 'conf-1',
  name: 'TestConf 2026',
} as unknown as Conference;

const sampleTemplate = {
  id: 'tpl-1',
  conference_id: 'conf-1',
  template_type: 'applicant_verification',
  subject: 'Verify your email',
  body_html: '<p>Hello {{First Name}}</p>',
  body_text: 'Hello',
  is_active: true,
  is_customized: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('EmailTemplatesTab — editor wrapper padding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { items: [sampleTemplate], total: 1 } });
  });

  it('email editor wrapper has px-4 padding class', async () => {
    render(<EmailTemplatesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Verify your email')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    const editorWrapper = screen.getByTestId('email-editor-wrapper');
    expect(editorWrapper.className).toContain('px-4');
  });
});

describe('EmailTemplatesTab — sticky actions layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { items: [sampleTemplate], total: 1 } });
  });

  it('wraps the table in an overflow-x-auto container', async () => {
    render(<EmailTemplatesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Verify your email'));

    const table = screen.getByRole('table');
    const tableContainer = table.parentElement!;
    expect(tableContainer.className).toMatch(/overflow-x-auto/);
  });

  it('applies sticky right-0 to the Actions <th>', async () => {
    render(<EmailTemplatesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Verify your email'));

    const actionsTh = screen.getByRole('columnheader', { name: /actions/i });
    expect(actionsTh.className).toMatch(/sticky/);
    expect(actionsTh.className).toMatch(/right-0/);
    expect(actionsTh.className).toMatch(/z-\[1\]/);
  });

  it('applies sticky right-0 to every Actions <td>', async () => {
    render(<EmailTemplatesTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByText('Verify your email'));

    const editBtn = screen.getByRole('button', { name: /edit/i });
    const actionsTd = editBtn.closest('td')!;
    expect(actionsTd.className).toMatch(/sticky/);
    expect(actionsTd.className).toMatch(/right-0/);
    expect(actionsTd.className).toMatch(/z-\[1\]/);
  });
});
