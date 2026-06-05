import type { HandbookCategory } from '../handbookSections';

export const registrationFinanceCategory: HandbookCategory = {
  id: 'category-5',
  name: 'Registration & Finance',
  description: '',
  moduleCode: 'conferences',
  sections: [
    {
      id: '5-1-booking-options',
      title: 'Booking Options',
      categoryId: 'category-5',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure the pricing structure for conference registration through a matrix of periods and options.</p>
<strong>Key concepts:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Booking Periods</strong> (columns): Time windows with specific pricing (e.g., "Early Bird: Jan-Feb", "Regular: Mar-Apr")</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Booking Options</strong> (rows): What attendees purchase (e.g., "Tutorial Day", "Day 1", "Full Conference")</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Pricing Matrix</strong>: Each cell = price for that option during that period. Empty cell = not available.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Packages</strong>: Bundle multiple options into one purchasable item (price = sum of component prices)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Discount Codes</strong>: Percentage or fixed-amount reductions, individually created or bulk-generated</li>
</ul>
<strong>Auto-sync with program days:</strong> When you first open the Booking tab, the system automatically creates booking options from your program days and links them. Option names sync bidirectionally with program day names.
<strong>Booking Periods:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Each period has a name, start/end dates, and optional currency override</li>
<li class="text-gray-700 dark:text-gray-300">Recommended sequence: Blind Bird → Early Bird → Regular → Late/On-Site</li>
<li class="text-gray-700 dark:text-gray-300">Period dates may overlap (intentional flexibility)</li>
</ul>
<strong>Booking Options:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Each option has a name, optional description, attendance type (in_person, virtual, hybrid_onsite, hybrid_online), and optional program day link</li>
<li class="text-gray-700 dark:text-gray-300">Attendance type affects VAT calculation on invoices</li>
</ul>
<strong>Packages:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Bundle multiple options; price auto-calculates as sum of component prices per period</li>
<li class="text-gray-700 dark:text-gray-300">Changing option prices instantly recalculates package prices</li>
<li class="text-gray-700 dark:text-gray-300">Cannot delete packages with active registrations</li>
</ul>
<strong>Discount Codes:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Types: percentage or fixed amount</li>
<li class="text-gray-700 dark:text-gray-300">Scoping: apply to all options/periods, or restrict to specific ones</li>
<li class="text-gray-700 dark:text-gray-300">Usage limits: max uses (0 = unlimited), valid date range</li>
<li class="text-gray-700 dark:text-gray-300">Combinability: non-combinable (default, only one per registration) or combinable (stack multiple)</li>
<li class="text-gray-700 dark:text-gray-300">Bulk generation: create codes for Sponsors, Speakers, Committee, or custom lists using template variables (<code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ConferenceSlug]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[FirstName]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[LastName]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Counter]</code>, etc.)</li>
</ul>
<strong>Dependencies:</strong> Currency & Tax (Settings 1.4.5) should be configured first.
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Cannot delete options with existing registrations</li>
<li class="text-gray-700 dark:text-gray-300">Period names must be unique per conference</li>
<li class="text-gray-700 dark:text-gray-300">Option names must be unique per conference</li>
</ul>
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Options and prices appear in the registration form (public portal and admin)</li>
<li class="text-gray-700 dark:text-gray-300">Selected options generate invoice line items</li>
<li class="text-gray-700 dark:text-gray-300">Day-linked options determine which bookable sessions appear during registration</li>
<li class="text-gray-700 dark:text-gray-300">Discount codes reduce registration prices and increment usage count on confirmation</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sessions (2.3): Separately bookable sessions appear during registration if linked to an option's program day</li>
<li class="text-gray-700 dark:text-gray-300">Registration (5.2): Uses options and active period to determine pricing</li>
<li class="text-gray-700 dark:text-gray-300">Invoices (5.3): Line items derived from selected booking options</li>
<li class="text-gray-700 dark:text-gray-300">Alumni (3.6): ALUMNI discount code auto-applies for returning attendees</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: '5-2-registration',
      title: 'Registration',
      categoryId: 'category-5',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference registrations. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">registration</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create registrations (single attendee or group with shared billing)</li>
<li class="text-gray-700 dark:text-gray-300">View registration list with filters (status, booking option, date range, search)</li>
<li class="text-gray-700 dark:text-gray-300">Edit registration details: billing information, attendees, booking options, session selections</li>
<li class="text-gray-700 dark:text-gray-300">Add or remove additional items (add-on booking options)</li>
<li class="text-gray-700 dark:text-gray-300">Replace or cancel registrations</li>
<li class="text-gray-700 dark:text-gray-300">Export registration data to CSV</li>
<li class="text-gray-700 dark:text-gray-300">View registration lifecycle and status changes</li>
</ul>
<strong>Registration modes:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Single Registration</strong>: One attendee with billing info</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Group Registration</strong>: Multiple attendees sharing one billing profile</li>
</ul>
<strong>Registration statuses:</strong> Pending Invoice → Invoiced → Paid → (optionally) Cancelled
<strong>Session selection:</strong> If a booking option is linked to a program day with bookable sessions, registrants choose sessions during registration. Parallel sessions in the same time slot require choosing one; non-parallel sessions allow independent choices.
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">registration_confirmation</code>
<strong>Dependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Booking Options (5.1) must have active periods with prices</li>
<li class="text-gray-700 dark:text-gray-300">Registration Portal (Settings 1.4.2) must be enabled for public registration</li>
<li class="text-gray-700 dark:text-gray-300">Policies (Settings 1.4.2) must be defined if attendee acceptance is required</li>
</ul>
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Confirmed registrations generate invoices automatically</li>
<li class="text-gray-700 dark:text-gray-300">Paid registrations create Attendee records (3.4) and Alumni records (3.6)</li>
<li class="text-gray-700 dark:text-gray-300">Registration answers populate Analytics > Registration Questions (7.1.1)</li>
<li class="text-gray-700 dark:text-gray-300">Cancelling a registration (via invoice cancellation) revokes conference access but preserves user accounts</li>
<li class="text-gray-700 dark:text-gray-300">Registered attendees see a <strong>Registrations</strong> entry in their portal sidebar — showing conference name, booking option, and payment status across all their registrations.</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Invoices (5.3): Each registration links to an invoice</li>
<li class="text-gray-700 dark:text-gray-300">Attendees (3.4): Populated from paid registrations</li>
<li class="text-gray-700 dark:text-gray-300">Alumni (3.6): Auto-created from paid registrations</li>
<li class="text-gray-700 dark:text-gray-300">Booking Options (5.1): Determines pricing and available options</li>
</ul>
<strong>Cancel many at once:</strong> If a batch of bot or script registrations slipped past the public-portal protections, use the <strong>Cancel many&hellip;</strong> button at the top of the Registrations tab. Three-step dialog: filter (date range, originating IP, payment status, reason) &rarr; preview with per-row checkboxes (untick to spare) &rarr; typed-count confirmation. Each ticked row's invoice is flipped to cancelled, a credit note is generated and emailed to the billing contact, Stripe payment links are deactivated, and refunds are initiated for paid credit-card invoices. A multi-attendee submission produces ONE credit note for the bundled invoice (not per attendee).
<br/><br/>
<em>Heads-up:</em> the email-pattern filter is unavailable on the conference surface (the email is PII-encrypted at rest). Filter by IP and/or time window instead. The originating IP is auto-deleted once a registration is paid or cancelled (GDPR data minimization), so the IP filter only matches recent, still-pending rows &mdash; which is exactly when an admin needs the bulk-cancel anyway.`,
          }}
        />
      ),
    },
    {
      id: '5-3-invoices',
      title: 'Invoices',
      categoryId: 'category-5',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Create, send, and manage invoices. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoices</code> module.</strong></p>
<strong>Invoice types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Bank Transfer</strong>: Traditional invoice with bank details; manual payment reconciliation</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Credit Card</strong>: Stripe-integrated with automatic payment link and webhook-based status updates</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Credit Note</strong>: Negative invoice for cancellations; auto-generated, immutable</li>
</ul>
<strong>Invoice statuses:</strong> Draft → Sent → Paid (or: Sent → Overdue → Paid/Cancelled)
<strong>Status rules:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Draft</strong>: Fully editable, deletable, no invoice number yet</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sent</strong>: Read-only, invoice number assigned, email sent with PDF</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Overdue</strong>: Auto-set when due date passes (sent invoices transition automatically)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Paid</strong>: Payment received (manual mark or Stripe webhook)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Cancelled</strong>: Voided with credit note created; immutable</li>
</ul>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create invoices with recipient details, line items, due date</li>
<li class="text-gray-700 dark:text-gray-300">Search recipients from sponsors, speakers, registrations</li>
<li class="text-gray-700 dark:text-gray-300">Send invoices (generates number, creates payment link for credit card, emails PDF)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Replace Invoice</strong>: Correct billing info on sent invoices (original cancelled with credit note, new invoice created with corrected data — all registrations stay linked)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Cancel Invoice</strong>: Void with credit note; optionally cancel linked registrations and refund Stripe payments</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Mark as Paid</strong>: For bank transfer invoices with payment date and comment</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Convert to Credit Card</strong>: Change bank transfer invoice to credit card (creates Stripe payment link)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reopen</strong>: Move paid/cancelled invoice back to sent status</li>
<li class="text-gray-700 dark:text-gray-300">Resend invoices (same number, logged as resend)</li>
<li class="text-gray-700 dark:text-gray-300">View audit trail (Events tab: creation, sends, payments, refunds, status changes)</li>
</ul>
<strong>VAT handling:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">VAT automatically calculated based on: conference country, customer country, attendance type, B2B vs B2C</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT number required</strong> (red warning): Virtual/hybrid conferences with EU B2B customers (reverse charge)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT number recommended</strong> (yellow warning): In-person conferences with EU B2B customers</li>
<li class="text-gray-700 dark:text-gray-300">VAT number validated via 3-stage cascade: format check → regex → VIES EU registry</li>
</ul>
<strong>Email templates used:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_sent</code> — when sending an invoice</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_cancelled</code> — when cancelling with credit note</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_replaced</code> — when replacing an invoice</li>
</ul>
<strong>Stripe integration:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Credit card invoices include "Pay Online" button linking to Stripe checkout</li>
<li class="text-gray-700 dark:text-gray-300">Webhooks auto-update status to "paid" on successful payment</li>
<li class="text-gray-700 dark:text-gray-300">Manual sync available if webhooks fail</li>
</ul>
<strong>ZUGFeRD/Factur-X:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">When enabled (Settings 1.4.5), invoice PDFs include embedded XML for automated processing</li>
<li class="text-gray-700 dark:text-gray-300">Validation endpoint checks compliance before sending</li>
</ul>
<strong>Dependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Company Data, Bank Accounts, Invoice Templates (Settings 1.4.5) should be configured</li>
<li class="text-gray-700 dark:text-gray-300">Stripe Setup (Settings 1.4.5) required for credit card invoices</li>
<li class="text-gray-700 dark:text-gray-300">Currency & Tax (Settings 1.4.5) for VAT rules</li>
</ul>
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sent invoices cannot be edited (use Replace or Cancel + recreate)</li>
<li class="text-gray-700 dark:text-gray-300">Invoice numbers are sequential and immutable</li>
<li class="text-gray-700 dark:text-gray-300">Credit notes cannot be deleted</li>
<li class="text-gray-700 dark:text-gray-300">At least one billing field must differ for Replace Invoice to work</li>
</ul>
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Invoice status drives Payment Reminders (5.4) — only sent/overdue invoices get reminders</li>
<li class="text-gray-700 dark:text-gray-300">Paid invoices mark registrations as paid, creating Attendee and Alumni records</li>
<li class="text-gray-700 dark:text-gray-300">Cancelled invoices with registrations can revoke conference access</li>
<li class="text-gray-700 dark:text-gray-300">All actions logged in audit trail (Events tab)</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: '5-4-payment-reminders',
      title: 'Payment Reminders',
      categoryId: 'category-5',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage automated payment reminders for overdue invoices. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoices</code> module.</strong></p>
<strong>How it works:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Daily system check scans all conferences for overdue invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>1st Reminder</strong> (default: 2 days after due date): Friendly payment reminder email</li>
<li class="text-gray-700 dark:text-gray-300"><strong>2nd Reminder</strong> (default: 17 days after due date): Firmer reminder email</li>
<li class="text-gray-700 dark:text-gray-300">After 2nd reminder: Admin notification email (if enabled)</li>
</ol>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View reminder history with stats bar (pending, sent, failed counts)</li>
<li class="text-gray-700 dark:text-gray-300">Filter by status (pending/sent/failed), reminder number (1st/2nd), search by invoice number or recipient</li>
<li class="text-gray-700 dark:text-gray-300">Resend failed or previously sent reminders manually</li>
<li class="text-gray-700 dark:text-gray-300">Click any reminder row to navigate to the linked invoice</li>
</ul>
<strong>Email templates used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_first</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_second</code>
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Maximum one 1st reminder and one 2nd reminder per invoice</li>
<li class="text-gray-700 dark:text-gray-300">Only active invoices (sent or overdue status) receive reminders</li>
<li class="text-gray-700 dark:text-gray-300">Credit notes, paid, and cancelled invoices are excluded</li>
<li class="text-gray-700 dark:text-gray-300">Invoices without recipient email are skipped</li>
<li class="text-gray-700 dark:text-gray-300">Invoices auto-transition from "sent" to "overdue" when past due date</li>
</ul>
<strong>Dependencies:</strong> Payment Reminder settings (Settings 1.4.5) must be enabled. Email templates should be configured.
<strong>Consequences:</strong> All reminder activity logged in the invoice audit trail (Events tab in Invoices 5.3).
<strong>Configuration:</strong> Settings > Finance > Payment Reminders (1.4.5) controls timing and admin notification.`,
          }}
        />
      ),
    },
    {
      id: '5-5-cost-management',
      title: 'Cost Management',
      categoryId: 'category-5',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Track and manage conference costs and budgets. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoices</code> module.</strong></p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">5.5.1 Budget Planning</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Each conference has exactly <strong>one budget</strong>, which is always active and feeds directly into the Financial Reports tab.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add line items with description, planned amount, actual amount, category, and vendor</li>
<li class="text-gray-700 dark:text-gray-300">Create and manage <strong>categories</strong> with colors for organized tracking</li>
<li class="text-gray-700 dark:text-gray-300">Track planned vs. actual spending per line item and category</li>
<li class="text-gray-700 dark:text-gray-300">View summary cards: <strong>Total Budget</strong>, <strong>Spent</strong>, <strong>Remaining</strong>, and <strong>% Used</strong></li>
</ul>
<strong>How costs flow into Financial Reports:</strong> The budget's planned and actual amounts are automatically included in the Financial Reports tab under "Budget Variance by Category". If you have entered actual amounts, those are used; otherwise planned amounts are used as the cost estimate. Approved speaker expenses are added on top.
<strong>Best practice:</strong> Enter planned amounts when budgeting, then update actual amounts as costs are incurred. This gives you a live variance view in Financial Reports.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">5.5.2 Speaker Expenses</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Manage speaker expense allowances and track spending per speaker.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Set expense tiers with allowance amounts (e.g., Keynote: €1,500, Regular: €800)</li>
<li class="text-gray-700 dark:text-gray-300">Assign tiers to speakers</li>
<li class="text-gray-700 dark:text-gray-300">View submitted expenses with status (pending, approved, paid, rejected)</li>
<li class="text-gray-700 dark:text-gray-300">Approve or reject individual expenses</li>
<li class="text-gray-700 dark:text-gray-300">Track spending per speaker — the header shows the <strong>approved total</strong> (approved + paid expenses only)</li>
<li class="text-gray-700 dark:text-gray-300">Progress bar shows approved amount vs. tier allowance</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Send message to speaker</strong> — click the envelope icon next to a speaker to open a compose modal pre-filled with the speaker as recipient and "Regarding your speaker expenses" as subject</li>
</ul>
<strong>Dependencies:</strong> Speakers (3.2) must exist. Expense tiers must be configured.
<strong>Consequences:</strong> Approved expenses contribute to the total shown in the speaker header. Messages sent via the envelope icon appear in the Messages tab (6.1).`,
          }}
        />
      ),
    },
  ],
};
