import type { HandbookCategory } from '../handbookSections';

export const trainingAppendixCategory: HandbookCategory = {
  id: 'category-t-appendix',
  name: 'Appendix',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-glossary',
      title: 'Glossary',
      categoryId: 'category-t-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Term</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Definition</th></tr></thead><tbody>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Placement</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A scheduled instance of a training in the program calendar — one training can have multiple placements across the year</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Placement Type</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Open (public, shared), Inhouse (private, one customer), or Hybrid (mixed format)</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Program Year</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">An annual training calendar (e.g. 2026) containing all placements for that year</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Offer</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A formal proposal to a customer, linking one or more placements with pricing and attendee count</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Training Catalog</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">The master list of training types your organization offers (e.g. "AWS Solutions Architect", "IREB Foundation")</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Slug</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A short code shown on calendar bars (e.g. "AWS-SA", "IREB-FL")</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Blocked Day</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A company-specific non-working day (distinct from public holidays)</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Snapshot</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A frozen copy of the program at the time of publishing, used for version comparison</td></tr>
</tbody></table></div>`,
          }}
        />
      ),
    },
    {
      id: 't-getting-help',
      title: 'Getting Help',
      categoryId: 'category-t-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">If you need assistance with the training module:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Contact your tenant administrator for access and configuration questions</li>
<li class="text-gray-700 dark:text-gray-300">Check the specific section in this handbook for feature documentation</li>
<li class="text-gray-700 dark:text-gray-300">Use the search bar above to find information about specific topics</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
