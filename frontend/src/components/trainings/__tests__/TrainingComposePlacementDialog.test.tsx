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

function renderDialog(extra?: { initialPlacementId?: string; initialAttendeeIds?: string[] }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TrainingComposePlacementDialog open onClose={onClose} {...extra} />
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
}

function fakeAttendees(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-att-${i}`,
    first_name: `First${i}`,
    last_name: `Last${i}`,
    email: `${prefix}-${i}@example.com`,
  }));
}

const REGS_RESPONSE = {
  items: [
    {
      id: 'reg-1',
      placement_id: 'pl-1',
      training_name: 'ITIL Foundation',
      training_date: '2026-11-10',
      attendee_count: 4,
      attendees: fakeAttendees('reg1', 4),
    },
    {
      id: 'reg-2',
      placement_id: 'pl-1', // same placement, different registration
      training_name: 'ITIL Foundation',
      training_date: '2026-11-10',
      attendee_count: 1,
      attendees: fakeAttendees('reg2', 1),
    },
    {
      id: 'reg-3',
      placement_id: 'pl-2',
      training_name: 'PSM I',
      training_date: '2026-12-01',
      attendee_count: 2,
      attendees: fakeAttendees('reg3', 2),
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
      if (url === '/trainings/messaging/attendees') {
        // Default: empty result. Individual tests override below.
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

  it('switches to specific recipients and posts only the checked attendee_ids', async () => {
    mockApi.post = vi.fn().mockResolvedValue({
      data: {
        bulk_id: 'bulk-1',
        placement_id: 'pl-1',
        sent_count: 2,
        skipped_count: 0,
        recipients: [],
      },
    });

    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole('option', { name: /ITIL Foundation/ });
    await user.selectOptions(screen.getByLabelText(/Training session/i), 'pl-1');

    // Pick the "Specific attendees" radio.
    await user.click(screen.getByLabelText(/Specific attendees/i));

    // Pre-pl-1 has 5 attendees (reg1*4 + reg2*1). Pick 2 of them.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(5);
    await user.click(checkboxes[0]);
    await user.click(checkboxes[3]);

    await user.click(screen.getByLabelText(/Subject/i));
    await user.paste('Hi');
    await user.click(screen.getByTestId('body-editor'));
    await user.paste('<p>Hi</p>');

    await user.click(screen.getByRole('button', { name: /Send to 2/ }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(
        '/trainings/placements/pl-1/messages/broadcast',
        expect.objectContaining({
          subject: 'Hi',
          body_html: '<p>Hi</p>',
          attendee_ids: expect.arrayContaining(['reg1-att-0', 'reg1-att-3']),
        })
      )
    );
    // attendee_ids has exactly two entries.
    const callBody = mockApi.post.mock.calls[0][1] as { attendee_ids?: string[] };
    expect(callBody.attendee_ids).toHaveLength(2);
  });

  it('switching to search mode posts to /messaging/broadcasts/by-attendees with picked ids', async () => {
    // Override the search endpoint to return a couple of hits.
    const searchHits = [
      {
        attendee_id: 'a-100',
        first_name: 'Alex',
        last_name: 'Smith',
        email: 'alex@example.com',
        registration_id: 'reg-x',
        placement_id: 'pl-x',
        training_name: 'PSM I',
        training_date: '2026-12-01',
      },
      {
        attendee_id: 'a-101',
        first_name: 'Alexandra',
        last_name: 'Jones',
        email: 'alex.j@example.com',
        registration_id: 'reg-y',
        placement_id: 'pl-y',
        training_name: 'ITIL Foundation',
        training_date: '2026-11-10',
      },
    ];
    mockApi.get = vi.fn().mockImplementation((url: string) => {
      if (url === '/trainings/registrations') return Promise.resolve({ data: REGS_RESPONSE });
      if (url === '/trainings/messaging/templates')
        return Promise.resolve({ data: { items: [], total: 0 } });
      if (url === '/trainings/messaging/attendees')
        return Promise.resolve({ data: { items: searchHits, total: 2 } });
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    mockApi.post = vi.fn().mockResolvedValue({
      data: { bulk_id: 'bulk-x', sent_count: 2, skipped_count: 0, recipients: [] },
    });

    const user = userEvent.setup();
    renderDialog();

    // Switch to search mode.
    await user.click(screen.getByRole('button', { name: 'Search by name / email' }));

    // Pick both hits from the results list.
    const alex = await screen.findByRole('button', { name: /Alex Smith/i });
    await user.click(alex);
    const alexandra = await screen.findByRole('button', { name: /Alexandra Jones/i });
    await user.click(alexandra);

    await user.click(screen.getByLabelText(/Subject/i));
    await user.paste('Hi');
    await user.click(screen.getByTestId('body-editor'));
    await user.paste('<p>Hi</p>');

    await user.click(screen.getByRole('button', { name: /Send to 2/ }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(
        '/trainings/messaging/broadcasts/by-attendees',
        expect.objectContaining({
          subject: 'Hi',
          body_html: '<p>Hi</p>',
          attendee_ids: ['a-100', 'a-101'],
        })
      )
    );
  });

  it('opens with initialPlacementId + initialAttendeeIds pre-applied', async () => {
    renderDialog({ initialPlacementId: 'pl-2', initialAttendeeIds: ['reg3-att-1'] });

    // Wait for the placement options to populate (API fetch resolves into
    // the useQuery, the useMemo runs, the recipients picker renders).
    await screen.findByLabelText(/Specific attendees/i);
    expect((screen.getByLabelText(/Specific attendees/i) as HTMLInputElement).checked).toBe(true);
    // The pre-selected attendee's checkbox is checked. The Specific scope's
    // checkbox list renders the row labelled with first/last + email; we
    // pull it by email substring since that's stable.
    const checkbox = screen.getByRole('checkbox', { name: /reg3-1@example.com/i });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
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
        attachment_ids: [],
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
