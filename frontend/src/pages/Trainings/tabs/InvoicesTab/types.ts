export interface TrainingInvoice {
  id: string;
  invoice_number: string | null;
  template_type: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  recipient_name: string;
  recipient_email: string | null;
  training_name: string;
  payment_method: string | null;
  subtotal: string | null;
  tax_rate?: string | null;
  tax_amount: string | null;
  total: string | null;
  currency: string | null;
  related_invoice_id: string | null;
  line_items?: LineItem[] | null;
  recipient_address_line1?: string | null;
  recipient_city?: string | null;
  recipient_postal_code?: string | null;
  recipient_country?: string | null;
  recipient_vat_number?: string | null;
  notes?: string | null;
  stripe_payment_link_url?: string | null;
  created_at: string | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface LineItemInput {
  description: string;
  quantity: string;
  unit_price: string;
}
