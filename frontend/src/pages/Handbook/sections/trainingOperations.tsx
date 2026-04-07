import type { HandbookCategory } from '../handbookSections';

export const trainingOperationsCategory: HandbookCategory = {
  id: 'category-t-operations',
  name: 'Operations',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-registrations',
      title: 'Registrations',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage training registrations from the registration portal. Navigate to <strong>Registrations</strong> in the sidebar.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View all registrations with attendee details, training name, and status</li>
<li class="text-gray-700 dark:text-gray-300">Search and filter registrations</li>
<li class="text-gray-700 dark:text-gray-300">View registration question answers</li>
<li class="text-gray-700 dark:text-gray-300">Export registration data</li>
</ul>
<strong>Registration flow:</strong> Registrations come from the public registration portal (configured in Settings &rarr; Registration Portal). When a registration is received, a confirmation email is sent automatically (if email settings are enabled).`,
          }}
        />
      ),
    },
    {
      id: 't-invoices',
      title: 'Invoices',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage training invoices — create, send, and track payments. Navigate to <strong>Invoices</strong> in the sidebar.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View all training invoices with number, customer, amount, and payment status</li>
<li class="text-gray-700 dark:text-gray-300">Create invoices manually or from registrations</li>
<li class="text-gray-700 dark:text-gray-300">Preview invoice PDFs before sending</li>
<li class="text-gray-700 dark:text-gray-300">Send invoices via email</li>
<li class="text-gray-700 dark:text-gray-300">Track payment status (pending, paid, overdue)</li>
<li class="text-gray-700 dark:text-gray-300">Create credit notes / cancellation invoices</li>
<li class="text-gray-700 dark:text-gray-300">Export invoice data</li>
</ul>
<strong>Dependencies:</strong> Finance settings must be configured (Currency & Tax, Numbering, Company Data, Bank Accounts, Invoice Templates) before invoices can be generated.`,
          }}
        />
      ),
    },
    {
      id: 't-payment-reminders',
      title: 'Payment Reminders',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Automated and manual payment reminders for overdue training invoices. Navigate to <strong>Payment Reminders</strong> in the sidebar.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View all pending and sent payment reminders</li>
<li class="text-gray-700 dark:text-gray-300">Send reminders manually</li>
<li class="text-gray-700 dark:text-gray-300">Track reminder history per invoice</li>
</ul>
<strong>Automated reminders:</strong> When enabled in Settings &rarr; Finance &rarr; Payment Reminders, the system automatically sends first and second reminders at configured day intervals. An admin alert is sent for overdue invoices.`,
          }}
        />
      ),
    },
  ],
};
