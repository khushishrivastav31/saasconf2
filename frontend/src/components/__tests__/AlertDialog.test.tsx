import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AlertDialog from "../AlertDialog";

describe("AlertDialog", () => {
  const defaultProps = {
    open: true,
    title: "Error Occurred",
    message: "Something went wrong.",
    onClose: vi.fn(),
  };

  it("renders nothing when open is false", () => {
    const { container } = render(
      <AlertDialog {...defaultProps} open={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and message when open", () => {
    render(<AlertDialog {...defaultProps} />);
    expect(screen.getByText("Error Occurred")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("renders default OK button", () => {
    render(<AlertDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("renders custom button label", () => {
    render(<AlertDialog {...defaultProps} buttonLabel="Got it" />);
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("calls onClose when button is clicked", () => {
    const onClose = vi.fn();
    render(<AlertDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <AlertDialog {...defaultProps} onClose={onClose} />
    );
    const backdrop = container.querySelector(".bg-black\\/40");
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<AlertDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Enter key is pressed", () => {
    const onClose = vi.fn();
    render(<AlertDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["error", "warning", "info", "success"] as const)(
    "renders %s variant",
    (variant) => {
      render(<AlertDialog {...defaultProps} variant={variant} />);
      expect(screen.getByText("Error Occurred")).toBeInTheDocument();
    }
  );
});
