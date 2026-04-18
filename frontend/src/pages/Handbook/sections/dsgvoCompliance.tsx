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
<li class="text-gray-700 dark:text-gray-300"><strong>Ops-side export</strong>: SaaSConf support can generate the Art. 15 ZIP from internal tooling on request (one command). The admin-facing UI to self-serve that export is Phase 2.</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Admin UI for logging + reviewing subject requests, the per-category erasure preview, and the portal-side <em>My Data</em> tab land in Phases 2\u20134. Each section below calls out what\u2019s live now vs. what\u2019s coming.</p>`,
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
<li class="text-gray-700 dark:text-gray-300"><span class="text-emerald-700 dark:text-emerald-400 font-medium">Live via ops (Phase 1)</span>: email SaaSConf support with the subject\u2019s email address. Support runs <code>python -m scripts.export_subject_data</code>, which does an indexed hash lookup across <strong>15 tables</strong> (registrations, billing contacts, CFP applicants, applicant activity logs, email logs, alumni, speakers, sponsors, training attendees / registrations / registration attendees, offer attendees, trainers, customers, audit events) and returns a ZIP with one JSON file per table plus a <code>manifest.json</code> summarising the record counts.</li>
<li class="text-gray-700 dark:text-gray-300">The request itself is logged in the <code>privacy_requests</code> table (requestor, reviewer, outcome, timestamps) so you have an audit trail even though there is no UI yet.</li>
<li class="text-gray-700 dark:text-gray-300"><span class="text-amber-700 dark:text-amber-400 font-medium">Phase 2</span>: a <strong>Privacy Requests</strong> tab under <em>Tenant Settings</em> with a \u201cGenerate export\u201d button per request \u2014 no ops email needed.</li>
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
<li class="text-gray-700 dark:text-gray-300"><span class="text-amber-700 dark:text-amber-400 font-medium">Full \u201cright-to-be-forgotten\u201d flow arrives in Phase 3</span>: preview + confirm, per-category choice of <em>delete</em> vs <em>anonymize</em>, automatic skip of in-retention invoices.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Today, via existing admin UIs</strong>, you can already: delete a single <em>Registration</em> row (Registration tab \u2192 row menu \u2192 Delete), remove a <em>CFP applicant</em>, delete an <em>Alumni</em> record, or delete a <em>training attendee</em> (as long as no invoice references them). These destructive actions prompt a confirm dialog and emit an audit event.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>For partial erasure</strong> (delete registration, keep invoice), contact SaaSConf support \u2014 ops tooling can anonymise a row (replace name/email with a placeholder) while preserving the invoice\u2019s accounting identity.</li>
<li class="text-gray-700 dark:text-gray-300">Invoice deletion itself shows a retention-warning dialog <em>every time</em> (see the <em>Overview</em> section) \u2014 you must confirm the record is retained in your accounting system.</li>
</ul>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 20 \u2014 Portability</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The subject asks: <em>\u201cGive me my data in a machine-readable format so I can move it.\u201d</em> <span class="text-emerald-700 dark:text-emerald-400 font-medium">Satisfied by the Art. 15 ZIP</span> \u2014 it is JSON per table (RFC 8259), which qualifies as \u201cstructured, commonly used and machine-readable\u201d.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Art. 21 \u2014 Objection</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Handled ad-hoc per scenario (e.g. objection to marketing email) \u2014 for now, remove the subject from the relevant communications list (<em>Settings \u2192 Email preferences</em> / remove from campaign recipients) and document the objection in your own records. Contact support for guidance on edge cases.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What Phase 1 actually makes fast</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Every subject-identifying row has an indexed SHA-256 email hash, so a subject lookup returns in milliseconds instead of a full-table <code>ilike</code> scan. The <code>privacy_requests</code> tracking table exists in the database (so ops-run requests can already be recorded); its admin UI ships in Phase 2.</p>`,
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
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Today (Phase 1):</strong> when you receive a subject request, contact SaaSConf support. We run the export or (case-by-case) erasure from ops tooling; the request, reviewer, and outcome are recorded in the <code>privacy_requests</code> table so you have an audit trail.</p>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Phase 2 (planned):</strong> a dedicated <strong>Privacy Requests</strong> tab under tenant settings, letting you:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Log incoming data-subject requests (access or erasure)</li>
<li class="text-gray-700 dark:text-gray-300">Approve or reject portal self-service requests</li>
<li class="text-gray-700 dark:text-gray-300">Generate the subject-data export ZIP and deliver a time-limited download link</li>
<li class="text-gray-700 dark:text-gray-300">Preview and execute erasure plans with per-category delete / anonymize / skip choices (Phase 3)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Response-window reminder: you have one month from receiving the request (Art. 12(3)) \u2014 contact support early rather than late.</p>`,
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
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">What's coming for portal users (Phase 4)</h3>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>My Data \u2192 Export</strong>: download the same Art. 15 ZIP the admin-side export produces \u2014 auto-approved, no admin involvement.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>My Data \u2192 Request deletion</strong>: submit an Art. 17 request that lands in the admin <em>Privacy Requests</em> tab for approval (Phase 2 + Phase 3 feed into this).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>My Data \u2192 Consent log</strong>: view and revoke marketing / analytics consents.</li>
</ul>`,
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
