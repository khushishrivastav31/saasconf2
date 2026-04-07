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
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Send targeted messages to training participants, trainers, or customer contacts. Navigate to <strong>Messages</strong> in the sidebar.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Compose messages with rich text formatting</li>
<li class="text-gray-700 dark:text-gray-300">Select recipients from configured recipient lists</li>
<li class="text-gray-700 dark:text-gray-300">Use message templates for common communications</li>
<li class="text-gray-700 dark:text-gray-300">View sent message history</li>
<li class="text-gray-700 dark:text-gray-300">Track delivery status</li>
</ul>
<strong>Setup:</strong> Configure messaging settings, message templates, and recipient lists in the Settings section before sending messages.`,
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
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Publish news and announcements related to training programs. Navigate to <strong>News</strong> in the sidebar.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create news articles with title, content, and publication date</li>
<li class="text-gray-700 dark:text-gray-300">Edit existing articles</li>
<li class="text-gray-700 dark:text-gray-300">Publish or unpublish articles</li>
<li class="text-gray-700 dark:text-gray-300">View published articles on the public-facing portal</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
