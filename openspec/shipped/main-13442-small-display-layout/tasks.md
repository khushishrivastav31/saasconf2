# MAIN-13442: Tasks

> Frontend-only, pure layout/CSS change (Tailwind class changes only, no
> logic/prop changes). No OpenAPI drift. No dedicated automated test — this
> repo has no existing viewport/responsive test pattern to follow (checked:
> none found), so verification is manual per `design.md`'s Methodology.
> User-visible → handbook update not required (layout-only, no new
> functionality or workflow change).

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** Scope confirmed (Paper
      Form Builder, per the attached screenshot); single-column stacking
      below `lg:` confirmed for the in-between (768–1024px) range.

## Implementation

- [ ] `index.tsx:600` — change `grid grid-cols-12` to
      `grid grid-cols-1 lg:grid-cols-12`, and each panel's `col-span-N` to
      `lg:col-span-N`, per `design.md`'s Fix 1.
- [ ] `UnifiedFieldCard.tsx:177` — add `flex-wrap justify-end` to the
      built-in-field toggle group's container, per `design.md`'s Fix 2.
- [ ] If manual verification (below) still shows the outer card row
      squeezing the label at very narrow widths, add `flex-wrap` to the
      card's outer container (`UnifiedFieldCard.tsx:91-92`) as well.

## Verify (manual + full sweep)

- [ ] Browser dev tools, resize to ~1366×768 (and try 1280×800): confirm
      field labels in the Form Fields canvas render in full (no
      letter-by-letter truncation), and the three checkbox toggles are
      legible, whether on one row or wrapped.
- [ ] Confirm the 3-column layout still renders correctly (no regression)
      at standard desktop width (`lg:`/`xl:` and above, e.g. 1920×1080).
- [ ] Confirm the Field Palette and Field Properties panels remain usable
      when stacked at narrow widths (not clipped, not requiring horizontal
      scroll).
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test` (no new tests expected; confirm no existing test asserts
      the old fixed `grid-cols-12` classes).

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `fix(cfp): responsive layout for paper form
      builder at small display sizes (MAIN-13442)`; PR per workflow,
      `--auto --squash` once green.
