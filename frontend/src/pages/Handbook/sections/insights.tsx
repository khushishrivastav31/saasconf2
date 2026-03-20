import type { HandbookCategory } from '../handbookSections';

export const insightsCategory: HandbookCategory = {
  id: 'category-7',
  name: 'Insights',
  description: '',
  sections: [
    {
      id: '7-1-analytics',
      title: 'Analytics',
      categoryId: 'category-7',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View conference data analytics and reports. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">analytics</code> module.</strong></p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.1 Registration Questions</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View aggregated responses to custom registration questions. Displays horizontal bar charts showing how attendees answered each question configured in Settings (1.4.2 > Registration Questions).</p>
<strong>What you see:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Each question is displayed as a card with a horizontal bar chart</li>
<li class="text-gray-700 dark:text-gray-300">Each bar shows the <strong>answer label</strong> on the left and the count on the right</li>
<li class="text-gray-700 dark:text-gray-300">Bar width is proportional to the response count relative to the most popular answer</li>
<li class="text-gray-700 dark:text-gray-300">Total response count is shown per question</li>
</ul>
<strong>Dependencies:</strong> Registration Questions must be configured in Settings. Registrations with answers must exist.
<strong>Consequences:</strong> Read-only analytics view — does not modify any data.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.2 Conference Statistics</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Visual analytics across six data dimensions, each in its own sub-tab:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Registrations Over Time</strong> — Line chart with daily new registrations and cumulative total</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Attendees Location</strong> — Interactive world map with markers for attendee cities, plus country and city breakdown tables</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Attendees Company</strong> — Horizontal bar chart of top companies by attendee count</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Papers Over Time</strong> — Monthly paper submission chart with cumulative total (requires CFP module)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Attendees per Day</strong> — Bar chart showing attendance per conference/program day</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Tutorials</strong> — Grouped bar chart showing attendee count and revenue per tutorial session</li>
</ul>
<strong>Dependencies:</strong> Registrations, papers, and program data must exist for charts to populate. Some sub-tabs require specific modules (CFP for papers, program for per-day stats).
<strong>Consequences:</strong> Read-only analytics — does not modify any data.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.3 Revenue Tracking</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Real-time revenue analytics using invoices as the authoritative source of truth. Credit notes and cancelled invoices are excluded from all totals.</p>
<strong>KPI Cards:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Total Revenue</strong> — Sum of all active (non-cancelled) registration and sponsor invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Registration Revenue</strong> — Total from registration invoices (direct from invoice totals)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sponsor Revenue</strong> — Total from sponsor invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Outstanding</strong> — Receivables from sent-but-not-yet-paid invoices (excludes credit notes)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Attendees</strong> — Active registrations (cancelled registrations excluded)</li>
</ul>
<strong>Revenue Streams table:</strong> Breaks down revenue by source — Sponsors, Registrations (per booking option with attendee counts and period drill-down), and any unattributed amounts. Grand Total always matches the sum of actual invoices.
<strong>Exports:</strong> CSV and XLSX.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.4 Financial Reports</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">P&amp;L summary combining revenue, budget costs, and speaker expenses.</p>
<strong>P&amp;L Summary KPIs:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Total Revenue</strong> — All invoice revenue (same as Revenue Tracking)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Outstanding</strong> — Receivables</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Total Costs</strong> — Budget amounts (actual if entered, else planned) + approved/paid speaker expenses</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Net Result</strong> — Revenue minus costs (green = profit, red = loss)</li>
</ul>
<strong>Revenue Streams section:</strong> Same breakdown as Revenue Tracking — Sponsors, per-booking-option registration revenue, and unattributed amounts.
<strong>Budget Variance by Category:</strong> For each budget category shows Planned, Actual, Variance, and % — requires a budget with line items.
<strong>Cost Per Attendee:</strong> Total costs and revenue divided by active attendee count.
<strong>Export:</strong> PDF with full P&amp;L, variance table, and revenue breakdown.
<strong>Note:</strong> The budget is always included automatically — there is no need to activate it. Speaker expenses are included if the expenses module is enabled.`,
          }}
        />
      ),
    },
  ],
};
