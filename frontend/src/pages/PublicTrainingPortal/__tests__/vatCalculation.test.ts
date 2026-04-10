/**
 * Tests for VAT Decision Table matching logic.
 *
 * Extracts and tests the same logic used in TrainingRegistrationForm's
 * vatRate useMemo — attendance type, customer classification, rule matching.
 */
import { describe, it, expect } from 'vitest';

// Replicate the VAT calculation logic from TrainingRegistrationForm
interface VatRule {
  attendance_type: string;
  customer_type: string;
  customer_location: string;
  charge_vat: boolean;
  vat_rate_source: string;
}

interface VatConfig {
  vat_rates: Record<string, number>;
  vat_rules: VatRule[];
  eu_countries: string[];
  tenant_country: string;
}

interface TrainingInfo {
  location_city: string | null;
  location_country: string | null;
}

interface BillingInfo {
  country: string;
  company_name: string;
  vat_number: string;
}

function calculateVatRate(
  vatConfig: VatConfig,
  training: TrainingInfo,
  billing: BillingInfo
): number {
  const { vat_rates, vat_rules, eu_countries, tenant_country } = vatConfig;
  const locationCountry = (training.location_country || '').toUpperCase();
  const billingCountry = billing.country.toUpperCase();

  // Determine attendance type
  const locCity = (training.location_city || '').toLowerCase();
  const isVirtual = locCity.includes('online') || locCity.includes('virtual');
  const attendanceType = isVirtual ? 'virtual' : 'in_person';

  // Determine customer type
  const customerType = billing.company_name && billing.vat_number ? 'b2b' : 'b2c';

  // Determine customer location
  let customerLocation = 'non_eu';
  if (billingCountry === tenant_country) {
    customerLocation = 'domestic';
  } else if (eu_countries.map((c) => c.toUpperCase()).includes(billingCountry)) {
    customerLocation = 'eu';
  }

  // Find matching rule
  if (vat_rules.length > 0) {
    const rule = vat_rules.find(
      (r) =>
        r.attendance_type === attendanceType &&
        r.customer_type === customerType &&
        r.customer_location === customerLocation
    );
    if (rule && rule.charge_vat) {
      const source = rule.vat_rate_source;
      if (source === 'training_country' || source === 'conference') {
        return vat_rates[locationCountry] || 0;
      } else if (source === 'customer_country' || source === 'customer') {
        return vat_rates[billingCountry] || 0;
      }
    }
    return 0;
  }

  // Fallback
  return vat_rates[locationCountry] || 0;
}

// Standard VAT config for Germany-based tenant
const vatConfig: VatConfig = {
  vat_rates: { DE: 19, AT: 20, FR: 20 },
  vat_rules: [
    // In-person: always charge VAT from training country
    {
      attendance_type: 'in_person',
      customer_type: 'b2c',
      customer_location: 'domestic',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    {
      attendance_type: 'in_person',
      customer_type: 'b2c',
      customer_location: 'eu',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    {
      attendance_type: 'in_person',
      customer_type: 'b2c',
      customer_location: 'non_eu',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    {
      attendance_type: 'in_person',
      customer_type: 'b2b',
      customer_location: 'domestic',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    {
      attendance_type: 'in_person',
      customer_type: 'b2b',
      customer_location: 'eu',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    // Virtual B2B EU: reverse charge — no VAT
    {
      attendance_type: 'virtual',
      customer_type: 'b2b',
      customer_location: 'eu',
      charge_vat: false,
      vat_rate_source: 'none',
    },
    // Virtual B2B domestic: charge VAT
    {
      attendance_type: 'virtual',
      customer_type: 'b2b',
      customer_location: 'domestic',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    // Virtual B2C EU: charge customer country VAT (OSS)
    {
      attendance_type: 'virtual',
      customer_type: 'b2c',
      customer_location: 'eu',
      charge_vat: true,
      vat_rate_source: 'customer_country',
    },
    // Virtual B2C domestic: charge training country VAT
    {
      attendance_type: 'virtual',
      customer_type: 'b2c',
      customer_location: 'domestic',
      charge_vat: true,
      vat_rate_source: 'training_country',
    },
    // Virtual non-EU: no VAT
    {
      attendance_type: 'virtual',
      customer_type: 'b2c',
      customer_location: 'non_eu',
      charge_vat: false,
      vat_rate_source: 'none',
    },
    {
      attendance_type: 'virtual',
      customer_type: 'b2b',
      customer_location: 'non_eu',
      charge_vat: false,
      vat_rate_source: 'none',
    },
  ],
  eu_countries: ['DE', 'AT', 'FR', 'NL', 'BE'],
  tenant_country: 'DE',
};

describe('VAT Decision Table', () => {
  describe('In-person training in Germany', () => {
    const training: TrainingInfo = { location_city: 'Berlin', location_country: 'DE' };

    it('charges 19% for domestic B2C', () => {
      expect(
        calculateVatRate(vatConfig, training, { country: 'DE', company_name: '', vat_number: '' })
      ).toBe(19);
    });

    it('charges 19% for EU B2C', () => {
      expect(
        calculateVatRate(vatConfig, training, { country: 'AT', company_name: '', vat_number: '' })
      ).toBe(19);
    });

    it('charges 19% for non-EU B2C', () => {
      expect(
        calculateVatRate(vatConfig, training, { country: 'US', company_name: '', vat_number: '' })
      ).toBe(19);
    });

    it('charges 19% for domestic B2B', () => {
      expect(
        calculateVatRate(vatConfig, training, {
          country: 'DE',
          company_name: 'Test GmbH',
          vat_number: 'DE123456789',
        })
      ).toBe(19);
    });

    it('charges 19% for EU B2B (in-person)', () => {
      expect(
        calculateVatRate(vatConfig, training, {
          country: 'AT',
          company_name: 'Austrian GmbH',
          vat_number: 'ATU12345678',
        })
      ).toBe(19);
    });
  });

  describe('Virtual/Online training', () => {
    const training: TrainingInfo = { location_city: 'Online', location_country: 'DE' };

    it('charges 19% for domestic B2C', () => {
      expect(
        calculateVatRate(vatConfig, training, { country: 'DE', company_name: '', vat_number: '' })
      ).toBe(19);
    });

    it('charges customer country rate for EU B2C (OSS)', () => {
      expect(
        calculateVatRate(vatConfig, training, { country: 'AT', company_name: '', vat_number: '' })
      ).toBe(20); // Austria rate
    });

    it('charges 0% for EU B2B (reverse charge)', () => {
      expect(
        calculateVatRate(vatConfig, training, {
          country: 'AT',
          company_name: 'Austrian GmbH',
          vat_number: 'ATU12345678',
        })
      ).toBe(0);
    });

    it('charges 0% for non-EU B2C', () => {
      expect(
        calculateVatRate(vatConfig, training, { country: 'US', company_name: '', vat_number: '' })
      ).toBe(0);
    });

    it('charges 0% for non-EU B2B', () => {
      expect(
        calculateVatRate(vatConfig, training, {
          country: 'US',
          company_name: 'US Corp',
          vat_number: 'US123',
        })
      ).toBe(0);
    });

    it('charges 19% for domestic B2B', () => {
      expect(
        calculateVatRate(vatConfig, training, {
          country: 'DE',
          company_name: 'German GmbH',
          vat_number: 'DE123456789',
        })
      ).toBe(19);
    });
  });

  describe('Attendance type detection', () => {
    it('treats "Berlin" as in-person', () => {
      const rate = calculateVatRate(
        vatConfig,
        { location_city: 'Berlin', location_country: 'DE' },
        { country: 'DE', company_name: '', vat_number: '' }
      );
      expect(rate).toBe(19);
    });

    it('treats "Online" as virtual', () => {
      const rate = calculateVatRate(
        vatConfig,
        { location_city: 'Online', location_country: 'DE' },
        { country: 'AT', company_name: 'Corp', vat_number: 'ATU123' }
      );
      expect(rate).toBe(0); // virtual B2B EU → reverse charge
    });

    it('treats "Virtual Classroom" as virtual', () => {
      const rate = calculateVatRate(
        vatConfig,
        { location_city: 'Virtual Classroom', location_country: 'DE' },
        { country: 'AT', company_name: 'Corp', vat_number: 'ATU123' }
      );
      expect(rate).toBe(0);
    });
  });

  describe('Fallback when no rules configured', () => {
    const noRulesConfig: VatConfig = {
      vat_rates: { DE: 19 },
      vat_rules: [],
      eu_countries: [],
      tenant_country: 'DE',
    };

    it('uses training country rate as fallback', () => {
      const rate = calculateVatRate(
        noRulesConfig,
        { location_city: 'Berlin', location_country: 'DE' },
        { country: 'US', company_name: '', vat_number: '' }
      );
      expect(rate).toBe(19);
    });

    it('returns 0 for unknown country', () => {
      const rate = calculateVatRate(
        noRulesConfig,
        { location_city: 'New York', location_country: 'US' },
        { country: 'US', company_name: '', vat_number: '' }
      );
      expect(rate).toBe(0);
    });
  });
});
