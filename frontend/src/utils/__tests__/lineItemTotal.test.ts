import { describe, it, expect } from 'vitest';
import { lineItemTotal } from '../lineItemTotal';

describe('lineItemTotal', () => {
  it('computes a plain total with no discount', () => {
    expect(lineItemTotal(2, 100)).toBe(200);
  });

  it('applies a fixed amount discount (existing behaviour, no regression)', () => {
    expect(lineItemTotal(1, 100, 25)).toBe(75);
    expect(lineItemTotal(2, 100, 50)).toBe(150);
  });

  it('applies a percentage discount', () => {
    expect(lineItemTotal(2, 100, 0, 10)).toBe(180);
    expect(lineItemTotal(1, 200, 0, 25)).toBe(150);
  });

  it('lets the percentage take precedence when both are somehow present', () => {
    // Callers keep these mutually exclusive, but the formula must be deterministic.
    expect(lineItemTotal(1, 100, 90, 10)).toBe(90);
  });

  it('clamps a negative result to zero', () => {
    expect(lineItemTotal(1, 100, 150)).toBe(0);
  });

  it('treats a null/zero percentage as no percentage discount', () => {
    expect(lineItemTotal(1, 100, 40, null)).toBe(60);
    expect(lineItemTotal(1, 100, 40, 0)).toBe(60);
  });
});
