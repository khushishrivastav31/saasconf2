import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoiceLineItemsTab from "../InvoiceLineItemsTab";
import type { InvoiceUpdate, InvoiceLineItem } from "../../../types";

const mockLineItems: InvoiceLineItem[] = [
  { description: "Conference Ticket", quantity: 2, unit_price: 500, total: 1000 },
  { description: "Workshop Add-on", quantity: 1, unit_price: 200, total: 200 },
];

const mockFormData: InvoiceUpdate = {
  invoice_number: "INV-2024-001",
  recipient_name: "Acme Corp",
  line_items: mockLineItems,
  subtotal: 1200,
  tax_rate: 10,
  tax_amount: 120,
  total: 1320,
  currency: "USD",
};

describe("InvoiceLineItemsTab", () => {
  const defaultProps = {
    formData: mockFormData,
    updateLineItem: vi.fn(),
    addLineItem: vi.fn(),
    removeLineItem: vi.fn(),
    handleTaxRateChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders table headers", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByRole("columnheader", { name: /Description/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Qty/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Unit Price/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Total/i })).toBeInTheDocument();
    });

    it("renders all line items", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByDisplayValue("Conference Ticket")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Workshop Add-on")).toBeInTheDocument();
    });

    it("renders Add Line Item button", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByText("Add Line Item")).toBeInTheDocument();
    });

    it("renders totals section", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByText("Subtotal")).toBeInTheDocument();
      expect(screen.getByText("Tax Rate (%)")).toBeInTheDocument();
      // Total appears in header and summary - use getAllByText
      const totalElements = screen.getAllByText("Total");
      expect(totalElements.length).toBeGreaterThanOrEqual(1);
    });

    it("displays correct subtotal", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByText("1200.00")).toBeInTheDocument();
    });

    it("displays correct tax amount", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByText("120.00")).toBeInTheDocument();
    });

    it("displays correct total with currency", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByText(/1320\.00/)).toBeInTheDocument();
      expect(screen.getByText(/USD/)).toBeInTheDocument();
    });

    it("renders remove button for each line item", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const removeButtons = screen.getAllByTitle("Remove");
      expect(removeButtons).toHaveLength(2);
    });
  });

  describe("line item fields", () => {
    it("renders description input for each line item", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const descriptionInputs = screen.getAllByPlaceholderText("Item description");
      expect(descriptionInputs).toHaveLength(2);
      expect(descriptionInputs[0]).toHaveValue("Conference Ticket");
      expect(descriptionInputs[1]).toHaveValue("Workshop Add-on");
    });

    it("renders quantity input for each line item", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      // First line item has quantity 2
      expect(screen.getByDisplayValue("2")).toBeInTheDocument();
      // Second line item has quantity 1
      const quantityOnes = screen.getAllByDisplayValue("1");
      expect(quantityOnes.length).toBeGreaterThanOrEqual(1);
    });

    it("renders unit price input for each line item", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByDisplayValue("500")).toBeInTheDocument();
      expect(screen.getByDisplayValue("200")).toBeInTheDocument();
    });

    it("renders line item totals", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      expect(screen.getByText("1000.00")).toBeInTheDocument();
      expect(screen.getByText("200.00")).toBeInTheDocument();
    });

    it("renders tax rate input", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const taxRateInput = screen.getByDisplayValue("10");
      expect(taxRateInput).toBeInTheDocument();
      expect(taxRateInput).toHaveAttribute("type", "number");
      expect(taxRateInput).toHaveAttribute("min", "0");
      expect(taxRateInput).toHaveAttribute("max", "100");
    });
  });

  describe("line item interactions", () => {
    it("calls updateLineItem when description changes", async () => {
      const user = userEvent.setup();
      const updateLineItem = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} updateLineItem={updateLineItem} />);

      const descriptionInput = screen.getByDisplayValue("Conference Ticket");
      await user.clear(descriptionInput);
      await user.type(descriptionInput, "New Description");

      expect(updateLineItem).toHaveBeenCalled();
      // Check that it was called with index 0 and field "description"
      const calls = updateLineItem.mock.calls;
      expect(calls.some((call: unknown[]) => call[0] === 0 && call[1] === "description")).toBe(true);
    });

    it("calls updateLineItem when quantity changes", async () => {
      const user = userEvent.setup();
      const updateLineItem = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} updateLineItem={updateLineItem} />);

      const quantityInput = screen.getByDisplayValue("2");
      await user.clear(quantityInput);
      await user.type(quantityInput, "5");

      expect(updateLineItem).toHaveBeenCalled();
      const calls = updateLineItem.mock.calls;
      expect(calls.some((call: unknown[]) => call[0] === 0 && call[1] === "quantity")).toBe(true);
    });

    it("calls updateLineItem when unit price changes", async () => {
      const user = userEvent.setup();
      const updateLineItem = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} updateLineItem={updateLineItem} />);

      const priceInput = screen.getByDisplayValue("500");
      await user.clear(priceInput);
      await user.type(priceInput, "750");

      expect(updateLineItem).toHaveBeenCalled();
      const calls = updateLineItem.mock.calls;
      expect(calls.some((call: unknown[]) => call[0] === 0 && call[1] === "unit_price")).toBe(true);
    });

    it("calls addLineItem when Add Line Item button is clicked", async () => {
      const user = userEvent.setup();
      const addLineItem = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} addLineItem={addLineItem} />);

      await user.click(screen.getByText("Add Line Item"));

      expect(addLineItem).toHaveBeenCalledTimes(1);
    });

    it("calls removeLineItem when remove button is clicked", async () => {
      const user = userEvent.setup();
      const removeLineItem = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} removeLineItem={removeLineItem} />);

      const removeButtons = screen.getAllByTitle("Remove");
      await user.click(removeButtons[0]);

      expect(removeLineItem).toHaveBeenCalledWith(0);
    });

    it("calls removeLineItem with correct index for second item", async () => {
      const user = userEvent.setup();
      const removeLineItem = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} removeLineItem={removeLineItem} />);

      const removeButtons = screen.getAllByTitle("Remove");
      await user.click(removeButtons[1]);

      expect(removeLineItem).toHaveBeenCalledWith(1);
    });
  });

  describe("tax rate interactions", () => {
    it("calls handleTaxRateChange when tax rate changes", async () => {
      const user = userEvent.setup();
      const handleTaxRateChange = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} handleTaxRateChange={handleTaxRateChange} />);

      const taxRateInput = screen.getByDisplayValue("10");
      await user.clear(taxRateInput);
      await user.type(taxRateInput, "15");

      expect(handleTaxRateChange).toHaveBeenCalled();
    });

    it("calls handleTaxRateChange with 0 when tax rate is cleared", async () => {
      const user = userEvent.setup();
      const handleTaxRateChange = vi.fn();
      render(<InvoiceLineItemsTab {...defaultProps} handleTaxRateChange={handleTaxRateChange} />);

      const taxRateInput = screen.getByDisplayValue("10");
      await user.clear(taxRateInput);

      expect(handleTaxRateChange).toHaveBeenCalledWith(0);
    });
  });

  describe("empty state", () => {
    it("renders empty table when no line items", () => {
      const emptyFormData: InvoiceUpdate = {
        ...mockFormData,
        line_items: [],
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={emptyFormData} />);

      // Table headers should still be present
      expect(screen.getByText("Description")).toBeInTheDocument();
      // But no description inputs should be rendered
      expect(screen.queryByPlaceholderText("Item description")).not.toBeInTheDocument();
    });

    it("handles undefined line_items", () => {
      const formDataWithoutItems: InvoiceUpdate = {
        ...mockFormData,
        line_items: undefined,
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithoutItems} />);

      expect(screen.getByText("Add Line Item")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Item description")).not.toBeInTheDocument();
    });
  });

  describe("default/undefined values", () => {
    it("displays 0.00 for undefined subtotal", () => {
      const formDataWithoutTotals: InvoiceUpdate = {
        ...mockFormData,
        subtotal: undefined,
        tax_amount: undefined,
        total: undefined,
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithoutTotals} />);

      // Should show 0.00 for subtotal
      const subtotalElements = screen.getAllByText("0.00");
      expect(subtotalElements.length).toBeGreaterThanOrEqual(1);
    });

    it("displays empty tax rate input when tax_rate is undefined", () => {
      const formDataWithoutTaxRate: InvoiceUpdate = {
        ...mockFormData,
        tax_rate: undefined,
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithoutTaxRate} />);

      // Tax rate input should be empty
      const taxRateInputs = screen.getAllByRole("spinbutton");
      const emptyTaxRateInput = taxRateInputs.find(input =>
        input.className.includes("w-20") && (input as HTMLInputElement).value === ""
      );
      expect(emptyTaxRateInput).toBeTruthy();
    });

    it("displays empty currency when currency is undefined", () => {
      const formDataWithoutCurrency: InvoiceUpdate = {
        ...mockFormData,
        currency: undefined,
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithoutCurrency} />);

      // Total should still be displayed, just without currency
      expect(screen.getByText("1320.00")).toBeInTheDocument();
    });
  });

  describe("input attributes", () => {
    it("has correct attributes for quantity inputs", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const quantityInput = screen.getByDisplayValue("2");
      expect(quantityInput).toHaveAttribute("type", "number");
      expect(quantityInput).toHaveAttribute("step", "1");
      expect(quantityInput).toHaveAttribute("min", "0");
    });

    it("has correct attributes for unit price inputs", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const priceInput = screen.getByDisplayValue("500");
      expect(priceInput).toHaveAttribute("type", "number");
      expect(priceInput).toHaveAttribute("step", "0.01");
      expect(priceInput).toHaveAttribute("min", "0");
    });

    it("has correct attributes for tax rate input", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const taxRateInput = screen.getByDisplayValue("10");
      expect(taxRateInput).toHaveAttribute("type", "number");
      expect(taxRateInput).toHaveAttribute("step", "0.01");
      expect(taxRateInput).toHaveAttribute("min", "0");
      expect(taxRateInput).toHaveAttribute("max", "100");
    });
  });

  describe("button types", () => {
    it("Add Line Item button has type button", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const addButton = screen.getByText("Add Line Item");
      expect(addButton).toHaveAttribute("type", "button");
    });

    it("Remove buttons have type button", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const removeButtons = screen.getAllByTitle("Remove");
      removeButtons.forEach(button => {
        expect(button).toHaveAttribute("type", "button");
      });
    });
  });

  describe("formatting", () => {
    it("formats line item totals to 2 decimal places", () => {
      const formDataWithDecimals: InvoiceUpdate = {
        ...mockFormData,
        line_items: [
          { description: "Item", quantity: 3, unit_price: 33.33, total: 99.99 },
        ],
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithDecimals} />);
      expect(screen.getByText("99.99")).toBeInTheDocument();
    });

    it("formats totals section values to 2 decimal places", () => {
      const formDataWithDecimals: InvoiceUpdate = {
        ...mockFormData,
        subtotal: 1234.567,
        tax_amount: 123.456,
        total: 1358.023,
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithDecimals} />);
      expect(screen.getByText("1234.57")).toBeInTheDocument();
      expect(screen.getByText("123.46")).toBeInTheDocument();
      expect(screen.getByText(/1358\.02/)).toBeInTheDocument();
    });
  });

  describe("multiple line items", () => {
    it("handles many line items", () => {
      const manyItems: InvoiceLineItem[] = Array.from({ length: 10 }, (_, i) => ({
        description: `Item ${i + 1}`,
        quantity: i + 1,
        unit_price: 100,
        total: (i + 1) * 100,
      }));
      const formDataWithManyItems: InvoiceUpdate = {
        ...mockFormData,
        line_items: manyItems,
      };
      render(<InvoiceLineItemsTab {...defaultProps} formData={formDataWithManyItems} />);

      const descriptionInputs = screen.getAllByPlaceholderText("Item description");
      expect(descriptionInputs).toHaveLength(10);

      const removeButtons = screen.getAllByTitle("Remove");
      expect(removeButtons).toHaveLength(10);
    });
  });

  describe("accessibility", () => {
    it("has accessible table structure", () => {
      render(<InvoiceLineItemsTab {...defaultProps} />);
      const table = screen.getByRole("table");
      expect(table).toBeInTheDocument();

      const columnheaders = screen.getAllByRole("columnheader");
      expect(columnheaders.length).toBeGreaterThanOrEqual(4);
    });
  });
});
