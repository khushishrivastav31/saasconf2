# MAIN-13443: Design

## Sort: client vs. server

Check `CFPEvaluatedPapers.tsx`'s data-fetching call first — if `/cfp/papers?
status=final_consideration` returns the full set (no `skip`/`limit`
pagination in practice for a typical conference's evaluated-paper count),
sort client-side exactly like the existing text search: derive a sorted array
with `useMemo`, no backend change needed.

If the endpoint *is* paginated (check `papers.py`'s list endpoint for
`skip`/`limit` defaults — CLAUDE.md requires pagination on list endpoints, so
likely yes), server-side sort is required: average score isn't a DB column
(it's derived from `PaperReview.total_score`), so sorting by it needs either
a computed subquery/aggregate in the list query, or a denormalized
`CFPPaper.average_score` column updated on review submit. Recommend the
subquery approach first (simpler, no extra write path) unless it's a
measured performance problem.

## Detail parity — field mapping

| Field | Reviewer view (source) | Admin view (`EvaluatedPaperCard`) today |
|---|---|---|
| abstract_short/long | ✅ | ✅ |
| internal comments | ✅ | ✅ |
| cospeakers | ✅ | ✅ |
| learning_objectives | ✅ `AssignedPapersTab.tsx:250-268` | ❌ missing |
| video_url | ✅ `EvaluatedPapersTab.tsx:147-192` | ❌ missing |
| custom_field_answers | ✅ `AssignedPapersTab.tsx:250-268` | ❌ missing |
| per-question review detail | ✅ | ✅ via `ReviewsPanel.tsx` |

Add the three missing blocks to `EvaluatedPaperCard`, reusing whatever
sub-component the reviewer view uses for each (e.g. if `AssignedPapersTab`
has a `CustomFieldAnswers` component, import/reuse it rather than
reimplementing).

## Two admin surfaces — needs a decision, not a guess

`CFPEvaluatedPapers.tsx` (evaluated-papers list) and
`PaperDetailModal.tsx` (Assignments tab) are genuinely different screens.
The ticket's wording ("in evaluated papers... when I click in the paper")
points at the former. Treat the latter as out of scope unless review says
otherwise — don't silently expand scope to a screen the ticket didn't
name.

## Handling missing scores

A paper with zero submitted reviews has no `average_score` — render as
"—" or "No reviews yet", not `0` (which would misleadingly sort as lowest)
or `NaN`. Sort order should likely place unscored papers at a
consistent end (e.g. always last regardless of asc/desc) rather than
interleaving based on a coerced `0`.
