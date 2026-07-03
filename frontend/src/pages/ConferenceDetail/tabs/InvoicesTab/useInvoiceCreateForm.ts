import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import api from '../../../../config/api';
import { lineItemTotal } from '../../../../utils/lineItemTotal';
import type {
  Conference,
  Invoice,
  InvoiceCreate,
  InvoiceLineItem,
  LocationContactPerson,
  RecipientSearchResult,
} from '../../../../types';

const EMPTY_CONTACT: LocationContactPerson = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  comment: '',
};

function makeEmptyForm(conference: Conference): InvoiceCreate {
  return {
    template_type: 'bank_transfer',
    issue_date: '',
    due_date: '',
    recipient_name: '',
    recipient_email: '',
    recipient_address_line1: '',
    recipient_address_line2: '',
    recipient_city: '',
    recipient_state: '',
    recipient_postal_code: '',
    recipient_country: '',
    recipient_vat_number: '',
    line_items: [],
    subtotal: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 0,
    currency: conference.currency || '',
    notes: '',
    internal_comment: '',
    contact_persons: [],
    is_active: true,
  };
}

function recalcTotals(items: InvoiceLineItem[], taxRate: number) {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = subtotal * (taxRate / 100);
  return { subtotal, tax_amount: taxAmount, total: subtotal + taxAmount };
}

interface Options {
  conference: Conference;
  taxInfo: { current_vat_rate: number | null } | undefined;
  createMutation: UseMutationResult<Invoice, unknown, InvoiceCreate, unknown>;
}

export function useInvoiceCreateForm({ conference, taxInfo, createMutation }: Options) {
  const emptyForm = useMemo(() => makeEmptyForm(conference), [conference]);

  const [createForm, setCreateForm] = useState<InvoiceCreate>(emptyForm);
  const [createNewContact, setCreateNewContact] = useState<LocationContactPerson>({
    ...EMPTY_CONTACT,
  });
  const [autoCalculateVat, setAutoCalculateVat] = useState(true);
  const [isLoadingVatPreview, setIsLoadingVatPreview] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [validationAlert, setValidationAlert] = useState<string | null>(null);
  const vatPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setCreateForm(emptyForm);
    setCreateNewContact({ ...EMPTY_CONTACT });
  }, [emptyForm]);

  const addLineItem = () => {
    const items: InvoiceLineItem[] = [
      ...(createForm.line_items || []),
      {
        description: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        discount_percentage: null,
        total: 0,
      },
    ];
    setCreateForm({ ...createForm, line_items: items });
  };

  const removeLineItem = (index: number) => {
    const items = (createForm.line_items || []).filter((_, i) => i !== index);
    const totals = recalcTotals(items, createForm.tax_rate || 0);
    setCreateForm({ ...createForm, line_items: items, ...totals });
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const items = [...(createForm.line_items || [])];
    const item = { ...items[index] };
    const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;

    if (field === 'description') {
      item.description = String(value);
    } else if (field === 'quantity') {
      item.quantity = numVal;
    } else if (field === 'unit_price') {
      item.unit_price = numVal;
    } else if (field === 'discount') {
      // Amount and percentage discounts are mutually exclusive.
      item.discount = numVal;
      if (numVal) item.discount_percentage = null;
    } else if (field === 'discount_percentage') {
      item.discount_percentage = numVal || null;
      if (numVal) item.discount = 0;
    } else if (field === 'total') {
      item.total = numVal;
    }

    item.total = lineItemTotal(
      item.quantity,
      item.unit_price,
      item.discount,
      item.discount_percentage
    );
    items[index] = item;

    const totals = recalcTotals(items, createForm.tax_rate || 0);
    setCreateForm({ ...createForm, line_items: items, ...totals });
  };

  const handleTaxRateChange = (rate: number) => {
    const totals = recalcTotals(createForm.line_items || [], rate);
    setCreateForm({ ...createForm, tax_rate: rate, ...totals });
  };

  const previewVat = useCallback(async () => {
    if (!autoCalculateVat) return;
    if (!createForm.recipient_country?.trim()) return;
    if (!createForm.subtotal || createForm.subtotal <= 0) return;

    setIsLoadingVatPreview(true);
    try {
      const response = await api.post(`/conferences/${conference.id}/invoices/preview-vat`, {
        recipient_country: createForm.recipient_country,
        recipient_vat_number: createForm.recipient_vat_number || null,
        subtotal: createForm.subtotal,
        issue_date: createForm.issue_date || null,
      });

      const { tax_rate, tax_amount, total, notes_text } = response.data;

      setCreateForm((prev) => ({
        ...prev,
        tax_rate,
        tax_amount,
        total,
        notes:
          notes_text && !prev.notes?.includes(notes_text)
            ? prev.notes
              ? `${prev.notes}\n\n${notes_text}`
              : notes_text
            : prev.notes,
      }));
    } catch (err) {
      console.error('VAT preview failed:', err);
    } finally {
      setIsLoadingVatPreview(false);
    }
  }, [
    autoCalculateVat,
    createForm.recipient_country,
    createForm.recipient_vat_number,
    createForm.subtotal,
    createForm.issue_date,
    conference.id,
  ]);

  useEffect(() => {
    if (!autoCalculateVat) return;
    if (vatPreviewTimerRef.current) {
      clearTimeout(vatPreviewTimerRef.current);
    }
    vatPreviewTimerRef.current = setTimeout(() => {
      previewVat();
    }, 500);
    return () => {
      if (vatPreviewTimerRef.current) {
        clearTimeout(vatPreviewTimerRef.current);
      }
    };
  }, [autoCalculateVat, previewVat]);

  // Auto-fill tax rate from conference VAT settings when not auto-calculating.
  useEffect(() => {
    if (!autoCalculateVat && taxInfo?.current_vat_rate != null && createForm.tax_rate === 0) {
      handleTaxRateChange(Number(taxInfo.current_vat_rate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxInfo?.current_vat_rate, autoCalculateVat]);

  const handleRecipientSelect = (result: RecipientSearchResult) => {
    setCreateForm({
      ...createForm,
      recipient_source_type: result.source_type,
      recipient_source_id: result.id,
      recipient_name: result.display_name,
      recipient_email: result.email || '',
      recipient_address_line1: result.address_line1 || '',
      recipient_address_line2: result.address_line2 || '',
      recipient_city: result.city || '',
      recipient_state: result.state || '',
      recipient_postal_code: result.postal_code || '',
      recipient_country: result.country || '',
      recipient_vat_number: result.vat_number || '',
      contact_persons: result.contact_persons || [],
    });
  };

  const handleManualEntry = () => {
    setCreateForm({
      ...createForm,
      recipient_source_type: undefined,
      recipient_source_id: undefined,
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const missing: string[] = [];
    if (!createForm.recipient_name?.trim()) missing.push('Recipient Name');
    if (!createForm.recipient_address_line1?.trim()) missing.push('Address Line 1');
    if (!createForm.recipient_city?.trim()) missing.push('City');
    if (!createForm.recipient_postal_code?.trim()) missing.push('Postal Code');
    if (!createForm.recipient_country?.trim()) missing.push('Country');
    if (!createForm.currency?.trim() && !conference.currency) missing.push('Currency');
    if ((createForm.line_items || []).length === 0) missing.push('At least one Line Item');
    const emptyItems = (createForm.line_items || []).filter((li) => !li.description?.trim());
    if (emptyItems.length > 0) missing.push('Description for all Line Items');

    if (missing.length > 0) {
      setValidationAlert(
        `Please fill in the following required fields:\n\n- ${missing.join('\n- ')}`
      );
      return;
    }

    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...createNewContact }];
    }
    createMutation.mutate(finalData);
  };

  const addCreateContact = () => {
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...(createForm.contact_persons || []), { ...createNewContact }],
      });
      setCreateNewContact({ ...EMPTY_CONTACT });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  return {
    createForm,
    setCreateForm,
    createNewContact,
    setCreateNewContact,
    autoCalculateVat,
    setAutoCalculateVat,
    isLoadingVatPreview,
    setIsLoadingVatPreview,
    emailError,
    setEmailError,
    validationAlert,
    setValidationAlert,
    resetForm,
    addLineItem,
    removeLineItem,
    updateLineItem,
    handleTaxRateChange,
    handleRecipientSelect,
    handleManualEntry,
    handleCreateSubmit,
    addCreateContact,
    removeCreateContact,
    updateCreateContact,
  };
}
