import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ConferenceLogo from '../ConferenceLogo';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock api instance
const mockApi = {
  defaults: { baseURL: 'http://localhost:8000' },
} as unknown as { defaults: { baseURL: string } };

describe('ConferenceLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'No logo' placeholder when logoUrl is null", () => {
    render(<ConferenceLogo logoUrl={null} apiInstance={mockApi} />);
    expect(screen.getByText('No logo')).toBeInTheDocument();
  });

  it('renders nothing when logoUrl is null and showPlaceholder is false', () => {
    const { container } = render(
      <ConferenceLogo logoUrl={null} showPlaceholder={false} apiInstance={mockApi} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows Loading... while fetching logo', () => {
    // Keep the fetch pending
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ConferenceLogo logoUrl="/uploads/logo.png" apiInstance={mockApi} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders image when logo fetch succeeds', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(<ConferenceLogo logoUrl="/uploads/logo.png" alt="Test logo" apiInstance={mockApi} />);

    await waitFor(() => {
      const img = screen.getByAltText('Test logo');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'blob:http://localhost/mock-blob-url');
    });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/uploads/logo.png');
  });

  it('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<ConferenceLogo logoUrl="/uploads/logo.png" apiInstance={mockApi} />);

    // Should show loading first, then nothing (error handled silently)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('handles non-ok response gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    render(<ConferenceLogo logoUrl="/uploads/logo.png" apiInstance={mockApi} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('applies custom className to image', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(
      <ConferenceLogo logoUrl="/uploads/logo.png" className="custom-class" apiInstance={mockApi} />
    );

    await waitFor(() => {
      const img = screen.getByAltText('Conference logo');
      expect(img).toHaveClass('custom-class');
    });
  });

  it('applies custom placeholderClassName', () => {
    render(
      <ConferenceLogo
        logoUrl={null}
        placeholderClassName="custom-placeholder"
        apiInstance={mockApi}
      />
    );
    expect(screen.getByText('No logo')).toHaveClass('custom-placeholder');
  });
});
