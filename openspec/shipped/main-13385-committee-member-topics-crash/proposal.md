# Change main-13385 — Adding a program-committee reviewer crashes when Excluded Topics are selected

## Status
`planned` · Branch: TBD

## Ticket
MAIN-13385 — Adding a reviewer gives an internal server error ONLY when an
Excluded Topic is selected.

## Methodology
TDD — Red → Green → Refactor.

## Problem

In the CFP admin UI, adding a member to the **Program Committee** (a "reviewer")
returns **HTTP 500 / internal server error** whenever one or more **Excluded
Topics** are selected. With **no topic** selected the same form succeeds and the
member is created. Observed on staging; reproduced in development with the real
exception:

```
sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called;
can't call await_only() here. Was IO attempted in an unexpected place?
```

The failing endpoint is `POST /api/v1/cfp/committee-members`
(`create_committee_member`, `backend/app/api/v1/cfp/committee.py`).

### Root cause

The crash is at `committee.py:237`:

```python
member = CFPCommitteeMember(...)   # line 219
db.add(member)
await db.flush()                   # line 227 → member is now PERSISTENT

if member_data.topic_ids:
    topic_result = await db.execute(select(CFPTopic).where(...))
    member.topics = list(topic_result.scalars().all())   # line 237 → BOOM
```

`CFPCommitteeMember.topics` is a many-to-many relationship declared
`lazy="selectin"` (`backend/app/models/cfp.py:263`). After `await db.flush()`,
`member` is a **persistent** instance whose `topics` collection has **never been
loaded**. Assigning a new collection to an unloaded relationship makes
SQLAlchemy first **lazy-load the existing collection** (to compute the
add/remove delta against the `cfp_committee_member_topics` secondary table). That
lazy load emits a **synchronous** SELECT, which under the async engine runs
outside the greenlet that `asyncpg` needs → `MissingGreenlet`.

`lazy="selectin"` does **not** protect this path: the selectin strategy only
fires while the parent is being loaded by a query (`db.execute`). Bare attribute
**assignment** falls back to the default lazy (`select`) loader, which is sync.

### Why only when a topic is selected
The `member.topics = ...` assignment at line 237 is guarded by
`if member_data.topic_ids:`. With no topics chosen, the block is skipped, the
lazy load never happens, and the create succeeds. The subsequent re-fetch with
`selectinload(...topics)` (added previously for the response builder) never runs
into the problem because the crash happens *before* it, during the assignment.

### Why the UPDATE endpoint is unaffected
`update_committee_member` loads `member` via `db.execute(select(...))`
(`committee.py:298`). Because `topics` is `lazy="selectin"`, that query eagerly
populates the collection, so the later `member.topics = ...` assignment has a
loaded collection to diff against and never triggers a sync lazy load.

## Proposed solution

Populate the `topics` collection **without** triggering a lazy load of the
pre-existing (empty) collection on the freshly-flushed member. Preferred
approach: resolve the topic rows **before** assignment and attach them so no
unloaded-collection diff is required.

Two viable implementations (decision in `design.md`):

1. **Construct with topics** — query topics first, then build
   `CFPCommitteeMember(..., topics=topic_list)` so the collection is set on a
   *pending* (pre-flush) object, where no lazy load occurs. Cleanest; removes
   the post-flush mutation entirely.
2. **Eager-load before assign** — after flush, `await db.refresh(member,
   attribute_names=["topics"])` (or re-select with `selectinload`) before the
   `member.topics = ...` assignment, so the collection is loaded in async
   context first.

This is a targeted backend fix. No schema, API contract, or frontend change.

## Scope

- **In scope:** fix the `MissingGreenlet` in `create_committee_member`; add
  regression test coverage for the create-with-topics path (and a guard test on
  update-with-topics).
- **Out of scope:** UI changes, the `update`/`list`/`delete` handlers (already
  correct), the `paper_assignments` excluded-topics conflict logic.

## Impact

- Admins can add program-committee reviewers with Excluded Topics again.
- Removes a 500 on a core CFP admin workflow.
- No migration, no OpenAPI change, no frontend change.
