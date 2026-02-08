import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactPersonList from "../ContactPersonList";
import type { LocationContactPerson } from "../../types";

// Mock the RichTextEditor component
vi.mock("../common/RichTextEditor", () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

// Mock the RichTextDisplay component
vi.mock("../common/RichTextDisplay", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="rich-text-display">{content}</div>
  ),
}));

// Mock the validatePhone function
vi.mock("../../utils/validators", () => ({
  validatePhone: vi.fn((phone: string) => {
    if (!phone) return null;
    // Simple validation: must start with + or 00
    if (!phone.startsWith("+") && !phone.startsWith("00")) {
      return "Phone must start with + or 00";
    }
    return null;
  }),
}));

const mockContacts: LocationContactPerson[] = [
  {
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    phone: "+491234567890",
    comment: "Primary contact",
  },
  {
    first_name: "Jane",
    last_name: "Smith",
    email: "jane.smith@example.com",
    phone: "",
    comment: "",
  },
];

const emptyContact: LocationContactPerson = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  comment: "",
};

describe("ContactPersonList", () => {
  const mockSetNewContact = vi.fn();
  const mockAddContact = vi.fn();
  const mockRemoveContact = vi.fn();
  const mockUpdateContact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders contact persons list when contacts exist", () => {
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      expect(screen.getByText("Contact Persons")).toBeInTheDocument();
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.getByText("john.doe@example.com")).toBeInTheDocument();
      expect(screen.getByText("+491234567890")).toBeInTheDocument();
    });

    it("displays contact count badge", () => {
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("does not render contacts section when no contacts exist", () => {
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      expect(screen.queryByText("Contact Persons")).not.toBeInTheDocument();
    });

    it("renders the Add New Contact form", () => {
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      expect(screen.getByText("Add New Contact")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("First Name *")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Last Name *")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("+491234545 or 00491234566")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "+ Add Contact" })
      ).toBeInTheDocument();
    });

    it("displays contact initials in avatar", () => {
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      expect(screen.getByText("JD")).toBeInTheDocument();
      expect(screen.getByText("JS")).toBeInTheDocument();
    });

    it("displays contact comment using RichTextDisplay", () => {
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      expect(screen.getByTestId("rich-text-display")).toBeInTheDocument();
      expect(screen.getByText("Primary contact")).toBeInTheDocument();
    });

    it("shows edit button when updateContact is provided", () => {
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      expect(editButtons).toHaveLength(2);
    });

    it("does not show edit button when updateContact is not provided", () => {
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      expect(screen.queryByTitle("Edit contact")).not.toBeInTheDocument();
    });
  });

  describe("add contact functionality", () => {
    it("calls setNewContact when first name is changed", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const firstNameInput = screen.getByPlaceholderText("First Name *");
      await user.type(firstNameInput, "A");

      expect(mockSetNewContact).toHaveBeenCalledWith({
        ...emptyContact,
        first_name: "A",
      });
    });

    it("calls setNewContact when last name is changed", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const lastNameInput = screen.getByPlaceholderText("Last Name *");
      await user.type(lastNameInput, "B");

      expect(mockSetNewContact).toHaveBeenCalledWith({
        ...emptyContact,
        last_name: "B",
      });
    });

    it("calls setNewContact when email is changed", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const emailInput = screen.getByPlaceholderText("Email");
      await user.type(emailInput, "t");

      expect(mockSetNewContact).toHaveBeenCalledWith({
        ...emptyContact,
        email: "t",
      });
    });

    it("calls setNewContact when phone is changed", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const phoneInput = screen.getByPlaceholderText(
        "+491234545 or 00491234566"
      );
      await user.type(phoneInput, "+");

      expect(mockSetNewContact).toHaveBeenCalledWith({
        ...emptyContact,
        phone: "+",
      });
    });

    it("calls addContact when add button is clicked with valid data", async () => {
      const user = userEvent.setup();
      const validNewContact: LocationContactPerson = {
        first_name: "Test",
        last_name: "User",
        email: "",
        phone: "",
        comment: "",
      };

      render(
        <ContactPersonList
          contacts={[]}
          newContact={validNewContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const addButton = screen.getByRole("button", { name: "+ Add Contact" });
      await user.click(addButton);

      expect(mockAddContact).toHaveBeenCalledTimes(1);
    });

    it("disables add button when first name is empty", () => {
      const invalidNewContact: LocationContactPerson = {
        first_name: "",
        last_name: "User",
        email: "",
        phone: "",
        comment: "",
      };

      render(
        <ContactPersonList
          contacts={[]}
          newContact={invalidNewContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const addButton = screen.getByRole("button", { name: "+ Add Contact" });
      expect(addButton).toBeDisabled();
    });

    it("disables add button when last name is empty", () => {
      const invalidNewContact: LocationContactPerson = {
        first_name: "Test",
        last_name: "",
        email: "",
        phone: "",
        comment: "",
      };

      render(
        <ContactPersonList
          contacts={[]}
          newContact={invalidNewContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const addButton = screen.getByRole("button", { name: "+ Add Contact" });
      expect(addButton).toBeDisabled();
    });

    it("disables add button when phone has validation error", async () => {
      const user = userEvent.setup();
      const contactWithPhone: LocationContactPerson = {
        first_name: "Test",
        last_name: "User",
        email: "",
        phone: "",
        comment: "",
      };

      render(
        <ContactPersonList
          contacts={[]}
          newContact={contactWithPhone}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      // Type an invalid phone number (doesn't start with + or 00)
      const phoneInput = screen.getByPlaceholderText(
        "+491234545 or 00491234566"
      );
      await user.type(phoneInput, "123456");

      const addButton = screen.getByRole("button", { name: "+ Add Contact" });
      expect(addButton).toBeDisabled();
    });

    it("shows phone validation error message", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={[]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const phoneInput = screen.getByPlaceholderText(
        "+491234545 or 00491234566"
      );
      await user.type(phoneInput, "invalid");

      expect(
        screen.getByText("Phone must start with + or 00")
      ).toBeInTheDocument();
    });
  });

  describe("remove contact functionality", () => {
    it("calls removeContact when remove button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const removeButtons = screen.getAllByTitle("Remove contact");
      await user.click(removeButtons[0]);

      expect(mockRemoveContact).toHaveBeenCalledWith(0);
    });

    it("calls removeContact with correct index for second contact", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const removeButtons = screen.getAllByTitle("Remove contact");
      await user.click(removeButtons[1]);

      expect(mockRemoveContact).toHaveBeenCalledWith(1);
    });
  });

  describe("edit contact functionality", () => {
    it("enters edit mode when edit button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      // Should show Save and Cancel buttons in edit mode
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" })
      ).toBeInTheDocument();
    });

    it("populates edit form with contact data", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      // Check that edit form inputs have the contact's values
      const firstNameInputs = screen.getAllByPlaceholderText("First Name *");
      const editFirstNameInput = firstNameInputs.find(
        (input) => (input as HTMLInputElement).value === "John"
      );
      expect(editFirstNameInput).toBeInTheDocument();

      const lastNameInputs = screen.getAllByPlaceholderText("Last Name *");
      const editLastNameInput = lastNameInputs.find(
        (input) => (input as HTMLInputElement).value === "Doe"
      );
      expect(editLastNameInput).toBeInTheDocument();
    });

    it("cancels edit mode when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      // Should exit edit mode - no Save/Cancel buttons
      expect(
        screen.queryByRole("button", { name: "Save" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cancel" })
      ).not.toBeInTheDocument();
    });

    it("calls updateContact when Save button is clicked with valid data", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);

      expect(mockUpdateContact).toHaveBeenCalledWith(0, {
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "+491234567890",
        comment: "Primary contact",
      });
    });

    it("allows editing contact fields", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      // Find the edit form first name input and modify it
      const firstNameInputs = screen.getAllByPlaceholderText("First Name *");
      const editFirstNameInput = firstNameInputs.find(
        (input) => (input as HTMLInputElement).value === "John"
      ) as HTMLInputElement;

      await user.clear(editFirstNameInput);
      await user.type(editFirstNameInput, "Johnny");

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);

      expect(mockUpdateContact).toHaveBeenCalledWith(0, {
        first_name: "Johnny",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "+491234567890",
        comment: "Primary contact",
      });
    });

    it("disables Save button when first name is empty in edit mode", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      const firstNameInputs = screen.getAllByPlaceholderText("First Name *");
      const editFirstNameInput = firstNameInputs.find(
        (input) => (input as HTMLInputElement).value === "John"
      ) as HTMLInputElement;

      await user.clear(editFirstNameInput);

      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();
    });

    it("disables Save button when last name is empty in edit mode", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      const lastNameInputs = screen.getAllByPlaceholderText("Last Name *");
      const editLastNameInput = lastNameInputs.find(
        (input) => (input as HTMLInputElement).value === "Doe"
      ) as HTMLInputElement;

      await user.clear(editLastNameInput);

      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();
    });

    it("shows phone validation error in edit mode", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      // Find the phone input in edit mode
      const phoneInputs = screen.getAllByPlaceholderText(
        "+491234545 or 00491234566"
      );
      const editPhoneInput = phoneInputs.find(
        (input) => (input as HTMLInputElement).value === "+491234567890"
      ) as HTMLInputElement;

      await user.clear(editPhoneInput);
      await user.type(editPhoneInput, "invalid");

      expect(
        screen.getByText("Phone must start with + or 00")
      ).toBeInTheDocument();
    });

    it("disables Save button when phone has validation error in edit mode", async () => {
      const user = userEvent.setup();
      render(
        <ContactPersonList
          contacts={mockContacts}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      const editButtons = screen.getAllByTitle("Edit contact");
      await user.click(editButtons[0]);

      const phoneInputs = screen.getAllByPlaceholderText(
        "+491234545 or 00491234566"
      );
      const editPhoneInput = phoneInputs.find(
        (input) => (input as HTMLInputElement).value === "+491234567890"
      ) as HTMLInputElement;

      await user.clear(editPhoneInput);
      await user.type(editPhoneInput, "invalid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();
    });
  });

  describe("edge cases", () => {
    it("handles contact with missing optional fields", () => {
      const minimalContact: LocationContactPerson = {
        first_name: "Minimal",
        last_name: "Contact",
      };

      render(
        <ContactPersonList
          contacts={[minimalContact]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      expect(screen.getByText("Minimal Contact")).toBeInTheDocument();
      expect(screen.getByText("MC")).toBeInTheDocument();
    });

    it("handles empty first_name or last_name gracefully for initials", () => {
      const partialContact: LocationContactPerson = {
        first_name: "",
        last_name: "Only",
        email: "",
        phone: "",
        comment: "",
      };

      render(
        <ContactPersonList
          contacts={[partialContact]}
          newContact={emptyContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
          updateContact={mockUpdateContact}
        />
      );

      // Should show just the last name initial
      expect(screen.getByText("O")).toBeInTheDocument();
    });

    it("handles whitespace-only names as invalid", () => {
      const whitespaceContact: LocationContactPerson = {
        first_name: "   ",
        last_name: "User",
        email: "",
        phone: "",
        comment: "",
      };

      render(
        <ContactPersonList
          contacts={[]}
          newContact={whitespaceContact}
          setNewContact={mockSetNewContact}
          addContact={mockAddContact}
          removeContact={mockRemoveContact}
        />
      );

      const addButton = screen.getByRole("button", { name: "+ Add Contact" });
      expect(addButton).toBeDisabled();
    });
  });
});
