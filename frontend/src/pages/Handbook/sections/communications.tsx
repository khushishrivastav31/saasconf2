import type { HandbookCategory } from '../handbookSections';

export const communicationsCategory: HandbookCategory = {
  id: 'category-6',
  name: 'Communications',
  description: '',
  moduleCode: 'conferences',
  sections: [
    {
      id: '6-1-messages',
      title: 'Messages',
      categoryId: 'category-6',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">In-app messaging system for conference communications.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Compose and send messages to individuals or groups</li>
<li class="text-gray-700 dark:text-gray-300">Use message templates (from Settings 1.4.4)</li>
<li class="text-gray-700 dark:text-gray-300">Attach files to messages</li>
<li class="text-gray-700 dark:text-gray-300">Filter messages by status (read/unread), date, sender</li>
<li class="text-gray-700 dark:text-gray-300">Archive, flag, or export messages</li>
<li class="text-gray-700 dark:text-gray-300">Messages can optionally trigger email notifications</li>
</ul>
<strong>Bulk Messaging:</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">Send messages to multiple recipients at once. The bulk compose modal organizes recipients into categories:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Applicants:</strong> All applicants, by paper status, or by committee role &mdash; creates in-app message threads</li>
<li class="text-gray-700 dark:text-gray-300"><strong>By User Role:</strong> Target members of specific roles (e.g., Speakers, Keynote) &mdash; creates in-app message threads</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Registrations:</strong> All confirmed registrations &mdash; sends email only (no portal account)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sponsors:</strong> All sponsors or by sponsor package &mdash; sends email to sponsor contact persons</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Saved Lists:</strong> Manual recipient lists and dynamic filter-based lists (from Settings 1.4.4)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">A live recipient count is shown when you select a target group. Template variables include <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[First Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Last Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Email]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Conference Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Company Name]</code>, and <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Booking Option]</code>.</p>
<strong>Notification bell dropdown:</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">The bell icon in the top bar opens a dropdown showing your unread messages at a glance (admin and speaker portal):</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Admin:</strong> one row per conference with unread messages, each linking directly to that conference&rsquo;s Messaging tab. If the badge shows a count but no conference rows appear (training-domain threads), a summary line explains the count without navigating.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Speaker portal:</strong> shows &ldquo;You have N unread message(s)&rdquo; and a &ldquo;View all messages&rdquo; link. Click outside or press Escape to close.</li>
</ul>
<strong>Dependencies:</strong> User Roles (1.4.2), Recipient Lists (Settings 1.4.4), and Message Templates (Settings 1.4.4). Sponsor Packages (4.1) for sponsor targeting. Booking Options (5.1) for registration targeting.
<strong>Consequences:</strong> Applicant and user role recipients receive in-app notifications (with optional email). Registration and sponsor recipients receive email only.`,
          }}
        />
      ),
    },
    {
      id: '6-2-news',
      title: 'News',
      categoryId: 'category-6',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Publish news articles and announcements. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">news</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create articles with title, rich-text content, and optional attachments</li>
<li class="text-gray-700 dark:text-gray-300">Save as draft or publish immediately</li>
<li class="text-gray-700 dark:text-gray-300">Distribute published articles via email to recipient lists</li>
<li class="text-gray-700 dark:text-gray-300">View articles on the public portal</li>
<li class="text-gray-700 dark:text-gray-300">Edit or unpublish articles</li>
</ul>
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">news_distribution</code>
<strong>Dependencies:</strong> Recipient Lists (Settings 1.4.4) for email distribution.
<strong>Consequences:</strong> Published articles appear on the applicant/attendee portal. Email distribution sends the article content to selected recipient groups.`,
          }}
        />
      ),
    },
  ],
};
