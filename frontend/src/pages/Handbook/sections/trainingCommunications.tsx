import type { HandbookCategory } from '../handbookSections';

export const trainingCommunicationsCategory: HandbookCategory = {
  id: 'category-t-comms',
  name: 'Communications',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-messages',
      title: 'Messages',
      categoryId: 'category-t-comms',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">The <strong>Messages</strong> tab in trainings is a full inbox: thread list on the left, message detail + reply on the right — same layout you know from conferences.</p>

<strong>What you can do</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Compose</strong> a broadcast — pick recipients <em>By training session</em> (everyone on a placement, optionally narrowed to specific attendees) or <em>Search by name / email</em> (cross-placement).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reply</strong> 1:1 to any thread. Attendee replies from the portal land here automatically.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Attach files</strong> to broadcasts and replies. Recipients see the paperclip badge in their portal inbox.</li>
<li class="text-gray-700 dark:text-gray-300">Insert <strong>variables</strong> at the cursor: <code>[First Name]</code>, <code>[Last Name]</code>, <code>[Email]</code>, <code>[Training Name]</code>, <code>[Placement Date]</code>, <code>[Company Name]</code>.</li>
<li class="text-gray-700 dark:text-gray-300">Pick a <strong>message template</strong> from <em>Trainings → Settings → Message Templates</em>. Templates can also carry a screen overlay.</li>
<li class="text-gray-700 dark:text-gray-300">Attach a <strong>screen overlay</strong> so recipients see a celebratory animation on their next portal login.</li>
<li class="text-gray-700 dark:text-gray-300">Filter the inbox by <strong>Archived</strong>, <strong>Files</strong>, <strong>Unread</strong>, or search by subject.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Archive / Unarchive</strong> any thread from its detail header.</li>
</ul>

<strong>Per-registration entry points</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">In <em>Training Registrations</em>, each row has a <strong>Message attendees</strong> button (placement-level), and each individual attendee has a <strong>Message</strong> button — opens the same Compose dialog pre-filled with that target.</p>

<strong>Messaging Mode (Settings → Messaging)</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">Two delivery modes, set per tenant:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Email Only</strong> (default for trainings) — the full message body lands directly in the recipient's inbox; threads are still recorded for your reference.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>In-App Messaging</strong> — recipients receive a notification email with a portal link; the actual content is read in their portal inbox.</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Switch any time without losing thread history.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-news',
      title: 'News',
      categoryId: 'category-t-comms',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Publish news and announcements that surface to portal users on the trainings module. Navigate to <strong>News</strong> in the trainings sidebar.</p>

<strong>What you can do</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create rich-text articles (drafts by default).</li>
<li class="text-gray-700 dark:text-gray-300">Attach a <strong>screen overlay</strong> so the article triggers a full-screen animation on the recipient's next portal login.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Publish</strong> / <strong>Unpublish</strong> from the article actions. Only published articles are visible to portal users.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Send</strong> a published article as an email to every training attendee in the tenant (deduped by email).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Edit</strong> or <strong>Delete</strong> at any time.</li>
</ul>

<strong>Who sees published articles</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">Only portal users with a training-portal identity in this tenant — i.e. anyone whose email matches a <em>Training Registration Attendee</em> row. CFP-only applicants do not see training news (and vice versa).</p>`,
          }}
        />
      ),
    },
    {
      id: 't-screen-overlays',
      title: 'Screen Overlays',
      categoryId: 'category-t-comms',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure full-screen animations (confetti, fireworks, sparkle, …) shown to portal users on login events. Navigate to <strong>Trainings → Settings → Screen Overlays</strong>.</p>

<strong>What you can do</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Set a <strong>title</strong>, <strong>body</strong>, <strong>animation</strong>, and <strong>duration</strong> (1–30 s).</li>
<li class="text-gray-700 dark:text-gray-300">Pick a <strong>trigger</strong>: <em>First registration</em>, <em>Always</em>, or <em>Scheduled</em> (with a date).</li>
<li class="text-gray-700 dark:text-gray-300">Upload an optional <strong>image</strong> shown alongside the animation.</li>
<li class="text-gray-700 dark:text-gray-300">Toggle <strong>Active</strong> per overlay; only active overlays fire.</li>
<li class="text-gray-700 dark:text-gray-300">Order overlays via <strong>display order</strong> when multiple are eligible.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Preview</strong> the animation from the overlay row.</li>
</ul>

<strong>Where overlays surface</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">Anywhere a training admin attaches one — News articles, message templates, and individual broadcasts all carry an optional <em>Screen Overlay</em> picker. Trainings overlays are tenant-wide (no per-training fan-out) and only appear to portal users on the trainings module.</p>`,
          }}
        />
      ),
    },
  ],
};
