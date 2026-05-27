# Tasks — Deadline fields CSS consistency

## Phase 0 — Recon

- [ ] Open `DeadlinesTab.tsx` and inventory every raw `<input>`,
      `<select>`, and `<label>` not using the shared components.
- [ ] Identify the "good" reference styling used elsewhere in Settings.

## Phase 1 — Replace inputs

### RED
- [ ] Test: every input in DeadlinesTab has the shared `Input` component's
      class signature.

### GREEN
- [ ] Replace raw inputs with `<Input>` / `<Select>`.

### REFACTOR
- [ ] Standardize label markup.

## Phase 2 — Full sweep

- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test`
- [ ] Manual: visually compare Deadlines tab to another Settings tab —
      inputs should look identical.
