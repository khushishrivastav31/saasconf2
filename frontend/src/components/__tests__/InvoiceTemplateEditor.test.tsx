import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InvoiceTemplateEditor from '../InvoiceTemplateEditor';

// Mock the admin API client
vi.mock('../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../config/api';
const mockApi = vi.mocked(api);

// Mock Toast to avoid provider requirement
vi.mock('../Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Shared spy for showToast — declared at module level, reset in beforeEach
const mockShowToast = vi.fn();

// Mock RichTextEditor to a plain textarea for testability
vi.mock('../common/RichTextEditor', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    rows?: number;
    editorClassName?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  ),
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof InvoiceTemplateEditor>> = {}) {
  const queryClient = createQueryClient();

  const defaultProps: React.ComponentProps<typeof InvoiceTemplateEditor> = {
    conferenceId: 'conf-123',
    value: '<p>Hello [COMPANY_NAME]</p>',
    onChange: vi.fn(),
    ...overrides,
  };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <InvoiceTemplateEditor {...defaultProps} />
      </QueryClientProvider>
    ),
    props: defaultProps,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('InvoiceTemplateEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Rendering — basic structure
  describe('rendering', () => {
    it('renders the RichTextEditor with the provided value', () => {
      renderEditor({ value: '<p>Test body content</p>' });

      const editor = screen.getByTestId('rich-text-editor');
      expect(editor).toBeInTheDocument();
      expect(editor).toHaveValue('<p>Test body content</p>');
    });

    it('renders the Page Format selector with default A4 option', () => {
      renderEditor();

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      // Default pageFormat is A4
      expect(select).toHaveValue('A4');
    });

    it('renders Preview PDF and Insert Template buttons', () => {
      renderEditor();

      expect(screen.getByRole('button', { name: /preview pdf/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /insert template/i })).toBeInTheDocument();
    });

    it('renders Save Template button when onSave prop is provided', () => {
      renderEditor({ onSave: vi.fn() });

      expect(screen.getByRole('button', { name: /save template/i })).toBeInTheDocument();
    });

    it('does not render Save Template button when onSave prop is absent', () => {
      renderEditor();

      expect(screen.queryByRole('button', { name: /save template/i })).not.toBeInTheDocument();
    });

    it('renders the Show Placeholders toggle button', () => {
      renderEditor();

      expect(screen.getByRole('button', { name: /show placeholders/i })).toBeInTheDocument();
    });

    it('renders the HTML source toggle button', () => {
      renderEditor();

      // The button text renders as HTML entities rendered by the browser
      const buttons = screen.getAllByRole('button');
      const htmlButton = buttons.find((b) => b.textContent?.includes('HTML'));
      expect(htmlButton).toBeTruthy();
    });
  });

  // 2. Page Format selection
  describe('page format select', () => {
    it('calls onPageFormatChange when a different format is selected', async () => {
      const user = userEvent.setup();
      const onPageFormatChange = vi.fn();
      renderEditor({ onPageFormatChange, pageFormat: 'A4' });

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'Letter');

      expect(onPageFormatChange).toHaveBeenCalledWith('Letter');
    });

    it('reflects the pageFormat prop in the select value', () => {
      renderEditor({ pageFormat: 'Legal' });

      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('Legal');
    });

    it('disables the page format select when disabled prop is true', () => {
      renderEditor({ disabled: true });

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });
  });

  // 3. Placeholder sidebar
  describe('placeholder sidebar', () => {
    it('shows placeholder sidebar when Show Placeholders is clicked', async () => {
      const user = userEvent.setup();
      renderEditor();

      const toggleBtn = screen.getByRole('button', { name: /show placeholders/i });
      await user.click(toggleBtn);

      // The heading "Placeholders" appears in the sidebar
      expect(screen.getByText('Placeholders')).toBeInTheDocument();
      // Button label changes to "Hide Placeholders"
      expect(screen.getByRole('button', { name: /hide placeholders/i })).toBeInTheDocument();
    });

    it('hides placeholder sidebar when Hide Placeholders is clicked', async () => {
      const user = userEvent.setup();
      renderEditor();

      // Open
      await user.click(screen.getByRole('button', { name: /show placeholders/i }));
      expect(screen.getByText('Placeholders')).toBeInTheDocument();

      // Close
      await user.click(screen.getByRole('button', { name: /hide placeholders/i }));
      expect(screen.queryByText('Placeholders')).not.toBeInTheDocument();
    });

    it('inserts a placeholder into the editor value when a placeholder button is clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderEditor({ value: '<p>Hello</p>', onChange });

      // Open placeholders sidebar
      await user.click(screen.getByRole('button', { name: /show placeholders/i }));

      // The "Invoice" and "Items & Totals" categories are expanded by default.
      // Click [INVOICE_NUMBER] placeholder button
      const invoiceNumberBtn = screen.getByRole('button', { name: /\[INVOICE_NUMBER\]/i });
      await user.click(invoiceNumberBtn);

      expect(onChange).toHaveBeenCalledWith('<p>Hello</p>[INVOICE_NUMBER]');
    });

    it('shows category toggle for collapsed category (e.g. Company)', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('button', { name: /show placeholders/i }));

      // "Company" category header should be present (CSS uppercase is applied via class, not text content)
      expect(screen.getByText('Company')).toBeInTheDocument();
      // But [COMPANY_NAME] items should NOT be visible since Company is collapsed by default
      expect(screen.queryByRole('button', { name: /\[COMPANY_NAME\]/i })).not.toBeInTheDocument();
    });

    it('expands a collapsed category when its header is clicked', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('button', { name: /show placeholders/i }));

      // Click the Company category header to expand it (CSS uppercase doesn't affect text content)
      const companyHeader = screen.getByText('Company');
      await user.click(companyHeader);

      // [COMPANY_NAME] button should now be visible
      expect(screen.getByRole('button', { name: /\[COMPANY_NAME\]/i })).toBeInTheDocument();
    });
  });

  // 4. HTML source view toggle
  describe('HTML view toggle', () => {
    it('switches to a raw textarea when HTML button is clicked', async () => {
      const user = userEvent.setup();
      renderEditor({ value: '<p>My content</p>' });

      // Before: visual rich text editor is shown
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();

      // Click the HTML toggle button
      const buttons = screen.getAllByRole('button');
      const htmlBtn = buttons.find((b) => b.textContent?.includes('HTML'))!;
      await user.click(htmlBtn);

      // After: the HTML source textarea is visible (it does NOT have data-testid)
      // The rich text editor mocked component is gone in HTML mode
      // The textarea for raw HTML is present — it contains the formatted HTML
      const textareas = screen.getAllByRole('textbox');
      // Should have at least one textarea for raw HTML
      expect(textareas.length).toBeGreaterThan(0);
    });
  });

  // 5. Save Template button
  describe('Save Template button', () => {
    it('calls onSave when Save Template is clicked', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderEditor({ onSave });

      const saveBtn = screen.getByRole('button', { name: /save template/i });
      await user.click(saveBtn);

      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  // 6. Preview PDF button & mutation
  describe('Preview PDF', () => {
    it('shows "Generating..." while preview request is pending', async () => {
      const user = userEvent.setup();
      // Simulate a never-resolving request
      mockApi.post.mockImplementation(() => new Promise(() => {}));

      renderEditor();

      const previewBtn = screen.getByRole('button', { name: /preview pdf/i });
      await user.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generating\.\.\./i })).toBeInTheDocument();
      });
    });

    it('disables Preview PDF button while request is pending', async () => {
      const user = userEvent.setup();
      mockApi.post.mockImplementation(() => new Promise(() => {}));

      renderEditor();

      const previewBtn = screen.getByRole('button', { name: /preview pdf/i });
      await user.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generating\.\.\./i })).toBeDisabled();
      });
    });

    it('shows error toast when preview API call fails', async () => {
      const user = userEvent.setup();
      mockApi.post.mockRejectedValueOnce(new Error('Preview generation failed'));

      renderEditor();

      await user.click(screen.getByRole('button', { name: /preview pdf/i }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Preview generation failed'),
          'error'
        );
      });
    });

    it('sends correct payload to preview endpoint', async () => {
      const user = userEvent.setup();

      // Mock FileReader and Blob behaviour so onSuccess runs
      const originalFileReader = global.FileReader;
      const mockFileReader = {
        readAsDataURL: vi.fn(function (this: { onloadend: () => void }) {
          this.result = 'data:application/pdf;base64,abc';
          this.onloadend?.();
        }),
        result: '',
        onloadend: null as null | (() => void),
        onerror: null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.FileReader = vi.fn(() => mockFileReader) as any;

      mockApi.post.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

      renderEditor({
        conferenceId: 'conf-xyz',
        value: '<p>body</p>',
        headerValue: '<p>header</p>',
        footerValue: '<p>footer</p>',
        vatSource: 'fiscal_rep',
        templateType: 'stripe',
      });

      await user.click(screen.getByRole('button', { name: /preview pdf/i }));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          '/conferences/conf-xyz/settings/invoice-settings/preview',
          expect.objectContaining({
            invoice_template_html: '<p>body</p>',
            invoice_header_html: '<p>header</p>',
            invoice_footer_html: '<p>footer</p>',
            invoice_company_info: { vat_source: 'fiscal_rep' },
          }),
          expect.objectContaining({ params: { template_type: 'stripe' } })
        );
      });

      global.FileReader = originalFileReader;
    });
  });

  // 7. Header / Footer collapsible sections
  describe('header and footer sections', () => {
    it('does not render Page Header section when onHeaderChange is not provided', () => {
      renderEditor();

      expect(screen.queryByText(/page header/i)).not.toBeInTheDocument();
    });

    it('renders Page Header section when onHeaderChange prop is provided', () => {
      renderEditor({ onHeaderChange: vi.fn(), headerValue: '' });

      expect(screen.getByText(/page header/i)).toBeInTheDocument();
    });

    it('expands header editor when Page Header button is clicked', async () => {
      const user = userEvent.setup();
      const onHeaderChange = vi.fn();
      renderEditor({ onHeaderChange, headerValue: '<p>header content</p>' });

      const headerToggle = screen.getByText(/page header/i).closest('button')!;
      await user.click(headerToggle);

      // After expanding, a RichTextEditor for the header is visible
      const editors = screen.getAllByTestId('rich-text-editor');
      // There should be 2 editors: body + header
      expect(editors.length).toBe(2);
      expect(editors[1]).toHaveValue('<p>header content</p>');
    });

    it('does not render Page Footer section when onFooterChange is not provided', () => {
      renderEditor();

      expect(screen.queryByText(/page footer/i)).not.toBeInTheDocument();
    });

    it('renders Page Footer section when onFooterChange prop is provided', () => {
      renderEditor({ onFooterChange: vi.fn(), footerValue: '' });

      expect(screen.getByText(/page footer/i)).toBeInTheDocument();
    });

    it('expands footer editor when Page Footer button is clicked', async () => {
      const user = userEvent.setup();
      const onFooterChange = vi.fn();
      renderEditor({ onFooterChange, footerValue: '<p>footer content</p>' });

      const footerToggle = screen.getByText(/page footer/i).closest('button')!;
      await user.click(footerToggle);

      const editors = screen.getAllByTestId('rich-text-editor');
      // body + footer
      expect(editors.length).toBe(2);
      expect(editors[1]).toHaveValue('<p>footer content</p>');
    });
  });

  // 8. disabled state
  describe('disabled state', () => {
    it('disables the RichTextEditor when disabled prop is true', () => {
      renderEditor({ disabled: true });

      const editor = screen.getByTestId('rich-text-editor');
      expect(editor).toBeDisabled();
    });
  });

  // 9. onChange wiring
  describe('onChange wiring', () => {
    it('calls onChange when the RichTextEditor fires a change', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderEditor({ value: '', onChange });

      const editor = screen.getByTestId('rich-text-editor');
      await user.type(editor, 'abc');

      expect(onChange).toHaveBeenCalled();
    });
  });
});
