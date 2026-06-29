"""Tests for GET /alumni – tenant-wide alumni aggregation from past conferences.

Covers: dedup by email_hash, all four sources (attendee / main-speaker /
co-speaker / committee), past-only filter, cancellation exclusion,
conference_id + role query filters, tenant isolation, and CSV export.
"""

import os
import uuid
from datetime import date, timedelta

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("PII_ENCRYPTION_KEY", "d3SqaqrZBel50kd5H4KnoZNvwPcNFP8kozOQeuPh9Jg=")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email, encrypt_pii
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperCospeaker,
    CospeakerInvitationStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.registration import Registration, RegistrationStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import _make_token, auth_headers as _auth_headers

ALUMNI_URL = "/api/v1/alumni"


def auth_headers(user: User, tenant_id: uuid.UUID | None = None) -> dict[str, str]:
    """Build auth headers for a user, always including conferences module."""
    token = _make_token(user, modules=["conferences", "cfp"])
    return _auth_headers(token)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _past_date(days: int = 10) -> date:
    return date.today() - timedelta(days=days)


def _future_date(days: int = 10) -> date:
    return date.today() + timedelta(days=days)


async def _make_applicant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    first_name: str,
    last_name: str,
    email: str,
) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        first_name=first_name,
        last_name=last_name,
        password_hash=hash_password("pw"),
    )
    a.email = email
    db.add(a)
    await db.flush()
    return a


async def _make_cfp(db: AsyncSession, tenant_id: uuid.UUID) -> CallForPapers:
    c = CallForPapers(id=uuid.uuid4(), tenant_id=tenant_id, title="CFP", status="open")
    db.add(c)
    await db.flush()
    return c


async def _make_conference(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    name: str = "Conf",
    end_date: date | None = None,
    start_date: date | None = None,
) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        name=name,
        abbreviation=name[:4].upper(),
        is_active=True,
        end_date=end_date,
        start_date=start_date or _past_date(20),
    )
    db.add(c)
    await db.flush()
    return c


async def _link_cfp_to_conference(
    db: AsyncSession, cfp: CallForPapers, conference: Conference
) -> None:
    db.add(ConferenceCFP(id=uuid.uuid4(), cfp_id=cfp.id, conference_id=conference.id))
    await db.flush()


async def _make_registration(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    conference_id: uuid.UUID,
    email: str,
    first_name: str = "Test",
    last_name: str = "User",
    status: str = RegistrationStatus.PAID.value,
) -> Registration:
    from app.models.booking import BookingOption
    from app.models.registration import BillingProfile

    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        conference_id=conference_id,
        name=f"Option-{uuid.uuid4().hex[:4]}",
    )
    db.add(option)
    await db.flush()

    bp = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        conference_id=conference_id,
        street="1 Main St",
        postal_code="12345",
        city="City",
        country="DE",
        contact_first_name=first_name,
        contact_last_name=last_name,
    )
    db.add(bp)
    await db.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        conference_id=conference_id,
        billing_profile_id=bp.id,
        booking_option_id=option.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        status=status,
    )
    db.add(reg)
    await db.flush()
    return reg


async def _make_accepted_paper(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cfp: CallForPapers,
    speaker: CFPApplicant,
) -> CFPPaper:
    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        cfp_id=cfp.id,
        main_speaker_id=speaker.id,
        title="Great Talk",
        status=PaperStatus.ACCEPTED.value,
    )
    db.add(paper)
    await db.flush()
    return paper


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="CFP", code="cfp", description="CFP", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_modules(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
    for mod in [conferences_module, cfp_module]:
        db_session.add(
            TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True)
        )
    await db_session.commit()
    return tenant


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dedup_attendee_and_speaker(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """A person who is both an attendee and a speaker collapses to one row."""
    email = f"dual-{uuid.uuid4().hex[:6]}@example.com"
    conf = await _make_conference(db_session, tenant.id, name="PastConf", end_date=_past_date())
    cfp = await _make_cfp(db_session, tenant.id)
    await _link_cfp_to_conference(db_session, cfp, conf)

    await _make_registration(db_session, tenant.id, conf.id, email, "Dual", "Person")
    applicant = await _make_applicant(db_session, tenant.id, "Dual", "Person", email)
    await _make_accepted_paper(db_session, tenant.id, cfp, applicant)
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    items = resp.json()["items"]

    matching = [i for i in items if i["email_hash"] == hash_email(email)]
    assert len(matching) == 1, "should deduplicate to a single row"
    roles = set(matching[0]["roles"])
    assert "attendee" in roles
    assert "speaker" in roles


@pytest.mark.asyncio
async def test_past_only_end_date_lt_today(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """Only conferences with end_date < today appear; future + null excluded."""
    past_email = f"past-{uuid.uuid4().hex[:6]}@example.com"
    future_email = f"future-{uuid.uuid4().hex[:6]}@example.com"
    null_email = f"null-{uuid.uuid4().hex[:6]}@example.com"

    past_conf = await _make_conference(
        db_session, tenant.id, name="Past", end_date=_past_date()
    )
    future_conf = await _make_conference(
        db_session, tenant.id, name="Future", end_date=_future_date()
    )
    null_conf = await _make_conference(db_session, tenant.id, name="Null", end_date=None)

    await _make_registration(db_session, tenant.id, past_conf.id, past_email)
    await _make_registration(db_session, tenant.id, future_conf.id, future_email)
    await _make_registration(db_session, tenant.id, null_conf.id, null_email)
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}

    assert hash_email(past_email) in email_hashes
    assert hash_email(future_email) not in email_hashes
    assert hash_email(null_email) not in email_hashes


@pytest.mark.asyncio
async def test_cancelled_registrations_excluded(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """Cancelled registrations do not appear; other statuses do."""
    conf = await _make_conference(db_session, tenant.id, end_date=_past_date())

    cancelled_email = f"cancelled-{uuid.uuid4().hex[:6]}@example.com"
    paid_email = f"paid-{uuid.uuid4().hex[:6]}@example.com"

    await _make_registration(
        db_session,
        tenant.id,
        conf.id,
        cancelled_email,
        status=RegistrationStatus.CANCELLED.value,
    )
    await _make_registration(
        db_session,
        tenant.id,
        conf.id,
        paid_email,
        status=RegistrationStatus.PAID.value,
    )
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}
    assert hash_email(cancelled_email) not in email_hashes
    assert hash_email(paid_email) in email_hashes


@pytest.mark.asyncio
async def test_speakers_accepted_papers_only(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """Main speakers appear only when their paper is accepted; rejected excluded."""
    conf = await _make_conference(db_session, tenant.id, end_date=_past_date())
    cfp = await _make_cfp(db_session, tenant.id)
    await _link_cfp_to_conference(db_session, cfp, conf)

    accepted_speaker_email = f"accepted-spk-{uuid.uuid4().hex[:6]}@example.com"
    rejected_speaker_email = f"rejected-spk-{uuid.uuid4().hex[:6]}@example.com"

    accepted_spk = await _make_applicant(
        db_session, tenant.id, "A", "Speaker", accepted_speaker_email
    )
    rejected_spk = await _make_applicant(
        db_session, tenant.id, "R", "Speaker", rejected_speaker_email
    )

    await _make_accepted_paper(db_session, tenant.id, cfp, accepted_spk)

    rejected_paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=rejected_spk.id,
        title="Rejected Talk",
        status=PaperStatus.REJECTED.value,
    )
    db_session.add(rejected_paper)
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}
    assert hash_email(accepted_speaker_email) in email_hashes
    assert hash_email(rejected_speaker_email) not in email_hashes


@pytest.mark.asyncio
async def test_cospeaker_accepted_only(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """Accepted co-speakers appear; pending/declined co-speakers do not."""
    conf = await _make_conference(db_session, tenant.id, end_date=_past_date())
    cfp = await _make_cfp(db_session, tenant.id)
    await _link_cfp_to_conference(db_session, cfp, conf)

    main_email = f"main-{uuid.uuid4().hex[:6]}@example.com"
    accepted_co_email = f"co-accepted-{uuid.uuid4().hex[:6]}@example.com"
    pending_co_email = f"co-pending-{uuid.uuid4().hex[:6]}@example.com"

    main_spk = await _make_applicant(db_session, tenant.id, "Main", "Speaker", main_email)
    accepted_co = await _make_applicant(
        db_session, tenant.id, "Accepted", "Cospeaker", accepted_co_email
    )
    pending_co = await _make_applicant(
        db_session, tenant.id, "Pending", "Cospeaker", pending_co_email
    )

    paper = await _make_accepted_paper(db_session, tenant.id, cfp, main_spk)

    db_session.add(
        CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=accepted_co.id,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
    )
    db_session.add(
        CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=pending_co.id,
            invitation_status=CospeakerInvitationStatus.PENDING.value,
        )
    )
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}
    assert hash_email(accepted_co_email) in email_hashes
    assert hash_email(pending_co_email) not in email_hashes


@pytest.mark.asyncio
async def test_committee_members(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """Committee members appear in the alumni list with role 'committee'."""
    conf = await _make_conference(db_session, tenant.id, end_date=_past_date())
    email = f"committee-{uuid.uuid4().hex[:6]}@example.com"
    applicant = await _make_applicant(db_session, tenant.id, "Committee", "Member", email)
    db_session.add(
        CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conf.id,
            applicant_id=applicant.id,
            role="reviewer",
        )
    )
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    items = resp.json()["items"]
    matching = [i for i in items if i["email_hash"] == hash_email(email)]
    assert len(matching) == 1
    assert "committee" in matching[0]["roles"]


@pytest.mark.asyncio
async def test_conference_id_filter(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """conference_id filter restricts results to alumni of that conference only."""
    conf_a = await _make_conference(db_session, tenant.id, name="ConfA", end_date=_past_date())
    conf_b = await _make_conference(db_session, tenant.id, name="ConfB", end_date=_past_date())

    email_a = f"conf-a-{uuid.uuid4().hex[:6]}@example.com"
    email_b = f"conf-b-{uuid.uuid4().hex[:6]}@example.com"
    await _make_registration(db_session, tenant.id, conf_a.id, email_a)
    await _make_registration(db_session, tenant.id, conf_b.id, email_b)
    await db_session.commit()

    resp = await client.get(
        ALUMNI_URL,
        params={"conference_id": str(conf_a.id)},
        headers=auth_headers(tenant_admin_user, tenant.id),
    )
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}
    assert hash_email(email_a) in email_hashes
    assert hash_email(email_b) not in email_hashes


@pytest.mark.asyncio
async def test_role_filter(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """role filter keeps only alumni matching that role."""
    conf = await _make_conference(db_session, tenant.id, end_date=_past_date())
    cfp = await _make_cfp(db_session, tenant.id)
    await _link_cfp_to_conference(db_session, cfp, conf)

    attendee_email = f"att-{uuid.uuid4().hex[:6]}@example.com"
    speaker_email = f"spk-{uuid.uuid4().hex[:6]}@example.com"

    await _make_registration(db_session, tenant.id, conf.id, attendee_email)
    spk = await _make_applicant(db_session, tenant.id, "Speaker", "Only", speaker_email)
    await _make_accepted_paper(db_session, tenant.id, cfp, spk)
    await db_session.commit()

    resp = await client.get(
        ALUMNI_URL,
        params={"role": "speaker"},
        headers=auth_headers(tenant_admin_user, tenant.id),
    )
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}
    assert hash_email(speaker_email) in email_hashes
    assert hash_email(attendee_email) not in email_hashes


@pytest.mark.asyncio
async def test_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """Alumni from another tenant never appear."""
    other_tenant = Tenant(
        id=uuid.uuid4(),
        name="Other",
        slug=f"other-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(other_tenant)
    await db_session.flush()

    other_conf = await _make_conference(db_session, other_tenant.id, end_date=_past_date())
    other_email = f"other-{uuid.uuid4().hex[:6]}@example.com"
    await _make_registration(db_session, other_tenant.id, other_conf.id, other_email)
    await db_session.commit()

    resp = await client.get(ALUMNI_URL, headers=auth_headers(tenant_admin_user, tenant.id))
    assert resp.status_code == 200
    email_hashes = {i["email_hash"] for i in resp.json()["items"]}
    assert hash_email(other_email) not in email_hashes


@pytest.mark.asyncio
async def test_csv_matches_json(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
) -> None:
    """CSV export row count matches JSON list total."""
    conf = await _make_conference(db_session, tenant.id, end_date=_past_date())
    for i in range(3):
        await _make_registration(
            db_session, tenant.id, conf.id, f"csv-test-{i}-{uuid.uuid4().hex[:6]}@example.com"
        )
    await db_session.commit()

    json_resp = await client.get(
        ALUMNI_URL,
        params={"limit": 500},
        headers=auth_headers(tenant_admin_user, tenant.id),
    )
    assert json_resp.status_code == 200
    json_total = json_resp.json()["total"]

    csv_resp = await client.get(
        f"{ALUMNI_URL}/export.csv",
        headers=auth_headers(tenant_admin_user, tenant.id),
    )
    assert csv_resp.status_code == 200
    content = csv_resp.content.decode("utf-8-sig")
    lines = [ln for ln in content.splitlines() if ln.strip()]
    # lines[0] is header
    assert len(lines) - 1 == json_total
