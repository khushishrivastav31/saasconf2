# Tasks — Email template editor padding

## Phase 0 — Recon

- [ ] Locate the email template editor file in `frontend/src/`.
- [ ] Identify the outer wrapper that currently lacks padding.

## Phase 1 — Apply padding

### RED
- [ ] Test: editor container has `px-4` or `px-6` class.

### GREEN
- [ ] Add the padding class.

### REFACTOR
- [ ] If the preview pane is rendered separately, mirror the padding
      so the layout stays symmetric.

## Phase 2 — Full sweep

- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test`
- [ ] Manual: open Email Template Editor → confirm body has visible
      horizontal padding.
