/**
 * Financial Reporting Tab
 *
 * Shows P&L summary, budget variance chart/table, cost per attendee KPIs,
 * and PDF/XLSX export buttons.
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
  Cell,
  ReferenceLine,
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

interface PLSummary {
  total_revenue: string;
  outstanding_revenue: string;
  total_costs: string;
  net_result: string;
  currency: string;
  as_of_date: string;
}

interface VarianceLine {
  category_name: string;
  category_color: string | null;
  planned: string;
  actual: string;
  variance: string;
  variance_percent: number;
}

interface CostPerAttendee {
  total_paid_attendees: number;
  total_costs: string;
  cost_per_attendee: string;
  revenue_per_attendee: string;
  currency: string;
}

interface PeriodBreakdown {
  booking_period_id: string | null;
  period_name: string;
  period_start: string | null;
  period_end: string | null;
  attendee_count: number;
  total_revenue: string;
}

interface BookingOptionRevenue {
  booking_option_id: string;
  booking_option_name: string;
  category: 'ticket' | 'day_pass';
  attendee_count: number;
  total_revenue: string;
  currency: string;
  periods: PeriodBreakdown[];
}

interface FinancialReportData {
  pl_summary: PLSummary;
  variance_by_category: VarianceLine[];
  cost_per_attendee: CostPerAttendee;
  revenue: {
    total_revenue: string;
    registration_revenue: string;
    sponsor_revenue: string;
    outstanding_revenue: string;
    other_revenue: string;
    currency: string;
    by_booking_option: BookingOptionRevenue[];
    total_registrations: number;
    paid_registrations: number;
    active_registrations: number;
    multiple_currencies: boolean;
  };
  budget_id: string | null;
  budget_name: string | null;
  generated_at: string;
}

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FinancialReportingTab({ conference }: Props) {
  const { showToast } = useToast();
  const [expandedOption, setExpandedOption] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<FinancialReportData>({
    queryKey: queryKeys.analytics.financialReport(conference.id),
    queryFn: async () => {
      const res = await api.get<FinancialReportData>(
        `/conferences/${conference.id}/analytics/financial-report`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const currency = data?.pl_summary.currency ?? 'EUR';

  const fmt = useCallback(
    (v: string | number) => formatCurrency(typeof v === 'string' ? parseFloat(v) : v, currency),
    [currency]
  );

  const netResult = data ? parseFloat(data.pl_summary.net_result) : 0;
  const netColor =
    netResult >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  // Variance bar chart data — grouped bars (planned vs actual)
  const varianceChartData = useMemo(
    () =>
      (data?.variance_by_category ?? []).map((line) => ({
        name: line.category_name,
        planned: parseFloat(line.planned),
        actual: parseFloat(line.actual),
        color: line.category_color,
      })),
    [data]
  );

  // Revenue vs cost comparison
  const revCostData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Revenue', value: parseFloat(data.pl_summary.total_revenue), fill: '#22c55e' },
      { name: 'Costs', value: parseFloat(data.pl_summary.total_costs), fill: '#ef4444' },
    ];
  }, [data]);

  const handleExportPdf = useCallback(async () => {
    try {
      const res = await api.get(
        `/conferences/${conference.id}/analytics/financial-report/export/pdf`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial_report_${conference.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(parseApiError(e), 'error');
    }
  }, [conference.id, showToast]);

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
        {parseApiError(error) || 'Failed to load financial report.'}
      </div>
    );
  }

  const pl = data.pl_summary;
  const cpa = data.cost_per_attendee;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Financial Reports
          </h2>
          {data.budget_name && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Budget: {data.budget_name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPdf}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Export PDF
          </button>
        </div>
      </div>

      {data.revenue.multiple_currencies && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 text-yellow-700 dark:text-yellow-300 text-sm">
          Revenue shown in {currency}. Multi-currency invoices may be excluded from calculations.
        </div>
      )}

      {/* P&L KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard label="Total Revenue" value={fmt(pl.total_revenue)} />
        <KPICard label="Outstanding" value={fmt(pl.outstanding_revenue)} sub="receivables" />
        <KPICard label="Total Costs" value={fmt(pl.total_costs)} />
        <KPICard label="Net Result" value={fmt(pl.net_result)} color={netColor} />
      </div>

      {/* Revenue Streams breakdown */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Revenue Streams</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {/* Sponsor row */}
            <tr className="bg-white dark:bg-gray-800">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">Sponsors</td>
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 text-right font-medium">
                {fmt(data.revenue.sponsor_revenue)}
              </td>
            </tr>

            {/* Registrations header row */}
            <tr className="bg-white dark:bg-gray-800">
              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                Registrations
              </td>
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 text-right font-medium">
                {fmt(data.revenue.registration_revenue)}
              </td>
            </tr>

            {/* Per booking-option rows */}
            {(data.revenue.by_booking_option ?? []).map((opt) => (
              <Fragment key={opt.booking_option_id}>
                <tr
                  className="bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() =>
                    setExpandedOption(
                      expandedOption === opt.booking_option_id ? null : opt.booking_option_id
                    )
                  }
                >
                  <td className="pl-8 pr-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="mr-1 text-gray-400 dark:text-gray-500 text-xs">
                      {expandedOption === opt.booking_option_id ? '▾' : '▸'}
                    </span>
                    {opt.booking_option_name}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      ({opt.attendee_count} attendee{opt.attendee_count !== 1 ? 's' : ''})
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                    {fmt(opt.total_revenue)}
                  </td>
                </tr>

                {/* Period sub-rows */}
                {expandedOption === opt.booking_option_id &&
                  opt.periods.map((p, pi) => (
                    <tr
                      key={`${opt.booking_option_id}-${pi}`}
                      className="bg-white dark:bg-gray-800"
                    >
                      <td className="pl-14 pr-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {p.period_name}
                        {p.period_start && p.period_end && (
                          <span className="ml-1 opacity-60">
                            ({p.period_start} – {p.period_end})
                          </span>
                        )}
                        <span className="ml-1 opacity-60">· {p.attendee_count} att.</span>
                      </td>
                      <td className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 text-right">
                        {fmt(p.total_revenue)}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}

            {/* Others row — only shown if > 0 */}
            {parseFloat(data.revenue.other_revenue) > 0.005 && (
              <tr className="bg-white dark:bg-gray-800">
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 italic">
                  Others
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right italic">
                  {fmt(data.revenue.other_revenue)}
                </td>
              </tr>
            )}

            {/* Grand total */}
            <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600">
              <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">
                Grand Total
              </td>
              <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                {fmt(pl.total_revenue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Revenue vs Cost chart */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Revenue vs Costs
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revCostData} margin={{ left: 10, right: 30 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip formatter={(v: number) => [fmt(v), '']} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {revCostData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cost per attendee */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard label="Attendees" value={String(cpa.total_paid_attendees)} sub="excl. cancelled" />
        <KPICard label="Cost per Attendee" value={fmt(cpa.cost_per_attendee)} />
        <KPICard label="Revenue per Attendee" value={fmt(cpa.revenue_per_attendee)} />
        <KPICard label="As of Date" value={new Date(pl.as_of_date).toLocaleDateString()} />
      </div>

      {/* Budget variance */}
      {data.variance_by_category.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No active budget found. Create and activate a budget in the Budget Planning tab to see
          variance analysis.
        </div>
      ) : (
        <>
          {/* Variance bar chart */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
              Budget Variance by Category
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={varianceChartData} margin={{ left: 10, right: 30 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    fmt(v),
                    name === 'planned' ? 'Planned' : 'Actual',
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={0} stroke="#6b7280" />
                <Bar dataKey="planned" fill="#94a3b8" radius={[4, 4, 0, 0]} name="planned" />
                <Bar dataKey="actual" name="actual" radius={[4, 4, 0, 0]}>
                  {varianceChartData.map((entry, index) => {
                    const isOver = entry.actual > entry.planned;
                    return <Cell key={index} fill={isOver ? '#ef4444' : '#22c55e'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Variance table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Planned
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actual
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Variance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.variance_by_category.map((line, i) => {
                  const varianceVal = parseFloat(line.variance);
                  const varianceColor =
                    varianceVal >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400';
                  const sign = varianceVal >= 0 ? '+' : '';
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {line.category_color && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                            style={{ backgroundColor: line.category_color }}
                          />
                        )}
                        {line.category_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 text-right">
                        {fmt(line.planned)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 text-right">
                        {fmt(line.actual)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right ${varianceColor}`}>
                        {sign}
                        {fmt(line.variance)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right ${varianceColor}`}>
                        {sign}
                        {line.variance_percent.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
