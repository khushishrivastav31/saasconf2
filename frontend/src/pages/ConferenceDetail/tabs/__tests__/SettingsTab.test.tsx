import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsTab from '../SettingsTab';
import type { Conference } from '../../../../types';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock all child tab components to avoid complex rendering
vi.mock('../settings/VolunteerRolesTab', () => ({ default: () => <div>VolunteerRolesTab</div> }));
vi.mock('../settings/LocationTypesTab', () => ({ default: () => <div>LocationTypesTab</div> }));
vi.mock('../settings/SponsorPackagesTab', () => ({ default: () => <div>SponsorPackagesTab</div> }));
vi.mock('../settings/SessionTypesTab', () => ({ default: () => <div>SessionTypesTab</div> }));
vi.mock('../settings/CommitteeRolesTab', () => ({ default: () => <div>CommitteeRolesTab</div> }));
vi.mock('../settings/ScoreScalesTab', () => ({ default: () => <div>ScoreScalesTab</div> }));
vi.mock('../settings/ReviewCriteriaTab', () => ({ default: () => <div>ReviewCriteriaTab</div> }));
vi.mock('../settings/PaperFormBuilderTab', () => ({
  default: () => <div>PaperFormBuilderTab</div>,
}));
vi.mock('../../PronounOptionsTab', () => ({ default: () => <div>PronounOptionsTab</div> }));
vi.mock('../settings/EmailTemplatesTab', () => ({ default: () => <div>EmailTemplatesTab</div> }));
vi.mock('../settings/EmailSettingsTab', () => ({ default: () => <div>EmailSettingsTab</div> }));
vi.mock('../settings/MessagingSettingsTab', () => ({
  default: () => <div>MessagingSettingsTab</div>,
}));
vi.mock('../settings/MessageTemplatesTab', () => ({
  default: () => <div>MessageTemplatesTab</div>,
}));
vi.mock('../settings/RecipientListsTab', () => ({ default: () => <div>RecipientListsTab</div> }));
vi.mock('../ScreenOverlaysTab', () => ({ default: () => <div>ScreenOverlaysTab</div> }));
vi.mock('../settings/InvoiceNumberTab', () => ({ default: () => <div>InvoiceNumberTab</div> }));
vi.mock('../settings/InvoiceCompanyDataTab', () => ({
  default: () => <div>InvoiceCompanyDataTab</div>,
}));
vi.mock('../settings/InvoiceBankAccountsTab', () => ({
  default: () => <div>InvoiceBankAccountsTab</div>,
}));
vi.mock('../settings/InvoiceTemplateTab', () => ({ default: () => <div>InvoiceTemplateTab</div> }));
vi.mock('../settings/StripeSetupTab', () => ({ default: () => <div>StripeSetupTab</div> }));
vi.mock('../settings/FinancialSettingsTab', () => ({
  default: () => <div>FinancialSettingsTab</div>,
}));

const mockConference: Conference = {
  id: 'conf-123',
  name: 'Test Conference',
  abbreviation: 'TC',
  tenant_id: 'tenant-1',
  tenant_slug: 'demo',
  status: 'active',
  currency: null,
  invoice_currency: null,
  country: 'DE',
  city: null,
  state: null,
  postal_code: null,
  start_date: null,
  end_date: null,
  timezone: null,
  description: null,
  website: null,
  support_email: null,
  contact_email: null,
  phone: null,
  venue_name: null,
  venue_address: null,
  venue_type: 'in_person',
  venue_url: null,
  virtual_platform_url: null,
  logo_url: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('SettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('superOnly filtering', () => {
    it('shows all Finance items for super_admin', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u1', role: 'super_admin', modules: [] },
      });

      render(<SettingsTab conference={mockConference} isAdmin={true} />);

      // All Finance nav items should be visible
      expect(screen.getByRole('button', { name: /currency & tax/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /numbering/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /company data/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bank accounts/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /invoice templates/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /stripe setup/i })).toBeInTheDocument();
    });

    it('hides Numbering and Stripe Setup for tenant_admin', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u2', role: 'tenant_admin', modules: [] },
      });

      render(<SettingsTab conference={mockConference} isAdmin={true} />);

      // Non-superOnly Finance items should be visible
      expect(screen.getByRole('button', { name: /currency & tax/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /company data/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bank accounts/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /invoice templates/i })).toBeInTheDocument();

      // superOnly items should be hidden
      expect(screen.queryByRole('button', { name: /numbering/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /stripe setup/i })).not.toBeInTheDocument();
    });

    it('hides Numbering and Stripe Setup for regular user', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u3', role: 'user', modules: [] },
      });

      render(<SettingsTab conference={mockConference} isAdmin={false} />);

      // superOnly items should be hidden
      expect(screen.queryByRole('button', { name: /numbering/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /stripe setup/i })).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('shows all settings group headers', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u1', role: 'super_admin', modules: [] },
      });

      render(<SettingsTab conference={mockConference} isAdmin={true} />);

      expect(screen.getByText('People & Roles')).toBeInTheDocument();
      expect(screen.getByText('Conference Setup')).toBeInTheDocument();
      expect(screen.getByText('CFP & Reviews')).toBeInTheDocument();
      expect(screen.getByText('Communication')).toBeInTheDocument();
      expect(screen.getByText('Finance')).toBeInTheDocument();
    });

    it('renders default tab content (Volunteer Tasks)', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u1', role: 'super_admin', modules: [] },
      });

      render(<SettingsTab conference={mockConference} isAdmin={true} />);

      expect(screen.getByText('VolunteerRolesTab')).toBeInTheDocument();
    });
  });
});
