"""Shared CFP review-data seeding logic.

Populates a single conference's CFP with realistic test data — papers across
several session types, reviewers (committee members), paper→reviewer
assignments with partial overlap, and submitted reviews with scored answers —
so the evaluated-papers workflows (sort, detail views, must-have flag) can be
manually tested or demoed.

Two callers share this module:
- ``backend/scripts/seed_cfp_review_data.py`` — the interactive CLI.
- ``app/api/v1/cfp/seed.py`` — the dev/staging-only admin endpoint.

Every write is idempotent (looked up by a natural key before insert). The
caller owns the RLS context: pass a session already scoped to the target
tenant. This module never changes RLS context, so it cannot widen the caller's
security boundary.
"""

import random
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.core.default_settings import DEFAULT_REVIEW_CRITERIA, DEFAULT_SCORE_SCALES
from app.core.score_utils import normalize_to_5
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPApplicant, CFPCommitteeMember
from app.models.cfp_papers import CFPPaper, CFPPaperAssignment, PaperStatus
from app.models.conference import Conference
from app.models.review import (
    PaperReview,
    ReviewAnswer,
    ReviewCriterion,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewScoreScale,
    ReviewStatus,
)
from app.models.settings import SessionType

# ── Environment gate ──────────────────────────────────────────────────
# Closed-by-default allow-list: only these environments may seed. Anything
# else (production, an unset/typo'd value) fails safe.
_SEEDING_ENVIRONMENTS = frozenset({"development", "staging"})


def is_seeding_allowed(settings: Settings) -> bool:
    """True only in environments where seeding test data is permitted."""
    return settings.SENTRY_ENVIRONMENT.lower() in _SEEDING_ENVIRONMENTS


# ── Configuration ─────────────────────────────────────────────────────
DEFAULT_PASSWORD = "Test1234!"

# Seeded applicants use YOPMail addresses so real mail can be received in a
# throwaway inbox. The tag keeps seed data easy to spot and filter.
EMAIL_DOMAIN = "yopmail.com"
EMAIL_TAG = "-test-saasconf"


def _seed_email(prefix: str, n: int) -> str:
    """Build a seed email, e.g. seed.reviewer1-test-saasconf@yopmail.com."""
    return f"{prefix}{n}{EMAIL_TAG}@{EMAIL_DOMAIN}"


# Session types seeded (name, slug, duration_minutes) — spread papers across
# these so the "different session types" requirement is satisfied.
SEED_SESSION_TYPES: list[tuple[str, str, int]] = [
    ("Seed 25-minute Talk", "seed-25-min-talk", 25),
    ("Seed 45-minute Keynote", "seed-45-min-keynote", 45),
    ("Seed 90-minute Workshop", "seed-90-min-workshop", 90),
    ("Seed Full-Day Tutorial", "seed-full-day-tutorial", 360),
]

# Deterministic pools for generated speakers/reviewers.
FIRST_NAMES = [
    "Ada",
    "Bjarne",
    "Clara",
    "Dennis",
    "Edith",
    "Fabian",
    "Grace",
    "Hedy",
    "Ivan",
    "Joan",
    "Ken",
    "Linus",
    "Margaret",
    "Niklaus",
    "Olga",
    "Pieter",
    "Quinn",
    "Radia",
    "Sophie",
    "Torvald",
    "Ursula",
    "Vint",
    "Wendy",
    "Ximena",
]
LAST_NAMES = [
    "Lovelace",
    "Stroustrup",
    "Curie",
    "Ritchie",
    "Clarke",
    "Pauli",
    "Hopper",
    "Lamarr",
    "Sutherland",
    "Clarke",
    "Thompson",
    "Torvalds",
    "Hamilton",
    "Wirth",
    "Petrova",
    "Bruegel",
    "Rivest",
    "Perlman",
    "Wilson",
    "Nyquist",
    "Franklin",
    "Cerf",
    "Hall",
    "Ramirez",
]

ABSTRACT = (
    "This session explores a pragmatic, real-world approach to the topic, "
    "sharing lessons learned from production deployments and hands-on "
    "experiments. Attendees will leave with concrete, actionable techniques "
    "they can apply immediately."
)
LEARNING_OBJECTIVES = "1. Understand the core concepts\n2. Apply the techniques in practice\n3. Avoid common pitfalls"

INTERNAL_COMMENTS = [
    "Solid submission, well within scope for the track.",
    "Good abstract but the outline could be tighter.",
    "Strong speaker track record; recommend accept.",
    "Interesting angle, some overlap with other submissions.",
    "Borderline — depends on the final program balance.",
]
SPEAKER_FEEDBACK = (
    "Thank you for your submission. The committee appreciated the clear "
    "structure and the practical, hands-on focus of your proposal. We felt the "
    "learning objectives were well defined and relevant to our audience. To "
    "strengthen the talk further, consider adding a concrete case study and "
    "tightening the introduction so more time is spent on the actionable "
    "material. Overall this is a compelling proposal and we look forward to "
    "seeing it on the program."
)


class SeedError(Exception):
    """Raised when seeding cannot proceed (e.g. no scored review questions)."""


@dataclass
class SeedResult:
    """Final seeded state for a conference (idempotent — reflects totals)."""

    evaluated_papers: int
    reviewers: int
    must_have_papers: int
    default_password: str = DEFAULT_PASSWORD


# ── Helpers ───────────────────────────────────────────────────────────
async def get_or_create_cfp(db: AsyncSession, conference: Conference) -> CallForPapers:
    """Get the conference's CFP or create one linked to it."""
    result = await db.execute(
        select(CallForPapers)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(ConferenceCFP.conference_id == conference.id)
        .limit(1)
    )
    cfp = result.scalar_one_or_none()
    if cfp:
        return cfp

    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        title=f"Call for Papers – {conference.name}",
        status="open",
    )
    db.add(cfp)
    await db.flush()
    db.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conference.id, cfp_id=cfp.id))
    await db.flush()
    print(f"  Created CFP: {cfp.title}")
    return cfp


async def get_or_create_session_types(
    db: AsyncSession, tenant_id: uuid.UUID, conference_id: uuid.UUID
) -> list[SessionType]:
    """Get or create the seed session types (idempotent by slug)."""
    result = await db.execute(select(SessionType).where(SessionType.conference_id == conference_id))
    existing = {st.slug: st for st in result.scalars().all()}

    session_types: list[SessionType] = []
    created = 0
    for name, slug, duration in SEED_SESSION_TYPES:
        st = existing.get(slug)
        if st is None:
            st = SessionType(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                conference_id=conference_id,
                name=name,
                slug=slug,
                duration_minutes=duration,
                cfp_eligible=True,
                is_active=True,
            )
            db.add(st)
            await db.flush()
            created += 1
        session_types.append(st)
    print(f"  Session types: {created} created, {len(SEED_SESSION_TYPES) - created} already existed")
    return session_types


async def ensure_review_config(
    db: AsyncSession, tenant_id: uuid.UUID, conference_id: uuid.UUID
) -> list[ReviewQuestion]:
    """
    Return the conference's active scored review questions.

    Conferences created through the app already have a review config seeded
    (see app.core.default_settings.seed_default_settings). If this conference
    has none, create a minimal one from the same DEFAULT_* constants so the
    caller is self-contained. Idempotent via the unique name/title constraints.
    """
    questions = await _load_scored_questions(db, tenant_id, conference_id)
    if questions:
        print(f"  Review config: reusing {len(questions)} existing scored question(s)")
        return questions

    print("  Review config: none found — seeding a default config")
    scale_by_name: dict[str, ReviewScoreScale] = {}
    for scale_data in DEFAULT_SCORE_SCALES:
        scale = ReviewScoreScale(
            tenant_id=tenant_id,
            conference_id=conference_id,
            name=scale_data["name"],  # type: ignore[index]
            scale_type=scale_data["scale_type"],  # type: ignore[index]
        )
        db.add(scale)
        await db.flush()
        scale_by_name[scale_data["name"]] = scale  # type: ignore[index]
        for option_data in scale_data["options"]:  # type: ignore[index]
            db.add(
                ReviewScaleOption(
                    scale_id=scale.id,
                    label=option_data["label"],
                    numeric_value=option_data.get("numeric_value"),
                    is_unsure=option_data.get("is_unsure", False),
                    display_order=option_data["display_order"],
                )
            )

    for criterion_data in DEFAULT_REVIEW_CRITERIA:
        criterion = ReviewCriterion(
            tenant_id=tenant_id,
            conference_id=conference_id,
            title=criterion_data["title"],
            description=criterion_data["description"],
            display_order=criterion_data["display_order"],
        )
        db.add(criterion)
        await db.flush()
        for question_data in criterion_data["questions"]:  # type: ignore[attr-defined]
            scale_id = None
            if "scale_name" in question_data:
                scale = scale_by_name.get(question_data["scale_name"])  # type: ignore[assignment]
                if scale:
                    scale_id = scale.id
            db.add(
                ReviewQuestion(
                    criterion_id=criterion.id,
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    text=question_data["text"],
                    help_text=question_data.get("help_text"),
                    score_scale_id=scale_id,
                    display_order=question_data["display_order"],
                )
            )
    await db.flush()
    return await _load_scored_questions(db, tenant_id, conference_id)


async def _load_scored_questions(
    db: AsyncSession, tenant_id: uuid.UUID, conference_id: uuid.UUID
) -> list[ReviewQuestion]:
    """Active questions that carry a score scale (i.e. can be scored)."""
    result = await db.execute(
        select(ReviewQuestion)
        .options(selectinload(ReviewQuestion.score_scale).selectinload(ReviewScoreScale.options))
        .where(
            ReviewQuestion.conference_id == conference_id,
            ReviewQuestion.tenant_id == tenant_id,
            ReviewQuestion.is_active.is_(True),
            ReviewQuestion.score_scale_id.isnot(None),
        )
        .order_by(ReviewQuestion.display_order)
    )
    return list(result.scalars().all())


async def get_or_create_applicant(
    db: AsyncSession, tenant_id: uuid.UUID, first_name: str, last_name: str, email: str
) -> CFPApplicant:
    """Get an applicant by email hash or create one."""
    email_lower = email.strip().lower()
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.tenant_id == tenant_id,
            CFPApplicant.email_hash == hash_email(email_lower),
        )
    )
    applicant = result.scalar_one_or_none()
    if applicant:
        return applicant

    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        first_name=first_name,
        last_name=last_name,
        email=email_lower,
        password_hash=hash_password(DEFAULT_PASSWORD),
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def get_or_create_reviewers(
    db: AsyncSession, tenant_id: uuid.UUID, conference_id: uuid.UUID, count: int
) -> list[CFPCommitteeMember]:
    """Get or create `count` committee-member reviewers (idempotent by email)."""
    reviewers: list[CFPCommitteeMember] = []
    created = 0
    for i in range(count):
        first = FIRST_NAMES[i % len(FIRST_NAMES)]
        last = LAST_NAMES[i % len(LAST_NAMES)]
        email = _seed_email("seed.reviewer", i + 1)
        applicant = await get_or_create_applicant(db, tenant_id, first, last, email)

        result = await db.execute(
            select(CFPCommitteeMember).where(
                CFPCommitteeMember.tenant_id == tenant_id,
                CFPCommitteeMember.conference_id == conference_id,
                CFPCommitteeMember.applicant_id == applicant.id,
            )
        )
        member = result.scalar_one_or_none()
        if member is None:
            member = CFPCommitteeMember(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                conference_id=conference_id,
                applicant_id=applicant.id,
                role="reviewer",
            )
            db.add(member)
            await db.flush()
            created += 1
        reviewers.append(member)
    print(f"  Reviewers: {created} created, {count - created} already existed")
    return reviewers


async def get_or_create_papers(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cfp: CallForPapers,
    session_types: list[SessionType],
    count: int,
) -> list[CFPPaper]:
    """Get or create `count` evaluated papers spread across session types."""
    papers: list[CFPPaper] = []
    created = 0
    for i in range(count):
        title = f"Seed Review Paper {i + 1:02d}"
        result = await db.execute(select(CFPPaper).where(CFPPaper.cfp_id == cfp.id, CFPPaper.title == title))
        paper = result.scalar_one_or_none()
        if paper is None:
            # A distinct main speaker per paper, drawn deterministically.
            first = FIRST_NAMES[i % len(FIRST_NAMES)]
            last = LAST_NAMES[(i * 3) % len(LAST_NAMES)]
            speaker = await get_or_create_applicant(db, tenant_id, first, last, _seed_email("seed.speaker", i + 1))
            session_type = session_types[i % len(session_types)]
            paper = CFPPaper(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                cfp_id=cfp.id,
                main_speaker_id=speaker.id,
                session_type_id=session_type.id,
                title=title,
                abstract_short=ABSTRACT[:200],
                abstract_long=ABSTRACT,
                level="all_levels",
                learning_objectives=LEARNING_OBJECTIVES,
                status=PaperStatus.FINAL_CONSIDERATION.value,
            )
            db.add(paper)
            await db.flush()
            created += 1
        papers.append(paper)
    print(f"  Papers: {created} created, {count - created} already existed")
    return papers


async def get_or_create_assignments(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    papers: list[CFPPaper],
    reviewers: list[CFPCommitteeMember],
    rng: random.Random,
) -> list[CFPPaperAssignment]:
    """
    Assign 2-3 reviewers to each paper with partial overlap (not a full matrix).

    Idempotent by the (paper_id, committee_member_id) unique constraint.
    """
    assignments: list[CFPPaperAssignment] = []
    created = 0
    for paper in papers:
        n = min(len(reviewers), rng.choice([2, 2, 3]))
        chosen = rng.sample(reviewers, n)
        for member in chosen:
            result = await db.execute(
                select(CFPPaperAssignment).where(
                    CFPPaperAssignment.paper_id == paper.id,
                    CFPPaperAssignment.committee_member_id == member.id,
                )
            )
            assignment = result.scalar_one_or_none()
            if assignment is None:
                assignment = CFPPaperAssignment(
                    id=uuid.uuid4(),
                    tenant_id=tenant_id,
                    paper_id=paper.id,
                    committee_member_id=member.id,
                )
                db.add(assignment)
                await db.flush()
                created += 1
            assignments.append(assignment)
    print(f"  Assignments: {created} created, {len(assignments) - created} already existed")
    return assignments


def _compute_review(
    questions: list[ReviewQuestion], rng: random.Random
) -> tuple[float, list[tuple[ReviewQuestion, ReviewScaleOption, float]]]:
    """
    Pick a scored option per question and compute the normalized total score.

    Mirrors the submission-time formula in
    app/api/v1/cfp_portal/reviews.py: sum(normalize_to_5(value) * weight) / sum(weight)
    over count_in_score questions. Returns (total_score, per-question picks).
    """
    picks: list[tuple[ReviewQuestion, ReviewScaleOption, float]] = []
    total_weighted = 0.0
    total_weight = 0.0
    for question in questions:
        scale = question.score_scale
        if scale is None:
            continue
        scorable = [o for o in scale.options if o.numeric_value is not None and not o.is_unsure]
        if not scorable:
            continue
        # Bias toward the upper half of the scale for realistic "evaluated" data.
        option = rng.choice(scorable[len(scorable) // 2 :] or scorable)
        picks.append((question, option, option.numeric_value or 0.0))
        if question.count_in_score:
            values = [o.numeric_value for o in scorable if o.numeric_value is not None]
            normalized = normalize_to_5(option.numeric_value or 0.0, min(values), max(values))
            total_weighted += normalized * question.weight
            total_weight += question.weight
    total_score = (total_weighted / total_weight) if total_weight > 0 else 0.0
    return total_score, picks


async def create_reviews(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    conference_id: uuid.UUID,
    papers: list[CFPPaper],
    assignments: list[CFPPaperAssignment],
    questions: list[ReviewQuestion],
    must_have_count: int,
    rng: random.Random,
) -> None:
    """
    Create one submitted PaperReview (with scored answers) per assignment.

    Exactly `must_have_count` papers get must_have=True on at least one review.
    Idempotent by the assignment's unique review constraint.
    """
    # The first N papers (by title order) are the must-have set.
    must_have_paper_ids = {p.id for p in papers[:must_have_count]}
    # Track which papers still need a must-have flag applied.
    pending_must_have = set(must_have_paper_ids)

    # Build a stable config snapshot mirroring the submission-time structure.
    config_snapshot = await _build_config_snapshot(db, tenant_id, conference_id, questions)

    reviews_created = 0
    assignments_by_paper: dict[uuid.UUID, list[CFPPaperAssignment]] = {}
    for assignment in assignments:
        assignments_by_paper.setdefault(assignment.paper_id, []).append(assignment)

    for paper_id, paper_assignments in assignments_by_paper.items():
        for idx, assignment in enumerate(paper_assignments):
            result = await db.execute(select(PaperReview).where(PaperReview.assignment_id == assignment.id))
            if result.scalar_one_or_none() is not None:
                # Existing review — nothing to do, and it may already carry the flag.
                pending_must_have.discard(paper_id)
                continue

            total_score, picks = _compute_review(questions, rng)
            must_have = paper_id in pending_must_have and idx == 0
            if must_have:
                pending_must_have.discard(paper_id)

            review = PaperReview(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                assignment_id=assignment.id,
                paper_id=assignment.paper_id,
                committee_member_id=assignment.committee_member_id,
                status=ReviewStatus.SUBMITTED.value,
                total_score=round(total_score, 3),
                speaker_feedback=SPEAKER_FEEDBACK,
                internal_comment=rng.choice(INTERNAL_COMMENTS),
                must_have=must_have,
                config_snapshot=config_snapshot,
                submitted_at=func.now(),
            )
            db.add(review)
            await db.flush()
            reviews_created += 1

            for question, option, numeric in picks:
                db.add(
                    ReviewAnswer(
                        id=uuid.uuid4(),
                        review_id=review.id,
                        question_id=question.id,
                        selected_option_id=option.id,
                        numeric_score=numeric,
                        is_unsure=option.is_unsure,
                        snapshot_weight=question.weight,
                        snapshot_question_text=question.text,
                        snapshot_option_label=option.label,
                    )
                )
            await db.flush()

    print(f"  Reviews: {reviews_created} created")
    if pending_must_have:
        print(
            f"  WARNING: {len(pending_must_have)} must-have paper(s) had no new "
            "review to flag (already reviewed on a prior run)."
        )


async def _build_config_snapshot(
    db: AsyncSession, tenant_id: uuid.UUID, conference_id: uuid.UUID, questions: list[ReviewQuestion]
) -> dict:
    """Build the criteria/questions snapshot stored on each review."""
    result = await db.execute(
        select(ReviewCriterion)
        .where(
            ReviewCriterion.conference_id == conference_id,
            ReviewCriterion.tenant_id == tenant_id,
            ReviewCriterion.is_active.is_(True),
        )
        .order_by(ReviewCriterion.display_order)
    )
    criteria = result.scalars().all()
    return {
        "criteria": [
            {
                "id": str(c.id),
                "title": c.title,
                "questions": [
                    {
                        "id": str(q.id),
                        "text": q.text,
                        "weight": q.weight,
                        "question_type": q.question_type,
                        "count_in_score": q.count_in_score,
                    }
                    for q in questions
                    if q.criterion_id == c.id
                ],
            }
            for c in criteria
        ],
    }


async def compute_seed_state(db: AsyncSession, conference_id: uuid.UUID, cfp_id: uuid.UUID) -> SeedResult:
    """Summarize the seeded state of a conference (used by both callers)."""
    evaluated_papers = (
        await db.execute(
            select(func.count())
            .select_from(CFPPaper)
            .where(CFPPaper.cfp_id == cfp_id, CFPPaper.status == PaperStatus.FINAL_CONSIDERATION.value)
        )
    ).scalar() or 0
    reviewers = (
        await db.execute(
            select(func.count())
            .select_from(CFPCommitteeMember)
            .where(CFPCommitteeMember.conference_id == conference_id)
        )
    ).scalar() or 0
    must_have_papers = (
        await db.execute(
            select(func.count(func.distinct(PaperReview.paper_id))).where(
                PaperReview.must_have.is_(True),
                PaperReview.status == ReviewStatus.SUBMITTED.value,
            )
        )
    ).scalar() or 0
    return SeedResult(
        evaluated_papers=evaluated_papers,
        reviewers=reviewers,
        must_have_papers=must_have_papers,
    )


async def seed_cfp_review_data(
    db: AsyncSession,
    conference: Conference,
    *,
    papers: int = 22,
    reviewers: int = 3,
    must_have: int = 5,
) -> SeedResult:
    """
    Seed a conference's CFP with review test data. Does not commit — the caller
    owns the transaction and the (already tenant-scoped) RLS context.

    Raises SeedError if the conference has no scored review questions and none
    could be created.
    """
    rng = random.Random(f"{conference.id}")  # deterministic across re-runs
    tenant_id = conference.tenant_id

    cfp = await get_or_create_cfp(db, conference)
    session_types = await get_or_create_session_types(db, tenant_id, conference.id)
    questions = await ensure_review_config(db, tenant_id, conference.id)
    if not questions:
        raise SeedError("No scored review questions available; cannot create reviews.")

    reviewer_members = await get_or_create_reviewers(db, tenant_id, conference.id, reviewers)
    paper_rows = await get_or_create_papers(db, tenant_id, cfp, session_types, papers)
    assignments = await get_or_create_assignments(db, tenant_id, paper_rows, reviewer_members, rng)
    await create_reviews(db, tenant_id, conference.id, paper_rows, assignments, questions, must_have, rng)
    await db.flush()

    return await compute_seed_state(db, conference.id, cfp.id)
