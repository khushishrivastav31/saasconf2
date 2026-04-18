import type { HandbookCategory } from '../handbookSections';

export const trainingCustomersCategory: HandbookCategory = {
  id: 'category-t-customers',
  name: 'Customers & Offers',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-customers',
      title: 'Customers',
      categoryId: 'category-t-customers',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage B2B customers who book training programs. Navigate to <strong>Customers</strong> in the sidebar.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create new customers with company name, address, VAT number, and contact details</li>
<li class="text-gray-700 dark:text-gray-300">Search and filter the customer list (name and contact-person are partial match; email requires the full address because it is encrypted at rest)</li>
<li class="text-gray-700 dark:text-gray-300">Click a customer to open the detail panel with tabs: Details, Contacts, Offers</li>
<li class="text-gray-700 dark:text-gray-300">Set customer-specific default pricing and currency</li>
<li class="text-gray-700 dark:text-gray-300">Add rich-text comments/notes per customer</li>
<li class="text-gray-700 dark:text-gray-300">Delete customers (tenant super users only)</li>
</ul>
<strong>Customer Detail Panel Tabs:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Details</strong> — Edit customer info, address, VAT, pricing, comments</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Contacts</strong> — Manage contact persons for the customer</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Offers</strong> — View and create offers, manage attendees, create offer invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Documents</strong> — View all offer documents across this customer's offers</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Invoices</strong> — View all training invoices linked to this customer's offers</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-offers',
      title: 'Creating Offers',
      categoryId: 'category-t-customers',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Create training offers for customers by linking program placements with pricing. Navigate to a <strong>Customer &rarr; Offers tab</strong>.</p>
<strong>Two offer types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Inhouse/Hybrid Offer</strong> — Select from available inhouse/hybrid placements. These are exclusive — once assigned to an offer, they cannot be assigned to another</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Open Training Offer</strong> — Select from open and hybrid placements. These are shared — the same placement can appear in multiple customer offers</li>
</ul>
<strong>Creating an offer:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Click "+ Inhouse/Hybrid Offer" or "+ Open Training Offer"</li>
<li class="text-gray-700 dark:text-gray-300">Select placements from the picker (search by training name, grouped by year)</li>
<li class="text-gray-700 dark:text-gray-300">Set number of attendees, training price, certification price, and currency</li>
<li class="text-gray-700 dark:text-gray-300">Add optional comments</li>
<li class="text-gray-700 dark:text-gray-300">Save — the offer gets an auto-generated number (OFF-0001, OFF-0002, etc.)</li>
</ol>
<strong>Offer status lifecycle:</strong>
<div class="flex items-center gap-2 my-3 flex-wrap">
<span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Draft</span>
<span class="text-gray-400">&rarr;</span>
<span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Sent</span>
<span class="text-gray-400">&rarr;</span>
<span class="px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Accepted</span>
<span class="text-gray-400">or</span>
<span class="px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Rejected</span>
</div>
<p class="text-gray-700 dark:text-gray-300 my-2">Status changes automatically: creating an offer sets it to Draft. Sending the offer document changes it to Sent. After that, manually mark as Accepted or Rejected.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-offer-documents',
      title: 'Offer Documents',
      categoryId: 'category-t-customers',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Create, edit, and send professional offer documents to customers. Accessible from the offer detail within a customer's Offers tab.</p>
<strong>Creating a document:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Select from existing offer templates (configured in Settings &rarr; Offer Templates)</li>
<li class="text-gray-700 dark:text-gray-300">The template content is loaded into a rich text editor for customization</li>
<li class="text-gray-700 dark:text-gray-300">Edit the document content (formatting, text, images)</li>
<li class="text-gray-700 dark:text-gray-300">Save changes — each save creates a new version</li>
</ul>
<strong>Document actions:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Download DOCX</strong> — Export as Word document</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Download PDF</strong> — Export as PDF</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Send via Email</strong> — Send the document as PDF attachment to a specified email address. Records the send in the version history</li>
</ul>
<strong>Version history:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Every edit and send is tracked with timestamp and action type</li>
<li class="text-gray-700 dark:text-gray-300">View the history timeline to see when documents were created, edited, and sent</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-attendees',
      title: 'Attendees',
      categoryId: 'category-t-customers',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Add attendee details per placement within an offer. Visible in the offer detail, under each training placement.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add attendees with first name, last name, email, and comments</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Certification Exam:</strong> Per attendee, select exam mode — "No exam", "Exam: On-site", or "Exam: Online"</li>
<li class="text-gray-700 dark:text-gray-300">When an exam is selected, choose the <strong>Exam language</strong> from the configured training languages and optionally enable <strong>Extra time</strong> (for foreign language candidates)</li>
<li class="text-gray-700 dark:text-gray-300">Add multiple attendees per placement</li>
<li class="text-gray-700 dark:text-gray-300">If the number of attendees exceeds the offer's defined attendee count, a warning is shown</li>
<li class="text-gray-700 dark:text-gray-300">Remove individual attendees</li>
</ul>
<strong>Integration:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">The total attendee count per placement is visible in the trainer schedule</li>
<li class="text-gray-700 dark:text-gray-300">Trainers can see how many people are attending their assigned trainings</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-offer-management',
      title: 'Offer Management',
      categoryId: 'category-t-customers',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage all offers across all customers in one dashboard. Navigate to <strong>Offer Management</strong> in the sidebar.</p>
<strong>Dashboard features:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Stats cards</strong> — Show count and total revenue for each status (Draft, Sent, Accepted, Rejected)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Filter by status</strong> — Click a stats card to filter the table by that status</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Search</strong> — Search by offer number or customer name</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Offers table</strong> — Shows offer number, customer, status, training count, training price, certification price, and creation date</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Click to navigate</strong> — Clicking an offer navigates to the customer detail panel with that offer selected</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">This is a read-only overview. To edit offers, navigate to the specific customer's Offers tab.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-offer-invoicing',
      title: 'Offer Invoicing',
      categoryId: 'category-t-customers',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Generate training invoices directly from accepted offers. Open a customer's offer detail and click <strong>Create Invoice</strong>.</p>
<strong>How it works:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">The invoice preview auto-populates from offer data: placements, attendees, pricing, and customer billing info</li>
<li class="text-gray-700 dark:text-gray-300">Choose <strong>Bank Transfer</strong> or <strong>Credit Card</strong> (Stripe) as payment method</li>
<li class="text-gray-700 dark:text-gray-300">Adjust line items, VAT rate, notes, issue/due dates if needed</li>
<li class="text-gray-700 dark:text-gray-300">Save as <strong>Draft</strong> (editable, no invoice number) or <strong>Send</strong> (assigns number, emails recipient)</li>
<li class="text-gray-700 dark:text-gray-300">For credit card invoices, a Stripe payment link is created and included in the email</li>
<li class="text-gray-700 dark:text-gray-300">Already-invoiced amounts are tracked — the form shows how much of the offer total has been invoiced</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Prerequisite:</strong> The offer must be in <strong>Accepted</strong> status. Finance settings (Currency & Tax, Numbering, Company Data) must be configured.</p>`,
          }}
        />
      ),
    },
  ],
};
