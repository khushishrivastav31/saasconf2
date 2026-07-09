"""Dev/staging-only admin endpoint to seed CFP review test data.

Lets a tenant admin populate a conference with realistic review data (papers,
reviewers, assignments, submitted reviews) to manually test/demo the
evaluated-papers workflows. Gated to non-production environments — returns 404
everywhere else so production reveals nothing about the feature.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.conference import Conference
from app.services.cfp_review_seed import SeedError, is_seeding_allowed, seed_cfp_review_data

router = APIRouter()


class SeedReviewDataRequest(BaseModel):
    """Volumes to seed. Bounded so an admin can't generate absurd amounts."""

    papers: int = Field(default=22, ge=1, le=100)
    reviewers: int = Field(default=3, ge=1, le=10)
    must_have: int = Field(default=5, ge=0, le=100)

    @model_validator(mode="after")
    def _must_have_within_papers(self) -> "SeedReviewDataRequest":
        if self.must_have > self.papers:
            raise ValueError("must_have cannot exceed papers")
        return self


class SeedReviewDataResponse(BaseModel):
    evaluated_papers: int
    reviewers: int
    must_have_papers: int
    default_password: str


@router.post("/conferences/{conference_id}/seed-review-data", response_model=SeedReviewDataResponse)
async def seed_review_data(
    conference_id: UUID,
    payload: SeedReviewDataRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> SeedReviewDataResponse:
    """Seed review test data into the given conference (dev/staging only)."""
    if not is_seeding_allowed(get_settings()):
        raise HTTPException(status_code=404, detail="Not found")

    # Resolve the conference, scoped to the caller's tenant. A conference from
    # another tenant simply isn't found → 404 (never a 403 that confirms it).
    conference = (
        await db.execute(
            select(Conference).where(
                Conference.id == conference_id,
                Conference.tenant_id == current_user.require_tenant_id(),
            )
        )
    ).scalar_one_or_none()
    if conference is None:
        raise HTTPException(status_code=404, detail="Conference not found")

    try:
        result = await seed_cfp_review_data(
            db,
            conference,
            papers=payload.papers,
            reviewers=payload.reviewers,
            must_have=payload.must_have,
        )
    except SeedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await db.commit()
    return SeedReviewDataResponse(
        evaluated_papers=result.evaluated_papers,
        reviewers=result.reviewers,
        must_have_papers=result.must_have_papers,
        default_password=result.default_password,
    )
