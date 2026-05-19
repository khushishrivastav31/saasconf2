# Change 010 — Sponsor Tier Assignment Flow

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 4.1.2: Assigning a sponsor to a tier from the sponsor form has an unclear
flow. The sponsor form (`SponsorsTab.tsx`) uses the concept of "sponsor
packages" (not "tiers"), but QA and business users think in terms of
"sponsorship tiers" (Gold, Silver, Bronze, etc.). The mismatch between the
UI label and the user's mental model causes the assignment to be hard to find
or understand.

Specific issues observed:
1. The "Package" dropdown in the create-sponsor form is not labelled or
   described as a "tier" — users don't know this is where tiers are assigned.
2. When no packages have been created yet, the dropdown shows an empty list
   with a help text pointing to Settings > Sponsor Packages, but the path
   is not a clickable link — users cannot navigate there directly.
3. After assigning a package, the tier name does not appear prominently in
   the sponsor list row; only `sponsor_package_name` is shown in a small
   column, which may be missed.

## Proposed Change

1. **Frontend: Rename/relabel** — Change the "Package" field label in the
   sponsor create/edit form to "Sponsorship Tier (Package)". Add helper text:
   "Tiers are managed in Settings → Sponsor Packages."

2. **Frontend: Clickable link in empty state** — When the package list is
   empty, replace the plain text with a `<Link>` navigating to the Sponsor
   Packages settings tab (e.g. `?section=settings&tab=sponsor-packages`).

3. **Frontend: Tier badge in list** — Render the `sponsor_package_name` as a
   coloured badge (matching the tier's `color` field if available) in the
   sponsor list table so it is visually prominent.

## Out of Scope

- Renaming the backend data model from "package" to "tier" (would require a
  migration and API change — deferred).
- Multi-tier sponsor assignments.

## Spec

See `openspec/specs/` (to be created alongside implementation).
