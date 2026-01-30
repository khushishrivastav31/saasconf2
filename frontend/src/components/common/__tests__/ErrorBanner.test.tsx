import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBanner, SuccessBanner } from "../ErrorBanner";

describe("ErrorBanner", () => {
  it("renders the error message", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders nothing when message is null", () => {
    const { container } = render(<ErrorBanner message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies red styling", () => {
    render(<ErrorBanner message="Error!" />);
    const banner = screen.getByText("Error!");
    expect(banner.className).toContain("bg-red-50");
    expect(banner.className).toContain("text-red-700");
  });
});

describe("SuccessBanner", () => {
  it("renders the success message", () => {
    render(<SuccessBanner message="Operation completed" />);
    expect(screen.getByText("Operation completed")).toBeInTheDocument();
  });

  it("renders nothing when message is null", () => {
    const { container } = render(<SuccessBanner message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies green styling", () => {
    render(<SuccessBanner message="Success!" />);
    const banner = screen.getByText("Success!");
    expect(banner.className).toContain("bg-green-50");
    expect(banner.className).toContain("text-green-700");
  });
});
