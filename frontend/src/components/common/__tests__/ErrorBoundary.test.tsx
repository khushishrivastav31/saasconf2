import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "../ErrorBoundary";

// Mock Sentry so tests don't require a real DSN
vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

// Suppress React's noisy error boundary console output during tests
const originalError = console.error;
beforeEach(() => {
  vi.clearAllMocks();
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (msg.includes("Error: Uncaught") || msg.includes("The above error")) return;
    originalError(...args);
  };
  return () => {
    console.error = originalError;
  };
});

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <p>All good</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <p>Hello</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders default fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred. Please try refreshing the page."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom error view</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom error view")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("reports error to Sentry", async () => {
    const Sentry = await import("@sentry/react");
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Test explosion" }),
      expect.objectContaining({ extra: expect.objectContaining({ componentStack: expect.any(String) }) }),
    );
  });

  it("recovers when 'Try again' is clicked and child no longer throws", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Re-render with a non-throwing child before clicking retry
    rerender(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
