/**
 * Revenue Tracking Analytics Tab
 *
 * Shows KPIs, revenue breakdown by booking option × period (charts + table),
 * revenue status pie chart, and CSV/XLSX export buttons.
 */
import { Fragment, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { parseApiError } from '../../../../utils/apiError';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { useToast } from '../../../../components/Toast';
import type { Conference } from '../../../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PeriodBreakdown {
  booking_period_id: string | null;
  period_name: string;
  period_start: string | null;
  period_end: string | null;
  attendee_count: number;
  total_revenue: string;
  subtotal_revenue: string;
  tax_amount: string;
}

interface BookingOptionRevenue {
  booking_option_id: string;
  booking_option_name: string;
  category: 'ticket' | 'day_pass';
  conference_day_id: string | null;
  attendee_count: number;
  total_revenue: string;
  subtotal_revenue: string;
  tax_amount: string;
  currency: string;
  periods: PeriodBreakdown[];
}

interface RevenueTrackingData {
  total_revenue: string;
  registration_revenue: string;
  sponsor_revenue: string;
  outstanding_revenue: string;
  currency: string;
  by_booking_option: BookingOptionRevenue[];
  sponsor_invoice_count: number;
  total_registrations: number;
  paid_registrations: number;
  cancelled_registrations: number;
  multiple_currencies: boolean;
}

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart colors
// ---------------------------------------------------------------------------

const BAR_COLOR = '#3b82f6';
const PIE_COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b'];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RevenueTrackingTab({ conference }: Props) {
  const { showToast } = useToast();
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery<RevenueTrackingData>({
    queryKey: queryKeys.analytics.revenue(conference.id),
    queryFn: async () => {
      const res = await api.get<RevenueTrackingData>(
        `/conferences/${conference.id}/analytics/revenue`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const currency = data?.currency ?? 'EUR';

  const fmt = useCallback(
    (v: string | number) => formatCurrency(typeof v === 'string' ? parseFloat(v) : v, currency),
    [currency]
  );

  const toggleOption = useCallback((optionId: string) => {
    setExpandedOptions((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  }, []);

  const barData = useMemo(
    () =>
      (data?.by_booking_option ?? []).map((item) => ({
        name: item.booking_option_name,
        revenue: parseFloat(item.total_revenue),
        attendees: item.attendee_count,
      })),
    [data]
  );

  const pieData = useMemo(() => {
    if (!data) return [];
    return [
      {
        name: 'Paid',
        value: parseFloat(data.registration_revenue) + parseFloat(data.sponsor_revenue),
      },
      { name: 'Outstanding', value: parseFloat(data.outstanding_revenue) },
    ].filter((d) => d.value > 0);
  }, [data]);

  const handleExport = useCallback(
    async (format: 'csv' | 'xlsx') => {
      try {
        const res = await api.get(
          `/conferences/${conference.id}/analytics/revenue/export/${format}`,
          { responseType: 'blob' }
        );
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `revenue_${conference.id}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        showToast(parseApiError(e), 'error');
      }
    },
    [conference.id, showToast]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm">
        {parseApiError(error) || 'Failed to load revenue data.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Revenue Tracking</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Export XLSX
          </button>
        </div>
      </div>

      {data.multiple_currencies && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 text-yellow-700 dark:text-yellow-300 text-sm">
          Revenue shown in {currency}. Multi-currency invoices may be excluded from charts.
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard label="Total Revenue" value={fmt(data.total_revenue)} />
        <KPICard label="Registration Revenue" value={fmt(data.registration_revenue)} />
        <KPICard
          label="Sponsor Revenue"
          value={fmt(data.sponsor_revenue)}
          sub={`${data.sponsor_invoice_count} invoice${data.sponsor_invoice_count !== 1 ? 's' : ''}`}
        />
        <KPICard label="Outstanding" value={fmt(data.outstanding_revenue)} sub="receivables" />
      </div>

      {/* Registration stats */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Registrations" value={String(data.total_registrations)} />
        <KPICard label="Paid" value={String(data.paid_registrations)} />
        <KPICard label="Cancelled" value={String(data.cancelled_registrations)} />
      </div>

      {data.by_booking_option.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No paid invoices found for this conference.
        </div>
      ) : (
        <>
          {/* Revenue bar chart (total per option) */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
              Revenue by Booking Option
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v) => fmt(v)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                />
                <Tooltip
                  formatter={(v) => [fmt(Number(v) || 0), 'Revenue']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue status pie */}
          {pieData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Revenue Status
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_entry, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v) => fmt(Number(v) || 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Booking option × period table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <p className="px-4 pt-3 text-xs text-gray-500 dark:text-gray-400">
              Click a row to expand booking period breakdown.
            </p>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ticket Type / Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Attendees
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Subtotal
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tax
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.by_booking_option.map((item) => {
                  const isExpanded = expandedOptions.has(item.booking_option_id);
                  const hasPeriods = item.periods.length > 0;
                  return (
                    <Fragment key={item.booking_option_id}>
                      {/* Option header row */}
                      <tr
                        className="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer"
                        onClick={() => hasPeriods && toggleOption(item.booking_option_id)}
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          <span className="flex items-center gap-2">
                            {hasPeriods && (
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            )}
                            {item.booking_option_name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                            {item.category === 'day_pass' ? 'Day Pass' : 'Ticket'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                          {item.attendee_count}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                          {fmt(item.subtotal_revenue)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                          {fmt(item.tax_amount)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                          {fmt(item.total_revenue)}
                        </td>
                      </tr>

                      {/* Period sub-rows (expanded) */}
                      {isExpanded &&
                        item.periods.map((period, pi) => {
                          const dateRange =
                            period.period_start && period.period_end
                              ? ` (${period.period_start} – ${period.period_end})`
                              : '';
                          return (
                            <tr
                              key={`${item.booking_option_id}-period-${pi}`}
                              className="bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <td className="pl-10 pr-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                {period.period_name}
                                {dateRange && (
                                  <span className="text-gray-400 dark:text-gray-500">
                                    {dateRange}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                                —
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 text-right">
                                {period.attendee_count}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 text-right">
                                {fmt(period.subtotal_revenue)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 text-right">
                                {fmt(period.tax_amount)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 text-right">
                                {fmt(period.total_revenue)}
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                    {data.total_registrations}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                    —
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                    —
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                    {fmt(data.registration_revenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
