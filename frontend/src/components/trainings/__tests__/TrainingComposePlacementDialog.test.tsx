import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrainingComposePlacementDialog from '../TrainingComposePlacementDialog';
import { ToastProvider } from '../../Toast';

vi.mock('../../../config/api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

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

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TrainingComposePlacementDialog open onClose={onClose} />
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
}

const REGS_RESPONSE = {
  items: [
    {
      id: 'reg-1',
      placement_id: 'pl-1',
      training_name: 'ITIL Foundation',
      training_date: '2026-11-10',
      attendee_count: 4,
    },
    {
      id: 'reg-2',
      placement_id: 'pl-1', // same placement, different registration
      training_name: 'ITIL Foundation',
      training_date: '2026-11-10',
      attendee_count: 1,
    },
    {
      id: 'reg-3',
      placement_id: 'pl-2',
      training_name: 'PSM I',
      training_date: '2026-12-01',
      attendee_count: 2,
    },
  ],
  total: 3,
  page: 1,
  per_page: 200,
};

describe('TrainingComposePlacementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get = vi.fn().mockImplementation((url: string) => {
      if (url === '/trainings/registrations') {
        return Promise.resolve({ data: REGS_RESPONSE });
      }
      if (url === '/trainings/messaging/templates') {
        return Promise.resolve({ data: { items: [], total: 0 } });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  });

  it('groups registrations by placement and shows attendee counts', async () => {
    renderDialog();
    // Wait for the placement dropdown to populate.
    const itil = await screen.findByRole('option', {
      name: /ITIL Foundation.*2026-11-10.*5 attendees/,
    });
    expect(itil).toBeInTheDocument();
    const psm = screen.getByRole('option', { name: /PSM I.*2026-12-01.*2 attendees/ });
    expect(psm).toBeInTheDocument();
  });

  it('disables Send until placement, subject, and body are all populated', async () => {
    const user = userEvent.setup();
    renderDialog();

    const sendBtn = await screen.findByRole('button', { name: /Send/ });
    expect(sendBtn).toBeDisabled();

    await screen.findByRole('option', { name: /ITIL Foundation/ });
    await user.selectOptions(screen.getByLabelText(/Training session/i), 'pl-1');
    expect(sendBtn).toBeDisabled();

    await user.click(screen.getByLabelText(/Subject/i));
    await user.paste('Reminder');
    expect(sendBtn).toBeDisabled();

    await user.click(screen.getByTestId('body-editor'));
    await user.paste('<p>Hi</p>');
    expect(sendBtn).toBeEnabled();
  });

  it('posts to the placement-broadcast endpoint with the picked placement', async () => {
    mockApi.post = vi.fn().mockResolvedValue({
      data: {
        bulk_id: 'bulk-1',
        placement_id: 'pl-1',
        sent_count: 5,
        skipped_count: 0,
        recipients: [],
      },
    });

    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await screen.findByRole('option', { name: /ITIL Foundation/ });
    await user.selectOptions(screen.getByLabelText(/Training session/i), 'pl-1');
    await user.click(screen.getByLabelText(/Subject/i));
    await user.paste('Reminder for [Training Name]');
    await user.click(screen.getByTestId('body-editor'));
    await user.paste('<p>Hi [First Name]</p>');

    await user.click(screen.getByRole('button', { name: /Send to 5/ }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/trainings/placements/pl-1/messages/broadcast', {
        subject: 'Reminder for [Training Name]',
        body_html: '<p>Hi [First Name]</p>',
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
