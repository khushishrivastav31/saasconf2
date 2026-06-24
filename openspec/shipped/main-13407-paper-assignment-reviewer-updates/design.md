# MAIN-13407: Design

## Data — already available (no backend work)

Everything the new card needs is already serialized on the `Paper` response and
fetched by the assignment screen's papers query:

| Need | Field | Source |
| --- | --- | --- |
| Session type | `session_type_name`, `session_type_duration` | `schemas/cfp_papers.py:201-203`, `types/cfp.ts:330-331` |
| Speaker name | `main_speaker.first_name/last_name` | `types/cfp.ts:327` |
| Speaker country | `main_speaker.country` | `types/cfp.ts:243` |
| Co-speaker names | `cospeakers[].applicant.first_name/last_name` | `types/cfp.ts:294-298` |
| Co-speaker country | `cospeakers[].applicant.country` | `types/cfp.ts:243` |
| Invitation status | `cospeakers[].invitation_status` | `types/cfp.ts:296` |

So this is a **display + interaction** change in `CFPAssignments`, not a data
change. `country` is stored as a string (ISO code or name) on `CFPApplicant`; the
mockups render it as-is. At implementation time we can map ISO codes to labels via
the existing `COUNTRY_OPTIONS` if the stored value is an ISO code.

## Shared behaviour (true for all three proposals)

- **Session type badge** on every card (name + duration, e.g. `Workshop · 90 min`).
  Omitted only when `session_type_name` is null.
- **Speaker line**: `First Last · <country>`.
- **Co-speakers**: each co-speaker shown by name with country and a small
  invitation-status indicator (pending = grey, accepted = green, declined = red).
  Shown for **all** statuses — declined co-speakers still appear.
- **Sticky committee panel**: the program-committee column stays in view while the
  papers list scrolls (CSS `position: sticky` on the committee column / its own
  independent scroll region; the page does not scroll the committee out of view).
- **Drag & drop unchanged**: members drag onto papers (and papers onto members),
  exactly as today.
- **Invalid-assignment tooltip**: hovering an invalid drop target shows the
  specific reason. The reason is already computable client-side in
  `canAssignMemberToPaper` (`CFPAssignments/index.tsx:260`); we extend it to return
  *why* (enum: `is_speaker`, `is_cospeaker`, `already_assigned`, `excluded_topic`)
  and render the matching message in a tooltip. The 409 reason from the POST
  (`paper_assignments.py:145`) remains the server-side backstop.

## The three proposals (what Uwe chooses between)

Originally three layouts were mocked up. **Uwe / Brandon chose Proposal A**
(2026-06-24); Proposals B (dense rows) and C (detail pane) were dropped and their
mockups deleted. Only A is carried forward.

### Proposal A — Enriched card, sticky sidebar (`proposal-a-enriched-card.html`) — CHOSEN

Closest to today. Keep the two-column layout (committee left, papers right). The
committee column is sticky. Each paper stays a **card**, but enriched: session-type
badge top-right, speaker line with country, and a stacked co-speaker list (name +
country + status dot). Lowest implementation risk — it's an incremental change to
the current card.

- **Pros**: smallest diff, familiar, fast to ship.
- **Cons**: taller cards → fewer papers visible at once (see "Handling scale").

## Handling scale — many papers, few reviewers

A real conference is ~5 reviewers and ~100 papers. At `reviewers_per_paper = 3`
that's ~300 assignments — manual drag-and-drop alone does not scale, and taller
enriched cards make a 100-item scroll heavier. The design leans on tooling that
**already exists** on this screen plus a few targeted additions; drag-and-drop
becomes the *fine-tuning* tool, not the bulk one.

**Already built (keep + surface prominently):**

- **Auto-assign** (`POST /cfp/paper-assignments/auto-assign`,
  `paper_assignments.py:188`) — one action distributes `reviewers_per_paper`
  reviewers across all (optionally only-submitted) papers, **load-balanced** (sorts
  eligible members by current load) and **conflict/excluded-topic aware**, and
  reports papers it couldn't fully staff (`skipped_details`). This is the primary
  answer to 100 papers: bulk-assign first, then drag to correct.
- **Status filters** none / partial / complete (`index.tsx:218`) — narrow the 100
  down to just the papers still needing reviewers, so the admin never scrolls the
  full list to find gaps.
- **Search** + reviewer/paper-status filters — slice by speaker, title, topic.
- **Per-member load count** on each committee card — visible balance signal.

**Additions this change should make for scale (in priority order):**

1. **Make the auto-assign entry obvious** in the toolbar (it currently lives behind
   a button + modal) and show the post-run summary inline (created / skipped).
2. **Per-member assignment count** — show how many papers each reviewer currently
   has (a plain count, as today), so the admin can spread work sensibly. No
   "target"/average comparison — keep it simple.
3. **Default filter to "needs reviewers"** (none + partial) when the list is large,
   so the admin lands on the work that remains, not all 100.
4. **List virtualization / windowing** for the enriched cards once a conference
   exceeds ~50 papers — perf is first-class here; render only visible cards
   (`react-window` or equivalent) and keep `React.memo` per card. Verify the sticky
   committee panel and 15s auto-refetch don't fight the virtual scroller.
5. *(Optional, evaluate with Uwe)* a **"assign this member to all filtered papers"**
   bulk action for the topic-expert case (one reviewer owns a whole topic) —
   respects the same conflict/excluded-topic rules, skips and reports conflicts.

These are captured as tasks; items 4–5 may split into a follow-up PR if the first
iteration (cards + sticky + tooltip + auto-assign surfacing) is shippable sooner.

### Massive assignment — interaction (decided)

The primary bulk pattern, demonstrated in `mockups/proposal-a-enriched-card.html`:

1. **Fixed reviewer rail** — the program-committee column is pinned (own scroll,
   doesn't move with the page), so the drag source / bulk target is always
   reachable while the papers list scrolls. Each reviewer card shows their current
   **assignment count** (a plain number, as today) so the admin can spread work
   sensibly — no "target"/average figure.
2. **Arm a reviewer by clicking their card** (decided — not a separate "Pick"
   button). The whole card is the toggle. Implementation must disambiguate a
   *click* (arm) from the *start of a drag*: only treat as arm on click without
   drag movement (e.g. arm on `click`, and cancel the armed-toggle if a `dragstart`
   fired). Armed state is visually distinct (ring + highlight).
3. **Filter the papers** by **session type**, **topic**, and **status**
   (all / needs-reviewers / complete). The filtered count is shown.
4. **"Assign <reviewer> to all N filtered"** acts on the current filter. It only
   targets papers the reviewer is *eligible* for (skips conflict / excluded-topic /
   already-assigned / already-full).
5. **Confirm before applying** (decided — no silent bulk write). Clicking the bulk
   button opens a **preview/confirm dialog**: "Assign <reviewer> to **11** papers ·
   **3** will be skipped (2 conflict of interest, 1 excluded topic)." Nothing is
   written until the admin confirms. While armed, each card shows a green/amber
   stripe previewing assign-vs-skip before the dialog, too.
6. **Backend** — bulk apply should reuse the existing per-assignment create logic
   and its conflict/duplicate checks (`paper_assignments.py:112`), either by
   looping server-side in a new bulk endpoint
   (`POST /cfp/paper-assignments/bulk`, body = reviewer + paper_ids) that returns
   `{ assigned, skipped: [{paper_id, reason}] }`, or by client fan-out. A single
   bulk endpoint is preferred (one round-trip, one transaction, consistent skip
   reporting). **This is the one backend addition in scope** — note it updates the
   OpenAPI schema, so `pnpm gen:api` must run if we add it.

## Recommendation — confirmed

**Proposal A**, with the scale tooling above. It meets every Must (session type,
co-speaker names regardless of status, countries, sticky committee, drag&drop,
reason tooltip) with the smallest, lowest-risk diff, and the existing auto-assign
covers the many-papers/few-reviewers case without a UI rewrite.

## Implementation notes (post-approval)

- Extract a `PaperAssignmentCard` to keep `index.tsx` manageable; memoize per
  existing perf conventions (`React.memo` on list-rendered cards).
- Tooltip: reuse an existing tooltip pattern if one exists in the codebase; else a
  lightweight `title`-style or absolutely-positioned tooltip with dark-mode
  variants. Must be keyboard/focus accessible, not hover-only.
- Sticky panel: `position: sticky; top: …` on the committee column, or give each
  column its own `overflow-y-auto` within a fixed-height flex row. Verify it works
  with the existing 15s auto-refetch (no scroll jump).
- All new markup ships with `dark:` variants and `min-h-[44px]` touch targets where
  interactive, per UI conventions.
