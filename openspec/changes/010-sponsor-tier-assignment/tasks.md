# Tasks — Sponsor Tier Assignment Flow

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 0 — Investigation

- [ ] Check `GET /conferences/{id}/sponsors` response — does it include
  `sponsor_package_color`? If not, check the backend sponsor schema and
  `SponsorPackage` model.
- [ ] Check the exact label text for the package dropdown in `SponsorsTab.tsx`
- [ ] Find the route/query param used to navigate to the Sponsor Packages
  settings tab

---

## Phase 1 — Label and help text

### RED
- [ ] Write `frontend/src/__tests__/ConferenceDetail/SponsorsTab.test.tsx`
  - Form renders a label containing "Tier" (not just "Package")
  - Form renders help text referencing "Settings → Sponsor Packages"
  - Run → **expect failure**: label says "Package" only

### GREEN
- [ ] Update the dropdown label in `SponsorsTab.tsx` to "Sponsorship Tier (Package)"
- [ ] Add helper text below the dropdown
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm label/help text passes accessibility lint (label correctly
  associated with the select via `htmlFor`/`id`)

---

## Phase 2 — Clickable empty-state link

### RED
- [ ] Extend test: when package list is empty, a link element to the settings
  URL is rendered
  - Run → **expect failure**: current state is plain text

### GREEN
- [ ] Replace the empty-state plain text with a `<Link>` component pointing
  to `?section=settings&tab=sponsor-packages`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm the link is accessible (visible focus ring, correct `href`)

---

## Phase 3 — Tier badge in sponsor list

### RED
- [ ] Extend test: sponsor row with `sponsor_package_name = 'Gold'` renders a
  `<span>` badge with the text "Gold"
  - Sponsor row with no package renders "No tier" placeholder
  - Run → **expect failure**: column renders plain text, no badge

### GREEN
- [ ] Update the sponsor list table cell to render a styled badge when
  `sponsor_package_name` is set
- [ ] Apply `sponsor_package_color` as background if available
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] If `color` is absent from the API response, check backend schema and
  add `color` field to the sponsor list response; run `pnpm gen:api`

---

## Phase 4 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit`
- [ ] `cd frontend && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: create a sponsor → confirm "Tier" label visible in form
- [ ] Manual: empty package list → confirm link navigates to Settings → Sponsor Packages
- [ ] Manual: sponsor with a package → confirm badge shown in sponsor list
