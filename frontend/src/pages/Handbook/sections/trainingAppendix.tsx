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
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Controller</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Under DSGVO / GDPR, the party that decides why and how personal data is processed. The tenant is the controller.</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Data Subject</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">The natural person whose data is being processed (training attendee, trainer, customer contact). Subjects hold the rights in Art. 15\u201322.</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>DSGVO</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Datenschutz-Grundverordnung \u2014 the German name for the EU General Data Protection Regulation (GDPR).</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Encrypted PII</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Email, phone, and VAT numbers on customers, trainers, portal users, and invoices are encrypted in the database. Admin list searches match names with partial text, but email/phone/VAT only match the full value (because the database cannot scan inside encrypted text)</td></tr>
<tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Processor</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Under DSGVO / GDPR, the party that processes personal data on the controller\u2019s behalf under a DPA. SaaSConf is the processor.</td></tr>
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
    {
      id: 't-recent-changes',
      title: 'Recent Platform Changes',
      categoryId: 'category-t-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">For the full developer-focused log of recent platform changes (bot protection, infrastructure, scheduled maintenance routines), see <strong>Recent Platform Changes</strong> in the Conference handbook's Appendix. Highlights that affect the training module specifically:</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Public training registration is now bot-protected <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-05-03)</span></h4>
<p class="text-gray-700 dark:text-gray-300 my-2">The public training registration form (<code>/{tenant}/trainings/register</code>) was previously unprotected — registrations could be flooded by a script. It now shares the same defense in depth as the conference and CFP-applicant forms: reCAPTCHA v3, hidden honeypot input, 5-second form-time-trap, disposable-email blocklist, and a Redis-backed IP rate-limit (<code>3/hour</code>). The submitter sees the same form; bot signals are rejected with <code>HTTP 400</code>, rate-limited bursts with <code>HTTP 429</code>.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Four of the five layers are active out of the box; the reCAPTCHA score check turns on once <code>RECAPTCHA_SECRET_KEY</code> + <code>VITE_RECAPTCHA_SITE_KEY</code> are set on the environment. See <strong>Recent Platform Changes &rarr; How to fully activate reCAPTCHA</strong> in the Conference handbook's Appendix for the full step-by-step.</p>`,
          }}
        />
      ),
    },
  ],
};
