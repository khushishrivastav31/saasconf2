import { describe, it, expect } from 'vitest';
import {
  calculateOrderLineItems,
  groupLineItems,
  calculateOrderTotals,
  formatCurrency,
} from '../orderCalculations';

describe('orderCalculations', () => {
  const options = [
    { optionId: 'opt1', optionName: 'Full Pass', unitPrice: 100 },
    { optionId: 'opt2', optionName: 'Workshop', unitPrice: 50 },
  ];

  describe('calculateOrderLineItems', () => {
    it('returns line items without discount when discount is null', () => {
      const items = calculateOrderLineItems(options, 'period1', null);
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        optionId: 'opt1',
        optionName: 'Full Pass',
        quantity: 1,
        unitPrice: 100,
        discountAmount: 0,
        lineTotal: 100,
      });
    });

    it('applies percentage discount to applicable options', () => {
      const discount = {
        valid: true,
        discount_type: 'percentage' as const,
        discount_value: 10,
        applicable_option_ids: [],
        applicable_period_ids: [],
        code: 'TEST10',
        max_uses: null,
        current_uses: 0,
      };
      const items = calculateOrderLineItems(options, 'period1', discount);
      expect(items[0].discountAmount).toBe(10); // 10% of 100
      expect(items[0].lineTotal).toBe(90);
      expect(items[1].discountAmount).toBe(5); // 10% of 50
    });

    it('applies fixed discount capped at unit price', () => {
      const discount = {
        valid: true,
        discount_type: 'fixed' as const,
        discount_value: 200,
        applicable_option_ids: [],
        applicable_period_ids: [],
        code: 'BIGFIX',
        max_uses: null,
        current_uses: 0,
      };
      const items = calculateOrderLineItems(options, 'period1', discount);
      expect(items[0].discountAmount).toBe(100); // capped at unitPrice
      expect(items[1].discountAmount).toBe(50);
    });

    it('respects option restrictions', () => {
      const discount = {
        valid: true,
        discount_type: 'percentage' as const,
        discount_value: 20,
        applicable_option_ids: ['opt1'],
        applicable_period_ids: [],
        code: 'OPT1ONLY',
        max_uses: null,
        current_uses: 0,
      };
      const items = calculateOrderLineItems(options, 'period1', discount);
      expect(items[0].discountAmount).toBe(20); // applies
      expect(items[1].discountAmount).toBe(0); // not in allowed list
    });

    it('respects period restrictions', () => {
      const discount = {
        valid: true,
        discount_type: 'percentage' as const,
        discount_value: 20,
        applicable_option_ids: [],
        applicable_period_ids: ['period2'],
        code: 'P2ONLY',
        max_uses: null,
        current_uses: 0,
      };
      const items = calculateOrderLineItems(options, 'period1', discount);
      expect(items[0].discountAmount).toBe(0); // wrong period
    });

    it('skips invalid discount', () => {
      const discount = {
        valid: false,
        discount_type: 'percentage' as const,
        discount_value: 50,
        applicable_option_ids: [],
        applicable_period_ids: [],
        code: 'INVALID',
        max_uses: null,
        current_uses: 0,
      };
      const items = calculateOrderLineItems(options, 'period1', discount);
      expect(items[0].discountAmount).toBe(0);
    });
  });

  describe('groupLineItems', () => {
    it('groups items with same option/price/discount', () => {
      const items = [
        {
          optionId: 'opt1',
          optionName: 'Full Pass',
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
          lineTotal: 100,
        },
        {
          optionId: 'opt1',
          optionName: 'Full Pass',
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
          lineTotal: 100,
        },
      ];
      const grouped = groupLineItems(items);
      expect(grouped).toHaveLength(1);
      expect(grouped[0].quantity).toBe(2);
      expect(grouped[0].lineTotal).toBe(200);
    });

    it('keeps different options separate', () => {
      const items = [
        {
          optionId: 'opt1',
          optionName: 'Full Pass',
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
          lineTotal: 100,
        },
        {
          optionId: 'opt2',
          optionName: 'Workshop',
          quantity: 1,
          unitPrice: 50,
          discountAmount: 0,
          lineTotal: 50,
        },
      ];
      const grouped = groupLineItems(items);
      expect(grouped).toHaveLength(2);
    });
  });

  describe('calculateOrderTotals', () => {
    it('calculates totals correctly', () => {
      const items = [
        {
          optionId: 'opt1',
          optionName: 'Full Pass',
          quantity: 2,
          unitPrice: 100,
          discountAmount: 10,
          lineTotal: 180,
        },
      ];
      const totals = calculateOrderTotals(items, 19, 34.2);
      expect(totals.subtotal).toBe(180);
      expect(totals.totalDiscount).toBe(20); // 10 * 2
      expect(totals.vatRate).toBe(19);
      expect(totals.vatAmount).toBe(34.2);
      expect(totals.total).toBe(214.2);
    });

    it('defaults to zero VAT', () => {
      const totals = calculateOrderTotals([]);
      expect(totals.vatRate).toBe(0);
      expect(totals.vatAmount).toBe(0);
      expect(totals.total).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('formats EUR by default', () => {
      const result = formatCurrency(1234.5);
      expect(result).toContain('1.234,50');
    });

    it('formats USD', () => {
      const result = formatCurrency(99.99, 'USD');
      expect(result).toContain('99,99');
    });
  });
});
