import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OverlaySelector from '../OverlaySelector';

const mockGet = vi.fn();
vi.mock('../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('OverlaySelector', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 'id-1',
            title: 'Welcome',
            trigger_type: 'first_registration',
            animation_style: 'confetti',
            duration_seconds: 5,
            is_active: true,
            display_order: 0,
          },
          {
            id: 'id-2',
            title: 'Scheduled One',
            trigger_type: 'scheduled',
            animation_style: 'fireworks',
            duration_seconds: 10,
            is_active: true,
            display_order: 1,
          },
        ],
        total: 2,
      },
    });
  });

  it('renders with default label', () => {
    render(<OverlaySelector conferenceId="conf-1" value={null} onChange={mockOnChange} />, {
      wrapper,
    });
    expect(screen.getByText('Screen Overlay')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(
      <OverlaySelector
        conferenceId="conf-1"
        value={null}
        onChange={mockOnChange}
        label="Link Overlay"
      />,
      { wrapper }
    );
    expect(screen.getByText('Link Overlay')).toBeInTheDocument();
  });

  it('renders "No overlay" default option', () => {
    render(<OverlaySelector conferenceId="conf-1" value={null} onChange={mockOnChange} />, {
      wrapper,
    });
    const select = screen.getByRole('combobox');
    const noOverlayOption = select.querySelector('option[value=""]') as HTMLOptionElement;
    expect(noOverlayOption).toBeTruthy();
    expect(noOverlayOption.textContent).toBe('No overlay');
  });

  it('calls onChange with null when No overlay is selected', async () => {
    render(<OverlaySelector conferenceId="conf-1" value="id-1" onChange={mockOnChange} />, {
      wrapper,
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(mockOnChange).toHaveBeenCalledWith(null);
  });

  it('calls onChange with overlay id when selected', async () => {
    render(<OverlaySelector conferenceId="conf-1" value={null} onChange={mockOnChange} />, {
      wrapper,
    });

    // Wait for options to be rendered
    await waitFor(() => {
      expect(screen.getByText(/Welcome/)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'id-1' } });
    expect(mockOnChange).toHaveBeenCalledWith('id-1');
  });

  it('shows overlay titles with trigger labels after loading', async () => {
    render(<OverlaySelector conferenceId="conf-1" value={null} onChange={mockOnChange} />, {
      wrapper,
    });

    await waitFor(() => {
      expect(screen.getByText(/Welcome/)).toBeInTheDocument();
    });

    expect(screen.getByText(/First Reg/)).toBeInTheDocument();
    expect(screen.getByText(/Scheduled One/)).toBeInTheDocument();
  });
});
