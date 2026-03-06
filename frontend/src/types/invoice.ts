/**
 * Invoice and ZUGFeRD/Factur-X types
 */

/**
 * ZUGFeRD/Factur-X Settings
 *
 * All ZUGFeRD parameters are AUTO-DETERMINED from invoice/conference data:
 * - Profile: Always EN16931 (EU standard)
 * - Seller VAT ID: From company settings or fiscal representative
 * - Contact email/phone: From conference email/phone
 * - Payment terms: Always 30 days net
 * - Payment means: Auto-determined from invoice template_type
 * - Tax category: Auto-determined from VAT decision table
 * - Invoice type: Auto-determined from template_type (380=invoice, 381=credit note)
 */
export interface ZugferdSettings {
  enabled: boolean;
}

export interface ZugferdValidationResult {
  valid: boolean;
  profile?: string;
  errors: string[];
  warnings: string[];
  can_generate: boolean;
}
