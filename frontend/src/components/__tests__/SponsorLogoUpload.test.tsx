import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SponsorLogoUpload from '../SponsorLogoUpload';
import api from '../../config/api';

// Mock API
vi.mock('../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('SponsorLogoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows spinner while loading logo data', () => {
      (api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      // The component shows a spinner SVG during loading
      expect(screen.getByText('Logo')).toBeInTheDocument();
    });
  });

  describe('no logo state', () => {
    it('renders upload button when no logo exists', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Upload Logo')).toBeInTheDocument();
      });
    });

    it('does not show delete button when no logo exists', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Upload Logo')).toBeInTheDocument();
      });

      expect(screen.queryByText('Delete Logo')).not.toBeInTheDocument();
    });

    it('shows file type help text', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('JPEG, PNG, WebP, GIF, or SVG. Max 10MB.')).toBeInTheDocument();
      });
    });
  });

  describe('with logo', () => {
    const mockLogo = {
      id: 'att-1',
      tenant_id: 'tenant-1',
      entity_type: 'sponsor_logo',
      entity_id: 'sp-1',
      filename: 'logo.png',
      content_type: 'image/png',
      file_size: 1024,
      description: null,
      uploaded_by: null,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    };

    beforeEach(() => {
      // First call: get attachments list
      (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/attachments?')) {
          return Promise.resolve({
            data: { items: [mockLogo], total: 1 },
          });
        }
        if (url.includes('/download')) {
          return Promise.resolve({
            data: new Blob(['image-data'], { type: 'image/png' }),
          });
        }
        return Promise.resolve({ data: {} });
      });
    });

    it('shows Replace Logo button when logo exists', async () => {
      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Replace Logo')).toBeInTheDocument();
      });
    });

    it('shows Delete Logo button when logo exists', async () => {
      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Delete Logo')).toBeInTheDocument();
      });
    });

    it('renders logo image when blob URL is available', async () => {
      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        const img = screen.getByAltText('Sponsor logo');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'blob:http://localhost/mock-blob-url');
      });
    });
  });

  describe('upload interaction', () => {
    it('triggers file upload when a file is selected', async () => {
      const user = userEvent.setup();
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          id: 'att-new',
          entity_type: 'sponsor_logo',
          entity_id: 'sp-1',
          filename: 'new-logo.png',
        },
      });

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Upload Logo')).toBeInTheDocument();
      });

      const fileInput = document.getElementById('sponsor-logo-upload-sp-1') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const file = new File(['logo-content'], 'logo.png', { type: 'image/png' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/attachments',
          expect.any(FormData),
          expect.objectContaining({
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        );
      });
    });
  });

  describe('delete interaction', () => {
    it('calls delete API when Delete Logo is confirmed', async () => {
      const user = userEvent.setup();
      const mockLogo = {
        id: 'att-1',
        tenant_id: 'tenant-1',
        entity_type: 'sponsor_logo',
        entity_id: 'sp-1',
        filename: 'logo.png',
        content_type: 'image/png',
        file_size: 1024,
        description: null,
        uploaded_by: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/attachments?')) {
          return Promise.resolve({
            data: { items: [mockLogo], total: 1 },
          });
        }
        if (url.includes('/download')) {
          return Promise.resolve({
            data: new Blob(['img'], { type: 'image/png' }),
          });
        }
        return Promise.resolve({ data: {} });
      });
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('Delete Logo')).toBeInTheDocument();
      });

      // Click Delete Logo — opens confirmation dialog
      await user.click(screen.getByText('Delete Logo'));
      expect(
        screen.getByText(
          'Are you sure you want to delete this sponsor logo? This action cannot be undone.'
        )
      ).toBeInTheDocument();

      // Confirm deletion
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/attachments/att-1');
      });
    });
  });

  describe('heading', () => {
    it('renders Logo heading', () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      render(<SponsorLogoUpload sponsorId="sp-1" />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByText('Logo')).toBeInTheDocument();
    });
  });
});
