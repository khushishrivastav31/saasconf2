import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DetailsTab from '../DetailsTab';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

vi.mock('../../../../config/api', () => ({ default: { patch: vi.fn() } }));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: true }),
}));
vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: ({ value }: { value: string }) => <textarea defaultValue={value} />,
}));
vi.mock('../../../../components/ConferenceLogo', () => ({
  default: () => <div>Logo</div>,
}));
vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../../config/countries', () => ({
  COUNTRIES_BY_CONTINENT: [],
}));
vi.mock('../../../../config/timezones', () => ({
  TIMEZONE_OPTIONS: [],
  resolveTimezoneValue: (v: string) => v,
  COUNTRY_DEFAULT_TIMEZONE: {},
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockSetDirty = vi.fn();

const baseConference: Conference = {
  id: 'conf-1',
  name: 'Test Conf',
  abbreviation: 'TC',
  tenant_id: 'tenant-1',
  tenant_slug: 'demo',
  status: 'active',
  currency: null,
  invoice_currency: null,
  country: 'DE',
  city: null,
  support_email: 'support@conf.com',
  contact_email: 'contact@conf.com',
  phone: null,
  website: null,
  start_date: null,
  end_date: null,
  description: null,
  venue_name: null,
  venue_address: null,
  state: null,
  postal_code: null,
  timezone: null,
  venue_type: null,
  venue_url: null,
  virtual_platform_url: null,
  logo_url: null,
  settings: null,
};

function renderDetailsTab(conference = baseConference) {
  return render(
    <DirtyContext.Provider value={mockSetDirty}>
      <DetailsTab conference={conference} onUpdate={vi.fn()} isAdmin={true} />
    </DirtyContext.Provider>
  );
}

describe('DetailsTab — Contact Information', () => {
  beforeEach(() => {
    mockSetDirty.mockReset();
  });

  it('shows the support email note about message notifications', () => {
    renderDetailsTab();
    expect(
      screen.getByText('Message notifications from speakers will be sent to this address.')
    ).toBeInTheDocument();
  });

  it('renders the Support Email field', () => {
    renderDetailsTab();
    expect(screen.getByPlaceholderText('support@example.com')).toBeInTheDocument();
  });
});
