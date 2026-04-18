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
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage training registrations. Navigate to <strong>Registrations</strong> in the sidebar.</p>
<strong>Grouped by training:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Registrations are grouped by training placement — each group shows the training name, date, guaranteed badge, and total attendee count</li>
<li class="text-gray-700 dark:text-gray-300">Groups are collapsible and sorted by training date (nearest future first)</li>
<li class="text-gray-700 dark:text-gray-300">Past trainings are hidden by default — use the <strong>Show past</strong> checkbox to reveal them</li>
</ul>
<strong>Two sources of registrations:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Portal registrations</strong> — From the public registration portal. Shows contact name, email, attendee count, payment status, and total amount. Expand a row to see individual attendees with exam details</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Offer attendees</strong> — From accepted customer offers. Shown with a purple offer badge. Click the badge to navigate to the customer's offer detail</li>
</ul>
<strong>Filters:</strong> Search by name/email/company/training, filter by status, date range. Pagination for large datasets.
<br/><br/>
<strong>Attendee actions:</strong> Expand a registration row to see attendees. Edit exam mode, exam language, and extra time per attendee. Park attendees to the parking lot.`,
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
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage training invoices — create, send, cancel, replace, and track payments. Navigate to <strong>Invoices</strong> in the sidebar.</p>
<strong>Invoice list:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View all invoices with number, recipient, training, status (Draft/Sent/Paid/Overdue/Cancelled), type (Bank Transfer/Credit Card/Credit Note), and total</li>
<li class="text-gray-700 dark:text-gray-300">Credit notes appear as indented sub-rows (&#x21B3;) beneath their parent invoice</li>
<li class="text-gray-700 dark:text-gray-300">Click an invoice to open the detail panel with tabs: Details and Line Items</li>
<li class="text-gray-700 dark:text-gray-300">Filter by search, status, date range</li>
</ul>
<strong>Invoice lifecycle:</strong>
<div class="flex items-center gap-2 my-3 flex-wrap">
<span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Draft</span>
<span class="text-gray-400">&rarr;</span>
<span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Sent</span>
<span class="text-gray-400">&rarr;</span>
<span class="px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Paid</span>
<span class="text-gray-400">or</span>
<span class="px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Overdue</span>
</div>
<strong>Actions per status:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Draft:</strong> Edit all fields (line items, billing, dates), send, or delete</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sent:</strong> Resend email, mark as paid, cancel, or replace</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Paid:</strong> Cancel or replace</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Overdue:</strong> Same as Sent</li>
</ul>
<strong>Cancel &amp; Credit Note:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Cancelling a sent/paid/overdue invoice sets its status to <strong>Cancelled</strong> and automatically creates a <strong>Credit Note</strong> with negated line items</li>
<li class="text-gray-700 dark:text-gray-300">The credit note is linked to the original via the detail panel — click to navigate between them</li>
<li class="text-gray-700 dark:text-gray-300">If the cancelled invoice was paid via Stripe, the payment is refunded automatically</li>
</ul>
<strong>Replace (Billing Correction):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Use <strong>Replace</strong> to correct billing details (e.g., wrong address, VAT number) without losing the payment</li>
<li class="text-gray-700 dark:text-gray-300">The original invoice is cancelled, a credit note is created, and a <strong>new invoice</strong> is generated with corrected billing info</li>
<li class="text-gray-700 dark:text-gray-300">If the original was paid via Stripe, the payment transfers to the new invoice — <strong>no refund, no re-charge</strong></li>
</ul>
<strong>Stripe Payment Links:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">For credit card invoices, a Stripe payment link is created when the invoice is sent</li>
<li class="text-gray-700 dark:text-gray-300">The link is included in the invoice email and visible in the detail panel</li>
<li class="text-gray-700 dark:text-gray-300">Payment status is synced from Stripe automatically</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Prerequisites:</strong> Finance settings must be configured (Currency & Tax, Numbering, Company Data, Bank Accounts, Invoice Templates). For Stripe, complete Setup in Settings &rarr; Finance &rarr; Stripe.</p>`,
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
    {
      id: 't-pending-invoicing',
      title: 'Pending Invoicing',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Track registrations and accepted offers that still need invoices. Navigate to <strong>Pending Invoicing</strong> in the sidebar.</p>
<strong>Two sections:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Uninvoiced Registrations</strong> — Portal registrations that do not yet have an invoice. Shows contact, training, attendee count, and total. Click to create an invoice directly</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Accepted Offers</strong> — Offers in Accepted status with placements that have attendees but no invoice yet. Shows placement details, attendee count, and invoicing status per placement</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">This tab helps ensure no revenue is missed by surfacing all billable items that lack an invoice.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-parking-lot',
      title: 'Parking Lot',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">A holding area for attendees who need to be moved between trainings. Navigate to <strong>Parking Lot</strong> in the sidebar (between Attendees and Trainers).</p>
<strong>Central attendee identity:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Every attendee has a central identity based on email address — if the same person registers for multiple trainings, they share one attendee record</li>
<li class="text-gray-700 dark:text-gray-300">The attendee timeline shows all events: registration, parking, reassignment across all their trainings</li>
</ul>
<strong>Parking an attendee:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">From the Registrations tab, expand a registration row and click <strong>Park</strong> on an attendee</li>
<li class="text-gray-700 dark:text-gray-300">The attendee is moved to the parking lot and appears in the list with their original training info</li>
<li class="text-gray-700 dark:text-gray-300">Use case: training cancelled, attendee needs rescheduling, or temporary hold</li>
</ul>
<strong>Reassigning from parking lot:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Select a parked attendee and choose a <strong>new training placement</strong> to reassign them to</li>
<li class="text-gray-700 dark:text-gray-300">The system automatically handles the invoice transfer:</li>
</ul>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-6">
<li class="text-gray-700 dark:text-gray-300">Old invoice is cancelled and a credit note is created</li>
<li class="text-gray-700 dark:text-gray-300">A new registration is created for the new training</li>
<li class="text-gray-700 dark:text-gray-300">A new invoice is generated — if the original was <strong>paid</strong>, the payment transfers to the new invoice (no refund, no re-charge)</li>
<li class="text-gray-700 dark:text-gray-300">The old registration is cleaned up if no attendees remain</li>
</ol>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Note:</strong> The reassignment flow preserves the full billing history — the credit note links to the old invoice, and the new invoice has a note explaining the transfer.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-attendees-central',
      title: 'Attendees',
      categoryId: 'category-t-operations',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Central attendee registry across all trainings. Navigate to <strong>Attendees</strong> in the sidebar.</p>
<strong>Features:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Deduplication:</strong> Attendees are identified by email — registering for multiple trainings creates one central record</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Timeline:</strong> Each attendee has a history showing all events: registered, parked, reassigned, offer assigned, deactivated, reactivated</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Current placement:</strong> Shows which training(s) the attendee is currently assigned to</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Status:</strong> Active, Parked, or Inactive. An attendee is shown as Inactive when their status is explicitly "inactive" (via the Deactivate button on the parking lot or user profile) or when they are parked but their portal account is deactivated. The parking lot hides inactive users. Use the Deactivate / Reactivate actions on the attendee to change status; toggling portal access does not change the attendee status directly.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Search &amp; filter:</strong> Find attendees by name, email, or training</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
