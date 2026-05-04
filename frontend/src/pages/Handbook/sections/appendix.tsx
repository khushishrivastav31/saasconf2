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
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Action required</strong> — set <code>RECAPTCHA_SECRET_KEY</code> (backend) and <code>VITE_RECAPTCHA_SITE_KEY</code> (frontend build) on each environment. Get keys from <a href="https://www.google.com/recaptcha/admin" class="text-primary-600 hover:underline">https://www.google.com/recaptcha/admin</a> (reCAPTCHA v3 — one site/secret pair powers all three portals).</p>
<p class="text-gray-700 dark:text-gray-300 my-2">Conference registration, training registration, and CFP applicant signup now share the same defense in depth: reCAPTCHA v3 score, hidden honeypot input, 5-second form-time-trap, disposable-email blocklist, and a Redis-backed IP rate-limit (<code>3/hour</code> for conf + training reg, <code>5/minute</code> for CFP signup). Until the keys are configured, the system runs without captcha — the other layers are still active.</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Portal sidebar role gating <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-04-30)</span></h4>
<p class="text-gray-700 dark:text-gray-300 my-2">The unified portal sidebar now only shows menu sections that match the user's actual roles. Users with no role flags see a minimal navigation. Existing CFP committee members and training portal users keep full access automatically.</p>

<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Infrastructure &amp; tooling <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">(2026-04-30)</span></h4>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Frontend now uses pnpm 10</strong> (was npm). All <code>npm install</code> / <code>npm run X</code> commands locally become <code>pnpm install</code> / <code>pnpm X</code>. The Docker images, CI workflow, and Husky hooks are aligned. The shared dep store cuts install time considerably.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Security overrides on transitive dependencies</strong>: <code>d3-color ≥ 3.1.0</code> (ReDoS, was already in place) and <code>dompurify ≥ 3.3.2</code> (8 moderate mXSS/XSS advisories in <code>monaco-editor</code>'s exact-pinned 3.2.7). <code>pnpm audit</code> now reports zero known vulnerabilities at any severity.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Container base images bumped</strong>: node 22.14.0 → 22.22.2-alpine, python 3.12.10 → 3.12.13-slim, plus a refreshed nginx 1.27-alpine SHA digest (Dockerfile.prod and the staging compose file).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Vite pinned to 7.x</strong>: Vite 8's Rolldown bundler has a regression that crashes chart pages in dev with <code>TypeError: InternMap is not a constructor</code>. Production builds (rollup) are unaffected, so CI and staging stay green; only local <code>pnpm dev</code> chart pages were broken. Pinned <code>vite</code>, <code>@vitejs/plugin-react</code>, <code>vitest</code>, and <code>@vitest/coverage-v8</code> to the last esbuild-only line. A scheduled quarterly check auto-opens a PR to re-bump once Rolldown ships the fix.</li>
</ul>

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
