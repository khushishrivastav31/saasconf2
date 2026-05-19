import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConferenceSocialTab from '../SocialTab';
import type { Conference } from '../../../../types';

const mockShowToast = vi.fn();

vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockPut = vi.fn();
vi.mock('../../../../config/api', () => ({
  default: {
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

const mockConference = {
  id: 'conf-1',
  social_links: { twitter: 'https://twitter.com/test' },
} as unknown as Conference;

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConferenceSocialTab conference={mockConference} onUpdate={vi.fn()} isAdmin={true} />
    </QueryClientProvider>
  );
}

describe('ConferenceSocialTab — toast feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows success toast after saving social links', async () => {
    mockPut.mockResolvedValue({ data: {} });
    renderTab();

    // Make it dirty so Save is enabled
    const input = screen.getByPlaceholderText('twitter.com/...');
    fireEvent.change(input, { target: { value: 'https://twitter.com/updated' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Social links saved', 'success');
    });
  });

  it('shows error toast when save fails', async () => {
    mockPut.mockRejectedValue({ response: { data: { detail: 'Server error' } } });
    renderTab();

    const input = screen.getByPlaceholderText('twitter.com/...');
    fireEvent.change(input, { target: { value: 'https://twitter.com/updated' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Server error'), 'error');
    });
  });
});
