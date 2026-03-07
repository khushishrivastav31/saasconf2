/**
 * Invoice and ZUGFeRD/Factur-X types
 */

import type { Invoice } from './conference';

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

/**
 * Request to replace an invoice with corrected billing information.
 * Used when buyer provided wrong name, address, PO number, or VAT.
 */
export interface ReplaceInvoiceRequest {
  reason: string;
  recipient_name?: string;
  recipient_email?: string;
  recipient_address_line1?: string;
  recipient_city?: string;
  recipient_postal_code?: string;
  recipient_country?: string;
  recipient_vat_number?: string;
  procurement_code?: string;
  custom_email_message?: string;
}

/**
 * Response from invoice replacement operation.
 * Returns old cancelled invoice, credit note, and new replacement invoice.
 */
export interface ReplaceInvoiceResponse {
  old_invoice: Invoice;
  credit_note: Invoice;
  new_invoice: Invoice;
  registrations_transferred: number;
}

/**
 * Enhanced cancel invoice request with registration cancellation option.
 */
export interface CancelInvoiceRequest {
  reason: string;
  cancel_registrations?: boolean;
  cancellation_email_message?: string;
}
