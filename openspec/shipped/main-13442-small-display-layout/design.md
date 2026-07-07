# MAIN-13442: Design

## Scope now confirmed via attached screenshot

The Jira attachment (`Screenshot 2026-06-26 at 8.17.29 AM.png`) pins this to
the CFP **Paper Form Builder**'s expanded-builder view
(`PaperFormBuilderTab/index.tsx`). This replaces the earlier "4 guessed
candidate screens, need clarification" version of this design.

## Fix 1 — responsive 3-column grid

```tsx
// index.tsx:600, current — no responsive variant at all:
<div className="grid grid-cols-12 gap-4" style={{ minHeight: '600px' }}>
  <div className="col-span-3">{/* Field Palette */}</div>
  <div className="col-span-6">{/* Form Fields canvas */}</div>
  <div className="col-span-3">{/* Field Properties */}</div>
</div>
```

Proposed: stack below `lg:` (matching this repo's existing sidebar
breakpoint convention, `.claude/docs/ui-conventions.md`), full 3-column only
at `lg:` and above:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ minHeight: '600px' }}>
  <div className="lg:col-span-3">{/* Field Palette */}</div>
  <div className="lg:col-span-6">{/* Form Fields canvas */}</div>
  <div className="lg:col-span-3">{/* Field Properties */}</div>
</div>
```

Below `lg:`, all three sections stack vertically (palette, then canvas, then
properties) at full width — each gets the full content width instead of a
third of it. This alone removes the squeeze that causes the label
truncation, since the canvas column is no longer sharing a row with the
other two panels.

**Confirmed with user (2026-07-03): single-column stacking**, as recommended.
At all widths below `lg:` (including the 768–1024px in-between range), the
three panels stack full-width in one column: palette, then canvas, then
properties. No new `md:`-specific breakpoint introduced — consistent with
this repo skipping `md:` "unless you have a specific need"
(`.claude/docs/ui-conventions.md`).

## Fix 2 — field row wrapping in `UnifiedFieldCard`

```tsx
// UnifiedFieldCard.tsx:176-209, current — one unbroken flex row:
{isBuiltin && isAdmin && (
  <div className="flex items-center gap-3">
    <label className="flex items-center gap-1">...Visible for speaker</label>
    <label className="flex items-center gap-1">...Required for speaker</label>
    <label className="flex items-center gap-1">...Visible for reviewer</label>
  </div>
)}
```

Proposed: allow this toggle group to wrap independently of the label, so the
label (`flex-1 min-w-0` at line 124) never has to compete with it for the
last remaining pixels:

```tsx
<div className="flex items-center gap-3 flex-wrap justify-end">
  {/* same three <label> toggles, unchanged */}
</div>
```

Combined with the outer card's `flex items-center gap-3` (line 91-92) —
since the toggle group can now wrap onto its own line, the label's
`flex-1 min-w-0` stops being squeezed by three unbreakable toggle labels
sharing its row. If the outer flex row itself also needs to wrap (very
narrow widths), add `flex-wrap` there too so the toggle group drops below
the label/badges row entirely rather than just wrapping awkwardly beside it.

## Why not: hide toggle labels down to icons only

Considered replacing "Visible for speaker" / etc. with icon-only toggles +
tooltips to save horizontal space unconditionally. Rejected for this ticket
— it changes the control's affordance for all screen sizes, not just small
ones, and isn't what's needed once Fix 1 gives the canvas its own full-width
row on narrow viewports. Worth reconsidering only if manual verification at
1366×768 still shows cramping after Fix 1+2.
