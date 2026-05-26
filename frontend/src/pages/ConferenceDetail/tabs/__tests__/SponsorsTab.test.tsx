import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectionProvider } from '../../SelectionContext';
import ConferenceSponsorsTab from '../SponsorsTab';
import type { Conference } from '../../../../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

const mockShowToast = vi.fn();
vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../components/SponsorDetailPanel', () => ({
  default: () => <div data-testid="sponsor-detail-panel" />,
}));

vi.mock('../../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>ConfirmDelete</button>
        <button onClick={onCancel}>CancelDelete</button>
      </div>
    ) : null,
}));

vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));

vi.mock('../../../../components/ContactPersonList', () => ({
  default: () => <div data-testid="contact-person-list" />,
}));

vi.mock('../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../components/common/VatNumberInput', () => ({
  default: () => <div data-testid="vat-number-input" />,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockConference = {
  id: 'conf-1',
  name: 'TestConf 2026',
  currency: 'EUR',
} as unknown as Conference;

const sponsorBase = {
  id: 'sp-1',
  company_name: 'Acme Corp',
  price: null,
  currency: null,
  city: null,
  is_active: true,
  sponsor_package_id: null,
  sponsor_package_name: null,
  tenant_id: 't-1',
  conference_id: 'conf-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const sponsorWithPackage = {
  ...sponsorBase,
  id: 'sp-2',
  company_name: 'Gold Sponsor Ltd',
  sponsor_package_id: 'pkg-1',
  sponsor_package_name: 'Gold',
};

const emptySponsorsResponse = { items: [], total: 0, page: 1, page_size: 20 };
const sponsorsWithPackageResponse = {
  items: [sponsorWithPackage, sponsorBase],
  total: 2,
  page: 1,
  page_size: 20,
};
const goldPackage = { id: 'pkg-1', name: 'Gold', price: 5000, currency: 'EUR' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderTab(isAdmin = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SelectionProvider>
        <ConferenceSponsorsTab conference={mockConference} isAdmin={isAdmin} />
      </SelectionProvider>
    </QueryClientProvider>
  );
}

// ── Phase 1: Label and help text ─────────────────────────────────────────────

describe('SponsorsTab — form label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/sponsors') && !url.includes('packages')) {
        return Promise.resolve({ data: emptySponsorsResponse });
      }
      if (url.includes('/settings/sponsor-packages')) {
        return Promise.resolve({ data: { items: [goldPackage] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('form shows "Sponsorship Tier (Package)" label, not just "Package"', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /add sponsor/i }));
    const label = await screen.findByText(/sponsorship tier/i);
    expect(label).toBeTruthy();
  });

  it('form shows helper text referencing Settings → Sponsor Packages', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /add sponsor/i }));
    const helpText = await screen.findByText(/tiers are managed in settings/i);
    expect(helpText).toBeTruthy();
  });
});

// ── Phase 2: Clickable empty-state link ──────────────────────────────────────

describe('SponsorsTab — empty package state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/sponsors') && !url.includes('packages')) {
        return Promise.resolve({ data: emptySponsorsResponse });
      }
      if (url.includes('/settings/sponsor-packages')) {
        return Promise.resolve({ data: { items: [] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders a link to settings when package list is empty', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /add sponsor/i }));
    const link = await screen.findByRole('link', { name: /settings/i });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).href).toContain('tab=settings');
  });
});

// ── Phase 3: Tier badge in sponsor list ──────────────────────────────────────

describe('SponsorsTab — tier badge in list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/sponsors') && !url.includes('packages')) {
        return Promise.resolve({ data: sponsorsWithPackageResponse });
      }
      if (url.includes('/settings/sponsor-packages')) {
        return Promise.resolve({ data: { items: [goldPackage] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders a badge with the package name for a sponsor that has a tier', async () => {
    renderTab();
    const badge = await screen.findByText('Gold');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toMatch(/rounded-full|badge/i);
  });

  it('renders "No tier" placeholder for a sponsor without a package', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No tier')).toBeTruthy();
    });
  });
});
