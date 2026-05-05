import type { HandbookCategory } from '../handbookSections';

export const appendixCategory: HandbookCategory = {
  id: 'category-appendix',
  name: 'Appendix',
  description: '',
  moduleCode: 'conferences',
  sections: [
    {
      id: 'appendix',
      title: 'Appendix',
      categoryId: 'category-appendix',
      content: () => <div dangerouslySetInnerHTML={{ __html: `` }} />,
    },
    {
      id: 'glossary',
      title: 'Glossary',
      categoryId: 'category-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Term</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Definition</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Option</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A purchasable registration item (e.g., "Day 1 Pass", "Tutorial")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Period</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A time window with specific pricing (e.g., "Early Bird")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Package</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A bundle of multiple booking options at a combined price</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>CFP</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Call for Papers — the submission and review process for academic/technical papers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Credit Note</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A negative invoice issued when cancelling a sent invoice</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Discount Code</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A code that applies a percentage or fixed reduction to registration pricing</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Controller</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Under DSGVO / GDPR, the party that decides why and how personal data is processed. For SaaSConf, the tenant is the controller.</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Data Subject</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">The natural person whose personal data is being processed (attendee, applicant, speaker, trainer, etc.). Subjects hold the rights in Art. 15\u201322.</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>DSGVO</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Datenschutz-Grundverordnung \u2014 the German name for the EU General Data Protection Regulation (GDPR).</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Encrypted PII</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Personal contact fields (email, phone, VAT number) on users, invoices, and billing profiles are encrypted in the database. Admin list searches match names with partial text, but email/phone/VAT only match the full value</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Processor</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Under DSGVO / GDPR, the party that processes personal data on the controller\u2019s behalf under a DPA. SaaSConf is the processor for each tenant.</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Dynamic Recipient List</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A filter-based list that resolves recipients at send time based on criteria (e.g., registrations by booking option, sponsors by package)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Module</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A feature set that can be enabled/disabled per tenant (e.g., cfp, invoices, volunteers)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Paper Form Variant</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A role-specific version of the paper submission form with custom field configuration</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Portal</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">The public-facing website where attendees register and applicants submit papers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>RLS</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Row-Level Security — database-level tenant data isolation</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Reverse Charge</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">EU VAT mechanism where the buyer (not seller) accounts for VAT on cross-border B2B services</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Screen Overlay</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A full-screen announcement shown to portal users on login</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>System Role</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A predefined User Role (Keynote, Tutorial, Social Event, Bonus Session, Active Session, Sponsor Talk) that cannot be deleted or renamed</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Tenant</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">An organization using SaaSConf (each tenant's data is fully isolated)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>VIES</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">EU VAT Information Exchange System — online service for validating EU VAT numbers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>User Role</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A conference-scoped role for categorizing participants (e.g., Keynote, Tutorial) with assignable members</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>ZUGFeRD</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">German/EU standard for hybrid invoices (PDF with embedded XML for automated processing)</td></tr></tbody></table></div>`,
          }}
        />
      ),
    },
    {
      id: 'getting-help',
      title: 'Getting Help',
      categoryId: 'category-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Technical Support</strong>: support@saasconf.com</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT Questions</strong>: Consult your tax advisor — SaaSConf provides calculation tools but not tax advice</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Feature Requests</strong>: Submit via platform feedback form</li>
</ul>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Unsaved Changes</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">All forms across the platform use explicit save — changes are only persisted when you click <strong>Save Changes</strong>. When you have unsaved changes, a <strong>Discard</strong> button appears to revert to the last saved state. If you try to navigate away (switch tabs, close the panel, or leave the page) with unsaved changes, a confirmation dialog asks whether to stay or leave. On standalone pages like My Company, closing the browser tab with unsaved changes also triggers a native browser warning.</p>`,
          }}
        />
      ),
    },
    {
      id: 'recent-changes',
      title: 'Recent Platform Changes',
      categoryId: 'category-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">A developer-focused log of platform-level changes over the last few days. Operator-relevant items are flagged with <strong>Action required</strong>; the rest are infrastructure/tooling notes that explain behaviour you might notice but don't need to act on.</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Bot protection on public registration forms <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-05-03)</span></h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Conference registration, training registration, and CFP applicant signup now share the same defense in depth: reCAPTCHA v3 score, hidden honeypot input, 5-second form-time-trap, disposable-email blocklist, and a Redis-backed IP rate-limit (<code>3/hour</code> for conference + training registration, <code>5/minute</code> for CFP signup).</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Four of the five layers (everything except the reCAPTCHA score) are active out of the box. To turn on the reCAPTCHA score check too, follow the steps below — until the keys are configured, the system simply skips that layer.</p>
<h5 class="font-medium text-gray-900 dark:text-gray-100 mt-4 mb-2">How to fully activate reCAPTCHA</h5>
<ol class="list-decimal list-inside space-y-2 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Create a reCAPTCHA v3 site.</strong> Open <a href="https://www.google.com/recaptcha/admin" class="text-primary-600 hover:underline">https://www.google.com/recaptcha/admin</a>, click <em>+ Create</em>, choose type <strong>reCAPTCHA v3</strong>, label it (e.g. "SaaSConf"), and add your staging domain (and the prod domain when ready, plus <code>localhost</code> if you want to test locally). Accept the ToS, submit, and copy both the <strong>Site Key</strong> (public) and <strong>Secret Key</strong> (server-only).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Set the env vars on the target environment.</strong>
  <ul class="list-disc list-inside ml-6 mt-2 space-y-1">
    <li>Backend (server-side env): <code>RECAPTCHA_SECRET_KEY=&lt;secret&gt;</code> in <code>deploy/staging/.env</code> (or your host's secrets mechanism).</li>
    <li>Frontend (build-time arg, not runtime — Vite inlines it into the JS bundle at build time): <code>VITE_RECAPTCHA_SITE_KEY=&lt;site key&gt;</code> under the <code>args:</code> block of the <code>frontend:</code> service in <code>deploy/staging/docker-compose.yml</code>.</li>
  </ul>
</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Redeploy</strong> the stack so both layers pick up the new values (the frontend image needs a rebuild to inline the site key).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Smoke-test from a real browser.</strong> Visit the public registration page — you should see the small <em>"protected by reCAPTCHA"</em> badge in the bottom-right and a request to <code>https://www.google.com/recaptcha/api.js</code> in DevTools. Submit a valid registration (expect <code>200</code>), then poke the bot signals: set <code>honeypot_field</code> in the payload (expect <code>400</code>), submit within 5 seconds of page load (expect <code>400</code>), and fire 4+ submissions from the same IP within an hour (expect <code>429</code>).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Watch the score distribution</strong> in the reCAPTCHA admin console for the first few days. If real users routinely score below the default <code>0.5</code> threshold, lower it via the optional per-conference <code>score_threshold</code> setting (the global default lives in <code>RECAPTCHA_SCORE_THRESHOLD</code>).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>For production</strong>: either re-use the same key pair (add the prod domain to the existing reCAPTCHA site) or create a separate prod key — separate is cleaner because it keeps the staging score distribution from leaking into prod's signal. Set <code>RECAPTCHA_SECRET_KEY</code> + <code>VITE_RECAPTCHA_SITE_KEY</code> on the prod environment the same way.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Local dev</strong>: optional. Leave both vars empty (captcha bypassed; other four layers still active) or add <code>localhost</code> to the admin console domains and put the keys in your local <code>.env</code> if you want to exercise the full chain.</li>
</ol>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Portal sidebar role gating <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-04-30)</span></h4>
<p class="text-gray-700 dark:text-gray-300 my-2">The unified portal sidebar now only shows menu sections that match the user's actual roles. Users with no role flags see a minimal navigation. Existing CFP committee members and training portal users keep full access automatically.</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Infrastructure &amp; tooling <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-04-30)</span></h4>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Frontend now uses pnpm 10</strong> (was npm). All <code>npm install</code> / <code>npm run X</code> commands locally become <code>pnpm install</code> / <code>pnpm X</code>. The Docker images, CI workflow, and Husky hooks are aligned. The shared dep store cuts install time considerably.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Security overrides on transitive dependencies</strong>: <code>d3-color ≥ 3.1.0</code> (ReDoS, was already in place) and <code>dompurify ≥ 3.3.2</code> (8 moderate mXSS/XSS advisories in <code>monaco-editor</code>'s exact-pinned 3.2.7). <code>pnpm audit</code> now reports zero known vulnerabilities at any severity.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Container base images bumped</strong>: node 22.14.0 → 22.22.2-alpine, python 3.12.10 → 3.12.13-slim, plus a refreshed nginx 1.27-alpine SHA digest (Dockerfile.prod and the staging compose file).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Vite pinned to 7.x</strong>: Vite 8's Rolldown bundler has a regression that crashes chart pages in dev with <code>TypeError: InternMap is not a constructor</code>. Production builds (rollup) are unaffected, so CI and staging stay green; only local <code>pnpm dev</code> chart pages were broken. Pinned <code>vite</code>, <code>@vitejs/plugin-react</code>, <code>vitest</code>, and <code>@vitest/coverage-v8</code> to the last esbuild-only line. A scheduled quarterly check auto-opens a PR to re-bump once Rolldown ships the fix.</li>
</ul>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Unlock a locked-out admin/user <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-05-05)</span></h4>
<p class="text-gray-700 dark:text-gray-300 my-2">After 5 failed login attempts within 15 minutes, an account is auto-locked (brute-force protection). Previously the only remedy was operator-side Redis surgery. Now any tenant admin can lift the lock from the admin console: <strong>Tenants &rarr; (tenant) &rarr; Users tab</strong> &rarr; click the small padlock icon in the row's action column. The action is idempotent — clicking on a non-locked account just reports "no failed login attempts on record". Each invocation is recorded in the audit log (<code>user.unlock_login</code>).</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Bulk-cancel for bot-flooded registrations <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-05-04)</span></h4>
<p class="text-gray-700 dark:text-gray-300 my-2">For the training surface today (conference follows). On the Trainings &rarr; Registrations admin tab, <strong>Cancel many&hellip;</strong> opens a three-step dialog (Filter &rarr; Preview with per-row checkboxes &rarr; Confirm with typed-count guard) that turns each ticked row into a credit note via the same single-cancel primitives — invoice flipped, credit note generated and emailed, Stripe refunds initiated for paid CC. Capped at 500 per call.</p>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>About the originating-IP column the filter uses — GDPR retention.</strong> The IP is captured at registration time for fraud detection. Retention is purpose-bound, not time-bound: it is automatically deleted the moment the registration's status reaches a terminal state (<strong>paid</strong> — no abuse possible past payment — or <strong>cancelled</strong> — row already being cleaned up). Enforced centrally via a SQLAlchemy <code>before_flush</code> listener, so every transition path (public-portal create-with-paid, admin mark-paid, Stripe webhook, single-cancel, bulk-cancel) clears the IP without per-call-site code. In practice the IP exists only for the brief window between form submission and either payment confirmation or cancellation — older rows carry NULL.</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Scheduled maintenance routines</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Two automated agents now run on a cron and open PRs only when their conditions are met (no empty-PR noise):</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Monthly</strong> (1st of every month) — checks whether <code>eslint-plugin-react-hooks v8</code> has shipped on npm with a peer range that includes our <code>eslint@10</code>. If yes, opens a PR to drop the <code>strict-peer-dependencies=false</code> escape hatch in <code>frontend/.npmrc</code>.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Quarterly</strong> (1st of Jan/Apr/Jul/Oct) — inspects Vite 8's optimizeDeps bundle for the InternMap lazy-init wrapper. If gone, re-bumps Vite + recharts together; otherwise exits silently.</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
