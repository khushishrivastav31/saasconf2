import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "../Modal";

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>Body</p>
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title and children when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Modal">
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByText("My Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Body</p>
      </Modal>,
    );

    // The close button is a button with an SVG inside the header
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies custom size class", () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}} title="Test" size="max-w-lg">
        <p>Body</p>
      </Modal>,
    );
    const dialog = container.querySelector(".max-w-lg");
    expect(dialog).toBeInTheDocument();
  });

  it("applies default size class when not specified", () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>Body</p>
      </Modal>,
    );
    const dialog = container.querySelector(".max-w-2xl");
    expect(dialog).toBeInTheDocument();
  });
});
