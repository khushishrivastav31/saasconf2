import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "../Toast";

function TestConsumer() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast("Error message", "error")}>Show Error</button>
      <button onClick={() => showToast("Success message", "success")}>Show Success</button>
      <button onClick={() => showToast("Warning message", "warning")}>Show Warning</button>
      <button onClick={() => showToast("Info message", "info")}>Show Info</button>
      <button onClick={() => showToast("Default type")}>Show Default</button>
    </div>
  );
}

describe("Toast", () => {
  describe("useToast", () => {
    it("throws when used outside ToastProvider", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<TestConsumer />)).toThrow(
        "useToast must be used within a ToastProvider"
      );
      spy.mockRestore();
    });
  });

  describe("ToastProvider", () => {
    it("renders children", () => {
      render(
        <ToastProvider>
          <div>Hello</div>
        </ToastProvider>
      );
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("shows error toast when triggered", () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Error"));
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });

    it("shows success toast", () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Success"));
      expect(screen.getByText("Success message")).toBeInTheDocument();
    });

    it("shows warning toast", () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Warning"));
      expect(screen.getByText("Warning message")).toBeInTheDocument();
    });

    it("shows info toast", () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Info"));
      expect(screen.getByText("Info message")).toBeInTheDocument();
    });

    it("defaults to error type", () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Default"));
      expect(screen.getByText("Default type")).toBeInTheDocument();
    });

    it("shows multiple toasts", () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Error"));
      fireEvent.click(screen.getByText("Show Success"));
      expect(screen.getByText("Error message")).toBeInTheDocument();
      expect(screen.getByText("Success message")).toBeInTheDocument();
    });

    it("dismisses toast when close button is clicked", () => {
      vi.useFakeTimers();

      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Error"));
      expect(screen.getByText("Error message")).toBeInTheDocument();

      // Click the dismiss button (the X button in the toast)
      const dismissButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg.w-4")
      );
      fireEvent.click(dismissButtons[0]);

      // Wait for the exit animation (300ms)
      act(() => { vi.advanceTimersByTime(300); });

      expect(screen.queryByText("Error message")).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it("auto-dismisses toast after timeout", () => {
      vi.useFakeTimers();

      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Error"));
      expect(screen.getByText("Error message")).toBeInTheDocument();

      // Advance past TOAST_DURATION (5000ms) + exit animation (300ms)
      act(() => { vi.advanceTimersByTime(5300); });

      expect(screen.queryByText("Error message")).not.toBeInTheDocument();

      vi.useRealTimers();
    });
  });
});
