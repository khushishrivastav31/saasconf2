import { useEffect, useState } from 'react';
import type { Invoice, InvoiceLineItem, InvoiceUpdate, LocationContactPerson } from '../../types';

const EMPTY_CONTACT: LocationContactPerson = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  comment: '',
};

function emptyLineItem(): InvoiceLineItem {
  return { description: '', quantity: 1, unit_price: 0, total: 0 };
}

function makeFormData(invoice: Invoice): InvoiceUpdate {
  return {
    invoice_number: invoice.invoice_number ?? undefined,
    template_type: invoice.template_type || 'bank_transfer',
    status: invoice.status,
    issue_date: invoice.issue_date || '',
    due_date: invoice.due_date || '',
    recipient_name: invoice.recipient_name,
    recipient_email: invoice.recipient_email || '',
    recipient_address_line1: invoice.recipient_address_line1 || '',
    recipient_address_line2: invoice.recipient_address_line2 || '',
    recipient_city: invoice.recipient_city || '',
    recipient_state: invoice.recipient_state || '',
    recipient_postal_code: invoice.recipient_postal_code || '',
    recipient_country: invoice.recipient_country || '',
    recipient_vat_number: invoice.recipient_vat_number || '',
    line_items: invoice.line_items?.length ? invoice.line_items : [],
    subtotal: invoice.subtotal ?? undefined,
    tax_rate: invoice.tax_rate ?? undefined,
    tax_amount: invoice.tax_amount ?? undefined,
    total: invoice.total ?? undefined,
    currency: invoice.currency || '',
    discount_code: invoice.discount_code || undefined,
    discount_amount: invoice.discount_amount ?? undefined,
    notes: invoice.notes || '',
    internal_comment: invoice.internal_comment || '',
    contact_persons: invoice.contact_persons || [],
    is_active: invoice.is_active,
  };
}

export function useInvoiceFormState(invoice: Invoice) {
  const [formData, setFormData] = useState<InvoiceUpdate>(() => makeFormData(invoice));
  const [newContact, setNewContact] = useState<LocationContactPerson>({ ...EMPTY_CONTACT });
  const [activeTab, setActiveTab] = useState<'details' | 'line_items' | 'contacts' | 'documents'>(
    'details'
  );

  useEffect(() => {
    setActiveTab('details');
    setFormData(makeFormData(invoice));
    setNewContact({ ...EMPTY_CONTACT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id]);

  const recalculate = (items: InvoiceLineItem[], taxRate?: number) => {
    const subtotal = items.reduce((sum, li) => sum + (li.total || 0), 0);
    const rate = taxRate ?? formData.tax_rate ?? 0;
    const taxAmount = subtotal * (rate / 100);
    const total = subtotal + taxAmount;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const items = [...(formData.line_items || [])];
    const item = { ...items[index] };
    if (field === 'description') {
      item.description = value as string;
    } else {
      item[field] = Number(value) || 0;
    }
    if (field === 'quantity' || field === 'unit_price') {
      item.total = Math.round(item.quantity * item.unit_price * 100) / 100;
    }
    items[index] = item;
    const totals = recalculate(items);
    setFormData({ ...formData, line_items: items, ...totals });
  };

  const addLineItem = () => {
    const items = [...(formData.line_items || []), emptyLineItem()];
    setFormData({ ...formData, line_items: items });
  };

  const removeLineItem = (index: number) => {
    const items = (formData.line_items || []).filter((_, i) => i !== index);
    const totals = recalculate(items);
    setFormData({ ...formData, line_items: items, ...totals });
  };

  const handleTaxRateChange = (rate: number) => {
    const totals = recalculate(formData.line_items || [], rate);
    setFormData({ ...formData, tax_rate: rate, ...totals });
  };

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [...(formData.contact_persons || []), { ...newContact }],
      });
      setNewContact({ ...EMPTY_CONTACT });
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contact_persons: formData.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateContact = (index: number, contact: LocationContactPerson) => {
    setFormData({
      ...formData,
      contact_persons: formData.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  return {
    formData,
    setFormData,
    newContact,
    setNewContact,
    activeTab,
    setActiveTab,
    updateLineItem,
    addLineItem,
    removeLineItem,
    handleTaxRateChange,
    addContact,
    removeContact,
    updateContact,
  };
}
