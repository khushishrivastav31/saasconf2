import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner, ButtonSpinner } from "../LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders a spinner element", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});

describe("ButtonSpinner", () => {
  it("renders default 'Saving...' label", () => {
    render(<ButtonSpinner />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<ButtonSpinner label="Loading..." />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("includes a spinner element", () => {
    const { container } = render(<ButtonSpinner />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});
