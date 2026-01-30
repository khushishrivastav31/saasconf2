import { describe, it, expect } from "vitest";
import { parseApiError } from "../apiError";

describe("parseApiError", () => {
  it("returns string detail from Axios-style error", () => {
    const error = { response: { data: { detail: "Email already exists" } } };
    expect(parseApiError(error)).toBe("Email already exists");
  });

  it("joins validation error array", () => {
    const error = {
      response: {
        data: {
          detail: [
            { msg: "field required", loc: ["body", "name"] },
            { msg: "invalid email", loc: ["body", "email"] },
          ],
        },
      },
    };
    expect(parseApiError(error)).toBe("field required, invalid email");
  });

  it("falls back to 'Validation error' for array items without msg", () => {
    const error = {
      response: { data: { detail: [{ loc: ["body", "name"] }] } },
    };
    expect(parseApiError(error)).toBe("Validation error");
  });

  it("returns Error.message for standard Error objects", () => {
    const error = new Error("Something broke");
    expect(parseApiError(error)).toBe("Something broke");
  });

  it("returns default fallback for unknown values", () => {
    expect(parseApiError(null)).toBe("An unexpected error occurred");
    expect(parseApiError(undefined)).toBe("An unexpected error occurred");
    expect(parseApiError(42)).toBe("An unexpected error occurred");
  });

  it("uses custom fallback message", () => {
    expect(parseApiError("string-error", "Custom fallback")).toBe(
      "Custom fallback",
    );
  });

  it("handles Axios error with no detail", () => {
    const error = { response: { data: {} } };
    expect(parseApiError(error)).toBe("An unexpected error occurred");
  });

  it("handles Axios error with no data", () => {
    const error = { response: {} };
    expect(parseApiError(error)).toBe("An unexpected error occurred");
  });
});
