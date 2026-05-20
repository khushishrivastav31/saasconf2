# Design — Settings Save Toast Feedback

## Toast pattern

All three tabs should use the same pattern already established in
`EmailSettingsTab.tsx`:

```ts
onSuccess: () => {
  showToast('<Feature> saved', 'success');
},
onError: (error: unknown) => {
  showToast(parseApiError(error, 'Failed to save <feature>'), 'error');
},
```

Import `useToast` from the toast hook and `parseApiError` from the error
utils, both already used elsewhere in the codebase.

---

## SocialTab.tsx

### `updateMutation`

Current:
```ts
onSuccess: () => {
  setIsDirty(false);
  onUpdate();
},
```

Change to:
```ts
onSuccess: () => {
  setIsDirty(false);
  onUpdate();
  showToast('Social links saved', 'success');
},
onError: (error: unknown) => {
  showToast(parseApiError(error, 'Failed to save social links'), 'error');
},
```

---

## DeadlinesTab.tsx

Each mutation (create deadline, update deadline, delete deadline) needs both
`onSuccess` and `onError` handlers with `showToast`. Use context-aware messages:

| Mutation | Success message | Error fallback |
|----------|----------------|----------------|
| Create | `'Deadline created'` | `'Failed to create deadline'` |
| Update | `'Deadline updated'` | `'Failed to update deadline'` |
| Delete | `'Deadline deleted'` | `'Failed to delete deadline'` |

### CSS audit (QA 1.5.1)

Compare deadline form fields against `CRUDSettingsTab.tsx`. Expected classes:
- Input: `w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm`
- Label: `block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1`

Fix any deviations in `DeadlinesTab.tsx` to match this pattern.

---

## LocationsTab.tsx

Each mutation (create location, update location, delete location) needs
`showToast` in `onSuccess`/`onError`:

| Mutation | Success message | Error fallback |
|----------|----------------|----------------|
| Create | `'Location created'` | `'Failed to create location'` |
| Update | `'Location updated'` | `'Failed to update location'` |
| Delete | `'Location deleted'` | `'Failed to delete location'` |

---

## Test Impact

| File | Change |
|------|--------|
| Existing or new test for `SocialTab` | `showToast('Social links saved', 'success')` called on mutation success |
| Existing or new test for `DeadlinesTab` | Toast fires on each mutation outcome |
| Existing or new test for `LocationsTab` | Toast fires on each mutation outcome |
| `DeadlinesTab` test | Deadline form fields render with correct CSS classes |
