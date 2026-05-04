import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkCancelDialog from '../BulkCancelDialog';

vi.mock('../../../config/api', () => {
  return {
    default: {
      post: vi.fn(),
    },
  };
});

import api from '../../../config/api';

const mockedPost = vi.mocked(api.post);

const samplePreview = {
  total: 3,
  truncated: false,
  total_credit_note_value: '357.00',
  by_originating_ip: [{ key: '10.0.0.1', count: 3 }],
  by_billing_email: [{ key: 'bot@spam.com', count: 3 }],
  items: [
    {
      registration_id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-05-04T08:00:00Z',
      billing_email: 'bot1@spam.com',
      originating_ip: '10.0.0.1',
      invoice_total: '119.00',
      invoice_status: 'sent',
      label: 'Test Training',
    },
    {
      registration_id: '00000000-0000-0000-0000-000000000002',
      created_at: '2026-05-04T08:01:00Z',
      billing_email: 'bot2@spam.com',
      originating_ip: '10.0.0.1',
      invoice_total: '119.00',
      invoice_status: 'sent',
      label: 'Test Training',
    },
    {
      registration_id: '00000000-0000-0000-0000-000000000003',
      created_at: '2026-05-04T08:02:00Z',
      billing_email: 'bot3@spam.com',
      originating_ip: '10.0.0.1',
      invoice_total: '119.00',
      invoice_status: 'sent',
      label: 'Test Training',
    },
  ],
};

describe('BulkCancelDialog', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<BulkCancelDialog open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('blocks "Show matches" until reason is at least 10 characters', async () => {
    const user = userEvent.setup();
    render(<BulkCancelDialog open onClose={vi.fn()} />);

    const showButton = screen.getByRole('button', { name: /show matches/i });
    expect(showButton).toBeDisabled();

    const reasonField = screen.getByPlaceholderText(/bot burst/i);
    await user.type(reasonField, 'short');
    expect(showButton).toBeDisabled();

    await user.type(reasonField, ' bot 2026-05-04');
    expect(showButton).toBeEnabled();
  });

  it('walks through preview → confirm → done with the typed-count guard', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    mockedPost.mockResolvedValueOnce({ data: samplePreview }); // preview
    mockedPost.mockResolvedValueOnce({
      data: {
        cancelled: 3,
        credit_notes_created: 3,
        emails_sent: 3,
        refunds_initiated: 0,
        errors: [],
      },
    }); // confirm

    render(<BulkCancelDialog open onClose={onClose} onCompleted={onCompleted} />);

    await user.type(
      screen.getByPlaceholderText(/bot burst/i),
      'bot burst from 10.0.0.1 on 2026-05-04'
    );
    await user.click(screen.getByRole('button', { name: /show matches/i }));

    await waitFor(() => screen.getByRole('button', { name: /proceed to confirm/i }));

    // Default — all 3 rows ticked. Untick one to spare it.
    const rowCheckboxes = screen.getAllByRole('checkbox', {
      name: /Cancel registration/i,
    });
    expect(rowCheckboxes).toHaveLength(3);
    expect(rowCheckboxes.every((cb) => (cb as HTMLInputElement).checked)).toBe(true);
    await user.click(rowCheckboxes[2]); // spare the third row

    // The confirm button now reflects the smaller count.
    expect(screen.getByRole('button', { name: /proceed to confirm \(2\)/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /proceed to confirm \(2\)/i }));

    // Confirm step — typed-count guard targets the smaller count.
    const confirmInput = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /cancel 2 registrations/i });
    expect(submitButton).toBeDisabled();

    await user.type(confirmInput, '3'); // wrong (was the original total)
    expect(submitButton).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, '2'); // matches the deselected count
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    // Confirm payload included only the two ticked IDs (the third was spared).
    const confirmCall = mockedPost.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/confirm')
    );
    expect(confirmCall).toBeDefined();
    const confirmBody = confirmCall![1] as { registration_ids?: string[] };
    expect(confirmBody.registration_ids).toEqual([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ]);

    await waitFor(() => screen.getByText(/3 credit notes created/i));
    expect(onCompleted).toHaveBeenCalledOnce();
  });
});
