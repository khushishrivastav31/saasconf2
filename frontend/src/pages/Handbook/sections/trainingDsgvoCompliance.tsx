import type { HandbookCategory } from '../handbookSections';

export const trainingDsgvoComplianceCategory: HandbookCategory = {
  id: 'category-training-dsgvo',
  name: 'DSGVO Compliance',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 'training-dsgvo-overview',
      title: 'Overview',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">SaaSConf is designed to help you meet your obligations under the EU General Data Protection Regulation (DSGVO / GDPR) for the personal data your training programs collect \u2014 central training attendees, training registrations, offer attendees, trainers, customers, and training invoices.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Who is the controller?</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Your organization (the tenant) is the <strong>data controller</strong>; SaaSConf is the <strong>processor</strong>, running the platform under a DPA. Data subjects contact <em>you</em>, not SaaSConf.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Retention under HGB \u00a7257 / AO \u00a7147 (German tenants)</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Training invoices are normal commercial invoices and fall under the same retention rules as conference invoices:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>10 years</strong> \u2014 sent and received invoices, balance sheets, accounting records (HGB \u00a7257(4), AO \u00a7147(3)).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>6 years</strong> \u2014 commercial correspondence (e.g. offer emails, if they count as <em>Handelsbriefe</em>).</li>
<li class="text-gray-700 dark:text-gray-300">The 10-year clock starts at the <strong>end of the calendar year</strong> in which the invoice was issued (\u00a7257(5) HGB).</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">You, the tenant, are the taxpayer \u2014 retention is <em>your</em> obligation, not SaaSConf\u2019s. Once a training invoice has been exported to your accounting system (DATEV, Lexoffice, or equivalent), that system is the legal record and SaaSConf holds only a convenience copy. SaaSConf shows a prominent warning before invoice deletion so you explicitly confirm the record is retained elsewhere.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Audit logs rotate automatically after 365 days. That is SaaSConf\u2019s own retention (operational, not tax-driven).</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What Phase 1 ships for trainings</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Fast subject lookup</strong>: training attendees (central + parking lot), training registrations, training registration attendees, offer attendees, trainers, customers, and training invoices all carry an indexed SHA-256 email hash.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>PII encryption at rest</strong>: trainer, customer, and training-invoice email / phone / VAT number fields are Fernet-encrypted (plaintext columns no longer exist).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Subject-scoped audit trail</strong>: opening a training-attendee detail panel writes a <code>training_attendee.view</code> audit entry tagged with the subject\u2019s email hash. Invoice views share the same <code>invoice.view</code> code as the conferences module.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Self-serve export UI (Phase 2 \u2014 live)</strong>: tenant admins log, approve/reject, and generate subject-data exports directly from <strong>My Company \u2192 Privacy Requests</strong>. The same backend lookup powers both conference and training data.</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-subject-rights',
      title: 'Data subjects\u2019 rights',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">You (the controller) respond within one month (Art. 12(3)). Each right below lists (a) what\u2019s live today, (b) <em>where in SaaSConf</em> to perform it, and (c) what\u2019s coming in later phases.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 15 \u2014 Access / Export</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cWhat personal data of mine do you hold?\u201d</em></p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><span class="text-emerald-700 dark:text-emerald-400 font-medium">Live today</span>: open <strong>My Company \u2192 Privacy Requests \u2192 New request</strong>, choose <em>Export</em>, paste the subject\u2019s email(s) (up to 25 for family / joint bookings), then click <strong>Generate export</strong>. The server runs an indexed SHA-256 hash lookup across the training data model \u2014 central <code>training_attendees</code> (including parking-lot entries), every <code>training_registration</code> / <code>training_registration_attendee</code> / <code>offer_attendee</code> row, any linked training invoices, trainer or customer records where the subject\u2019s email matches, plus audit events tagged with the subject\u2019s email hash \u2014 and materialises a ZIP with one JSON file per table and a <code>manifest.json</code> summary. Download link is valid for 7 days; after that, regenerate.</li>
<li class="text-gray-700 dark:text-gray-300">Every request (creation, review, execution, download) is tracked in the <code>privacy_requests</code> table and the <code>audit_logs</code> table, each tagged with the subject\u2019s email hash.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 16 \u2014 Rectification</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cFix my data \u2014 it\u2019s wrong.\u201d</em> <span class="text-emerald-700 dark:text-emerald-400 font-medium">Live today</span> \u2014 the normal admin edit UIs <em>are</em> the rectification mechanism.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Trainings \u2192 Attendees tab \u2192</strong> open an attendee row \u2192 edit first name / last name / email / phone / custom fields. Also covers the parking-lot list shown in the same tab.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Trainings \u2192 Registrations tab \u2192</strong> open a registration \u2192 edit contact email, edit each registered attendee\u2019s personal data inline.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Trainings \u2192 Offers tab \u2192</strong> open an offer \u2192 edit offer-attendee rows (name, email) before the offer is converted to a registration.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Trainings \u2192 Customers tab \u2192</strong> edit the customer company record (contact name, email, phone, VAT).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Trainings \u2192 Trainers section</strong> (from the program-year / placement view) \u2192 edit trainer name, email, phone, profile.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Trainings \u2192 Invoices tab \u2192</strong> open an invoice \u2192 edit recipient name / address / VAT number / email.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Portal Users tab</strong> (under Trainings \u2192 Users) \u2192 edit portal user profiles on behalf of a registrant who cannot sign in.</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Every edit fires client + server validation so corrections can\u2019t introduce malformed data.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 17 \u2014 Erasure / \u201cRight to be forgotten\u201d</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cDelete my data.\u201d</em> <strong>HGB \u00a7257 retention trumps erasure for training invoices</strong> \u2014 a booked invoice must stay for 10 years even if the subject asks.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><span class="text-amber-700 dark:text-amber-400 font-medium">Full erasure flow arrives in Phase 3</span>: preview + confirm per record category, per-subject choice of <em>delete</em> vs <em>anonymize</em>, automatic skip of in-retention invoices.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Today, via existing admin UIs</strong>, you can delete: a single <em>training attendee</em> (Attendees tab \u2192 row menu), a parking-lot entry (same tab), a <em>training registration</em> (Registrations tab) \u2014 as long as no invoice references it, an unbooked <em>offer</em> (Offers tab), or a <em>trainer / customer</em> record with no training assignments. Each destructive action prompts a confirmation dialog and writes an audit event.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>For partial erasure</strong> (remove personal data, keep the invoice), contact SaaSConf support. Ops can anonymise a row (replace name/email with a placeholder) while preserving the invoice\u2019s accounting identity for HGB retention.</li>
<li class="text-gray-700 dark:text-gray-300">Invoice deletion itself always shows a retention-warning dialog \u2014 you must confirm the record is retained in your accounting system (DATEV / Lexoffice / equivalent) before the copy is removed from SaaSConf.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 20 \u2014 Portability</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Covered by the Art. 15 JSON ZIP \u2014 RFC 8259 JSON is \u201cstructured, commonly used and machine-readable\u201d.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What Phase 1 actually makes fast</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Every subject-identifying row has an indexed SHA-256 email hash, so one subject request resolves to a single indexed scan per table instead of full-table string matching.</p>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-handling-a-request',
      title: 'Handling a subject request',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Training subjects (attendees, trainers, customer contacts) can exercise their rights through any channel. This is the procedural playbook you run every time someone asks, before you open the Privacy Requests tab.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What a training subject can ask you</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cWhat data do you hold on me?\u201d</strong> \u2014 Art. 15 access. Reply with the export ZIP (training attendees, registrations, offer attendees, trainers, customers, linked invoices, audit trail).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cFix my data.\u201d</strong> \u2014 Art. 16 rectification. Edit the row in the relevant Trainings tab (Attendees / Registrations / Offers / Customers / Trainers / Invoices). No Privacy Request row needed unless the subject specifically asks for a paper trail.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cDelete me.\u201d</strong> \u2014 Art. 17 erasure. Log it. <strong>Training invoices retained under HGB \u00a7257 cannot be deleted for 10 years</strong> \u2014 explain that in your reply; it is <em>not</em> grounds to refuse the whole request.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cExport my data for use elsewhere.\u201d</strong> \u2014 Art. 20 portability. Satisfied by the Art. 15 JSON ZIP.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cStop emailing me about future trainings.\u201d</strong> \u2014 Art. 21 objection. Remove from the relevant reminder / marketing list; no deletion required.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">The channels you have to accept</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Email, web form, postal letter, phone, in person, during a training session</strong> \u2014 all equally valid. A request in a support ticket or a reply to a reminder email counts.</li>
<li class="text-gray-700 dark:text-gray-300">The clock starts <em>when the request arrives</em>, not when you log it. Log it the same day so the timeline is honest.</li>
<li class="text-gray-700 dark:text-gray-300">You cannot demand a specific form, and you cannot charge (exceptions below).</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Identity verification \u2014 proportionate, not paranoid</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Art. 12(6) lets you ask for identity confirmation only when you have <em>reasonable doubts</em>. Proportionality rules:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Request from the subject\u2019s registered email</strong>: treat as verified \u2014 no ID check.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Request from a different address</strong>: reply to the registered address first to confirm the request is genuine.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Corporate-booking case</strong>: if the customer-contact person asks for data about <em>their</em> attendees, treat each attendee as a separate subject \u2014 the company contact is not automatically authorised to speak for them. Ask the contact to route the request through each attendee, or verify each attendee directly.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>High-risk request</strong> (erasure, request touching Art. 9 accommodation data): a redacted photo ID is acceptable \u2014 delete it as soon as verification is done; do not store it.</li>
<li class="text-gray-700 dark:text-gray-300">Never demand ID for routine corrections.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">The one-month response window (Art. 12(3))</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Respond <strong>within one calendar month</strong> of receipt \u2014 even if the response is \u201cwe need more time\u201d or \u201cwe\u2019re refusing, here\u2019s why\u201d.</li>
<li class="text-gray-700 dark:text-gray-300">For genuinely complex cases (multiple trainings, archived customer records), you may extend by <strong>up to two further months</strong>, but you must tell the subject <em>within the first month</em> and give a reason. Note this in the Privacy Request\u2019s notes field.</li>
<li class="text-gray-700 dark:text-gray-300">The Privacy Requests tab shows an <span class="text-amber-700 dark:text-amber-400 font-medium">amber badge after 21 days</span> so you move before the deadline slips.</li>
<li class="text-gray-700 dark:text-gray-300">Response is <strong>free</strong>. Only charge (or refuse) if the request is \u201cmanifestly unfounded or excessive\u201d \u2014 and document the reason in the rejection field.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Standard workflow</h3>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Acknowledge</strong> receipt the same day (\u201cWe received your request on &lt;date&gt; and will respond by &lt;date + 1 month&gt;\u201d).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Verify identity</strong> proportionately (see above).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Log</strong> in <strong>My Company \u2192 Privacy Requests \u2192 New request</strong>. The export covers <em>both</em> conference and training data in one ZIP \u2014 you do not need to log two separate requests for a subject who appears in both modules.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Fulfil</strong>: for export, click <em>Generate export</em> and send the ZIP to the verified address. For erasure, approve or reject; the rejection reason you enter is what the subject will see.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reply</strong> in plain language (Art. 12(1)): attach or link to the ZIP; for erasure, list what was deleted and which training invoices stay under HGB \u00a7257.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Close the loop</strong> in the Privacy Requests tab; the status + audit trail are your proof of compliance.</li>
</ol>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">When you can lawfully say no</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Training-invoice retention</strong> (HGB \u00a7257 / AO \u00a7147) overrides erasure for up to 10 years after year-end of issue.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Trainer contractual retention</strong>: ongoing contracts may justify keeping trainer contact data until the contract ends \u2014 document the basis.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Identity cannot be confirmed</strong> after a reasonable verification attempt (Art. 12(6)).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Manifestly unfounded or excessive</strong> repeat requests (Art. 12(5)).</li>
<li class="text-gray-700 dark:text-gray-300">Any refusal must be explained and logged via the rejection-reason field. The subject always retains the right to complain to a supervisory authority \u2014 mention that in your reply.</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-privacy-requests',
      title: 'Privacy requests',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Live today (Phase 2):</strong> open <strong>My Company \u2192 Privacy Requests</strong>. The tab is tenant-wide \u2014 the same backend export covers both conference and training data for a subject in a single ZIP, so you log each request once.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What admins can do in this tab</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>New request</strong> \u2014 log an incoming Art. 15 (export) or Art. 17 (erasure) request with up to 25 subject emails (family / joint bookings) and free-text notes.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Generate export</strong> \u2014 on <em>export</em> requests, produces the ZIP (hash lookup across 15 tables plus audit events) and marks the request <em>completed</em>. Rate-limited to 10 generate calls per tenant per hour.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Approve erasure</strong> \u2014 marks an <em>erasure</em> request as approved. Actual deletion lands in Phase 3; the approval gives the subject the Art. 12(3) one-month acknowledgement.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reject</strong> \u2014 either type, with a required reason (e.g. HGB \u00a7257 invoice retention overrides erasure, or identity verification failed).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Filter &amp; search</strong> \u2014 by status, by type, or by subject email (the email is hashed client-side before the GIN-indexed lookup runs).</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Every action writes an <code>audit_logs</code> row with the acting admin\u2019s <code>user_id</code> and the subject\u2019s <code>subject_email_hash</code>. Requests still pending after 21 days show an amber badge so the Art. 12(3) deadline doesn\u2019t slip. Download links from a completed export are valid for 7 days \u2014 after that, regenerate.</p>
<p class="text-gray-700 dark:text-gray-300 my-2"><span class="text-amber-700 dark:text-amber-400 font-medium">Phase 3 (planned):</span> add the erasure <em>execution</em> step \u2014 preview the rows that would be deleted / anonymised, choose per-category behaviour, auto-skip in-retention training invoices, then commit.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Response window: one month from receiving the request (Art. 12(3)).</p>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-portal-self-service',
      title: 'Portal self-service',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Attendees and customer contacts don\u2019t always need admin intervention \u2014 several rights are already self-serve today in the training portal.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What training portal users can do today (Phase 1)</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Training portal \u2192 Profile</strong>: view and edit their own name, email, password \u2014 direct Art. 16 (rectification).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Training portal \u2192 My Registrations</strong>: see every training they\u2019re registered for and the per-attendee personal data your tenant holds for them.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Training portal \u2192 Invoices</strong>: download PDFs of their own training invoices \u2014 partial Art. 15 / Art. 20 coverage.</li>
<li class="text-gray-700 dark:text-gray-300">Portal logins use the indexed <code>email_hash</code> column (never a full-table scan), and portal-user email / phone are Fernet-encrypted at rest.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What\u2019s coming for portal users (Phase 4)</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>My Data \u2192 Export</strong>: download the same Art. 15 ZIP the admin-side export produces \u2014 auto-approved for the signed-in user.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>My Data \u2192 Request deletion</strong>: submit an Art. 17 request that lands in the admin <em>Privacy Requests</em> tab for approval.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>My Data \u2192 Consent log</strong>: view and revoke marketing / reminder-email consents.</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-audit-trail',
      title: 'Audit trail',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">From Phase 1 onward, opening a PII detail panel writes an audit entry so an Art. 15 export can answer \u201cwhich admins have seen this subject\u2019s data?\u201d.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Training-scoped action codes currently emitted:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code>training_attendee.view</code> \u2014 admin opened a training attendee detail</li>
<li class="text-gray-700 dark:text-gray-300"><code>invoice.view</code> \u2014 admin opened a training invoice (shared code across conferences and trainings)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Each row is tagged with the subject\u2019s email hash (<code>subject_email_hash</code>), so the Art. 15 export collects every audit event concerning a given subject in one indexed lookup \u2014 regardless of which admin opened the panel. Audit logs rotate after 365 days.</p>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-special-category',
      title: 'Special-category data (Art. 9)',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Free-text fields in the training module (attendee notes, offer attendee comments, exam-mode accommodation requests) can receive Art. 9 content (health, accessibility, religious dietary requirements). Ensure an explicit legal basis (Art. 9(2)) — typically explicit consent collected via the registration or offer workflow.</p>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-backups',
      title: 'Backups',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Erased data persists in encrypted backups until the next rotation cycle completes (industry-standard, DPA-accepted). Contact support for the current backup retention cadence.</p>`,
          }}
        />
      ),
    },
    {
      id: 'training-dsgvo-subprocessors',
      title: 'Subprocessors',
      categoryId: 'category-training-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Stripe</strong> — payment processing for training invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Resend</strong> — training confirmation / reminder emails</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sentry</strong> — error telemetry (<code>send_default_pii=False</code>)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Subject requests directed at these providers must go to them directly.</p>`,
          }}
        />
      ),
    },
  ],
};
