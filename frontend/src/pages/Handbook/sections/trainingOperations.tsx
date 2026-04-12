import type { HandbookCategory } from '../handbookSections';

export const trainingOperationsCategory: HandbookCategory = {
  id: 'category-t-operations',
  name: 'Operations',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-registration-portal',
      title: 'Registration Portal',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">A public-facing portal where participants can browse and register for trainings. Configure it in <strong>Settings &rarr; Registration Portal</strong>.</p>
<strong>Portal features:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Search &amp; Filters:</strong> Browse trainings with filters for date range, location (city or Online), language, syllabus, and guaranteed status</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Multi-language:</strong> Portal available in EN/DE (or more), switchable via language toggle. All labels are customizable in portal settings</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Guaranteed badge:</strong> Trainings marked as guaranteed show a green badge. Guaranteed status can be set manually or automatically when registrations reach a configurable threshold</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Certification Exam:</strong> Per attendee, choose exam mode (No exam / On-site / Online), exam language, and extra time option. Exam price from the syllabus is added per attendee</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT calculation:</strong> Automatic VAT based on the VAT Decision Table rules — considers attendance type (in-person/virtual), customer type (B2B/B2C), and customer location (domestic/EU/non-EU). VAT rate comes from training location country or customer country per rule</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Payment:</strong> Bank transfer or credit card (Stripe). When Stripe is enabled, the card form appears inline. Payment is confirmed before registration is created. Country-based auto-switching of payment method</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Order summary:</strong> Real-time display of training price, exam fees, subtotal, VAT, and total</li>
</ul>
<strong>Portal settings:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable the portal</li>
<li class="text-gray-700 dark:text-gray-300">Configure available languages and default language</li>
<li class="text-gray-700 dark:text-gray-300">Customize all portal text labels (per language)</li>
<li class="text-gray-700 dark:text-gray-300">Set auto-guarantee threshold (number of attendees)</li>
<li class="text-gray-700 dark:text-gray-300">Color theme customization</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Portal URL:</strong> <code>{origin}/{tenantSlug}/trainings/register</code></p>`,
          }}
        />
      ),
    },
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
