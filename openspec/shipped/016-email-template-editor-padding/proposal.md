# Change 016 — Email template editor horizontal padding

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor (cosmetic; tests are visual snapshot or DOM
class assertion).

## Problem

QA 1.4.4.2: The Email Template Editor renders content flush against the
left and right edges of its container. There is no horizontal padding,
which makes the body text touch the surrounding card border and looks
broken.

## Proposed Change

Add horizontal padding (`px-6` or equivalent) to the rich-text editor's
outer wrapper inside the email template editor. Apply the same padding
to the preview pane so the layout stays symmetric.

## Out of Scope

- Wider editor redesign.
- Changing the WYSIWYG library.
- Other unrelated cosmetic issues in the template editor.

## Spec

See `openspec/specs/` once implementation lands.
