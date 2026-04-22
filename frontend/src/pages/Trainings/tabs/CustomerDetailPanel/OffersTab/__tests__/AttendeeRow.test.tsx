import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AttendeeRow from '../AttendeeRow';
import api from '../../../../../../config/api';

vi.mock('../../../../../../config/api');
vi.mock('../../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const baseAttendee = {
  id: 'att-1',
  offer_id: 'offer-1',
  placement_id: 'place-1',
  first_name: 'Alice',
  last_name: 'Adams',
  email: 'alice@example.com',
  certification: false,
  exam_mode: null,
  extra_time: false,
  exam_language: null,
  comments: null,
  created_at: '2026-04-22T09:00:00Z',
  updated_at: '2026-04-22T09:00:00Z',
};

function renderRow(props: Partial<Parameters<typeof AttendeeRow>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const merged = {
    attendee: baseAttendee,
    offerId: 'offer-1',
    offerStatus: 'draft',
    placementId: 'place-1',
    languages: [],
    ...props,
  } as Parameters<typeof AttendeeRow>[0];
  return render(
    <QueryClientProvider client={queryClient}>
      <table>
        <tbody>
          <AttendeeRow {...merged} />
        </tbody>
      </table>
    </QueryClientProvider>
  );
}

describe('AttendeeRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.delete).mockResolvedValue({ data: {} } as never);
    vi.mocked(api.put).mockResolvedValue({ data: {} } as never);
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
  });

  describe('Delete flow', () => {
    it('opens the ConfirmDialog when the trash button is clicked and does not call api.delete until confirmed', async () => {
      renderRow();
      const user = userEvent.setup();

      const deleteBtn = screen.getByTitle('Delete attendee');
      await user.click(deleteBtn);

      expect(await screen.findByRole('heading', { name: /remove attendee/i })).toBeInTheDocument();
      expect(api.delete).not.toHaveBeenCalled();

      const confirmBtn = screen.getByRole('button', { name: 'Remove' });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/trainings/offers/offer-1/attendees/att-1');
      });
    });

    it('shows the portal-access warning text when the offer is accepted', async () => {
      renderRow({ offerStatus: 'accepted' });
      const user = userEvent.setup();

      await user.click(screen.getByTitle('Delete attendee'));
      expect(
        await screen.findByText(/will lose access to this training's materials/i)
      ).toBeInTheDocument();
    });

    it('uses lighter copy when the offer is still a draft', async () => {
      renderRow({ offerStatus: 'draft' });
      const user = userEvent.setup();

      await user.click(screen.getByTitle('Delete attendee'));
      expect(await screen.findByText(/are you sure you want to remove/i)).toBeInTheDocument();
      expect(screen.queryByText(/lose access/i)).not.toBeInTheDocument();
    });
  });

  describe('Email-change confirmation', () => {
    it('shows the warning ConfirmDialog before saving an email change on an accepted offer', async () => {
      renderRow({ offerStatus: 'accepted' });
      const user = userEvent.setup();

      const emailInput = screen.getByPlaceholderText('Email');
      await user.clear(emailInput);
      await user.type(emailInput, 'alice+new@example.com');

      await user.click(screen.getByRole('button', { name: /save/i }));

      expect(
        await screen.findByRole('heading', { name: /replace registered attendee/i })
      ).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /replace attendee/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/trainings/offers/offer-1/attendees/att-1',
          expect.objectContaining({ email: 'alice+new@example.com' })
        );
      });
    });

    it('saves silently on a name-only edit of an accepted offer (no dialog)', async () => {
      renderRow({ offerStatus: 'accepted' });
      const user = userEvent.setup();

      const firstName = screen.getByPlaceholderText('First name');
      await user.clear(firstName);
      await user.type(firstName, 'Alicia');

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/trainings/offers/offer-1/attendees/att-1',
          expect.objectContaining({ first_name: 'Alicia', email: 'alice@example.com' })
        );
      });
      expect(
        screen.queryByRole('heading', { name: /replace registered attendee/i })
      ).not.toBeInTheDocument();
    });

    it('does not show the email-change dialog when the offer is still a draft', async () => {
      renderRow({ offerStatus: 'draft' });
      const user = userEvent.setup();

      const emailInput = screen.getByPlaceholderText('Email');
      await user.clear(emailInput);
      await user.type(emailInput, 'alice+new@example.com');

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalled();
      });
      expect(
        screen.queryByRole('heading', { name: /replace registered attendee/i })
      ).not.toBeInTheDocument();
    });
  });
});
