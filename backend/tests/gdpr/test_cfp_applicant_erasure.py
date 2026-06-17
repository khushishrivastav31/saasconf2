"""GDPR erasure for CFP applicants that have papers.

Regression test for the FK violation:
  cfp_papers.main_speaker_id → cfp_applicants.id (RESTRICT)

Deleting the applicant row directly violates the constraint. The correct
erasure action is ``anonymize`` — wipe PII, keep the row so papers remain
consistent (same behaviour as the admin ``?mode=anonymize`` endpoint).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.gdpr.erasure import build_preview
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.models.cfp import CallForPapers, CFPPaper
from app.models.cfp_applicants import CFPApplicant
from app.models.privacy_request import PrivacyRequest, PrivacyRequestStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import _make_token

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

SUBJECT_EMAIL = "speaker-erase@example.com"


@pytest_asyncio.fixture()
async def cfp_erasure_env(db_session: AsyncSession) -> dict[str, Any]:
    tenant = Tenant(
        id=uuid.uuid4(),
        name="CFP Erase Corp",
        slug=f"cfp-erase-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    admin = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Admin",
        last_name="User",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        title="Dr",
        company="Acme",
        bio="A great speaker.",
        password_hash=hash_password("Password123!"),
    )
    applicant.email = SUBJECT_EMAIL

    db_session.add_all([tenant, admin, applicant])
    await db_session.commit()

    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP",
    )
    db_session.add(cfp)
    await db_session.commit()

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="My Great Talk",
    )
    db_session.add(paper)
    await db_session.commit()

    pr = PrivacyRequest(
        tenant_id=tenant.id,
        request_type="erasure",
        status=PrivacyRequestStatus.APPROVED.value,
    )
    pr.subject_emails = [SUBJECT_EMAIL]
    db_session.add(pr)
    await db_session.commit()

    token = _make_token(admin)
    return {
        "tenant": tenant,
        "applicant": applicant,
        "paper": paper,
        "pr": pr,
        "headers": {"Authorization": f"Bearer {token}"},
    }


class TestCFPApplicantErasurePreview:
    @pytest.mark.asyncio
    async def test_cfp_applicants_default_action_is_anonymize(
        self,
        db_session: AsyncSession,
        cfp_erasure_env: dict[str, Any],
    ) -> None:
        tenant_id = cfp_erasure_env["tenant"].id
        email_hash = hash_email(SUBJECT_EMAIL)
        preview = await build_preview(db_session, tenant_id, [email_hash])

        cfp_entry = next(e for e in preview.entries if e.table == "cfp_applicants")
        assert cfp_entry.default_action == "anonymize", (
            "cfp_applicants default_action must be 'anonymize' — deleting violates "
            "cfp_papers.main_speaker_id FK (RESTRICT)"
        )
        assert "anonymize" in cfp_entry.allowed_actions
        assert "delete" not in cfp_entry.allowed_actions


class TestCFPApplicantErasureExecute:
    @pytest.mark.asyncio
    async def test_execute_erasure_anonymizes_applicant_with_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cfp_erasure_env: dict[str, Any],
    ) -> None:
        """No FK violation when executing erasure for an applicant that has papers."""
        pr = cfp_erasure_env["pr"]
        r = await client.post(
            f"/api/v1/privacy-requests/{pr.id}/execute-erasure",
            json={"table_actions": {}},
            headers=cfp_erasure_env["headers"],
        )
        assert r.status_code == 200, r.text

    @pytest.mark.asyncio
    async def test_applicant_pii_cleared_after_erasure(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cfp_erasure_env: dict[str, Any],
    ) -> None:
        pr = cfp_erasure_env["pr"]
        applicant_id = cfp_erasure_env["applicant"].id

        await client.post(
            f"/api/v1/privacy-requests/{pr.id}/execute-erasure",
            json={"table_actions": {}},
            headers=cfp_erasure_env["headers"],
        )

        await db_session.refresh(cfp_erasure_env["applicant"])
        applicant = cfp_erasure_env["applicant"]
        assert applicant.email_hash is None
        assert applicant.email_encrypted is None
        assert applicant.first_name == "Deleted"
        assert applicant.last_name == "User"
        assert applicant.bio is None
        assert applicant.company is None
        assert applicant.is_deleted is True

    @pytest.mark.asyncio
    async def test_paper_still_exists_after_applicant_anonymized(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cfp_erasure_env: dict[str, Any],
    ) -> None:
        pr = cfp_erasure_env["pr"]
        paper_id = cfp_erasure_env["paper"].id

        await client.post(
            f"/api/v1/privacy-requests/{pr.id}/execute-erasure",
            json={"table_actions": {}},
            headers=cfp_erasure_env["headers"],
        )

        paper = await db_session.get(CFPPaper, paper_id)
        assert paper is not None, "Paper must survive applicant anonymization"
        assert paper.main_speaker_id == cfp_erasure_env["applicant"].id
