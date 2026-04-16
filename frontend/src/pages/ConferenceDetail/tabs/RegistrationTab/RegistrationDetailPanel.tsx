import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import type { Registration, BookingOption, RegistrationItemCreate } from '../../../../types';
import { ErrorBanner, SuccessBanner } from '../../../../components/common/ErrorBanner';
import { STATUS_LABELS, STATUS_COLORS, MODE_LABELS } from './helpers';
import { OptionSessions } from './SessionSelector';

interface RegistrationDetailPanelProps {
  registration: Registration;
  conferenceId: string;
  isAdmin: boolean;
  options: BookingOption[];
  invoiceMap: Record<string, { number: string; id: string }>;
  error: string | null;
  success: string | null;
  onBack: () => void;
  onDelete: (reg: Registration) => void;
  onReplace: (reg: Registration) => void;
  onAddItem: (regId: string, data: RegistrationItemCreate) => void;
  onRemoveItem: (regId: string, itemId: string) => void;
  onUpdateItemSession: (regId: string, itemId: string, sessionId: string | null) => void;
  onUpdateMainSession: (regId: string, sessionId: string | null) => void;
}

export default function RegistrationDetailPanel({
  registration: selectedReg,
  conferenceId,
  isAdmin,
  options,
  invoiceMap,
  error,
  success,
  onBack,
  onDelete,
  onReplace,
  onAddItem,
  onRemoveItem,
  onUpdateItemSession,
  onUpdateMainSession,
}: RegistrationDetailPanelProps) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemType, setAddItemType] = useState<'booking_option' | 'tutorial'>('booking_option');
  const [addItemOptionId, setAddItemOptionId] = useState('');

  function handleAddItem() {
    if (!addItemOptionId) return;
    const payload: RegistrationItemCreate = {
      item_type: addItemType,
      booking_option_id: addItemType === 'booking_option' ? addItemOptionId : undefined,
      program_session_id: addItemType === 'tutorial' ? addItemOptionId : undefined,
    };
    onAddItem(selectedReg.id, payload);
    setShowAddItem(false);
    setAddItemOptionId('');
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to list
      </button>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {selectedReg.first_name} {selectedReg.last_name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{selectedReg.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                STATUS_COLORS[selectedReg.status] ||
                'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
              }`}
            >
              {STATUS_LABELS[selectedReg.status] || selectedReg.status}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {MODE_LABELS[selectedReg.registration_mode] || selectedReg.registration_mode}
            </span>
          </div>
        </div>

        {/* Attendee info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-sm">
          {selectedReg.job_title && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Job Title:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">{selectedReg.job_title}</span>
            </div>
          )}
          {selectedReg.department && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Department:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">{selectedReg.department}</span>
            </div>
          )}
          {selectedReg.billing_company_name && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Company:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {selectedReg.billing_company_name}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-500 dark:text-gray-400">Invoice:</span>{' '}
            {invoiceMap[selectedReg.billing_profile_id] ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Navigate to invoices tab with invoice ID in URL
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'invoices');
                  url.searchParams.set('invoice', invoiceMap[selectedReg.billing_profile_id].id);
                  window.location.href = url.toString();
                }}
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                {invoiceMap[selectedReg.billing_profile_id].number}
              </button>
            ) : (
              <span className="text-gray-900 dark:text-gray-100">{'\u2014'}</span>
            )}
          </div>
          {selectedReg.notes && (
            <div className="col-span-full">
              <span className="text-gray-500 dark:text-gray-400">Notes:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">{selectedReg.notes}</span>
            </div>
          )}
        </div>

        {/* Status (read-only, determined by invoice) */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              STATUS_COLORS[selectedReg.status] ||
              'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
            }`}
          >
            {STATUS_LABELS[selectedReg.status] || selectedReg.status}
          </span>
          <div className="flex-1" />
          {isAdmin && (
            <div className="flex items-center gap-2">
              {(selectedReg.status === 'invoiced' || selectedReg.status === 'paid') && (
                <button
                  onClick={() => {
                    onReplace(selectedReg);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Replace Attendee
                </button>
              )}
              {selectedReg.status === 'registered_pending_invoice' && (
                <button
                  onClick={() => onDelete(selectedReg)}
                  className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                >
                  Delete Registration
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main booking option with session selection */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Main Booking Option
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                {selectedReg.booking_option_name || 'Unknown option'}
              </span>
            </div>
            {/* Session selector */}
            {isAdmin && selectedReg.booking_option_id && (
              <OptionSessions
                conferenceId={conferenceId}
                optionId={selectedReg.booking_option_id}
                selections={{}}
                selectedSessionId={selectedReg.main_session_id}
                onChange={(selections) => {
                  const sessionId = Object.values(selections).find(Boolean) || null;
                  onUpdateMainSession(selectedReg.id, sessionId);
                }}
                compact={true}
              />
            )}
          </div>
        </div>

        {/* Add-on items */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add-on Items</h4>
            {isAdmin && selectedReg.status === 'registered_pending_invoice' && (
              <button
                onClick={() => setShowAddItem(!showAddItem)}
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                {showAddItem ? 'Cancel' : '+ Add Item'}
              </button>
            )}
          </div>

          {showAddItem && (
            <div className="flex items-end gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Type
                </label>
                <select
                  className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm"
                  value={addItemType}
                  onChange={(e) => {
                    setAddItemType(e.target.value as 'booking_option' | 'tutorial');
                    setAddItemOptionId('');
                  }}
                >
                  <option value="booking_option">Booking Option</option>
                  <option value="tutorial">Tutorial</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  {addItemType === 'booking_option' ? 'Option' : 'Tutorial Session'}
                </label>
                {addItemType === 'booking_option' ? (
                  <select
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm"
                    value={addItemOptionId}
                    onChange={(e) => setAddItemOptionId(e.target.value)}
                  >
                    <option value="">Select option...</option>
                    {options
                      .filter((o) => o.is_active)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Tutorial will be assigned as pending"
                    disabled
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 sm:text-sm"
                  />
                )}
              </div>
              <button
                onClick={handleAddItem}
                disabled={addItemType === 'booking_option' && !addItemOptionId}
                className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}

          {selectedReg.items.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No items</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {[...selectedReg.items]
                .sort((a, b) => {
                  const optMap: Record<string, number> = {};
                  options.forEach((o) => (optMap[o.id] = o.sort_order));
                  const sortA = a.booking_option_id ? (optMap[a.booking_option_id] ?? 999) : 999;
                  const sortB = b.booking_option_id ? (optMap[b.booking_option_id] ?? 999) : 999;
                  return sortA - sortB;
                })
                .map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {item.item_name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          {item.item_type === 'tutorial' ? 'Tutorial' : 'Option'}
                        </span>
                        {item.pending && (
                          <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                            (to be selected)
                          </span>
                        )}
                      </div>
                      {isAdmin && selectedReg.status === 'registered_pending_invoice' && (
                        <button
                          onClick={() => onRemoveItem(selectedReg.id, item.id)}
                          className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Session selector for this item */}
                    {isAdmin && item.booking_option_id && (
                      <OptionSessions
                        conferenceId={conferenceId}
                        optionId={item.booking_option_id}
                        selections={{}}
                        selectedSessionId={item.program_session_id}
                        onChange={(selections) => {
                          const sessionId = Object.values(selections).find(Boolean) || null;
                          onUpdateItemSession(selectedReg.id, item.id, sessionId);
                        }}
                        compact={true}
                      />
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Booking History — all registrations by this email across conferences */}
        <BookingHistory email={selectedReg.email} conferenceId={conferenceId} />
      </div>
    </div>
  );
}

// ── Booking History Sub-Component ──────────────────────────────────────────

interface HistoryItem {
  registration_id: string;
  conference_id: string;
  conference_name: string;
  booking_option_name: string | null;
  status: string;
  discount_code: string | null;
  payment_method: string | null;
  invoice_total: string | null;
  invoice_currency: string | null;
  invoice_status: string | null;
  registered_at: string | null;
}

function BookingHistory({ email, conferenceId }: { email: string; conferenceId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['booking-history', email, conferenceId],
    queryFn: async () => {
      const res = await api.get(
        `/conferences/${conferenceId}/registrations/history/by-email/${encodeURIComponent(email)}`
      );
      return res.data as { email: string; items: HistoryItem[] };
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  // Exclude the current conference's registration (already visible above)
  const otherItems = items.filter((i) => i.conference_id !== conferenceId);

  if (!expanded) {
    return (
      <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Show booking history across conferences
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
        Booking History
        <span className="ml-1 text-xs font-normal text-gray-400">({email})</span>
      </h4>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : otherItems.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No other conference registrations found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Conference
                </th>
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Ticket
                </th>
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Discount
                </th>
                <th className="text-right py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {otherItems.map((item) => (
                <tr key={item.registration_id}>
                  <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                    {item.conference_name}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">
                    {item.booking_option_name ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        item.status === 'paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : item.status === 'cancelled'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}
                    >
                      {(item.invoice_status ?? item.status).replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 text-xs">
                    {item.discount_code ?? '—'}
                  </td>
                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                    {item.invoice_total
                      ? `${item.invoice_currency ?? ''} ${Number(item.invoice_total).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
