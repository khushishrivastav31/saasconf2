import type { HandbookCategory } from '../handbookSections';

export const partnershipsCategory: HandbookCategory = {
  id: 'category-4',
  name: 'Partnerships',
  description: '',
  sections: [
    {
      id: '4-1-sponsors',
      title: 'Sponsors',
      categoryId: 'category-4',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference sponsors and their contracts. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sponsors</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add sponsors with company details, logo, contact information</li>
<li class="text-gray-700 dark:text-gray-300">Assign sponsor packages (defined in Settings 1.4.2)</li>
<li class="text-gray-700 dark:text-gray-300">Create and manage sponsor contracts (rich text editor, DOCX upload, version history)</li>
<li class="text-gray-700 dark:text-gray-300">Send contracts via email with PDF/DOCX attachment</li>
<li class="text-gray-700 dark:text-gray-300">Generate invoices directly from sponsor records</li>
<li class="text-gray-700 dark:text-gray-300">Upload sponsor logos</li>
<li class="text-gray-700 dark:text-gray-300">Control sponsor visibility on portal</li>
</ul>
<strong>Contract workflow:</strong> Draft → Sent → Signed
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sponsor_contract_send</code> — with placeholders: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Package Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Custom Message]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Contract Content]</code>
<strong>Dependencies:</strong> Sponsor Packages must be defined in Settings (1.4.2).
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sponsor data available for Discount Code bulk generation (Booking Options 5.1)</li>
<li class="text-gray-700 dark:text-gray-300">Sponsor logos may appear on portal pages</li>
<li class="text-gray-700 dark:text-gray-300">Sponsor invoices appear in the Invoices tab (5.3)</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: '4-2-service-providers',
      title: 'Service Providers',
      categoryId: 'category-4',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage external service providers for the conference (caterers, AV companies, decorators, etc.). <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">service_providers</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add providers with company details, contacts, and service descriptions</li>
<li class="text-gray-700 dark:text-gray-300">Upload attachments (contracts, quotes)</li>
<li class="text-gray-700 dark:text-gray-300">Link providers to specific locations</li>
<li class="text-gray-700 dark:text-gray-300">Track provider status and notes</li>
</ul>
<strong>Dependencies:</strong> Locations (1.6) for venue-level provider linking (optional).
<strong>Consequences:</strong> Service provider data is organizational — used for internal tracking, not displayed on the portal.`,
          }}
        />
      ),
    },
  ],
};
