import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatCurrency,
  getCurrencyFormat,
  formatNumberForCurrency,
  parseFormattedNumber,
  parseFormattedCurrency,
  defaultNumberFormat,
  CURRENCY_FORMATS,
} from "../formatCurrency";

describe("formatNumber", () => {
  it("formats number with default options (US style)", () => {
    expect(formatNumber(1234.56)).toBe("1,234.56");
    expect(formatNumber(1234567.89)).toBe("1,234,567.89");
  });

  it("formats with European style (comma decimal, period thousands)", () => {
    expect(
      formatNumber(1234567.89, {
        decimalSeparator: ",",
        thousandsSeparator: ".",
        decimalPlaces: 2,
      })
    ).toBe("1.234.567,89");
  });

  it("formats with space as thousands separator", () => {
    expect(
      formatNumber(1234567.89, {
        thousandsSeparator: " ",
        decimalPlaces: 2,
      })
    ).toBe("1 234 567.89");
  });

  it("formats without thousands separator", () => {
    expect(
      formatNumber(1234567.89, {
        thousandsSeparator: "",
        decimalPlaces: 2,
      })
    ).toBe("1234567.89");
  });

  it("respects decimal places setting", () => {
    expect(formatNumber(1234.5678, { decimalPlaces: 0 })).toBe("1,235");
    expect(formatNumber(1234.5678, { decimalPlaces: 1 })).toBe("1,234.6");
    expect(formatNumber(1234.5678, { decimalPlaces: 2 })).toBe("1,234.57");
    expect(formatNumber(1234.5678, { decimalPlaces: 3 })).toBe("1,234.568");
    expect(formatNumber(1234.5678, { decimalPlaces: 4 })).toBe("1,234.5678");
  });

  it("handles string input", () => {
    expect(formatNumber("1234.56")).toBe("1,234.56");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatNumber(null)).toBe("");
    expect(formatNumber(undefined)).toBe("");
    expect(formatNumber("")).toBe("");
  });

  it("returns empty string for NaN", () => {
    expect(formatNumber("not a number")).toBe("");
  });

  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0.00");
    expect(formatNumber(0, { decimalPlaces: 0 })).toBe("0");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-1234.56)).toBe("-1,234.56");
  });

  it("handles small numbers without thousands separator", () => {
    expect(formatNumber(123.45)).toBe("123.45");
  });
});

describe("getCurrencyFormat", () => {
  it("returns correct format for EUR (European style)", () => {
    const format = getCurrencyFormat("EUR");
    expect(format.decimalSeparator).toBe(",");
    expect(format.thousandsSeparator).toBe(".");
    expect(format.currencyPosition).toBe("after");
    expect(format.decimalPlaces).toBe(2);
  });

  it("returns correct format for USD (US style)", () => {
    const format = getCurrencyFormat("USD");
    expect(format.decimalSeparator).toBe(".");
    expect(format.thousandsSeparator).toBe(",");
    expect(format.currencyPosition).toBe("before");
    expect(format.decimalPlaces).toBe(2);
  });

  it("returns correct format for JPY (no decimals)", () => {
    const format = getCurrencyFormat("JPY");
    expect(format.decimalPlaces).toBe(0);
  });

  it("returns default format for unknown currency", () => {
    expect(getCurrencyFormat("XYZ")).toEqual(defaultNumberFormat);
  });

  it("returns default format for null/undefined", () => {
    expect(getCurrencyFormat(null)).toEqual(defaultNumberFormat);
    expect(getCurrencyFormat(undefined)).toEqual(defaultNumberFormat);
  });

  it("handles lowercase currency codes", () => {
    expect(getCurrencyFormat("eur")).toEqual(CURRENCY_FORMATS.EUR);
  });
});

describe("formatCurrency", () => {
  it("formats EUR with European style (symbol after)", () => {
    expect(formatCurrency(1234.56, "EUR")).toBe("1.234,56 EUR");
  });

  it("formats USD with US style (symbol before)", () => {
    expect(formatCurrency(1234.56, "USD")).toBe("USD 1,234.56");
  });

  it("formats JPY without decimals", () => {
    expect(formatCurrency(1234.56, "JPY")).toBe("JPY 1,235");
  });

  it("formats SEK with space thousands separator", () => {
    expect(formatCurrency(1234567.89, "SEK")).toBe("1 234 567,89 SEK");
  });

  it("formats CHF with apostrophe thousands separator", () => {
    expect(formatCurrency(1234567.89, "CHF")).toBe("CHF 1'234'567,89");
  });

  it("returns just number when no currency provided", () => {
    expect(formatCurrency(1234.56, null)).toBe("1,234.56");
    expect(formatCurrency(1234.56, undefined)).toBe("1,234.56");
    expect(formatCurrency(1234.56, "")).toBe("1,234.56");
  });

  it("returns empty string for null/undefined values", () => {
    expect(formatCurrency(null, "EUR")).toBe("");
    expect(formatCurrency(undefined, "EUR")).toBe("");
  });
});

describe("formatNumberForCurrency", () => {
  it("formats number using EUR format without currency code", () => {
    expect(formatNumberForCurrency(1234.56, "EUR")).toBe("1.234,56");
  });

  it("formats number using USD format without currency code", () => {
    expect(formatNumberForCurrency(1234.56, "USD")).toBe("1,234.56");
  });

  it("formats number using JPY format (no decimals)", () => {
    expect(formatNumberForCurrency(1234.56, "JPY")).toBe("1,235");
  });
});

describe("parseFormattedNumber", () => {
  it("parses US formatted number", () => {
    expect(parseFormattedNumber("1,234.56")).toBe(1234.56);
    expect(parseFormattedNumber("1,234,567.89")).toBe(1234567.89);
  });

  it("parses European formatted number", () => {
    expect(
      parseFormattedNumber("1.234,56", {
        decimalSeparator: ",",
        thousandsSeparator: ".",
      })
    ).toBe(1234.56);
    expect(
      parseFormattedNumber("1.234.567,89", {
        decimalSeparator: ",",
        thousandsSeparator: ".",
      })
    ).toBe(1234567.89);
  });

  it("parses number with space thousands separator", () => {
    expect(
      parseFormattedNumber("1 234 567.89", {
        thousandsSeparator: " ",
      })
    ).toBe(1234567.89);
  });

  it("parses number without thousands separator", () => {
    expect(
      parseFormattedNumber("1234567.89", {
        thousandsSeparator: "",
      })
    ).toBe(1234567.89);
  });

  it("returns NaN for invalid input", () => {
    expect(parseFormattedNumber("")).toBeNaN();
    expect(parseFormattedNumber("abc")).toBeNaN();
  });

  it("handles negative numbers", () => {
    expect(parseFormattedNumber("-1,234.56")).toBe(-1234.56);
  });
});

describe("parseFormattedCurrency", () => {
  it("parses EUR formatted currency string", () => {
    expect(parseFormattedCurrency("1.234,56 EUR", "EUR")).toBe(1234.56);
  });

  it("parses USD formatted currency string", () => {
    expect(parseFormattedCurrency("USD 1,234.56", "USD")).toBe(1234.56);
  });

  it("parses JPY formatted currency string (no decimals)", () => {
    expect(parseFormattedCurrency("JPY 1,235", "JPY")).toBe(1235);
  });

  it("returns NaN for invalid input", () => {
    expect(parseFormattedCurrency("", "EUR")).toBeNaN();
  });
});
