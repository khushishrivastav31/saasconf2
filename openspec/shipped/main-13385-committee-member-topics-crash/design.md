# Design — main-13385 committee-member create with topics

## Context

`POST /api/v1/cfp/committee-members` (`create_committee_member`,
`backend/app/api/v1/cfp/committee.py:148`) creates a program-committee member,
optionally with `topic_ids` (the "Excluded Topics"). The handler currently:

1. validates the conference and applicant,
2. constructs `CFPCommitteeMember(...)`, `db.add`, `await db.flush()`,
3. **if** `topic_ids`: selects the `CFPTopic` rows and assigns
   `member.topics = [...]`,  ← crashes here
4. assigns the "Program Committee" `UserRole`,
5. `await db.commit()`,
6. re-selects the member with `selectinload(applicant, topics)` and builds the
   response.

`CFPCommitteeMember.topics` (`models/cfp.py:263`):
```python
topics: Mapped[list["CFPTopic"]] = relationship(
    "CFPTopic", secondary=cfp_committee_member_topics, lazy="selectin"
)
```

## The bug, precisely

After `await db.flush()` the member is **persistent** with an **unloaded**
`topics` collection. `member.topics = [...]` requires SQLAlchemy to know the
*current* members of the collection to emit the correct INSERT/DELETE against
the `cfp_committee_member_topics` secondary table. It therefore emits a
synchronous lazy SELECT for the existing rows — illegal under the async engine
→ `MissingGreenlet`. Confirmed by reproduction: traceback terminates at
`committee.py:237  member.topics = list(topic_result.scalars().all())`.

## Decision

**Option 1 — assign topics at construction (pre-flush).** Move the topic query
above the member construction and pass the resolved list into the constructor:

```python
topics: list[CFPTopic] = []
if member_data.topic_ids:
    topic_result = await db.execute(
        select(CFPTopic).where(
            CFPTopic.id.in_(member_data.topic_ids),
            CFPTopic.tenant_id == current_user.tenant_id,
        )
    )
    topics = list(topic_result.scalars().all())

member = CFPCommitteeMember(
    tenant_id=current_user.tenant_id,
    conference_id=member_data.conference_id,
    applicant_id=applicant.id,
    role=member_data.role,
    expertise_areas=member_data.expertise_areas,
    topics=topics,
)
db.add(member)
await db.flush()
```

Setting the collection on a **pending** (not-yet-flushed) object initialises it
directly — there is no prior persistent state to lazy-load, so no sync IO. The
flush then INSERTs both the member row and the secondary rows in one async unit.

### Why not Option 2 (refresh/re-select before assign)
`await db.refresh(member, ["topics"])` or a `selectinload` re-select also works,
but it adds an extra round-trip purely to load a collection we already know is
empty, and keeps the fragile post-flush mutation. Option 1 is simpler and
removes the footgun entirely.

### Why not change the relationship loader
Switching `topics` away from `lazy="selectin"` (e.g. to `raise`/`write_only`)
would surface the bug as an explicit error but break the read paths
(`list`, response builder) that rely on selectin eager loading. Out of scope.

## Interaction with the existing re-fetch

The handler already re-selects the member with
`selectinload(CFPCommitteeMember.applicant)` and
`selectinload(CFPCommitteeMember.topics)` after `commit()` (`committee.py:273`),
because `expire_on_commit` expires the collection and the response builder reads
`member.topics`. That re-fetch stays — it is the correct way to repopulate after
commit and is unaffected by this change. The fix only concerns how topics are
**attached before flush**.

## Test strategy (TDD)

RED (must fail on current code with a 500 / MissingGreenlet):
- `create` with `topic_ids` (link-existing-applicant mode) → 201, response
  `topics` contains the selected topic.
- `create` with `topic_ids` (inline-new-applicant mode) → 201 with topics, to
  cover the branch where `applicant` is created inline.

GREEN: apply Option 1.

Guard / regression (should pass before and after, lock in behaviour):
- `create` with **no** topics still returns 201 with `topics == []`.
- `update` with `topic_ids` still returns 200 with the topics set (confirms the
  already-correct path stays correct).

Tests live in `backend/tests/cfp/test_cfp.py::TestCommitteeMembers`, reusing the
existing `topic`, `conference`, `second_applicant`, `cfp_admin_token` fixtures.

## Risk / blast radius

Minimal. One handler, no schema/migration, no API-contract change (response
shape identical), no frontend change, no OpenAPI drift. The pending-object
assignment is a standard SQLAlchemy pattern already used elsewhere for new rows.
