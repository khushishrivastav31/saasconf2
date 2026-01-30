import { describe, it, expect } from "vitest";
import { validatePhone, isValidPhone } from "../validators";

describe("validatePhone", () => {
  it("returns null for empty string (optional field)", () => {
    expect(validatePhone("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(validatePhone(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(validatePhone(undefined)).toBeNull();
  });

  it("accepts digits-only number", () => {
    expect(validatePhone("00491234566")).toBeNull();
  });

  it("accepts number starting with +", () => {
    expect(validatePhone("+491234545")).toBeNull();
  });

  it("rejects letters", () => {
    expect(validatePhone("abc123")).not.toBeNull();
  });

  it("rejects spaces", () => {
    expect(validatePhone("+49 123 456")).not.toBeNull();
  });

  it("rejects dashes", () => {
    expect(validatePhone("+49-123-456")).not.toBeNull();
  });

  it("rejects parentheses", () => {
    expect(validatePhone("(049)123456")).not.toBeNull();
  });

  it("returns a descriptive error message", () => {
    const result = validatePhone("bad-phone");
    expect(result).toContain("Phone number must contain only digits");
  });
});

describe("isValidPhone", () => {
  it("returns true for valid phone numbers", () => {
    expect(isValidPhone("+491234545")).toBe(true);
    expect(isValidPhone("00491234566")).toBe(true);
    expect(isValidPhone("")).toBe(true);
    expect(isValidPhone(null)).toBe(true);
  });

  it("returns false for invalid phone numbers", () => {
    expect(isValidPhone("abc")).toBe(false);
    expect(isValidPhone("+49 123")).toBe(false);
  });
});
