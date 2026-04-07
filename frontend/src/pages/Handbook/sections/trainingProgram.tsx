import type { HandbookCategory } from '../handbookSections';

export const trainingProgramCategory: HandbookCategory = {
  id: 'category-t-program',
  name: 'Training Program',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-design-program',
      title: 'Design Program',
      categoryId: 'category-t-program',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Plan annual training programs using a visual year calendar. Navigate to <strong>Training Program &rarr; [Year] &rarr; Design</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create program years (current or future years)</li>
<li class="text-gray-700 dark:text-gray-300">Drag trainings from the catalog sidebar onto calendar dates to create placements</li>
<li class="text-gray-700 dark:text-gray-300">Drag placement type items (Inhouse, Hybrid) onto existing placements to set their type</li>
<li class="text-gray-700 dark:text-gray-300">Assign locations to placements via a dropdown on the training bar</li>
<li class="text-gray-700 dark:text-gray-300">View weekends (blue) and holidays/blocked days (purple) on the grid</li>
<li class="text-gray-700 dark:text-gray-300">Remove or reposition placements by dragging</li>
<li class="text-gray-700 dark:text-gray-300">Delete old program years (tenant super users only)</li>
<li class="text-gray-700 dark:text-gray-300">Collapse/expand program years in the sidebar</li>
</ul>
<strong>Placement Types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Open</strong> — Public training, multiple customers can book seats (default)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Inhouse</strong> — Private training for a single customer</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Hybrid</strong> — Mix of remote and on-site training</li>
</ul>
<strong>Dependencies:</strong> Trainings must exist in the Training Catalog (Settings). Locations and holidays are optional but recommended.`,
          }}
        />
      ),
    },
    {
      id: 't-assign-trainers',
      title: 'Assign Trainers',
      categoryId: 'category-t-program',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Assign trainers to training placements using drag-and-drop. Navigate to <strong>Training Program &rarr; [Year] &rarr; Trainers</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Drag a trainer from the sidebar onto a training bar in the calendar</li>
<li class="text-gray-700 dark:text-gray-300">Click a training bar to view/manage assigned trainers</li>
<li class="text-gray-700 dark:text-gray-300">Remove trainer assignments from the detail panel</li>
<li class="text-gray-700 dark:text-gray-300">Filter the calendar by trainer to see their personal schedule</li>
<li class="text-gray-700 dark:text-gray-300">Automatic conflict detection: warns about unavailability periods and double-bookings</li>
<li class="text-gray-700 dark:text-gray-300">Override conflicts with confirmation dialog when necessary</li>
</ul>
<strong>Dependencies:</strong> Placements must exist (Design Program). Trainers must be registered with active status in Settings &rarr; Trainers.`,
          }}
        />
      ),
    },
    {
      id: 't-final-program',
      title: 'Final Program',
      categoryId: 'category-t-program',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Publish the finalized program and notify trainers with their personal schedules. Navigate to <strong>Training Program &rarr; [Year] &rarr; Final</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Publish:</strong> Creates a snapshot and emails all assigned trainers a PDF with their personal schedule</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Update:</strong> After changes, click "Update Program" to preview a diff of all changes. Only affected trainers receive updated emails</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Change Preview:</strong> Before confirming, a dialog shows what changed — grouped by placement and trainer, color-coded (green=added, red=removed, amber=modified)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Version History:</strong> Each publish creates a versioned snapshot</li>
<li class="text-gray-700 dark:text-gray-300">Read-only calendar view of the published program with placement type and customer name badges</li>
</ul>
<strong>Email behavior:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Initial publish: all assigned trainers receive "Your Training Schedule {Year}" with PDF</li>
<li class="text-gray-700 dark:text-gray-300">Updates: only affected trainers receive "Updated Training Schedule {Year}" with change summary and updated PDF</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
