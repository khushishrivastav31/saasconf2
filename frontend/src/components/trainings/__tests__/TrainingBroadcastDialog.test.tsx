import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrainingBroadcastDialog, { TRAINING_TEMPLATE_VARIABLES } from '../TrainingBroadcastDialog';
import { ToastProvider } from '../../Toast';

vi.mock('../../../config/api', () => ({
  default: { post: vi.fn() },
}));

// Stub the rich-text editor with a simple textarea so userEvent.type works.
// We're testing the dialog wiring (subject/body collection, send action,
// recipient gating), not the editor itself.
vi.mock('../../common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | undefined;
    onChange: (html: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="body-editor"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import api from '../../../config/api';
const mockApi = vi.mocked(api);

const ATTENDEES = [
  { id: 'a1', first_name: 'Alice', last_name: 'L', email: 'alice@example.com' },
  { id: 'a2', first_name: 'Bob', last_name: 'B', email: 'bob@example.com' },
  { id: 'a3', first_name: 'Empty', last_name: 'Mail', email: '' },
];

function renderDialog(props?: Partial<React.ComponentProps<typeof TrainingBroadcastDialog>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TrainingBroadcastDialog
            open
            onClose={onClose}
            registrationId="reg-1"
            trainingName="ITIL Foundation"
            attendees={ATTENDEES}
            {...props}
          />
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
}

describe('TrainingBroadcastDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the recipient count, excluding attendees with empty email', () => {
    renderDialog();
    expect(screen.getByText(/Sending to 2 attendees/i)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped — no email/i)).toBeInTheDocument();
  });

  it('disables Send until subject and body are populated', async () => {
    const user = userEvent.setup();
    renderDialog();

    const sendBtn = screen.getByRole('button', { name: /Send to 2/ });
    expect(sendBtn).toBeDisabled();

    await user.click(screen.getByLabelText(/Subject/i));
    await user.paste('Reminder');
    expect(sendBtn).toBeDisabled();

    await user.click(screen.getByTestId('body-editor'));
    await user.paste('<p>Hi</p>');
    expect(sendBtn).toBeEnabled();
  });

  it('posts to the broadcast endpoint with the typed subject + body', async () => {
    mockApi.post = vi.fn().mockResolvedValue({
      data: {
        bulk_id: 'bulk-1',
        registration_id: 'reg-1',
        sent_count: 2,
        skipped_count: 1,
        recipients: [
          { thread_id: 't1', email: 'alice@example.com' },
          { thread_id: 't2', email: 'bob@example.com' },
        ],
      },
    });

    const user = userEvent.setup();
    const { onClose } = renderDialog();

    // Use ``user.click`` + ``user.paste`` instead of ``user.type`` because
    // userEvent parses ``[...]`` as keyboard-key descriptors, which collides
    // with the ``[Training Name]`` template tokens this dialog is built for.
    await user.click(screen.getByLabelText(/Subject/i));
    await user.paste('Reminder for [Training Name]');
    await user.click(screen.getByTestId('body-editor'));
    await user.paste('<p>Hi [First Name]</p>');
    await user.click(screen.getByRole('button', { name: /Send to 2/ }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(
        '/trainings/registrations/reg-1/messages/broadcast',
        {
          subject: 'Reminder for [Training Name]',
          body_html: '<p>Hi [First Name]</p>',
        }
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('disables Send when there are no eligible recipients', () => {
    renderDialog({ attendees: [{ id: 'x', first_name: 'No', last_name: 'Email', email: '' }] });
    expect(screen.getByText(/Sending to 0 attendees/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to 0/ })).toBeDisabled();
  });

  it('exposes the same template variables the backend service knows', () => {
    // Contract test: if someone renames the backend placeholders without
    // updating this list, the user gets a button that produces a literal
    // string the server won't substitute. Pin it.
    expect(TRAINING_TEMPLATE_VARIABLES.map((v) => v.token)).toEqual([
      '[First Name]',
      '[Last Name]',
      '[Email]',
      '[Training Name]',
      '[Placement Date]',
      '[Company Name]',
    ]);
  });
});
