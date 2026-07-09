# MAIN-13444: Design

## Script shape (mirrors `seed_papers_from_csv.py`)

```python
def get_or_create_session_types(session, conference_id) -> list[SessionType]: ...
def get_or_create_reviewers(session, conference_id, count=3) -> list[CFPCommitteeMember]: ...
def get_or_create_papers(session, conference_id, session_types, count=20) -> list[CFPPaper]: ...
def assign_reviewers(session, papers, reviewers) -> list[CFPPaperAssignment]: ...
def create_reviews(session, assignments, must_have_count=5) -> None: ...

def main(conference_id: int): ...
```

## Must-have distribution

Pick 5 papers up front (e.g. first 5 by id in the seeded set), and on at least
one `PaperReview` per chosen paper set `must_have=True`; other papers get a
realistic score spread (e.g. random or fixed distribution across
1-5/whatever `total_score` range `PaperReview` uses) without `must_have`.

## Idempotency

Follow `seed_papers_from_csv.py:79`'s `get_or_create_applicant` pattern —
look up by a natural key (e.g. paper title + conference_id, reviewer email +
conference_id) before inserting, so re-running the script against the same
conference is a no-op rather than a duplicate-data generator.

## Tenant safety

Script takes a `--conference-id` (or slug) CLI argument; all created rows
scope to that conference's `tenant_id`. Since this is a dev script (not run
in production automation), still worth an explicit guard (e.g. refuse to run
if the target conference's tenant looks like a production tenant, if such a
marker exists) — check how `seed_conference_settings.py` handles this, if at
all, and match that precedent rather than inventing a new safety check.

## Review count / score realism

3 reviewers × ~20 papers with partial overlap (not every reviewer reviews
every paper) is more representative of real assignment patterns than a full
3×20 matrix — check `CFPPaperAssignment` for any existing per-paper reviewer
count convention (e.g. is 2-3 reviewers per paper typical?) and match it.
