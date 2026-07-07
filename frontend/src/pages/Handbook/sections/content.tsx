import type { HandbookCategory } from '../handbookSections';

export const contentCategory: HandbookCategory = {
  id: 'category-2',
  name: 'Content',
  description: '',
  moduleCode: 'conferences',
  sections: [
    {
      id: '2-1-call-for-papers',
      title: 'Call for Papers',
      categoryId: 'category-2',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage the entire CFP lifecycle from topic definition through paper decisions. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp</code> module.</strong></p>
<p class="text-gray-700 dark:text-gray-300 my-2">The Call for Papers is a structured multi-phase process that guides papers from submission through peer review to final decisions. It is designed around the academic conference model where an independent program committee evaluates submissions through blind or open review.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">The CFP tab has 6 sub-tabs, each representing one stage of the review pipeline. Papers flow through these stages sequentially:</p>
<div class="my-6 overflow-x-auto"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:8px 0"><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd">SETUP</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">SUBMISSION</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">ASSIGNMENT</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">REVIEW</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">DECISION</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">OUTCOME</div></div></div>
<strong>Paper status lifecycle — each paper transitions through these statuses:</strong>
<div class="my-6 space-y-3"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd">Submitted</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#fef3c7;color:#92400e;border:1px solid #fcd34d">Under Review</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd">Evaluated</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">Accepted</div></div><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0;margin-left:0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd">Evaluated</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5">Rejected</div></div></div>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Submitted</strong>: Paper received from author via the portal. Author can still edit until the submission deadline.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Under Review</strong>: At least one reviewer has been assigned. Paper is locked for author edits.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Evaluated</strong>: All assigned reviewers have completed their reviews. Scores are aggregated.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Accepted</strong>: Admin has accepted the paper. Author receives acceptance email. Paper can become a Session.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Rejected</strong>: Admin has rejected the paper. Author receives rejection email.</li>
</ul>
<strong>Phase 1 — Setup (before opening the CFP):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Define Topics/tracks that authors can submit to (sub-tab: Topics)</li>
<li class="text-gray-700 dark:text-gray-300">Configure the Paper Form fields in Settings (1.4.3)</li>
<li class="text-gray-700 dark:text-gray-300">Set up Score Scales and Review Criteria in Settings (1.4.3)</li>
<li class="text-gray-700 dark:text-gray-300">Add Program Committee members (3.1) with topic expertise and COI declarations</li>
<li class="text-gray-700 dark:text-gray-300">Share the portal URL with potential authors</li>
</ul>
<strong>Phase 2 — Submission (portal-side):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Authors register on the portal and submit papers selecting a topic</li>
<li class="text-gray-700 dark:text-gray-300">Papers arrive in the Papers sub-tab with status "Submitted"</li>
<li class="text-gray-700 dark:text-gray-300">Authors can update their submissions until the deadline (configurable via Deadlines 1.5)</li>
</ul>
<strong>Phase 3 — Assignment:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Admin assigns papers to committee reviewers in the Assignments sub-tab — use drag-and-drop for individual assignments or click a reviewer card to arm them for bulk assignment.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Paper cards now show</strong>: session type &amp; duration, main speaker + country, all co-speakers (name, country, invitation status — pending/accepted/declined), and the reviewer progress indicator.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Conflict reasons</strong>: hovering an invalid drop target shows exactly why a reviewer cannot be assigned (speaker/co-speaker conflict of interest, excluded-topic overlap, or already assigned).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Bulk assign</strong>: click a reviewer card in the left rail to arm them, then filter papers by session type / topic / review status, preview which papers will be assigned vs. skipped, and confirm with a single click.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Auto-assign</strong> (toolbar button) distributes reviewers across all eligible papers load-balanced by topic; use it first, then drag-and-drop to fine-tune.</li>
<li class="text-gray-700 dark:text-gray-300">The system respects COI declarations — conflicted reviewers cannot be assigned manually or via bulk/auto-assign.</li>
<li class="text-gray-700 dark:text-gray-300">Each paper can have multiple reviewers for balanced evaluation (configured in CFP Settings).</li>
</ul>
<strong>Phase 4 — Review (portal-side):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Committee members review assigned papers through their portal</li>
<li class="text-gray-700 dark:text-gray-300">They score papers using the configured Score Scales and Review Criteria</li>
<li class="text-gray-700 dark:text-gray-300">Papers move to "Evaluated" status once all assigned reviews are complete</li>
<li class="text-gray-700 dark:text-gray-300">A reviewer can click <strong>Edit</strong> on their own submitted review to revise and resubmit it at any time — even after the paper has been accepted or rejected. There is no "save as draft" step once submitted; edits go straight back to resubmit. Every edit is timestamped (visible to admins as an "Edited" badge in the paper's review list) so late changes to a decided paper stay auditable.</li>
</ul>
<strong>Phase 5 — Decision:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Admin reviews aggregated scores and comments in the Evaluated Papers sub-tab</li>
<li class="text-gray-700 dark:text-gray-300">Papers can be compared side-by-side</li>
<li class="text-gray-700 dark:text-gray-300">Admin makes Accept or Reject decisions (individually or in bulk)</li>
</ul>
<strong>Phase 6 — Outcome:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Accepted papers appear in the Accepted Papers sub-tab; authors receive acceptance email</li>
<li class="text-gray-700 dark:text-gray-300">Rejected papers appear in the Rejected Papers sub-tab; authors receive rejection email</li>
<li class="text-gray-700 dark:text-gray-300">Accepted papers can be converted into Sessions (2.3) for the conference program</li>
</ul>
<strong>Dependencies (must be set up before opening the CFP):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Paper Form, Score Scales, and Review Criteria in Settings (1.4.3)</li>
<li class="text-gray-700 dark:text-gray-300">Topics defined (sub-tab: Topics)</li>
<li class="text-gray-700 dark:text-gray-300">Program Committee members added (3.1) with topic expertise</li>
</ul>
<strong>Key constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">COI-flagged reviewers cannot be assigned to conflicted papers</li>
<li class="text-gray-700 dark:text-gray-300">Paper status transitions are sequential — you cannot skip phases</li>
<li class="text-gray-700 dark:text-gray-300">Once a decision (accept/reject) is made, the paper cannot return to evaluation</li>
</ul>
<strong>Email templates used:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">reviewer_assignment</code> — sent to reviewers when papers are assigned</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_acceptance</code> — sent to authors when their paper is accepted</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_rejection</code> — sent to authors when their paper is rejected</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Accepted papers → Sessions (2.3) → Program Design (2.2.1): the content pipeline from submission to published schedule</li>
<li class="text-gray-700 dark:text-gray-300">Topics → Committee expertise matching: topics help suggest appropriate reviewers</li>
<li class="text-gray-700 dark:text-gray-300">Deadlines (1.5): set submission deadlines and review deadlines to keep the process on track</li>
</ul>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.1 Topics</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Define submission topics/tracks for the CFP (e.g., "Machine Learning", "Security", "DevOps"). Topics categorize papers and help match reviewers with relevant expertise.</p>
<strong>Consequences:</strong> Topics appear on the CFP portal submission form. Papers are categorized by topic. Topics can be used to match reviewers with relevant expertise.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.2 Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View and manage all submitted papers. Search, filter by status/topic, view paper details, download attachments. Papers support multiple authors (co-speakers).</p>
<strong>Paper statuses:</strong> Submitted → Under Review → Evaluated → Accepted/Rejected
<strong>Consequences:</strong> Paper status changes trigger notifications to applicants (if email templates configured).
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.3 Assignments</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Assign papers to Program Committee reviewers. The system supports manual assignment and can suggest assignments based on topic expertise.</p>
<strong>Constraints:</strong> Reviewers with conflict-of-interest (COI) flags cannot be assigned to those papers. Each paper should have multiple independent reviewers.
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">reviewer_assignment</code>
<strong>Consequences:</strong> Assigned reviewers receive email notifications and see papers in their portal review queue.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.4 Evaluated Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View papers that have completed the review process with aggregated scores and reviewer comments. Compare papers side-by-side to make informed accept/reject decisions.</p>
<strong>Dependencies:</strong> Reviews must be completed by assigned committee members.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.5 Accepted Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Papers marked as accepted. Bulk or individual acceptance with email notification.</p>
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_acceptance</code>
<strong>Consequences:</strong> Accepted papers can be converted into program sessions. Applicants receive acceptance notification.
<strong>Interdependency:</strong> Accepted papers → Sessions (2.3) → Program Design (2.2.1)
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.6 Rejected Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Papers marked as rejected. Bulk or individual rejection with email notification.</p>
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_rejection</code>
<strong>Consequences:</strong> Applicants receive rejection notification.`,
          }}
        />
      ),
    },
    {
      id: '2-2-program',
      title: 'Program',
      categoryId: 'category-2',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Design and build the conference schedule. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">program</code> module.</strong></p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.2.1 Design</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Visual CSS Grid editor for building the conference schedule day by day. Each day displays a grid where:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Rows</strong> = time slots (e.g., 09:00–10:00, 10:30–12:00)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Columns</strong> = tracks (e.g., "Main Hall", "Room A", "Workshop Room")</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Cells</strong> = sessions placed at a specific time and track</li>
</ul>
<strong>Building the grid:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Create Program Days</strong> — each maps to a conference date. Days appear as tabs.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Add Time Slots</strong> — define start/end times for each day. Slots can span multiple rows (e.g., a 3-hour tutorial).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Add Tracks</strong> — parallel streams within a day. Each track gets a column.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Place Sessions</strong> — drag existing sessions into cells, or create new ones inline. A session can span multiple time slots (multi-slot duration).</li>
</ol>
<strong>Special slot types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Break slots</strong> — non-session time (coffee, lunch). Span all tracks with a label.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>General events</strong> — plenary sessions that span all tracks (opening ceremony, keynote).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Regular sessions</strong> — placed in a single track column.</li>
</ul>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Reorder tracks and time slots by dragging</li>
<li class="text-gray-700 dark:text-gray-300">Resize time slots by adjusting start/end times</li>
<li class="text-gray-700 dark:text-gray-300">Assign a location to each track</li>
<li class="text-gray-700 dark:text-gray-300">Color-code sessions by session type</li>
<li class="text-gray-700 dark:text-gray-300">View speaker assignments per session</li>
</ul>
<strong>Dependencies:</strong> Sessions (2.3), Locations (1.6), and Session Types (Settings 1.4.2) should be created first.
<strong>Consequences:</strong> The program grid becomes the published schedule. Time slot definitions determine when sessions appear on the portal and in registration session selection.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.2.2 Build</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Assign papers to sessions and publish the program to attendees.</p>
<strong>Paper assignment:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Open a session in the grid to see its paper list</li>
<li class="text-gray-700 dark:text-gray-300">Search and add accepted papers (from CFP Accepted Papers, 2.1.5)</li>
<li class="text-gray-700 dark:text-gray-300">Set paper order within a session (presentation sequence)</li>
<li class="text-gray-700 dark:text-gray-300">Each paper can only be assigned to one session</li>
</ul>
<strong>Publishing workflow:</strong>
<div class="my-6 space-y-3"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Draft</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Preview</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Publish</div></div><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0;margin-left:0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Published</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Update (re-publish)</div></div></div>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Preview</strong> — generates a read-only preview of the full schedule. Review for gaps, conflicts, or missing assignments.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Publish</strong> — makes the program visible on the attendee portal. Triggers acceptance/rejection emails to paper authors.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Update</strong> — after initial publish, changes can be re-published. Only <strong>new</strong> assignments trigger notifications (differential publishing — authors already notified are not emailed again).</li>
</ol>
<strong>Email templates used:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">Paper Acceptance</code> — sent to authors whose papers are assigned to a session on publish</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">Paper Rejection</code> — sent to authors whose papers were not assigned (if configured)</li>
</ul>
<strong>Dependencies:</strong> Program Design (2.2.1) must have the grid structure. Accepted Papers (2.1.5) must exist for assignment.
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Publishing makes the schedule visible on the portal</li>
<li class="text-gray-700 dark:text-gray-300">Authors receive acceptance/rejection emails on first publish</li>
<li class="text-gray-700 dark:text-gray-300">Subsequent re-publishes only notify newly assigned authors</li>
<li class="text-gray-700 dark:text-gray-300">Assigned papers appear in the session detail on the portal</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: '2-3-sessions',
      title: 'Sessions',
      categoryId: 'category-2',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage individual conference sessions. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sessions</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create sessions with title, description, session type, duration</li>
<li class="text-gray-700 dark:text-gray-300">Assign speakers and locations</li>
<li class="text-gray-700 dark:text-gray-300">Mark sessions as "separately bookable" (for tutorials, workshops)</li>
<li class="text-gray-700 dark:text-gray-300">Set session capacity limits</li>
<li class="text-gray-700 dark:text-gray-300">Link sessions to program days</li>
</ul>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Session Types</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Session types are format templates defined in <strong>Settings > Conference Setup > Session Types</strong> (1.4.2). Every session must have a type. Types control display and behavior across the platform.</p>
<strong>Built-in examples:</strong> Keynote, Workshop, Panel Discussion, Tutorial, Poster Session, Hackathon, Bonus Session, Networking, Social Event.
<strong>Key fields on a session type:</strong>
<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Field</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Purpose</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Name</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Display label (e.g., "Tutorial", "Keynote")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Default Duration</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Pre-fills duration when creating a session of this type (e.g., 90 min)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Separately Bookable</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">If enabled, sessions of this type appear as selectable options during registration</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Is Tutorial</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Marks the type as a tutorial format — used for filtering and display grouping</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Color</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Color-codes sessions of this type in the Program Design grid</td></tr></tbody></table></div>
<strong>How <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">separately_bookable</code> works:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">A booking option is linked to a program day</li>
<li class="text-gray-700 dark:text-gray-300">That day has sessions marked with a <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">separately_bookable</code> session type</li>
<li class="text-gray-700 dark:text-gray-300">During registration, the registrant sees dropdown menus grouped by session type to choose from</li>
<li class="text-gray-700 dark:text-gray-300">Parallel sessions in the same time slot: choose <strong>one</strong> via dropdown</li>
<li class="text-gray-700 dark:text-gray-300">Non-parallel sessions (different time slots): choose from <strong>each</strong> independently</li>
<li class="text-gray-700 dark:text-gray-300">Sessions without papers assigned show: <em>"You can choose your sessions later"</em></li>
<li class="text-gray-700 dark:text-gray-300">Full sessions (at capacity) are hidden from dropdowns</li>
</ol>
<strong>Dependencies:</strong> Session Types (Settings 1.4.2) must be defined first. Speakers (3.2) and Locations (1.6) should exist for assignment.
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sessions appear in Program Design (2.2.1) for scheduling</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Separately bookable sessions</strong> appear as selection options during registration when linked to a booking option's program day</li>
<li class="text-gray-700 dark:text-gray-300">Session capacity limits hide full sessions from registration dropdowns</li>
<li class="text-gray-700 dark:text-gray-300">Session type colors appear in the program grid for visual identification</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Booking Options (5.1) link options to program days; if that day has bookable sessions, registrants choose one per time slot</li>
<li class="text-gray-700 dark:text-gray-300">Attendees (3.4) shows which session each registrant selected</li>
<li class="text-gray-700 dark:text-gray-300">Program Design (2.2.1) uses session types for color-coding and grouping</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
