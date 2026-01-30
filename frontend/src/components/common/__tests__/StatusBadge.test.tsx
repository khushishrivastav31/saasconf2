import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatusBadge from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders 'Active' text when isActive is true", () => {
    render(<StatusBadge isActive={true} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders 'Inactive' text when isActive is false", () => {
    render(<StatusBadge isActive={false} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("renders as a span (no button) when onClick is not provided", () => {
    render(<StatusBadge isActive={true} />);
    const badge = screen.getByText("Active");
    expect(badge.tagName).toBe("SPAN");
  });

  it("renders as a button when onClick is provided", () => {
    render(<StatusBadge isActive={true} onClick={() => {}} />);
    const badge = screen.getByText("Active");
    expect(badge.tagName).toBe("BUTTON");
  });

  it("calls onClick with toggled state when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatusBadge isActive={true} onClick={onClick} />);

    await user.click(screen.getByText("Active"));
    expect(onClick).toHaveBeenCalledWith(false);
  });

  it("calls onClick with true when inactive badge is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatusBadge isActive={false} onClick={onClick} />);

    await user.click(screen.getByText("Inactive"));
    expect(onClick).toHaveBeenCalledWith(true);
  });

  it("has green styling when active", () => {
    render(<StatusBadge isActive={true} />);
    const badge = screen.getByText("Active");
    expect(badge.className).toContain("bg-green-100");
    expect(badge.className).toContain("text-green-800");
  });

  it("has red styling when inactive", () => {
    render(<StatusBadge isActive={false} />);
    const badge = screen.getByText("Inactive");
    expect(badge.className).toContain("bg-red-100");
    expect(badge.className).toContain("text-red-800");
  });
});
