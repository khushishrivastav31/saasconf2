import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SeedTestDataButton from '../SeedTestDataButton';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockPost = vi.fn();
vi.mock('../../../../config/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

const mockIsTenantAdmin = vi.fn();
vi.mock('../../../../hooks/useIsAdmin', () => ({
  useIsTenantAdmin: () => mockIsTenantAdmin(),
}));

const mockIsSeedEnvironment = vi.fn();
vi.mock('../../../../utils/seedEnv', () => ({
  isSeedEnvironment: () => mockIsSeedEnvironment(),
}));

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SeedTestDataButton conferenceId="conf-1" />
    </QueryClientProvider>
  );
}

describe('SeedTestDataButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTenantAdmin.mockReturnValue(true);
    mockIsSeedEnvironment.mockReturnValue(true);
  });

  it('renders nothing for non-tenant-admins', () => {
    mockIsTenantAdmin.mockReturnValue(false);
    const { container } = renderButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing outside dev/staging', () => {
    mockIsSeedEnvironment.mockReturnValue(false);
    const { container } = renderButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('seeds data on confirm and shows a summary', async () => {
    mockPost.mockResolvedValue({
      data: {
        evaluated_papers: 22,
        reviewers: 3,
        must_have_papers: 5,
        default_password: 'Test1234!',
      },
    });
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: /seed test data/i }));
    fireEvent.click(screen.getByRole('button', { name: /^seed data$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/cfp/conferences/conf-1/seed-review-data', {});
    });
    expect(await screen.findByText(/seeded 22 evaluated papers/i)).toBeInTheDocument();
    expect(screen.getByText(/Test1234!/)).toBeInTheDocument();
  });

  it('surfaces an error when seeding fails', async () => {
    mockPost.mockRejectedValue({});
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: /seed test data/i }));
    fireEvent.click(screen.getByRole('button', { name: /^seed data$/i }));

    expect(await screen.findByText(/failed to seed test data/i)).toBeInTheDocument();
  });
});
