import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModalFooter from "../ModalFooter";

describe("ModalFooter", () => {
  describe("rendering", () => {
    it("renders Cancel and Submit buttons", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      expect(
        screen.getByRole("button", { name: "Cancel" })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("renders default submit label as Save", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("renders custom submit label when provided", () => {
      render(
        <ModalFooter
          onCancel={() => {}}
          isLoading={false}
          submitLabel="Create"
        />
      );

      expect(
        screen.getByRole("button", { name: "Create" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" })
      ).not.toBeInTheDocument();
    });
  });

  describe("button types", () => {
    it("Cancel button has type button", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      expect(cancelButton).toHaveAttribute("type", "button");
    });

    it("Submit button has type submit", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      const submitButton = screen.getByRole("button", { name: "Save" });
      expect(submitButton).toHaveAttribute("type", "submit");
    });
  });

  describe("onCancel callback", () => {
    it("calls onCancel when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(<ModalFooter onCancel={onCancel} isLoading={false} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("loading state", () => {
    it("disables submit button when isLoading is true", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={true} />);

      // When loading, the button shows "Saving..." with a spinner
      const submitButton = screen.getByRole("button", { name: /Saving/i });
      expect(submitButton).toBeDisabled();
    });

    it("shows spinner and Saving text when isLoading is true", () => {
      const { container } = render(<ModalFooter onCancel={() => {}} isLoading={true} />);

      // The submit button should show "Saving..." text when loading
      expect(
        screen.getByRole("button", { name: /Saving/i })
      ).toBeInTheDocument();
      // Should have a spinner
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("submit button is enabled when isLoading is false", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      const submitButton = screen.getByRole("button", { name: "Save" });
      expect(submitButton).not.toBeDisabled();
    });

    it("Cancel button remains enabled when isLoading is true", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={true} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      expect(cancelButton).not.toBeDisabled();
    });
  });

  describe("styling", () => {
    it("applies correct styling to Cancel button", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      expect(cancelButton).toHaveClass("border", "border-gray-300", "bg-white");
    });

    it("applies correct styling to Submit button", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={false} />);

      const submitButton = screen.getByRole("button", { name: "Save" });
      expect(submitButton).toHaveClass("bg-primary-600", "text-white");
    });

    it("applies disabled opacity when loading", () => {
      render(<ModalFooter onCancel={() => {}} isLoading={true} />);

      const buttons = screen.getAllByRole("button");
      const submitBtn = buttons.find((btn) => btn.getAttribute("type") === "submit");
      expect(submitBtn).toHaveClass("disabled:opacity-50");
    });
  });

  describe("custom submit labels", () => {
    it("renders Update as submit label", () => {
      render(
        <ModalFooter
          onCancel={() => {}}
          isLoading={false}
          submitLabel="Update"
        />
      );

      expect(
        screen.getByRole("button", { name: "Update" })
      ).toBeInTheDocument();
    });

    it("renders Delete as submit label", () => {
      render(
        <ModalFooter
          onCancel={() => {}}
          isLoading={false}
          submitLabel="Delete"
        />
      );

      expect(
        screen.getByRole("button", { name: "Delete" })
      ).toBeInTheDocument();
    });

    it("renders Submit as submit label", () => {
      render(
        <ModalFooter
          onCancel={() => {}}
          isLoading={false}
          submitLabel="Submit"
        />
      );

      expect(
        screen.getByRole("button", { name: "Submit" })
      ).toBeInTheDocument();
    });
  });
});
