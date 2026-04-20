import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomerTimelineCard from '../CustomerTimelineCard';

vi.mock('../../config/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

function renderCard(portalUserId: string, title?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerTimelineCard portalUserId={portalUserId} title={title} />
    </QueryClientProvider>
  );
}

const eventItem = {
  id: 'evt-1',
  event_type: 'training.registered',
  domain: 'training',
  notes: 'Registered for Kubernetes 101',
  meta: null,
  created_by_id: null,
  created_by_email: null,
  created_at: '2026-04-01T10:00:00Z',
};

describe('CustomerTimelineCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the default "Activity" title', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    renderCard('pu-1');
    expect(screen.getByRole('heading', { name: /Activity/i })).toBeInTheDocument();
  });

  it('respects a custom title', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    renderCard('pu-1', 'Recent events');
    expect(screen.getByRole('heading', { name: /Recent events/i })).toBeInTheDocument();
  });

  it('passes the portalUserId through to the history endpoint', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [eventItem], total: 1 } });
    renderCard('pu-42');
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/portal-users/pu-42/history'));
    await waitFor(() =>
      expect(screen.getByText(/Registered for Kubernetes 101/)).toBeInTheDocument()
    );
  });

  it('renders HistoryPanel empty state when the feed is empty', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    renderCard('pu-1');
    await waitFor(() => expect(screen.getByText(/No history recorded yet/i)).toBeInTheDocument());
  });
});
