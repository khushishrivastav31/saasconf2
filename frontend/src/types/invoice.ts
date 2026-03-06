/**
 * Invoice and ZUGFeRD/Factur-X types
 */

export interface ZugferdSettings {
  enabled: boolean;
  profile: string; // "MINIMUM" | "BASIC_WL" | "BASIC" | "EN16931" | "EXTENDED"
  seller_vat_id: string | null;
  seller_contact_email: string | null;
  seller_contact_phone: string | null;
  payment_terms_code: string; // Default: "30" (Net 30 days)
  payment_means_code: string; // Default: "30" (Credit transfer)
  tax_category_code: string; // Default: "S" (Standard rate)
  invoice_type_code: string; // Default: "380" (Commercial invoice)
}

export interface ZugferdValidationResult {
  valid: boolean;
  profile?: string;
  errors: string[];
  warnings: string[];
  can_generate: boolean;
}
