import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InvoiceDetailPanel from "../index";
import type { Invoice, PlatformCurrency } from "../../../types";

// Helper to find input by label text (since labels don't use "for" attribute)
function getInputByLabel(container: HTMLElement, labelText: string) {
  const label = within(container).getByText(labelText);
  const parent = label.parentElement;
  if (!parent) throw new Error(`No parent element for label: ${labelText}`);
  const input = parent.querySelector("input, select, textarea");
  if (!input) throw new Error(`No input found for label: ${labelText}`);
  return input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
}

// Mock the api module
vi.mock("../../../config/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock RichTextEditor
vi.mock("../../common/RichTextEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (html: string) => void;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Mock AttachmentList
vi.mock("../../AttachmentList", () => ({
  default: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="attachment-list">
      Attachments for {entityType}: {entityId}
    </div>
  ),
}));

// Mock ContactPersonList
vi.mock("../../ContactPersonList", () => ({
  default: ({
    contacts,
    addContact,
    removeContact,
  }: {
    contacts: unknown[];
    addContact: () => void;
    removeContact: (index: number) => void;
  }) => (
    <div data-testid="contact-person-list">
      <span>Contacts: {contacts.length}</span>
      <button onClick={addContact}>Add Contact</button>
      <button onClick={() => removeContact(0)}>Remove First Contact</button>
    </div>
  ),
}));

// Mock ConfirmDialog
vi.mock("../../ConfirmDialog", () => ({
  default: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="confirm-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

const mockInvoice: Invoice = {
  id: "inv-1",
  tenant_id: "tenant-1",
  conference_id: "conf-1",
  invoice_number: "INV-2024-001",
  status: "draft",
  issue_date: "2024-01-15",
  due_date: "2024-02-15",
  recipient_name: "Acme Corp",
  recipient_email: "billing@acme.com",
  recipient_address_line1: "123 Main St",
  recipient_address_line2: "Suite 100",
  recipient_city: "New York",
  recipient_state: "NY",
  recipient_postal_code: "10001",
  recipient_country: "USA",
  recipient_vat_number: "US123456789",
  line_items: [
    { description: "Conference Ticket", quantity: 2, unit_price: 500, total: 1000 },
    { description: "Workshop Add-on", quantity: 1, unit_price: 200, total: 200 },
  ],
  subtotal: 1200,
  tax_rate: 10,
  tax_amount: 120,
  total: 1320,
  currency: "USD",
  notes: "<p>Thank you for your business</p>",
  contact_persons: [
    { first_name: "John", last_name: "Doe", email: "john@acme.com", phone: "555-1234" },
  ],
  is_active: true,
  created_at: "2024-01-10T10:00:00Z",
  updated_at: "2024-01-15T14:30:00Z",
};

const mockCurrencies: PlatformCurrency[] = [
  { id: "cur-1", code: "USD", name: "US Dollar", symbol: "$", is_active: true, created_at: "", updated_at: "" },
  { id: "cur-2", code: "EUR", name: "Euro", symbol: "\u20AC", is_active: true, created_at: "", updated_at: "" },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("InvoiceDetailPanel", () => {
  const defaultProps = {
    invoice: mockInvoice,
    currencies: mockCurrencies,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    isSaving: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders invoice header with invoice number", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByText("INV-2024-001")).toBeInTheDocument();
    });

    it("renders invoice status badge", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      // Draft appears both as status badge and in the select dropdown
      // Verify at least one "Draft" text is present
      const draftElements = screen.getAllByText("Draft");
      expect(draftElements.length).toBeGreaterThanOrEqual(1);
    });

    it("renders recipient name in header", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });

    it("renders all tab buttons", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Line Items/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Contacts/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Documents" })).toBeInTheDocument();
    });

    it("shows line items count in tab label", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Line Items (2)" })).toBeInTheDocument();
    });

    it("shows contacts count in tab label", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Contacts (1)" })).toBeInTheDocument();
    });

    it("renders Save Changes button", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    });

    it("shows Saving... text when isSaving is true", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} isSaving={true} />);
      expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    });

    it("disables save button when isSaving is true", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} isSaving={true} />);
      expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    });

    it("renders delete button when onDelete is provided", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      expect(screen.getByTitle("Delete invoice")).toBeInTheDocument();
    });

    it("does not render delete button when onDelete is not provided", () => {
      renderWithProviders(
        <InvoiceDetailPanel {...defaultProps} onDelete={undefined} />
      );
      expect(screen.queryByTitle("Delete invoice")).not.toBeInTheDocument();
    });
  });

  describe("tab navigation", () => {
    it("shows Details tab content by default", () => {
      const { container } = renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      const input = getInputByLabel(container, "Invoice Number *");
      expect(input).toBeInTheDocument();
    });

    it("switches to Line Items tab when clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Line Items/ }));

      expect(screen.getByText("Add Line Item")).toBeInTheDocument();
    });

    it("switches to Contacts tab when clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Contacts/ }));

      expect(screen.getByTestId("contact-person-list")).toBeInTheDocument();
    });

    it("switches to Documents tab when clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Documents" }));

      expect(screen.getByTestId("attachment-list")).toBeInTheDocument();
      expect(screen.getByText(/Attachments for invoice: inv-1/)).toBeInTheDocument();
    });
  });

  describe("status colors", () => {
    it("renders draft status with gray color", () => {
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);
      // Find the status badge in header (not the select option)
      const header = screen.getByText("INV-2024-001").closest("div")?.parentElement;
      const badge = within(header!).getByText("Draft");
      expect(badge.className).toContain("bg-gray-100");
      expect(badge.className).toContain("text-gray-800");
    });

    it("renders sent status with blue color", () => {
      const sentInvoice = { ...mockInvoice, status: "sent" as const };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={sentInvoice} />);
      const header = screen.getByText("INV-2024-001").closest("div")?.parentElement;
      const badge = within(header!).getByText("Sent");
      expect(badge.className).toContain("bg-blue-100");
      expect(badge.className).toContain("text-blue-800");
    });

    it("renders paid status with green color", () => {
      const paidInvoice = { ...mockInvoice, status: "paid" as const };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={paidInvoice} />);
      const header = screen.getByText("INV-2024-001").closest("div")?.parentElement;
      const badge = within(header!).getByText("Paid");
      expect(badge.className).toContain("bg-green-100");
      expect(badge.className).toContain("text-green-800");
    });

    it("renders overdue status with red color", () => {
      const overdueInvoice = { ...mockInvoice, status: "overdue" as const };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={overdueInvoice} />);
      const header = screen.getByText("INV-2024-001").closest("div")?.parentElement;
      const badge = within(header!).getByText("Overdue");
      expect(badge.className).toContain("bg-red-100");
      expect(badge.className).toContain("text-red-800");
    });

    it("renders cancelled status with yellow color", () => {
      const cancelledInvoice = { ...mockInvoice, status: "cancelled" as const };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={cancelledInvoice} />);
      const header = screen.getByText("INV-2024-001").closest("div")?.parentElement;
      const badge = within(header!).getByText("Cancelled");
      expect(badge.className).toContain("bg-yellow-100");
      expect(badge.className).toContain("text-yellow-800");
    });
  });

  describe("form submission", () => {
    it("calls onSave when form is submitted", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} onSave={onSave} />);

      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("includes form data in onSave call", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} onSave={onSave} />);

      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice_number: "INV-2024-001",
          status: "draft",
          recipient_name: "Acme Corp",
        })
      );
    });
  });

  describe("delete functionality", () => {
    it("opens confirm dialog when delete button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByTitle("Delete invoice"));

      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      expect(screen.getByText("Delete Invoice")).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete invoice "INV-2024-001"/)).toBeInTheDocument();
    });

    it("calls onDelete when confirmed", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByTitle("Delete invoice"));
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(onDelete).toHaveBeenCalledWith("inv-1");
    });

    it("closes dialog when cancelled", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByTitle("Delete invoice"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });

  describe("form data updates", () => {
    it("updates invoice number field", async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      const input = getInputByLabel(container, "Invoice Number *");
      await user.clear(input);
      await user.type(input, "INV-2024-002");

      expect(input).toHaveValue("INV-2024-002");
    });

    it("updates status field", async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      const select = getInputByLabel(container, "Status");
      await user.selectOptions(select, "sent");

      expect(select).toHaveValue("sent");
    });

    it("updates recipient name field", async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      const input = getInputByLabel(container, "Recipient Name *");
      await user.clear(input);
      await user.type(input, "New Company");

      expect(input).toHaveValue("New Company");
    });
  });

  describe("invoice data reset on change", () => {
    it("resets form when invoice id changes", () => {
      const { rerender, container } = renderWithProviders(
        <InvoiceDetailPanel {...defaultProps} />
      );

      const newInvoice: Invoice = {
        ...mockInvoice,
        id: "inv-2",
        invoice_number: "INV-2024-002",
        recipient_name: "New Corp",
      };

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <InvoiceDetailPanel {...defaultProps} invoice={newInvoice} />
        </QueryClientProvider>
      );

      expect(screen.getByText("INV-2024-002")).toBeInTheDocument();
      const input = getInputByLabel(container, "Invoice Number *");
      expect(input).toHaveValue("INV-2024-002");
    });
  });

  describe("line items functionality", () => {
    it("navigates to line items tab and displays items", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Line Items/ }));

      expect(screen.getByDisplayValue("Conference Ticket")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Workshop Add-on")).toBeInTheDocument();
    });

    it("adds new line item when Add Line Item is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Line Items/ }));
      await user.click(screen.getByText("Add Line Item"));

      // Should now have 3 description inputs (2 original + 1 new)
      const descriptionInputs = screen.getAllByPlaceholderText("Item description");
      expect(descriptionInputs).toHaveLength(3);
    });

    it("removes line item when remove button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Line Items/ }));

      // Initial state: 2 line items
      expect(screen.getAllByPlaceholderText("Item description")).toHaveLength(2);

      // Click remove on first item
      const removeButtons = screen.getAllByTitle("Remove");
      await user.click(removeButtons[0]);

      // Should now have 1 line item
      expect(screen.getAllByPlaceholderText("Item description")).toHaveLength(1);
    });

    it("updates line item description", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Line Items/ }));

      const descriptionInput = screen.getByDisplayValue("Conference Ticket");
      await user.clear(descriptionInput);
      await user.type(descriptionInput, "Updated Item");

      expect(descriptionInput).toHaveValue("Updated Item");
    });

    it("updates line item quantity", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Line Items/ }));

      const quantityInputs = screen.getAllByDisplayValue("2");
      await user.clear(quantityInputs[0]);
      await user.type(quantityInputs[0], "5");

      expect(quantityInputs[0]).toHaveValue(5);
    });
  });

  describe("empty invoice handling", () => {
    it("handles invoice with no line items", () => {
      const emptyInvoice: Invoice = {
        ...mockInvoice,
        line_items: [],
      };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={emptyInvoice} />);
      expect(screen.getByRole("button", { name: "Line Items" })).toBeInTheDocument();
    });

    it("handles invoice with no contact persons", () => {
      const emptyInvoice: Invoice = {
        ...mockInvoice,
        contact_persons: [],
      };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={emptyInvoice} />);
      expect(screen.getByRole("button", { name: "Contacts" })).toBeInTheDocument();
    });

    it("handles invoice with null optional fields", () => {
      const minimalInvoice: Invoice = {
        ...mockInvoice,
        issue_date: null,
        due_date: null,
        recipient_email: null,
        notes: null,
        subtotal: null,
        tax_rate: null,
        tax_amount: null,
        total: null,
        currency: null,
      };
      renderWithProviders(<InvoiceDetailPanel {...defaultProps} invoice={minimalInvoice} />);
      expect(screen.getByText("INV-2024-001")).toBeInTheDocument();
    });
  });
});
