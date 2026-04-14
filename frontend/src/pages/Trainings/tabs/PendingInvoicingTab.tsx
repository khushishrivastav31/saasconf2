/**
 * Pending Invoicing Tab
 *
 * Shows two sections:
 * 1. Uninvoiced Registrations — grouped by training, with registration details
 * 2. Accepted Offers — with placement-level invoicing status indicators
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';

// ── Types ────────────────────────────────────────────────────────────────────
interface PendingRegistration {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  company_name: string | null;
  status: string;
  payment_method: string;
  total: string | null;
  currency: string;
  attendee_count: number;
  created_at: string | null;
}

interface OfferPlacement {
  id: string;
  training_name: string;
  start_date: string | null;
  placement_type: string;
  has_registrations: boolean;
  has_invoices: boolean;
}

interface AcceptedOffer {
  id: string;
  offer_number: string;
  customer_name: string;
  status: string;
  attendees: number | null;
  training_price: string | null;
  certification_price: string | null;
  currency: string;
  po_number: string | null;
  created_at: string | null;
  placements: OfferPlacement[];
}

interface PendingData {
  uninvoiced_registrations: PendingRegistration[];
  accepted_offers: AcceptedOffer[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

const formatAmount = (amt: string | null, currency: string) => {
  if (!amt) return '—';
  const sym = currency === 'EUR' ? '€' : currency;
  return `${sym}\u00A0${Number(amt).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
};

const STATUS_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  invoiced: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

// ── Grouping ─────────────────────────────────────────────────────────────────
interface RegGroup {
  placementId: string;
  trainingName: string;
  trainingDate: string | null;
  registrations: PendingRegistration[];
}

function buildRegGroups(items: PendingRegistration[]): RegGroup[] {
  const map = new Map<string, RegGroup>();
  for (const r of items) {
    const g = map.get(r.placement_id);
    if (g) {
      g.registrations.push(r);
    } else {
      map.set(r.placement_id, {
        placementId: r.placement_id,
        trainingName: r.training_name,
        trainingDate: r.training_date,
        registrations: [r],
      });
    }
  }
  return Array.from(map.values());
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PendingInvoicingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['training-pending-invoicing'],
    queryFn: async () => {
      const res = await api.get('/trainings/invoices/pending');
      return res.data as PendingData;
    },
  });

  const regs = useMemo(() => data?.uninvoiced_registrations ?? [], [data]);
  const offers = useMemo(() => data?.accepted_offers ?? [], [data]);
  const regGroups = useMemo(() => buildRegGroups(regs), [regs]);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-400">Loading...</div>;
  }

  const isEmpty = regs.length === 0 && offers.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Pending Invoicing
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Registrations and accepted offers that have not been invoiced yet.
        </p>
      </div>

      {isEmpty ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          All caught up — no pending invoicing items.
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Uninvoiced Registrations ────────────────────────────────── */}
          {regs.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                Uninvoiced Registrations
                <span className="ml-2 text-xs font-normal text-gray-400">({regs.length})</span>
              </h3>
              <div className="space-y-3">
                {regGroups.map((group) => (
                  <div
                    key={group.placementId}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    {/* Group header */}
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/10 border-b border-gray-200 dark:border-gray-700">
                      <svg
                        className="w-4 h-4 text-amber-500 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {group.trainingName}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(group.trainingDate)}
                      </span>
                      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                        {group.registrations.length} registration
                        {group.registrations.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Registration rows */}
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-white dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Contact
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Email
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Att.
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Payment
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {group.registrations.map((reg) => (
                          <tr key={reg.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                              {reg.contact_first_name} {reg.contact_last_name}
                              {reg.company_name && (
                                <span className="ml-1 text-xs text-gray-400">
                                  ({reg.company_name})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                              {reg.contact_email}
                            </td>
                            <td className="px-4 py-2 text-center text-gray-600 dark:text-gray-400">
                              {reg.attendee_count}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[reg.status] || 'bg-gray-100 text-gray-700'}`}
                              >
                                {reg.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {reg.payment_method?.replace('_', ' ')}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                              {formatAmount(reg.total, reg.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Accepted Offers ─────────────────────────────────────────── */}
          {offers.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                Accepted Offers
                <span className="ml-2 text-xs font-normal text-gray-400">({offers.length})</span>
              </h3>
              <div className="space-y-3">
                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    {/* Offer header */}
                    <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-800">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {offer.offer_number}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {offer.customer_name}
                      </span>
                      {offer.attendees && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {offer.attendees} attendee{offer.attendees !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="ml-auto text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                        {formatAmount(offer.training_price, offer.currency)}
                      </span>
                    </div>
                    {/* Placements */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {offer.placements.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <PlacementStatusIcon
                            hasRegistrations={p.has_registrations}
                            hasInvoices={p.has_invoices}
                          />
                          <span className="text-gray-900 dark:text-gray-100">
                            {p.training_name}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatDate(p.start_date)}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">
                            {p.placement_type}
                          </span>
                          <span className="ml-auto">
                            <PlacementStatusLabel
                              hasRegistrations={p.has_registrations}
                              hasInvoices={p.has_invoices}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Placement status indicators ──────────────────────────────────────────────
function PlacementStatusIcon({
  hasRegistrations,
  hasInvoices,
}: {
  hasRegistrations: boolean;
  hasInvoices: boolean;
}) {
  if (hasInvoices) {
    // Green check
    return (
      <svg
        className="w-4 h-4 text-green-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  if (hasRegistrations) {
    // Amber warning — registered but no invoice
    return (
      <svg
        className="w-4 h-4 text-amber-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    );
  }
  // Red — no registrations at all
  return (
    <svg
      className="w-4 h-4 text-red-400 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function PlacementStatusLabel({
  hasRegistrations,
  hasInvoices,
}: {
  hasRegistrations: boolean;
  hasInvoices: boolean;
}) {
  if (hasInvoices) {
    return <span className="text-xs text-green-600 dark:text-green-400 font-medium">Invoiced</span>;
  }
  if (hasRegistrations) {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
        Registered, not invoiced
      </span>
    );
  }
  return (
    <span className="text-xs text-red-500 dark:text-red-400 font-medium">No registrations</span>
  );
}
