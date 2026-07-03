# MAIN-13442: Improve layout for small (14") display sizes

## Status
`draft` · Branch: _to be created on approval_ (`fix/cfp-small-display-layout`)

## Methodology
No unit-testable layout logic here — verification is manual: resize the
viewport/window to a 14" laptop width (~1366×768 or the browser's actual
content width once sidebar/chrome are subtracted, roughly 1000–1100px) and
confirm no truncation/overflow, plus a check at standard desktop width for
regressions.

## Problem

Ticket text: "Improve to see this in the small display size (14")". The
attached screenshot (`Screenshot 2026-06-26 at 8.17.29 AM.png`) confirms the
screen: the **CFP Paper Form Builder**
(`frontend/src/pages/ConferenceDetail/tabs/settings/PaperFormBuilderTab/`),
expanded-builder view. Field labels in the "Form Fields" list are truncated
to 1–2 characters ("Title"→"Ti", "Short Abstract"→"Sh...", "Learning
Objectives"→"Learning Ob..."), and the three per-field checkbox toggles
("Visible for speaker" / "Required for speaker" / "Visible for reviewer")
are crammed into an unreadable wrapped mess on the same row.

### Recon findings (2026-07-02) — confirmed root cause

- `PaperFormBuilderTab/index.tsx:600` renders the builder as a fixed 3-column
  `grid grid-cols-12` layout (Field Palette `col-span-3`, Form Fields canvas
  `col-span-6`, Field Properties `col-span-3`) with **no responsive
  breakpoint** — it's always 3 columns side by side, regardless of viewport
  width. On a 14" laptop, once the admin left-nav sidebar and browser chrome
  are subtracted, the canvas column (6/12 of the remaining width) is often
  well under 600px.
- `UnifiedFieldCard.tsx:88-209` renders each field row as a single
  non-wrapping `flex items-center gap-3` row containing: drag handle, field
  label (`flex-1 min-w-0` — the only flexible/shrinkable element), type
  badges (Built-in/Custom/Always Required), and — for built-in fields — three
  checkbox+label toggles with full-text labels ("Visible for speaker",
  "Required for speaker", "Visible for reviewer"), none of which wrap
  (`flex items-center gap-3` at line 177, no `flex-wrap`). When the canvas
  column is narrow, the label (the only `min-w-0` flexible item) is squeezed
  to near-zero width first, which is exactly the truncation visible in the
  screenshot.
- This is a genuine layout defect, not a guess: the grid has zero responsive
  variants today (confirmed via `grep -n "grid-cols" index.tsx` — only the
  bare `grid-cols-12` class, no `lg:`/`xl:` prefix), which is inconsistent
  with this repo's own convention of using `lg:` (1024px) for sidebar-style
  layouts (`.claude/docs/ui-conventions.md`).

## Proposed Change

1. **Responsive grid** (`index.tsx:600`): make the 3-column layout collapse
   below `lg:` (1024px) — palette and properties panels stack above/below the
   canvas (or become collapsible/toggleable) rather than all three columns
   competing for width simultaneously. Above `lg:`, keep the current 3/6/3
   split.
2. **Field row wrapping** (`UnifiedFieldCard.tsx:88-209`): let the three
   built-in-field checkbox toggles wrap onto their own row below the
   label/badges (`flex-wrap`, or split into two explicit rows: label+badges
   on top, toggles below) instead of competing with the label for
   horizontal space in one unbroken row. This guarantees the field label is
   never the thing that gets squeezed to unreadability.
3. Manually verify at a 14"-equivalent viewport (~1366×768, and again at the
   narrower effective content width once sidebar/chrome are accounted for)
   that: field labels render in full (or truncate gracefully with `...` and
   a tooltip, not letter-by-letter), and the three toggles are legible.

## Out of Scope

- Any other CFP/reviewer screen not shown in the attached screenshot (the 4
  candidate surfaces originally guessed in this proposal before the
  screenshot was available — `CFPEvaluatedPapers.tsx`, `AssignedPapersTab`/
  `EvaluatedPapersTab`, `PaperStatusLifeline`, `ReviewForm.tsx` — are not
  confirmed as in scope; revisit separately if a similar complaint surfaces
  there).
- Redesigning the Field Palette or Field Properties panels' internal content
  — only the outer grid's responsiveness and the field row's wrapping
  behavior are in scope.
- Custom (non-built-in) field rows, which don't render the three checkbox
  toggles today — only their label/badge truncation, if any, is in scope
  (same fix applies since they share `UnifiedFieldCard`).

## Acceptance Criteria

- At a 14"-laptop-equivalent viewport (~1366×768 or narrower effective
  content width), field labels in the Form Fields canvas render fully
  (or truncate with an explicit `...` + tooltip, never letter-by-letter).
- The three checkbox toggles ("Visible for speaker", "Required for speaker",
  "Visible for reviewer") remain legible — either on the same row if there's
  room, or wrapped onto their own row — with no visually broken/overlapping
  text.
- No regression to the Paper Form Builder's 3-column layout at standard
  desktop widths (`lg:`/`xl:` and above).

## Spec

See `openspec/specs/` once implementation lands.
