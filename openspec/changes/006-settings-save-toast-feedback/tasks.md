# Tasks — Settings Save Toast Feedback

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — SocialTab toast

### RED
- [ ] Write `frontend/src/__tests__/ConferenceDetail/SocialTab.test.tsx` (or extend existing)
  - On successful save, `showToast` is called with `'Social links saved'` + `'success'`
  - On failed save (mock API error), `showToast` is called with error message + `'error'`
  - Run → **expect failure**: no toast calls exist

### GREEN
- [ ] Add `showToast` import + hook to `SocialTab.tsx`
- [ ] Add `showToast('Social links saved', 'success')` in `updateMutation.onSuccess`
- [ ] Add `onError` handler with `showToast(parseApiError(error, 'Failed to save social links'), 'error')`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm toast messages are short and match the voice used in other tabs

---

## Phase 2 — DeadlinesTab toast + CSS

### RED
- [ ] Write / extend `frontend/src/__tests__/ConferenceDetail/DeadlinesTab.test.tsx`
  - Create mutation success → toast 'Deadline created'
  - Create mutation error → toast error message
  - Update mutation success → toast 'Deadline updated'
  - Delete mutation success → toast 'Deadline deleted'
  - Deadline form inputs have class `rounded-md border border-gray-300`
  - Run → **expect failure**: no toast calls, CSS may be inconsistent

### GREEN
- [ ] Add `showToast` to all three mutations in `DeadlinesTab.tsx`
- [ ] Audit and fix CSS classes on deadline form fields to match the pattern
  in `CRUDSettingsTab.tsx`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Ensure `parseApiError` is used for all error messages (not hardcoded strings)

---

## Phase 3 — LocationsTab toast

### RED
- [ ] Write / extend test for `LocationsTab`
  - Create location success → toast 'Location created'
  - Create location error → toast error message
  - Update location success → toast 'Location updated'
  - Delete location success → toast 'Location deleted'
  - Run → **expect failure**: no toast calls

### GREEN
- [ ] Add `showToast` to create, update, delete mutations in `LocationsTab.tsx`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Verify all three mutation `onError` handlers use `parseApiError`

---

## Phase 4 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit`
- [ ] `cd frontend && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: save social links → confirm success toast appears top-right
- [ ] Manual: create/edit/delete a deadline → confirm toast appears
- [ ] Manual: create/edit/delete a location → confirm toast appears
- [ ] Manual: inspect deadline form fields visually — consistent with other tabs
