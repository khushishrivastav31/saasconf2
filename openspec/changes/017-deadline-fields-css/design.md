# Design — Deadline fields CSS consistency

## Approach

1. Read `DeadlinesTab.tsx` end-to-end.
2. For every `<input>` and `<select>` not using the shared `Input` /
   `Select` components, swap them out.
3. Standardize label markup using the pattern already in
   `SettingsTab.tsx` (or wherever the "good" style lives).

## Reference styling

```tsx
<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
  Field name
</label>
<Input ... />
```

## Test approach

For each refactored field, a small DOM assertion that the input has the
expected class signature (rounded, border, padding). Not snapshot tests.

## Test Impact

| File | Change |
|------|--------|
| `DeadlinesTab.test.tsx` (extend) | All inputs match shared component class signature |
