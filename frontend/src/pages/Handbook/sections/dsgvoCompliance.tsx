import type { HandbookCategory } from '../handbookSections';

export const dsgvoComplianceCategory: HandbookCategory = {
  id: 'category-dsgvo',
  name: 'DSGVO Compliance',
  description: '',
  moduleCode: 'conferences',
  sections: [
    {
      id: 'dsgvo-overview',
      title: 'Overview',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">SaaSConf is designed to help you meet your obligations under the EU General Data Protection Regulation (DSGVO / GDPR) for the personal data your conference collects — registrations, billing contacts, applicants, sponsors, speakers, and alumni.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Who is the controller?</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Your organization (the tenant) is the <strong>data controller</strong> — you decide what data is collected and why. SaaSConf is the <strong>processor</strong>, running the platform on your behalf under a Data Processing Agreement (DPA). Data subjects (attendees, speakers, applicants) contact <em>you</em>, not SaaSConf.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Retention under HGB \u00a7257 / AO \u00a7147 (German tenants)</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">German tenants are subject to <strong>HGB \u00a7257</strong> (Aufbewahrungspflichten f\u00fcr Kaufleute) and <strong>AO \u00a7147</strong> (steuerliche Aufbewahrungspflichten). The relevant retention periods:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>10 years</strong> \u2014 sent and received invoices (<em>Rechnungen</em>), balance sheets (<em>Jahresabschl\u00fcsse</em>), accounting records (<em>B\u00fccher</em>), inventories.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>6 years</strong> \u2014 business correspondence (<em>Handelsbriefe</em>) and other commercial documents.</li>
<li class="text-gray-700 dark:text-gray-300">The 10-year clock starts at the <strong>end of the calendar year</strong> in which the invoice was issued (\u00a7257(5) HGB).</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>You, the tenant, are the taxpayer</strong> \u2014 so HGB / AO retention is <em>your</em> obligation, not SaaSConf\u2019s. In practice you export sent invoices to your accounting system (DATEV, Lexoffice, or equivalent); once that export has happened, your accounting system is the <em>system of record</em> for the tax authority and SaaSConf holds only a convenience copy. Deleting the SaaSConf copy then does not violate retention law \u2014 but <em>you</em> are the one who has to confirm that the export has actually taken place.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Because the decision is yours, SaaSConf shows a prominent warning dialog before any invoice deletion so you explicitly confirm the record is retained elsewhere. There is no silent bulk-delete of invoices.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Audit logs rotate automatically after 365 days. That is SaaSConf\u2019s own retention (operational, not tax-driven).</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What Phase 1 ships</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The current release delivers the data plumbing needed for Art. 15 / Art. 17 response \u2014 not yet the admin UI. Concretely:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Fast subject lookup</strong>: every table that identifies a data subject (registrations, applicants, invoices, billing contacts, alumni, email logs, audit logs, etc.) now carries a hashed email column (SHA-256 of lowercased \u00b7 trimmed) with its own index. One subject request resolves to a single indexed scan per table \u2014 not a full-table <code>ilike</code>.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>PII encryption at rest</strong>: email, phone, and VAT number fields on Users, Portal Users, Invoices, Billing Contacts, Trainers, and Customers are stored Fernet-encrypted (the plaintext columns no longer exist).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Subject-scoped audit trail</strong>: opening a registration, invoice, or training attendee detail panel writes an audit entry tagged with the subject\u2019s email hash (see <em>Audit trail</em> below).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Self-serve export UI (Phase 2 \u2014 live)</strong>: tenant admins can log, approve/reject, and generate subject-data exports directly from <strong>My Company \u2192 Privacy Requests</strong>. The ZIP download link is valid for 7 days.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Per-category erasure execution (Phase 3 \u2014 live)</strong>: approved erasure requests open a per-table preview with delete / anonymize / skip defaults, a type-to-confirm <code>ERASE</code> barrier, and automatic skip-locking of invoices under HGB \u00a7257.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Portal self-service (Phase 4 \u2014 live)</strong>: signed-in portal users can download their own data (export runs inline, allowlist-guarded so staff notes never ship) and submit deletion requests that land in the admin <em>Privacy Requests</em> queue for review.</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-subject-rights',
      title: 'Data subjects\u2019 rights',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Data subjects can exercise the following rights; you (the controller) respond within one month (Art. 12(3)). Each right below lists (a) what's live today, (b) <em>where in SaaSConf</em> to perform it, and (c) what's coming in later phases.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 15 \u2014 Access / Export</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cWhat personal data of mine do you hold?\u201d</em></p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><span class="text-emerald-700 dark:text-emerald-400 font-medium">Live today</span>: <strong>My Company \u2192 Privacy Requests \u2192 New request</strong> \u2014 log the subject\u2019s email(s), then click <em>Generate export</em>. The backend does an indexed hash lookup across <strong>15 tables</strong> (registrations, billing contacts, CFP applicants, applicant activity logs, email logs, alumni, training attendees / registrations / registration attendees, offer attendees, users, portal users, invoices, trainers, customers) plus the <code>audit_log</code> and returns a ZIP with one JSON file per table and a <code>manifest.json</code> summarising the record counts. The download link is valid for 7 days \u2014 regenerate if it expires.</li>
<li class="text-gray-700 dark:text-gray-300">Every request (and every generate / download / reject) is logged in <code>audit_logs</code> against the reviewer\u2019s user id, so you have a permanent compliance trail.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 16 \u2014 Rectification</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cFix my data \u2014 it\u2019s wrong.\u201d</em> <span class="text-emerald-700 dark:text-emerald-400 font-medium">Live today</span> \u2014 the normal admin edit UIs <em>are</em> the rectification mechanism.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Conference admin \u2192 Registration tab \u2192</strong> click a row \u2192 edit first name / last name / email / custom answers / billing profile.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Conference admin \u2192 CFPs tab \u2192 Applicants</strong> \u2192 open an applicant profile \u2192 edit name, email, accessibility fields, affiliations.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Conference admin \u2192 Invoices tab \u2192</strong> open an invoice \u2192 edit recipient name / address / VAT number / email.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Conference admin \u2192 Attendees / Speakers / Sponsors / Alumni tabs \u2192</strong> edit the corresponding profile fields.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Tenant settings \u2192 Users tab \u2192</strong> edit staff user profiles (admin-side users only).</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Every edit fires validation on the client <em>and</em> server (<code>validators.ts</code> / <code>validators.py</code>) so corrections can\u2019t introduce malformed data.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 17 \u2014 Erasure / \u201cRight to be forgotten\u201d</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cDelete my data.\u201d</em> This one is nuanced because <strong>HGB \u00a7257 retention trumps erasure for invoices</strong> \u2014 you cannot legally delete a booked invoice for 10 years even if the subject asks.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><span class="text-emerald-700 dark:text-emerald-400 font-medium">Live today</span>: on an <em>approved</em> erasure request, <strong>My Company \u2192 Privacy Requests \u2192 Execute erasure</strong> opens a per-table preview. Each row shows the count and a default action \u2014 <em>delete</em> for registrations / CFP applicants / email logs / training rows, <em>anonymize</em> for users / portal users / trainers / customers (name replaced with \u201cErased Subject\u201d, email &amp; phone nulled out), and <em>skip</em> (locked) for invoices and billing profiles tied to a retained invoice (HGB \u00a7257). You can override any unlocked row. The execute button only activates after you type <code>ERASE</code> into a final confirmation input \u2014 erasure is irreversible. The per-table record counts + chosen actions land in <code>audit_logs</code> and on the privacy-request\u2019s <code>execution_manifest</code>, so a later auditor can answer \u201cwhat did we erase for subject X on date Y\u201d. Rate-limited to 5 executions / tenant / hour.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Alternative: per-row deletes via existing admin UIs</strong> \u2014 you can still delete a single <em>Registration</em> row (Registration tab \u2192 row menu \u2192 Delete), remove a <em>CFP applicant</em>, delete an <em>Alumni</em> record, or delete a <em>training attendee</em> (as long as no invoice references them). Use this when the subject only wants one specific record removed rather than a full-subject erasure.</li>
<li class="text-gray-700 dark:text-gray-300">Invoice deletion itself shows a retention-warning dialog <em>every time</em> (see the <em>Overview</em> section) \u2014 you must confirm the record is retained in your accounting system.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 20 \u2014 Portability</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cGive me my data in a machine-readable format so I can move it.\u201d</em> <span class="text-emerald-700 dark:text-emerald-400 font-medium">Satisfied by the Art. 15 ZIP</span> \u2014 it is JSON per table (RFC 8259), which qualifies as \u201cstructured, commonly used and machine-readable\u201d.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 21 \u2014 Objection</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Handled ad-hoc per scenario (e.g. objection to marketing email) \u2014 for now, remove the subject from the relevant communications list (<em>Settings \u2192 Email preferences</em> / remove from campaign recipients) and document the objection in your own records. Contact support for guidance on edge cases.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What Phase 1 actually makes fast</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Every subject-identifying row has an indexed SHA-256 email hash, so a subject lookup returns in milliseconds instead of a full-table <code>ilike</code> scan. Tenant admins log and fulfil subject requests from <strong>My Company \u2192 Privacy Requests</strong> \u2014 see the dedicated section below.</p>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-handling-a-request',
      title: 'Handling a subject request',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">A data subject can exercise their rights <em>through any channel</em> \u2014 the law does not require a form. This section is the procedural playbook you run every time someone asks, before you ever touch the Privacy Requests tab.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What a subject can ask you</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cWhat data do you hold about me?\u201d</strong> \u2014 Art. 15 access request. You reply with the export ZIP (all 15 subject-bearing tables + audit trail).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cFix my data, it\u2019s wrong.\u201d</strong> \u2014 Art. 16 rectification. You correct the record in the relevant admin tab; no separate Privacy Request row is needed unless the subject specifically wants a paper trail.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cDelete all my data.\u201d</strong> \u2014 Art. 17 erasure. Log it, approve or reject, and communicate the outcome. Invoices retained under HGB \u00a7257 cannot be deleted \u2014 explain that in your reply; it is <em>not</em> grounds to refuse the whole request.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cGive me my data in a portable format.\u201d</strong> \u2014 Art. 20. Satisfied by the Art. 15 JSON ZIP.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cStop sending me marketing email.\u201d</strong> \u2014 Art. 21 objection. Remove from the relevant list; no deletion required.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>\u201cWho has seen my data?\u201d</strong> \u2014 covered by the subject-scoped audit trail inside the Art. 15 export.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">The channels you have to accept</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Email, web form, postal letter, phone, in person</strong> \u2014 all equally valid. A request in a support ticket or a reply-to-event-email counts.</li>
<li class="text-gray-700 dark:text-gray-300">The clock starts <em>when the request arrives</em>, not when you log it in the Privacy Requests tab. Log the request the same day you receive it so the timeline reflects reality.</li>
<li class="text-gray-700 dark:text-gray-300">You cannot require the subject to use a specific form, and you cannot charge for the request (exceptions below).</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Identity verification \u2014 proportionate, not paranoid</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Art. 12(6) lets you ask for \u201cadditional information necessary to confirm the identity of the data subject\u201d \u2014 but only when you have <em>reasonable doubts</em>. The bar is proportionality:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Request comes from the subject\u2019s registered email</strong>: treat as verified. Don\u2019t ask for ID.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Request comes from a different address</strong>: reply to the <em>registered</em> email first to confirm the request is genuine. A round-trip verification email is almost always enough.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>High-risk request</strong> (erasure of a prominent speaker, or a subject whose records include sensitive Art. 9 data): a photo ID confirming name + email is acceptable, but redact anything you don\u2019t need (date of birth, ID number) and delete it as soon as verification is complete \u2014 do not store it.</li>
<li class="text-gray-700 dark:text-gray-300">Never demand ID for routine corrections (e.g. updating a phone number) \u2014 that\u2019s disproportionate.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">The one-month response window (Art. 12(3))</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">You must respond <strong>within one calendar month</strong> of receipt \u2014 even if the response is \u201cwe need more time\u201d or \u201cwe\u2019re refusing, here\u2019s why\u201d.</li>
<li class="text-gray-700 dark:text-gray-300">For genuinely complex or multi-subject cases you may extend by <strong>up to two further months</strong>, but you must tell the subject <em>within the first month</em> and give a reason. Note this in the Privacy Request\u2019s notes field so the audit trail reflects it.</li>
<li class="text-gray-700 dark:text-gray-300">The Privacy Requests tab shows an <span class="text-amber-700 dark:text-amber-400 font-medium">amber badge after 21 days</span> so you can move before the deadline slips.</li>
<li class="text-gray-700 dark:text-gray-300">Response is <strong>free of charge</strong>. You can only charge a reasonable fee (or refuse) if the request is \u201cmanifestly unfounded or excessive\u201d \u2014 e.g. the same subject asking for a fresh export every week. Document the reason in the rejection field if you invoke this.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Standard workflow</h3>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Acknowledge</strong> receipt the same day (\u201cWe received your request on &lt;date&gt; and will respond by &lt;date + 1 month&gt;\u201d).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Verify identity</strong> proportionately (see above).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Log it</strong> in <strong>My Company \u2192 Privacy Requests \u2192 New request</strong>. Use the <em>notes</em> field to capture how the subject reached you and any identity-verification step.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Fulfil</strong>: for export, click <em>Generate export</em> and send the ZIP (or a secure download link) to the verified address. For erasure, approve or reject; if rejecting, the reason you enter is what the subject will see.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reply</strong> to the subject in plain language \u2014 Art. 12(1) requires a \u201cconcise, transparent, intelligible\u201d response. Attach or link to the ZIP; for erasure, list what was deleted and which invoice rows stay under HGB \u00a7257.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Close the loop</strong> in the Privacy Requests tab; the status + audit trail become your proof of compliance.</li>
</ol>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">When you can lawfully say no</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Invoice retention</strong> (HGB \u00a7257 / AO \u00a7147) overrides erasure for up to 10 years after year-end of issue.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Identity cannot be confirmed</strong> after a reasonable verification attempt (Art. 12(6)).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Manifestly unfounded or excessive</strong> repeat requests (Art. 12(5)).</li>
<li class="text-gray-700 dark:text-gray-300">Any refusal must be explained to the subject and logged via the rejection-reason field. The subject always retains the right to complain to a supervisory authority \u2014 mention that in your reply.</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-privacy-requests',
      title: 'Privacy requests',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Live today</strong>: go to <strong>My Company \u2192 Privacy Requests</strong>. From that tab, tenant admins can:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>New request</strong>: log an incoming data-subject request \u2014 pick <em>export</em> (Art. 15) or <em>erasure</em> (Art. 17), paste one or more subject emails (up to 25 for family / joint bookings), add notes.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Generate export</strong>: on an <em>export</em> request, click the button to build the Art. 15 ZIP on demand. The record-count manifest is stored; the download link is valid for 7 days (regenerate if it expires). Rate-limited to 10 exports / tenant / hour.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Approve</strong> (erasure only): marks the request approved and unlocks <em>Execute erasure</em>. Approval itself counts as the Art. 12(3) on-time reply; the subject does not have to wait for execute before you reply.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Execute erasure</strong> (approved erasure only): opens a per-table preview, lets you override <em>delete</em> / <em>anonymize</em> / <em>skip</em> per category, requires typing <code>ERASE</code> to activate the final button. Invoices and billing profiles tied to a retained invoice are locked at <em>skip</em> (HGB \u00a7257). Writes an audit row with the per-table action + record-count map <em>before</em> the deletion runs, so a rollback never leaves a misleading \u201cwe erased X\u201d trail. Rate-limited to 5 executions / tenant / hour.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reject</strong>: either type. A non-empty rejection reason is required and becomes part of the permanent record. For portal-initiated erasure requests, the subject automatically receives an email containing your rejection reason, closing the Art. 12(3) reply loop.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Filter &amp; search</strong>: filter by status / type, or paste a subject email to find every request concerning them \u2014 the email is hashed client-side and compared to the GIN-indexed <code>subject_email_hashes</code> column.</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Every create / view / approve / reject / generate / download / execute-erasure action writes an <code>audit_logs</code> row with the admin\u2019s user id and the subject\u2019s email hash, so you have a complete compliance trail.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Response-window reminder: you have one month from receiving the request (Art. 12(3)). Requests older than 21 days show an amber badge on the detail panel to warn you before the deadline.</p>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-portal-self-service',
      title: 'Portal self-service',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Data subjects don\u2019t always need an admin \u2014 several rights are already self-serve today in the registration portal.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What registrants / applicants can do today (Phase 1)</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Portal \u2192 Profile</strong>: view and edit their own name, email, password \u2014 direct Art. 16 (rectification) for core profile data.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Portal \u2192 My Registrations</strong>: view every registration tied to the portal account; edit attendee data where the conference allows late edits.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Portal \u2192 Invoices</strong>: download PDFs of their own invoices \u2014 partial Art. 15 (access) / Art. 20 (portability) coverage.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Portal \u2192 My Papers</strong> (CFP applicants): edit submitted abstracts, affiliation, accessibility notes until submission deadline.</li>
<li class="text-gray-700 dark:text-gray-300">All portal logins now verify the user via the indexed <code>email_hash</code> column (never a full-table scan), and the portal user\u2019s email / phone are Fernet-encrypted at rest.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Portal self-service (Phase 4 \u2014 live)</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Signed-in portal users open <strong>Portal \u2192 Privacy</strong> and see two buttons plus their request history.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Download my data</strong>: creates the privacy request, runs the export inline, and streams the ZIP back. No admin involvement. Rate-limited to 3 export + deletion requests per day per IP. The export uses an <em>explicit allowlist</em> (defined in <code>backend/app/core/gdpr/lookups.py</code>) so internal staff notes, admin annotation columns, and payment-processor identifiers are never included \u2014 a CI-time coverage guard + runtime canary byte-scan prevent regressions.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Request deletion</strong>: submits an Art. 17 request in <code>pending_review</code> state straight into the admin <em>Privacy Requests</em> queue. Actual deletion still goes through Phase 3\u2019s per-table preview + type-to-confirm <code>ERASE</code> barrier \u2014 portal users cannot bypass human review.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>My requests</strong>: lists the caller\u2019s own request history with status badges; completed exports stay downloadable for 7 days.</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Portal users can never file a request on somebody else\u2019s behalf \u2014 <code>subject_emails</code> is always stamped from their authenticated session, never accepted from the client.</p>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Outcome notifications (Change 037):</strong> when an admin acts on a portal-initiated erasure request, the subject is automatically emailed the outcome. If the erasure is executed, they receive a confirmation that their data was permanently deleted. If the request is rejected, they receive an email containing your rejection reason verbatim. These are fire-and-forget (failures are logged but never surface to the admin UI) and close the Art. 12(3) reply obligation on the system\u2019s side, though you may still want to send a personalised follow-up for complex cases.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Filing a deletion request fires two fire-and-forget emails: a confirmation to the subject (so they have a paper trail of \u201cyour request was received\u201d), and a notification to every active admin of your tenant. Recipients are resolved from two sources, de-duped: (1) active users who hold an <strong>Admin</strong> or <strong>Super User</strong> tenant role (<strong>My Company \u2192 Users \u2192 Tenant roles</strong>), and (2) the first entry of <strong>My Company \u2192 Contact persons</strong> (falling back to your Resend sender address), which is useful if you have a dedicated privacy mailbox. Only if both sources yield nothing is the notification silently skipped. The email link lands directly on <strong>My Company \u2192 Privacy Requests</strong>. A red badge on the <em>My Company</em> sidebar entry also shows the pending count so you don\u2019t need to open the tab to know a request is waiting. Export requests do <em>not</em> send these emails because the user receives the ZIP inline.</p>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-audit-trail',
      title: 'Audit trail',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Every sensitive action is logged with the admin\u2019s identity, timestamp, and the affected resource. From Phase 1 onward, opening a PII detail panel also writes a log entry so an Art. 15 export can answer \u201cwhich admins have seen this subject\u2019s data?\u201d \u2014 a common follow-up question when a subject complains about a leak.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">The following action codes are emitted for detail-panel opens:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code>registration.view</code> \u2014 admin opened a registration row</li>
<li class="text-gray-700 dark:text-gray-300"><code>invoice.view</code> \u2014 admin opened an invoice</li>
<li class="text-gray-700 dark:text-gray-300"><code>training_attendee.view</code> \u2014 admin opened a training attendee (trainings module only)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Each row is tagged with the subject\u2019s email hash (<code>subject_email_hash</code>), so the Art. 15 export collects <em>every</em> audit event concerning a given subject via a single indexed lookup \u2014 regardless of which admin opened the panel or when.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Audit logs are retained for 365 days and then rotated.</p>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-special-category',
      title: 'Special-category data (Art. 9)',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Some built-in fields may collect Art. 9 data (health, religion, ethnicity, political opinions). Review these carefully:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Accessibility details</strong> on Call-for-Papers applicant profiles — dietary, mobility, or health information.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Emergency contact</strong> on volunteer profiles — adjacent to health.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Custom registration questions</strong> (free-text) — whatever you ask, you store. Review your question text before enabling.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>CFP custom-field answers</strong> — same note as above.</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Ensure you have an explicit legal basis (Art. 9(2)) — usually explicit consent in the registration / submission flow.</p>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-backups',
      title: 'Backups',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Erased data persists in encrypted database backups until the next rotation cycle completes. This follows industry-standard practice and is accepted under the DPA. Contact support for the current backup retention cadence.</p>`,
          }}
        />
      ),
    },
    {
      id: 'dsgvo-subprocessors',
      title: 'Subprocessors',
      categoryId: 'category-dsgvo',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">SaaSConf uses a small number of subprocessors. Subject requests directed at these providers must go to them directly.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Stripe</strong> — payment processing (credit-card metadata only)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Resend</strong> — transactional email delivery</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sentry</strong> — error telemetry; SaaSConf sends errors with <code>send_default_pii=False</code></li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">The full list, including DPA links, is available from your account manager.</p>`,
          }}
        />
      ),
    },
  ],
};
