import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Must import after mocks
import api from '../../../../config/api';
import OfferDocumentsSection from '../OfferDocumentsSection';

const mockApi = vi.mocked(api);

const mockDocuments = [
  {
    id: 'doc-1',
    offer_id: 'offer-1',
    filename: 'Proposal.docx',
    content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size: 25600,
    html_content: '<p>Sample content</p>',
    is_editable: true,
    version: 2,
    version_count: 2,
    status: 'draft',
    last_sent_at: null,
    sent_to: null,
    created_by: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  },
  {
    id: 'doc-2',
    offer_id: 'offer-1',
    filename: 'Contract.pdf',
    content_type: 'application/pdf',
    file_size: 102400,
    html_content: null,
    is_editable: false,
    version: 1,
    version_count: 1,
    status: 'sent',
    last_sent_at: '2026-03-05T10:00:00Z',
    sent_to: [{ email: 'test@example.com', sent_at: '2026-03-05T10:00:00Z', version: 1 }],
    created_by: null,
    created_at: '2026-03-02T10:00:00Z',
    updated_at: '2026-03-02T10:00:00Z',
  },
];

const mockTemplates = [
  { id: 'tpl-1', name: 'Standard Offer', language: 'English' },
  { id: 'tpl-2', name: 'Custom Offer', language: 'German' },
];

const defaultProps = {
  offerId: 'offer-1',
  offerNumber: 'OFF-001',
  customerName: 'Acme Corp',
  contactPersons: [{ first_name: 'John', last_name: 'Doe', email: 'john@acme.com' }],
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('OfferDocumentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/documents') && !url.includes('/versions')) {
        return Promise.resolve({ data: mockDocuments });
      }
      if (url.includes('/offer-templates')) {
        return Promise.resolve({ data: { items: mockTemplates } });
      }
      if (url.includes('/versions')) {
        return Promise.resolve({ data: [] });
      }
      // Single document detail
      return Promise.resolve({ data: mockDocuments[0] });
    });
  });

  it('renders "Quotes" heading', async () => {
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    expect(screen.getByText('Quotes')).toBeInTheDocument();
  });

  it('shows document count badge when documents exist', async () => {
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows empty state when no documents', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/documents')) return Promise.resolve({ data: [] });
      if (url.includes('/offer-templates'))
        return Promise.resolve({ data: { items: mockTemplates } });
      return Promise.resolve({ data: [] });
    });
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/No quotes yet/)).toBeInTheDocument();
    });
  });

  it('shows "+ Quote from Template" button', async () => {
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('+ Quote from Template')).toBeInTheDocument();
    });
  });

  it('template picker dropdown shows templates on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('+ Quote from Template')).toBeInTheDocument();
    });
    // Wait for templates to load
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/offer-templates', expect.anything());
    });
    await user.click(screen.getByText('+ Quote from Template'));
    await waitFor(() => {
      expect(screen.getByText('Standard Offer')).toBeInTheDocument();
      expect(screen.getByText('Custom Offer')).toBeInTheDocument();
    });
  });

  it('renders document list with filename, version, and status', async () => {
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Proposal.docx')).toBeInTheDocument();
    });
    expect(screen.getByText('Contract.pdf')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
  });

  it('clicking document selects it and shows detail view', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Proposal.docx')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Proposal.docx'));
    await waitFor(() => {
      // Detail view shows download button
      expect(screen.getByText('Download')).toBeInTheDocument();
    });
  });

  it('detail view shows action buttons', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Proposal.docx')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Proposal.docx'));
    await waitFor(() => {
      expect(screen.getByText('Download')).toBeInTheDocument();
      expect(screen.getByText('Send')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('delete confirmation dialog appears on delete button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Proposal.docx')).toBeInTheDocument();
    });
    // Click X button on a document card
    const deleteButtons = screen.getAllByTitle('Delete document');
    await user.click(deleteButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Document?')).toBeInTheDocument();
    });
  });

  it('fetches documents from correct endpoint', async () => {
    renderWithProviders(<OfferDocumentsSection {...defaultProps} />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/trainings/offers/offer-1/documents');
    });
  });
});
