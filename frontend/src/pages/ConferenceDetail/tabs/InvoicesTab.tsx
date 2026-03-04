import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import type {
  Conference,
  Invoice,
  InvoiceCreate,
  InvoiceUpdate,
  InvoiceStatus,
  InvoiceTemplateType,
  PlatformCurrency,
  PaginatedResponse,
  LocationContactPerson,
} from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import InvoiceDetailPanel from '../../../components/InvoiceDetailPanel';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ContactPersonList from '../../../components/ContactPersonList';
import RichTextEditor from '../../../components/common/RichTextEditor';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ChevronLeftIcon, EditIcon, DeleteIcon } from '../icons';
import { useSelection } from '../SelectionContext';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

const TEMPLATE_TYPE_OPTIONS: { value: InvoiceTemplateType; label: string }[] = [
  { value: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { value: 'credit_card', label: 'Invoice (Credit Card)' },
  { value: 'credit_note', label: 'Credit Note' },
];

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  credit_note: 'Credit Note',
};

export default function ConferenceInvoicesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { selectedInvoiceId, setSelectedInvoiceId } = useSelection();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  // Use conference currency if set
  const isCurrencyLocked = !!conference.currency;

  const emptyCreateForm: InvoiceCreate = {
    invoice_number: '',
    template_type: 'bank_transfer',
    status: 'draft',
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
    subtotal: undefined,
    tax_rate: undefined,
    tax_amount: undefined,
    total: undefined,
    currency: conference.currency || '',
    notes: '',
    contact_persons: [],
    is_active: true,
  };

  const [createForm, setCreateForm] = useState<InvoiceCreate>(emptyCreateForm);
  const [createNewContact, setCreateNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.invoices.byConference(conference.id),
    queryFn: async () => {
      const response = await api.get<{
        items: Invoice[];
        total: number;
      }>(`/conferences/${conference.id}/invoices`);
      return response.data;
    },
  });

  // Platform currencies for dropdowns
  const { data: currenciesData } = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  const selectedInvoice = data?.items?.find((inv) => inv.id === selectedInvoiceId);

  const createMutation = useMutation({
    mutationFn: async (invoiceData: InvoiceCreate) => {
      const response = await api.post<Invoice>(
        `/conferences/${conference.id}/invoices`,
        invoiceData
      );
      return response.data;
    },
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setIsAdding(false);
      setCreateForm(emptyCreateForm);
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
      setError(null);
      setSelectedInvoiceId(newInvoice.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create invoice'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: invoiceData }: { id: string; data: InvoiceUpdate }) => {
      const response = await api.put<Invoice>(
        `/conferences/${conference.id}/invoices/${id}`,
        invoiceData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update invoice'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setSelectedInvoiceId(null);
      setDeleteTarget(null);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
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

  const downloadPDF = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const res = await api.get(`/conferences/${conference.id}/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${invoiceNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(parseApiError(err, 'Failed to download PDF'));
    }
  };

  const invoiceCount = data?.items?.length || 0;

  return (
    <div>
      {/* === DETAIL PANEL VIEW === */}
      {selectedInvoice ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedInvoiceId(null)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeftIcon />
              Back to invoices list
            </button>
            <button
              type="button"
              onClick={() =>
                downloadPDF(selectedInvoice.id, selectedInvoice.invoice_number || 'unknown')
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download PDF
            </button>
          </div>

          <ErrorBanner message={error} />

          <InvoiceDetailPanel
            invoice={selectedInvoice}
            currencies={currenciesData || []}
            conferenceCurrency={conference.currency}
            onSave={async (invoiceData) => {
              await updateMutation.mutateAsync({
                id: selectedInvoice.id,
                data: invoiceData,
              });
            }}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        </>
      ) : (
        <>
          {/* === TABLE LIST VIEW === */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Invoices
                {invoiceCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {invoiceCount}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage invoices for this conference.
              </p>
            </div>
            {isAdmin && !isAdding && (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(true);
                  setError(null);
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
              >
                + Add Invoice
              </button>
            )}
          </div>

          <ErrorBanner message={error} />

          {/* Create form */}
          {isAdding && (
            <form
              onSubmit={handleCreateSubmit}
              className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4"
            >
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">New Invoice</h5>

              {/* Invoice Number + Template Type + Status */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.invoice_number}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        invoice_number: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Template Type
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.template_type || 'bank_transfer'}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        template_type: e.target.value as InvoiceTemplateType,
                      })
                    }
                  >
                    {TEMPLATE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.status || 'draft'}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        status: e.target.value as InvoiceStatus,
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.issue_date || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        issue_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.due_date || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        due_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* Recipient Name + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.recipient_name}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        recipient_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.recipient_email || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        recipient_email: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* Currency + Active */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  {isCurrencyLocked ? (
                    <input
                      type="text"
                      value={conference.currency || ''}
                      disabled
                      title="Set by conference"
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 shadow-sm py-2 px-3 text-sm text-gray-600 dark:text-gray-300"
                    />
                  ) : (
                    <select
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={createForm.currency || ''}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          currency: e.target.value,
                        })
                      }
                    >
                      <option value="">-- Select Currency --</option>
                      {(currenciesData || []).map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code} - {c.name} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.is_active ?? true}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          is_active: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Active
                    </span>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <RichTextEditor
                  value={createForm.notes || ''}
                  onChange={(html) =>
                    setCreateForm({
                      ...createForm,
                      notes: html,
                    })
                  }
                  rows={2}
                />
              </div>

              {/* Contact Persons */}
              <ContactPersonList
                contacts={createForm.contact_persons || []}
                newContact={createNewContact}
                setNewContact={setCreateNewContact}
                addContact={addCreateContact}
                removeContact={removeCreateContact}
                updateContact={updateCreateContact}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setError(null);
                    setCreateForm(emptyCreateForm);
                    setCreateNewContact({
                      first_name: '',
                      last_name: '',
                      email: '',
                      phone: '',
                      comment: '',
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Invoices table */}
          {isLoading ? (
            <LoadingSpinner />
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Issue Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Total
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.items.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {TEMPLATE_TYPE_LABELS[invoice.template_type] || invoice.template_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {invoice.recipient_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {invoice.issue_date || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {invoice.due_date || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            STATUS_COLORS[invoice.status] ||
                            'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
                        {invoice.total != null
                          ? `${invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${invoice.currency ? ` ${invoice.currency}` : ''}`
                          : '-'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoiceId(invoice.id)}
                              className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
                              title="Edit"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(invoice)}
                              disabled={deleteMutation.isPending}
                              className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !isAdding && (
              <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                No invoices yet. Click "+ Add Invoice" to get started.
              </div>
            )
          )}
        </>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${deleteTarget?.invoice_number}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
