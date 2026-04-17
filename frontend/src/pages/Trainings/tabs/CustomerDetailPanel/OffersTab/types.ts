export interface OfferForm {
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  status: 'draft' | 'sent' | 'rejected' | 'accepted';
  comments: string | null;
  notes: string | null;
  po_number: string | null;
}

export interface CreateOfferForm {
  placement_ids: string[];
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  comments: string | null;
  notes: string | null;
  po_number: string | null;
}

export type OfferType = 'inhouse' | 'open';

export interface ContactPerson {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
}
