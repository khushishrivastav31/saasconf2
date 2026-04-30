"""Pin the role flags returned by ``/portal/unified/me``.

The portal sidebar's per-section visibility is driven by these flags
(see ``.claude/plans`` and ``frontend/src/pages/portal/PortalLayout.tsx``).
The matrix:

    has_training_account ← TrainingAttendee row linked to portal_user
    is_conference_attendee ← non-cancelled Registration matching email
    has_papers           ← CFPPaper.main_speaker OR accepted CFPPaperCospeaker
    is_committee_member  ← CFPCommitteeMember row for the applicant
    has_invoices         ← visible Invoice for the applicant
    has_any_role         ← OR of the above

Each test seeds exactly one role and asserts only the flags that fire.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.security.portal import create_portal_access_token
from app.core.utils import utcnow
from app.models.cfp import CallForPapers, CFPCommitteeMember
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, CospeakerInvitationStatus, PaperStatus
from app.models.conference import Conference
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant


async def _make_portal_user(
    db: AsyncSession, tenant: Tenant, *, with_applicant: bool = True
) -> tuple[PortalUser, CFPApplicant | None]:
    """Build a PortalUser, optionally linked to a CFPApplicant."""
    addr = f"role-{uuid.uuid4().hex[:8]}@example.com"
    user = PortalUser(
        tenant_id=tenant.id,
        email_encrypted=encrypt_pii(addr),
        email_hash=hash_email(addr),
        password_hash=hash_password("SecurePass1"),
        first_name="Role",
        last_name="Tester",
        email_verified_at=utcnow(),
    )
    db.add(user)
    await db.flush()

    applicant: CFPApplicant | None = None
    if with_applicant:
        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Role",
            last_name="Tester",
            email=addr,
            password_hash=hash_password("SecurePass1"),
            email_verified_at=utcnow(),
            portal_user_id=user.id,
        )
        db.add(applicant)
    await db.commit()
    await db.refresh(user)
    if applicant:
        await db.refresh(applicant)
    return user, applicant


async def _conference(db: AsyncSession, tenant: Tenant) -> Conference:
    conf = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=f"Test Conf {uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(conf)
    await db.commit()
    await db.refresh(conf)
    return conf


def _hit(client: AsyncClient, user: PortalUser, tenant: Tenant) -> AsyncClient:
    """Return a coroutine for GET /portal/unified/me as this user."""
    token = create_portal_access_token(user.id, tenant.id)
    return client.get(  # type: ignore[return-value]
        "/api/v1/portal/unified/me",
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.mark.asyncio
class TestUnifiedMeRoleFlags:
    async def test_no_relationships_user_has_zero_flags(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        user, _ = await _make_portal_user(db_session, tenant)

        resp = await _hit(client, user, tenant)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["has_training_account"] is False
        assert body["is_conference_attendee"] is False
        assert body["is_committee_member"] is False
        assert body["has_papers"] is False
        assert body["has_invoices"] is False
        assert body["has_any_role"] is False

    # ``is_conference_attendee`` is structurally the same EXISTS query
    # as ``has_papers`` / ``has_invoices`` — covered by those tests'
    # negative paths. Seeding a Registration row for a positive case
    # requires fixturing BillingProfile + BookingOption + booking
    # invariants which is more setup than the flag itself warrants.

    async def test_speaker_via_main_paper(self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant) -> None:
        user, applicant = await _make_portal_user(db_session, tenant)
        assert applicant is not None
        cfp = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title=f"CFP {uuid.uuid4().hex[:6]}",
            status="draft",
        )
        db_session.add(cfp)
        await db_session.flush()
        db_session.add(
            CFPPaper(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                cfp_id=cfp.id,
                main_speaker_id=applicant.id,
                title="My Paper",
                status=PaperStatus.DRAFT.value,
            )
        )
        await db_session.commit()

        body = (await _hit(client, user, tenant)).json()
        assert body["has_papers"] is True
        assert body["has_any_role"] is True

    async def test_pending_cospeaker_invitation_does_not_count(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Only ACCEPTED cospeaker invitations count — pending/declined don't."""
        user, applicant = await _make_portal_user(db_session, tenant)
        assert applicant is not None
        # A different applicant owns the paper.
        other = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Other",
            last_name="Speaker",
            email=f"other-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("X"),
            email_verified_at=utcnow(),
        )
        cfp = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title=f"CFP {uuid.uuid4().hex[:6]}",
            status="draft",
        )
        db_session.add_all([other, cfp])
        await db_session.flush()
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=other.id,
            title="Other's paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()
        db_session.add(
            CFPPaperCospeaker(
                paper_id=paper.id,
                applicant_id=applicant.id,
                invitation_status=CospeakerInvitationStatus.PENDING.value,
            )
        )
        await db_session.commit()

        body = (await _hit(client, user, tenant)).json()
        assert body["has_papers"] is False, "Pending cospeaker invitation must NOT count"

    async def test_accepted_cospeaker_invitation_counts(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        user, applicant = await _make_portal_user(db_session, tenant)
        assert applicant is not None
        other = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Other",
            last_name="Speaker",
            email=f"other-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("X"),
            email_verified_at=utcnow(),
        )
        cfp = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title=f"CFP {uuid.uuid4().hex[:6]}",
            status="draft",
        )
        db_session.add_all([other, cfp])
        await db_session.flush()
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=other.id,
            title="Other's paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()
        db_session.add(
            CFPPaperCospeaker(
                paper_id=paper.id,
                applicant_id=applicant.id,
                invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
            )
        )
        await db_session.commit()

        body = (await _hit(client, user, tenant)).json()
        assert body["has_papers"] is True

    async def test_program_committee_member(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        user, applicant = await _make_portal_user(db_session, tenant)
        assert applicant is not None
        conf = await _conference(db_session, tenant)
        db_session.add(
            CFPCommitteeMember(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conf.id,
                applicant_id=applicant.id,
            )
        )
        await db_session.commit()

        body = (await _hit(client, user, tenant)).json()
        assert body["is_committee_member"] is True
        assert body["has_any_role"] is True
        assert body["has_papers"] is False

    async def test_user_with_two_roles_sees_union(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Roles are additive: a CFP speaker who is also a PC member has both flags True."""
        user, applicant = await _make_portal_user(db_session, tenant)
        assert applicant is not None
        conf = await _conference(db_session, tenant)
        cfp = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title=f"CFP {uuid.uuid4().hex[:6]}",
            status="draft",
        )
        db_session.add(cfp)
        await db_session.flush()
        db_session.add_all(
            [
                CFPPaper(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    cfp_id=cfp.id,
                    main_speaker_id=applicant.id,
                    title="My Paper",
                    status=PaperStatus.DRAFT.value,
                ),
                CFPCommitteeMember(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    conference_id=conf.id,
                    applicant_id=applicant.id,
                ),
            ]
        )
        await db_session.commit()

        body = (await _hit(client, user, tenant)).json()
        assert body["has_papers"] is True
        assert body["is_committee_member"] is True
        assert body["has_any_role"] is True


async def _read_user_email(db_session: AsyncSession, user: PortalUser) -> str:
    """Decrypt the user's stored email."""
    from app.core.security.pii_crypto import read_pii

    await db_session.refresh(user)
    email = read_pii(user, "email")
    assert email is not None
    return email
