import type { HandbookCategory } from '../handbookSections';

export const trainingAnalyticsCategory: HandbookCategory = {
  id: 'category-t-analytics',
  name: 'Insights',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-revenue',
      title: 'Revenue',
      categoryId: 'category-t-analytics',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Track training revenue and financial performance. Navigate to <strong>Analytics &rarr; Revenue</strong>.</p>
<strong>What you can see:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Total revenue from training invoices</li>
<li class="text-gray-700 dark:text-gray-300">Revenue breakdown by period (monthly, quarterly, yearly)</li>
<li class="text-gray-700 dark:text-gray-300">Payment status distribution (paid, pending, overdue)</li>
<li class="text-gray-700 dark:text-gray-300">Revenue charts and trends</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-statistics',
      title: 'Training Statistics',
      categoryId: 'category-t-analytics',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View statistics about training programs, registrations, and trainer utilization. Navigate to <strong>Analytics &rarr; Training Statistics</strong>.</p>
<strong>What you can see:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Number of trainings per year/type</li>
<li class="text-gray-700 dark:text-gray-300">Registration counts and trends</li>
<li class="text-gray-700 dark:text-gray-300">Trainer assignment overview</li>
<li class="text-gray-700 dark:text-gray-300">Placement type distribution (open, inhouse, hybrid)</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
