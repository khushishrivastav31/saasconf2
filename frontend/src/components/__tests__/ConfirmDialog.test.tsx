import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../ConfirmDialog";

const defaultProps = {
  open: true,
  title: "Delete Item",
  message: "Are you sure you want to delete this?",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <ConfirmDialog {...defaultProps} open={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title and message when open", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to delete this?"),
    ).toBeInTheDocument();
  });

  it("renders default button labels", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders custom button labels", () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, remove"
        cancelLabel="Keep it"
      />,
    );
    expect(screen.getByText("Yes, remove")).toBeInTheDocument();
    expect(screen.getByText("Keep it")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog {...defaultProps} onCancel={onCancel} />,
    );

    // The backdrop is the element with bg-black/40
    const backdrop = container.querySelector(".bg-black\\/40");
    if (backdrop) {
      await user.click(backdrop);
    }
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
