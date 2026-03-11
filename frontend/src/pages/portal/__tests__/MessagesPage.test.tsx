import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessagesPage from '../MessagesPage';
import type { PortalThreadListResponse, PortalThreadDetailResponse } from '../../../types/portal';
import {
  mockApplicant,
  makeApplicantAuthContext,
  renderWithPortalProviders,
} from '../../../test-utils';

// jsdom does not implement scrollIntoView — mock it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock portalApi
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

// Mock heavy editor / display components
vi.mock('../../../components/common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('../../../components/common/RichTextDisplay', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="rich-text-display">{content}</div>
  ),
}));

vi.mock('../../../components/MessageFileAttach', () => ({
  default: () => <div data-testid="message-file-attach" />,
}));

function renderWithProviders(
  ui: React.ReactElement,
  { initialPath = '/acme/portal/messages' }: { initialPath?: string } = {}
) {
  return renderWithPortalProviders(ui, {
    authContext: makeApplicantAuthContext(),
    route: initialPath,
  });
}

// --- Fixtures ---

function makeThread(
  id: string,
  subject: string,
  unread = false,
  archivedAt: string | null = null
): PortalThreadListResponse['items'][0] {
  return {
    id,
    subject,
    last_message_at: '2025-03-10T10:00:00Z',
    last_message_preview: `Preview of ${subject}`,
    last_message_sender: {
      id: 'user-1',
      type: 'user',
      first_name: 'Organizer',
      last_name: 'Team',
      email: 'organizers@conf.io',
    },
    other_participants: [],
    unread,
    message_count: 1,
    created_at: '2025-03-01T00:00:00Z',
    archived_at: archivedAt,
  };
}

function makeThreadListResponse(
  items: PortalThreadListResponse['items']
): PortalThreadListResponse {
  return { items, total: items.length, page: 1, page_size: 20 };
}

function makeThreadDetail(
  id: string,
  subject: string,
  messages: PortalThreadDetailResponse['messages'] = []
): PortalThreadDetailResponse {
  return {
    id,
    subject,
    archived_at: null,
    participants: [
      {
        id: mockApplicant.id,
        type: 'applicant',
        first_name: mockApplicant.first_name,
        last_name: mockApplicant.last_name,
        email: mockApplicant.email,
        last_read_at: null,
      },
    ],
    messages,
    created_at: '2025-03-01T00:00:00Z',
    updated_at: '2025-03-10T10:00:00Z',
  };
}

function makeMessage(
  id: string,
  bodyHtml: string,
  senderType: 'applicant' | 'user' = 'user',
  senderId = 'user-1'
): PortalThreadDetailResponse['messages'][0] {
  return {
    id,
    thread_id: 'thread-1',
    sender: {
      id: senderId,
      type: senderType,
      first_name: senderType === 'applicant' ? mockApplicant.first_name : 'Organizer',
      last_name: senderType === 'applicant' ? mockApplicant.last_name : 'Team',
      email: senderType === 'applicant' ? mockApplicant.email : 'organizers@conf.io',
    },
    body_html: bodyHtml,
    attachments: [],
    created_at: '2025-03-10T10:00:00Z',
  };
}

describe('MessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a loading indicator while thread list is fetching', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {})); // never resolves

      const { container } = renderWithProviders(<MessagesPage />);

      // The page shows a "Loading..." text node while isLoading is true
      expect(container.textContent).toContain('Loading...');
    });

    it('renders the Messages heading regardless of load state', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<MessagesPage />);

      expect(screen.getByRole('heading', { name: /messages/i })).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when there are no threads', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse([]) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
      });
    });

    it('shows the New Message button even in empty state', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse([]) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new message/i })).toBeInTheDocument();
      });
    });
  });

  describe('thread list rendering', () => {
    it('renders thread subjects', async () => {
      const threads = [
        makeThread('t1', 'Travel Reimbursement'),
        makeThread('t2', 'AV Setup Question'),
      ];
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse(threads) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Travel Reimbursement')).toBeInTheDocument();
      });
      expect(screen.getByText('AV Setup Question')).toBeInTheDocument();
    });

    it('renders a preview snippet beneath each thread subject', async () => {
      const threads = [makeThread('t1', 'Thread One')];
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse(threads) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Preview of Thread One')).toBeInTheDocument();
      });
    });

    it('shows an unread indicator dot for unread threads', async () => {
      const threads = [makeThread('t1', 'Unread Thread', true)];
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse(threads) });

      const { container } = renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Unread Thread')).toBeInTheDocument();
      });

      // The unread dot is a <span> with rounded-full bg-blue-600
      const dot = container.querySelector('.rounded-full.bg-blue-600');
      expect(dot).toBeTruthy();
    });

    it('does not show the unread dot for read threads', async () => {
      const threads = [makeThread('t1', 'Read Thread', false)];
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse(threads) });

      const { container } = renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Read Thread')).toBeInTheDocument();
      });

      expect(container.querySelector('.rounded-full.bg-blue-600')).toBeNull();
    });

    it('renders the Archived toggle button', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse([]) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /archived/i })).toBeInTheDocument();
      });
    });
  });

  describe('selecting a thread', () => {
    it('calls the read endpoint when a thread is selected', async () => {
      const user = userEvent.setup();
      const threads = [makeThread('t1', 'My Thread')];

      // First call: thread list; second call: thread detail; third call: mark-read POST
      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse(threads) })
        .mockResolvedValueOnce({ data: makeThreadDetail('t1', 'My Thread') });
      mockPortalApi.post.mockResolvedValue({});

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText('My Thread')).toBeInTheDocument();
      });

      await user.click(screen.getByText('My Thread'));

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith('/portal/messages/t1/read');
      });
    });

    it('shows the thread detail pane with the subject header after selecting', async () => {
      const user = userEvent.setup();
      const threads = [makeThread('t1', 'Conference Schedule')];
      const detail = makeThreadDetail('t1', 'Conference Schedule', [
        makeMessage('m1', '<p>Hello!</p>'),
      ]);

      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse(threads) })
        .mockResolvedValueOnce({ data: detail });
      mockPortalApi.post.mockResolvedValue({});

      renderWithProviders(<MessagesPage />);

      await waitFor(() => screen.getByText('Conference Schedule'));
      await user.click(screen.getByText('Conference Schedule'));

      // Detail header uses an h3
      await waitFor(() => {
        const heading = screen.getByRole('heading', { level: 3 });
        expect(heading.textContent).toContain('Conference Schedule');
      });
    });

    it('renders the reply form when a thread is open', async () => {
      const user = userEvent.setup();
      const threads = [makeThread('t1', 'Open Thread')];
      const detail = makeThreadDetail('t1', 'Open Thread', [makeMessage('m1', '<p>Hey</p>')]);

      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse(threads) })
        .mockResolvedValueOnce({ data: detail });
      mockPortalApi.post.mockResolvedValue({});

      renderWithProviders(<MessagesPage />);

      await waitFor(() => screen.getByText('Open Thread'));
      await user.click(screen.getByText('Open Thread'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reply/i })).toBeInTheDocument();
      });
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    });

    it('renders message bubbles for each message in the thread', async () => {
      const user = userEvent.setup();
      const threads = [makeThread('t1', 'Multi-message')];
      const detail = makeThreadDetail('t1', 'Multi-message', [
        makeMessage('m1', '<p>First message</p>', 'user'),
        makeMessage('m2', '<p>Second message</p>', 'applicant', mockApplicant.id),
      ]);

      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse(threads) })
        .mockResolvedValueOnce({ data: detail });
      mockPortalApi.post.mockResolvedValue({});

      renderWithProviders(<MessagesPage />);

      await waitFor(() => screen.getByText('Multi-message'));
      await user.click(screen.getByText('Multi-message'));

      await waitFor(() => {
        const displays = screen.getAllByTestId('rich-text-display');
        expect(displays).toHaveLength(2);
      });
    });
  });

  describe('reply submission', () => {
    it('calls the reply API when the reply button is clicked', async () => {
      const user = userEvent.setup();
      const threads = [makeThread('t1', 'Replying Thread')];
      const detail = makeThreadDetail('t1', 'Replying Thread', [
        makeMessage('m1', '<p>Admin says hi</p>'),
      ]);

      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse(threads) })
        .mockResolvedValueOnce({ data: detail })
        // invalidation refetch
        .mockResolvedValue({ data: makeThreadDetail('t1', 'Replying Thread', []) });
      mockPortalApi.post.mockResolvedValue({});

      renderWithProviders(<MessagesPage />);

      await waitFor(() => screen.getByText('Replying Thread'));
      await user.click(screen.getByText('Replying Thread'));

      await waitFor(() => {
        expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
      });

      // Type a reply
      const editor = screen.getByTestId('rich-text-editor');
      await user.type(editor, 'Thanks for the update!');

      await user.click(screen.getByRole('button', { name: /^reply$/i }));

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith(
          '/portal/messages/t1/reply',
          expect.objectContaining({
            body_html: 'Thanks for the update!',
            attachment_ids: [],
          })
        );
      });
    });

    it('disables the Reply button while the reply is empty', async () => {
      const user = userEvent.setup();
      const threads = [makeThread('t1', 'Empty Reply Test')];
      const detail = makeThreadDetail('t1', 'Empty Reply Test', [
        makeMessage('m1', '<p>Hello</p>'),
      ]);

      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse(threads) })
        .mockResolvedValueOnce({ data: detail });
      mockPortalApi.post.mockResolvedValue({});

      renderWithProviders(<MessagesPage />);

      await waitFor(() => screen.getByText('Empty Reply Test'));
      await user.click(screen.getByText('Empty Reply Test'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^reply$/i })).toBeDisabled();
      });
    });
  });

  describe('archive toggle', () => {
    it('switches to archived view when the Archived button is clicked', async () => {
      const user = userEvent.setup();

      // First call: active threads; second call: archived threads (after toggle)
      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse([]) })
        .mockResolvedValueOnce({
          data: makeThreadListResponse([]),
        });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^archived$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^archived$/i }));

      await waitFor(() => {
        // Button label toggles to "Showing Archived"
        expect(screen.getByRole('button', { name: /showing archived/i })).toBeInTheDocument();
      });
    });

    it('shows archived empty state when viewing archived threads', async () => {
      const user = userEvent.setup();

      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse([]) })
        .mockResolvedValueOnce({ data: makeThreadListResponse([]) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^archived$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^archived$/i }));

      await waitFor(() => {
        expect(screen.getByText(/no archived messages/i)).toBeInTheDocument();
      });
    });
  });

  describe('compose modal', () => {
    it('opens the compose modal when New Message is clicked', async () => {
      const user = userEvent.setup();
      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse([]) })
        // Conferences fetch inside the modal
        .mockResolvedValueOnce({ data: [] });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new message/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new message/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /new message/i })).toBeInTheDocument();
      });
    });

    it('closes the compose modal when Cancel is clicked', async () => {
      const user = userEvent.setup();
      mockPortalApi.get
        .mockResolvedValueOnce({ data: makeThreadListResponse([]) })
        .mockResolvedValueOnce({ data: [] });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => screen.getByRole('button', { name: /new message/i }));
      await user.click(screen.getByRole('button', { name: /new message/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /new message/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('no thread selected placeholder', () => {
    it('shows the select-a-conversation placeholder on desktop', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: makeThreadListResponse([]) });

      renderWithProviders(<MessagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/select a conversation or start a new one/i)).toBeInTheDocument();
      });
    });
  });
});
