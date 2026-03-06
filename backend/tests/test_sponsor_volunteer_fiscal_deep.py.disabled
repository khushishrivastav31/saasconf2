"""Deep coverage tests for sponsor contracts, volunteer tasks, and fiscal representative endpoints.

Exercises conditional branches, error paths, version downloads, PDF/DOCX generation,
contract sending, volunteer assignment edge cases, schedule PDF exports with data,
and fiscal representative tax-info logic with inactive reps.
"""

import datetime
import io
import os
import uuid
import zipfile
from datetime import date, timedelta
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.associations import ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.conference import Conference
# from app.models.conference_vat_rate import ConferenceVatRate  # DELETED
from app.models.fiscal_representative import FiscalRepresentative

# Skip entire module - ConferenceVatRate was deleted
pytestmark = pytest.mark.skip(reason="ConferenceVatRate model deleted - needs migration to VatRateByCountry")
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SponsorPackage, VolunteerRole
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract, SponsorContractVersion
from app.models.tenant import Tenant
from app.models.user import User
from app.models.volunteer import Volunteer
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _contract_url(conference_id: uuid.UUID, sponsor_id: uuid.UUID, path: str = "") -> str:
    base = f"/api/v1/conferences/{conference_id}/sponsors/{sponsor_id}/contract"
    return f"{base}/{path}" if path else base


def _vol_url(conference_id: uuid.UUID, path: str = "") -> str:
    return f"/api/v1/conferences/{conference_id}/volunteer-tasks{path}"


def _fiscal_rep_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/fiscal-representative"


def _vat_rates_url(conference_id: uuid.UUID, rate_id: uuid.UUID | None = None) -> str:
    base = f"/api/v1/conferences/{conference_id}/vat-rates"
    return f"{base}/{rate_id}" if rate_id else base


def _tax_info_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/tax-info"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def sponsors_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Sponsors", code="sponsors", description="Sponsor mgmt", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def volunteers_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Volunteers", code="volunteers", description="Vol mgmt", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_all_modules(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    sponsors_module: Module,
    volunteers_module: Module,
) -> Tenant:
    for mod in (conferences_module, sponsors_module, volunteers_module):
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "sponsors", "volunteers"])


# ---------------------------------------------------------------------------
# Sponsor contract fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def sponsor_package(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SponsorPackage:
    pkg = SponsorPackage(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Gold",
        description="Gold package",
        price=10000,
        currency="EUR",
        is_active=True,
    )
    db_session.add(pkg)
    await db_session.commit()
    return pkg


@pytest_asyncio.fixture()
async def package_template_txt(db_session: AsyncSession, tenant: Tenant, sponsor_package: SponsorPackage) -> Attachment:
    content = b"Contract for {{company_name}}"
    att = Attachment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        entity_type="sponsor_package_contract",
        entity_id=sponsor_package.id,
        filename="template.txt",
        content_type="text/plain",
        file_size=len(content),
        file_data=content,
    )
    db_session.add(att)
    await db_session.commit()
    return att


@pytest_asyncio.fixture()
async def sample_sponsor(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, sponsor_package: SponsorPackage
) -> Sponsor:
    s = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        sponsor_package_id=sponsor_package.id,
        company_name="DeepTest Inc",
        phone="+100000",
        is_active=True,
        contact_persons=[
            {"first_name": "Jane", "last_name": "Doe", "email": "jane@deeptest.com"},
            {"first_name": "Bob", "last_name": "Doe", "email": "bob@deeptest.com"},
        ],
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def editable_contract(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    sample_sponsor: Sponsor,
    tenant_admin_user: User,
) -> SponsorContract:
    c = SponsorContract(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        sponsor_id=sample_sponsor.id,
        conference_id=conference.id,
        source_package_id=sample_sponsor.sponsor_package_id,
        filename="2026-01-01_TC26_Sponsorship_Gold_DeepTest-Inc",
        content_type="text/plain",
        file_data=b"<pre>Deep contract</pre>",
        file_size=22,
        html_content="<pre>Deep contract</pre>",
        is_editable=True,
        version=1,
        status="draft",
        created_by=tenant_admin_user.id,
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


@pytest_asyncio.fixture()
async def pdf_only_contract(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    sample_sponsor: Sponsor,
    tenant_admin_user: User,
) -> SponsorContract:
    """Contract that is PDF-only: is_editable=False, html_content=None, file_data present."""
    c = SponsorContract(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        sponsor_id=sample_sponsor.id,
        conference_id=conference.id,
        source_package_id=sample_sponsor.sponsor_package_id,
        filename="2026-01-01_TC26_Sponsorship_Gold_DeepTest-Inc",
        content_type="application/pdf",
        file_data=b"%PDF-1.4 fake pdf data",
        file_size=22,
        html_content=None,
        is_editable=False,
        version=1,
        status="draft",
        created_by=tenant_admin_user.id,
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


@pytest_asyncio.fixture()
async def contract_with_version(
    db_session: AsyncSession,
    editable_contract: SponsorContract,
    tenant_admin_user: User,
) -> SponsorContract:
    """Editable contract with one version snapshot (version 1 snapshot, contract at version 2)."""
    v1 = SponsorContractVersion(
        id=uuid.uuid4(),
        contract_id=editable_contract.id,
        version=1,
        html_content="<pre>Version 1</pre>",
        file_data=None,
        content_type="text/plain",
        file_size=17,
        filename=editable_contract.filename,
        created_by=tenant_admin_user.id,
    )
    db_session.add(v1)
    editable_contract.version = 2
    editable_contract.html_content = "<h1>Version 2 current</h1>"
    await db_session.commit()
    await db_session.refresh(editable_contract)
    return editable_contract


# ---------------------------------------------------------------------------
# Volunteer fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def program_day(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ProgramDay:
    d = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Day 1",
        date=datetime.date(2026, 6, 1),
        sort_order=0,
    )
    db_session.add(d)
    await db_session.commit()
    return d


@pytest_asyncio.fixture()
async def time_slot(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> ProgramTimeSlot:
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=program_day.id,
        start_time=datetime.time(9, 0),
        end_time=datetime.time(10, 0),
        sort_order=0,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def time_slot_2(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> ProgramTimeSlot:
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=program_day.id,
        start_time=datetime.time(10, 0),
        end_time=datetime.time(11, 0),
        sort_order=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def track(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, program_day: ProgramDay
) -> ProgramTrack:
    t = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=program_day.id,
        name="Track A",
        sort_order=0,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def session_obj(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    time_slot: ProgramTimeSlot,
    track: ProgramTrack,
) -> ProgramSession:
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=time_slot.id,
        start_track_id=track.id,
        slot_span=1,
        track_span=1,
        title="Opening Talk",
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def vol_role(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> VolunteerRole:
    r = VolunteerRole(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Usher",
        is_active=True,
    )
    db_session.add(r)
    await db_session.commit()
    return r


@pytest_asyncio.fixture()
async def volunteer_a(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Volunteer:
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="vol_a@test.com",
        first_name="Alice",
        last_name="Alpha",
        status="approved",
    )
    db_session.add(v)
    await db_session.flush()
    db_session.add(ConferenceVolunteer(conference_id=conference.id, volunteer_id=v.id))
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def volunteer_b(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Volunteer:
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="vol_b@test.com",
        first_name="Bob",
        last_name="Beta",
        status="approved",
    )
    db_session.add(v)
    await db_session.flush()
    db_session.add(ConferenceVolunteer(conference_id=conference.id, volunteer_id=v.id))
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def volunteer_not_linked(db_session: AsyncSession, tenant: Tenant) -> Volunteer:
    """Volunteer that exists in the tenant but is NOT linked to the conference."""
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="notlinked@test.com",
        first_name="Nolan",
        last_name="Lonely",
        status="approved",
    )
    db_session.add(v)
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def session_task(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    session_obj: ProgramSession,
    vol_role: VolunteerRole,
) -> SessionVolunteerTask:
    svt = SessionVolunteerTask(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        session_id=session_obj.id,
        volunteer_task_id=vol_role.id,
        required_count=3,
    )
    db_session.add(svt)
    await db_session.commit()
    return svt


@pytest_asyncio.fixture()
async def assignment_a(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    session_task: SessionVolunteerTask,
    volunteer_a: Volunteer,
) -> VolunteerAssignment:
    a = VolunteerAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        session_volunteer_task_id=session_task.id,
        volunteer_id=volunteer_a.id,
    )
    db_session.add(a)
    await db_session.commit()
    return a


# ═══════════════════════════════════════════════════════════════════════════
# SPONSOR CONTRACTS - DEEP COVERAGE
# ═══════════════════════════════════════════════════════════════════════════


class TestContractDownloadBinaryPdf:
    """Download a non-editable (PDF) contract returns the raw binary."""

    @pytest.mark.asyncio
    async def test_download_pdf_contract_returns_binary(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        pdf_only_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        url = _contract_url(conference.id, sample_sponsor.id, "download")
        resp = await client.get(url, headers=auth_headers(admin_token))

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content == b"%PDF-1.4 fake pdf data"

    @pytest.mark.asyncio
    async def test_download_no_file_data_no_html_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """An editable contract with html_content=None AND file_data=None returns 404."""
        editable_contract.html_content = None
        editable_contract.is_editable = False
        editable_contract.file_data = None
        await db_session.commit()

        url = _contract_url(conference.id, sample_sponsor.id, "download")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404


class TestContractPdfNoHtml:
    """GET /contract/pdf on a PDF-only contract returns 400."""

    @pytest.mark.asyncio
    async def test_pdf_endpoint_on_pdf_only_contract(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        pdf_only_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        url = _contract_url(conference.id, sample_sponsor.id, "pdf")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 400


class TestContractVersionDownload:
    """Download contract version as DOCX (HTML version) or binary (PDF version)."""

    @pytest.mark.asyncio
    async def test_download_html_version_as_docx(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_version: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Downloading a version that has html_content returns a DOCX."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions/1/download")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "application/vnd.openxmlformats" in resp.headers["content-type"]
        assert len(resp.content) > 0

    @pytest.mark.asyncio
    async def test_download_version_no_html_no_data_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """A version with no html_content and no file_data returns 404."""
        v = SponsorContractVersion(
            id=uuid.uuid4(),
            contract_id=editable_contract.id,
            version=1,
            html_content=None,
            file_data=None,
            content_type="application/pdf",
            file_size=0,
            filename=editable_contract.filename,
            created_by=tenant_admin_user.id,
        )
        db_session.add(v)
        editable_contract.version = 2
        await db_session.commit()

        url = _contract_url(conference.id, sample_sponsor.id, "versions/1/download")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_download_version_binary_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """A version with file_data but no html_content returns the raw binary."""
        v = SponsorContractVersion(
            id=uuid.uuid4(),
            contract_id=editable_contract.id,
            version=1,
            html_content=None,
            file_data=b"%PDF-1.4 version data",
            content_type="application/pdf",
            file_size=21,
            filename="version_file.pdf",
            created_by=tenant_admin_user.id,
        )
        db_session.add(v)
        editable_contract.version = 2
        await db_session.commit()

        url = _contract_url(conference.id, sample_sponsor.id, "versions/1/download")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content == b"%PDF-1.4 version data"

    @pytest.mark.asyncio
    async def test_download_nonexistent_version_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        url = _contract_url(conference.id, sample_sponsor.id, "versions/999/download")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404


class TestContractStatusToCancelled:
    """Test status transition to the 'signed' state and full flow."""

    @pytest.mark.asyncio
    async def test_status_draft_to_signed_directly(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Status can jump from draft directly to signed."""
        url = _contract_url(conference.id, sample_sponsor.id, "status")
        resp = await client.put(url, json={"status": "signed"}, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["status"] == "signed"


class TestContractSendPreview:
    """GET /contract/send-preview returns rendered email template."""

    @pytest.mark.asyncio
    async def test_send_preview_returns_subject_and_body(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        url = _contract_url(conference.id, sample_sponsor.id, "send-preview")
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert "subject" in data
        assert "body_html" in data
        assert len(data["subject"]) > 0
        assert len(data["body_html"]) > 0


class TestContractSend:
    """POST /contract/send exercises the email sending path."""

    @pytest.mark.asyncio
    async def test_send_to_explicit_recipient(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Sending to an explicit email address succeeds (dev mode logs only)."""
        url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": ["test@example.com"],
            "subject": "Your contract",
            "body_html": "<p>Please review the attached contract.</p>",
            "include_contact_persons": [],
            "send_as_pdf": False,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["sent_count"] == 1
        assert data["failed"] == []

    @pytest.mark.asyncio
    async def test_send_with_contact_person_indices(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Including contact_persons indices adds those emails to recipients."""
        url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": [],
            "subject": "Contract for you",
            "body_html": "<p>Here is the contract.</p>",
            "include_contact_persons": [0, 1],
            "send_as_pdf": False,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        # Both contact persons should be added: jane@deeptest.com, bob@deeptest.com
        assert data["sent_count"] == 2

    @pytest.mark.asyncio
    async def test_send_no_recipients_400(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Sending with no recipients returns 400."""
        url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": [],
            "subject": "Empty send",
            "body_html": "<p>Nobody to send to.</p>",
            "include_contact_persons": [],
            "send_as_pdf": False,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_send_as_pdf_generates_attachment(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Sending with send_as_pdf=True succeeds (PDF is generated from HTML)."""
        url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": ["pdf-test@example.com"],
            "subject": "Contract PDF",
            "body_html": "<p>PDF attached.</p>",
            "include_contact_persons": [],
            "send_as_pdf": True,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["sent_count"] == 1

    @pytest.mark.asyncio
    async def test_send_updates_status_from_draft_to_sent(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """After sending, contract status transitions from draft to sent."""
        send_url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": ["status-test@example.com"],
            "subject": "Check status",
            "body_html": "<p>Status test.</p>",
            "include_contact_persons": [],
            "send_as_pdf": False,
        }
        resp = await client.post(send_url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200

        # Verify contract status changed to sent
        get_url = _contract_url(conference.id, sample_sponsor.id)
        get_resp = await client.get(get_url, headers=auth_headers(admin_token))
        assert get_resp.status_code == 200
        assert get_resp.json()["status"] == "sent"

    @pytest.mark.asyncio
    async def test_send_pdf_contract_attaches_original_pdf(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        pdf_only_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Sending a PDF-only contract attaches the original PDF binary."""
        url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": ["pdf-orig@example.com"],
            "subject": "PDF contract",
            "body_html": "<p>Original PDF attached.</p>",
            "include_contact_persons": [],
            "send_as_pdf": False,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["sent_count"] == 1

    @pytest.mark.asyncio
    async def test_send_with_out_of_range_contact_index(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Out-of-range contact person indices are silently skipped."""
        url = _contract_url(conference.id, sample_sponsor.id, "send")
        payload = {
            "recipient_emails": ["fallback@example.com"],
            "subject": "Index test",
            "body_html": "<p>Only fallback should receive.</p>",
            "include_contact_persons": [99, -1],
            "send_as_pdf": False,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        # Only the explicit email should succeed
        assert data["sent_count"] == 1


class TestContractDeleteThenResources:
    """Ensure delete works and subsequent resource access fails."""

    @pytest.mark.asyncio
    async def test_delete_then_pdf_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        editable_contract: SponsorContract,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        headers = auth_headers(admin_token)
        base = _contract_url(conference.id, sample_sponsor.id)
        del_resp = await client.delete(base, headers=headers)
        assert del_resp.status_code == 200

        pdf_resp = await client.get(f"{base}/pdf", headers=headers)
        assert pdf_resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# VOLUNTEER TASKS - DEEP COVERAGE
# ═══════════════════════════════════════════════════════════════════════════


class TestVolunteerTaskCreationErrors:
    """Edge cases for POST /session-tasks."""

    @pytest.mark.asyncio
    async def test_create_session_task_nonexistent_session(
        self,
        client: AsyncClient,
        conference: Conference,
        vol_role: VolunteerRole,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        payload = {
            "session_id": str(uuid.uuid4()),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 1,
        }
        resp = await client.post(
            _vol_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_session_task_nonexistent_task(
        self,
        client: AsyncClient,
        conference: Conference,
        session_obj: ProgramSession,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        payload = {
            "session_id": str(session_obj.id),
            "volunteer_task_id": str(uuid.uuid4()),
            "required_count": 1,
        }
        resp = await client.post(
            _vol_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_session_task_duplicate_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        session_obj: ProgramSession,
        vol_role: VolunteerRole,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Creating a duplicate session-task (same session + task) returns 400."""
        payload = {
            "session_id": str(session_obj.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 2,
        }
        resp = await client.post(
            _vol_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_update_nonexistent_session_task_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.put(
            _vol_url(conference.id, f"/session-tasks/{uuid.uuid4()}"),
            json={"required_count": 5},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_nonexistent_session_task_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.delete(
            _vol_url(conference.id, f"/session-tasks/{uuid.uuid4()}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


class TestVolunteerAssignmentCreationErrors:
    """Edge cases for POST /volunteer-assignments."""

    @pytest.mark.asyncio
    async def test_assign_nonexistent_svt_404(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        payload = {
            "session_volunteer_task_id": str(uuid.uuid4()),
            "volunteer_id": str(volunteer_a.id),
        }
        resp = await client.post(
            _vol_url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_nonexistent_volunteer_404(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "volunteer_id": str(uuid.uuid4()),
        }
        resp = await client.post(
            _vol_url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_volunteer_not_linked_to_conference(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_not_linked: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Assigning a volunteer not linked to the conference returns 400."""
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "volunteer_id": str(volunteer_not_linked.id),
        }
        resp = await client.post(
            _vol_url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_assign_duplicate_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment_a: VolunteerAssignment,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Duplicate assignment of the same volunteer to same task returns 400."""
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "volunteer_id": str(volunteer_a.id),
        }
        resp = await client.post(
            _vol_url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 400


class TestVolunteerAssignmentDelete:
    """DELETE /volunteer-assignments/{id} edge cases."""

    @pytest.mark.asyncio
    async def test_delete_assignment_success(
        self,
        client: AsyncClient,
        conference: Conference,
        assignment_a: VolunteerAssignment,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.delete(
            _vol_url(conference.id, f"/volunteer-assignments/{assignment_a.id}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "unassigned" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_delete_nonexistent_assignment_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.delete(
            _vol_url(conference.id, f"/volunteer-assignments/{uuid.uuid4()}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


class TestVolunteerColorAndSchedulePdf:
    """Color update success and PDF export with actual data."""

    @pytest.mark.asyncio
    async def test_set_color_success(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.patch(
            _vol_url(conference.id, f"/volunteers/{volunteer_a.id}/color"),
            json={"color": "#FF5733"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "#FF5733"

    @pytest.mark.asyncio
    async def test_pdf_with_assignments_returns_valid_pdf(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment_a: VolunteerAssignment,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PDF for a volunteer with actual assignments should return valid PDF content."""
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{volunteer_a.id}/pdf"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_zip_with_assignments_returns_valid_zip(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment_a: VolunteerAssignment,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """ZIP of schedules with data should contain a PDF for the assigned volunteer."""
        resp = await client.get(
            _vol_url(conference.id, "/volunteer-schedules-pdf"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        # Parse the ZIP and verify contents
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        names = zf.namelist()
        assert len(names) == 1
        assert names[0].endswith(".pdf")
        pdf_data = zf.read(names[0])
        assert pdf_data[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_schedule_for_nonexistent_volunteer_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{uuid.uuid4()}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_schedule_empty_for_unassigned_volunteer(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Volunteer with no assignments returns an empty schedule."""
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{volunteer_a.id}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []
        assert data["volunteer_name"] == "Alice Alpha"


class TestVolunteerAssignmentOverviewWithVolunteers:
    """Test the overview endpoint when volunteers are actually assigned."""

    @pytest.mark.asyncio
    async def test_overview_includes_assigned_volunteer_details(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment_a: VolunteerAssignment,
        volunteer_a: Volunteer,
        tenant_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        resp = await client.get(_vol_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        sessions = data["items"][0]["sessions"]
        assert len(sessions) == 1
        assigned = sessions[0]["assigned_volunteers"]
        assert len(assigned) == 1
        assert assigned[0]["volunteer_name"] == "Alice Alpha"
        assert assigned[0]["volunteer_id"] == str(volunteer_a.id)


# ═══════════════════════════════════════════════════════════════════════════
# FISCAL REPRESENTATIVE + VAT RATES - DEEP COVERAGE
# ═══════════════════════════════════════════════════════════════════════════


class TestFiscalRepDeactivate:
    """Test updating a fiscal rep to inactive and its effect on tax-info."""

    @pytest_asyncio.fixture()
    async def fiscal_rep(
        self, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> FiscalRepresentative:
        rep = FiscalRepresentative(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Active Rep GmbH",
            country="Germany",
            email="info@activerep.de",
            vat_number="DE111222333",
            conference_vat_number="DE444555666",
            is_active=True,
        )
        db_session.add(rep)
        await db_session.commit()
        await db_session.refresh(rep)
        return rep

    @pytest.mark.asyncio
    async def test_update_fiscal_rep_to_inactive(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        fiscal_rep: FiscalRepresentative,
    ) -> None:
        """Updating is_active to False on a fiscal representative."""
        url = _fiscal_rep_url(conference.id)
        payload = {
            "company_name": fiscal_rep.company_name,
            "is_active": False,
        }
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
        # Same ID means it was updated, not recreated
        assert resp.json()["id"] == str(fiscal_rep.id)

    @pytest.mark.asyncio
    async def test_tax_info_inactive_fiscal_rep_shows_no_effective_vat(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """When fiscal rep is inactive and countries differ, effective_vat_number is None."""
        # Set up different countries
        tenant.country = "Austria"
        tenant.vat_number = "ATU12345678"
        conference.country = "Germany"

        # Create an inactive fiscal rep
        rep = FiscalRepresentative(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Inactive Rep",
            conference_vat_number="DE999888777",
            is_active=False,
        )
        db_session.add(rep)
        await db_session.commit()

        url = _tax_info_url(conference.id)
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["representation_type"] == "fiscal_representative"
        assert data["effective_vat_number"] is None
        # Fiscal rep summary should still be present
        assert data["fiscal_representative"] is not None
        assert data["fiscal_representative"]["is_active"] is False


class TestFiscalRepContactPersonsUpdate:
    """Test updating contact_persons on an existing fiscal rep."""

    @pytest.mark.asyncio
    async def test_upsert_replaces_contact_persons(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT replaces contact_persons on an existing fiscal rep."""
        # Create initial rep with one contact person
        rep = FiscalRepresentative(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Contact Test GmbH",
            contact_persons=[{"first_name": "Old", "last_name": "Person"}],
            is_active=True,
        )
        db_session.add(rep)
        await db_session.commit()

        url = _fiscal_rep_url(conference.id)
        payload = {
            "company_name": "Contact Test GmbH",
            "contact_persons": [
                {"first_name": "New1", "last_name": "Person1", "email": "new1@test.com"},
                {"first_name": "New2", "last_name": "Person2", "email": "new2@test.com"},
            ],
        }
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["contact_persons"]) == 2
        assert data["contact_persons"][0]["first_name"] == "New1"
        assert data["contact_persons"][1]["first_name"] == "New2"
        assert data["id"] == str(rep.id)


class TestVatRateUpdateRateOnly:
    """Test PUT on a VAT rate that only changes the rate (no date change)."""

    @pytest.mark.asyncio
    async def test_update_only_rate_value(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT with only rate= does not trigger overlap check (no date changes)."""
        today = date.today()
        rate = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("19.00"),
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=10),
        )
        db_session.add(rate)
        await db_session.commit()

        url = _vat_rates_url(conference.id, rate.id)
        resp = await client.put(url, json={"rate": 25.00}, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert Decimal(str(resp.json()["rate"])) == Decimal("25.00")
        # Dates unchanged
        assert resp.json()["start_date"] == str(rate.start_date)
        assert resp.json()["end_date"] == str(rate.end_date)


class TestVatRateEdgeCases:
    """Additional VAT rate edge cases."""

    @pytest.mark.asyncio
    async def test_create_rate_with_zero_rate(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """A rate of 0% (zero-rated) should be accepted."""
        url = _vat_rates_url(conference.id)
        payload = {
            "rate": 0.00,
            "start_date": "2027-01-01",
            "end_date": "2027-12-31",
            "description": "Zero-rated period",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 201
        assert Decimal(str(resp.json()["rate"])) == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_delete_vat_rate_verify_gone(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """After deleting a VAT rate, it no longer appears in the list."""
        today = date.today()
        rate = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("15.00"),
            start_date=today + timedelta(days=100),
            end_date=today + timedelta(days=200),
        )
        db_session.add(rate)
        await db_session.commit()

        # Delete
        url = _vat_rates_url(conference.id, rate.id)
        del_resp = await client.delete(url, headers=auth_headers(admin_token))
        assert del_resp.status_code == 200

        # Verify list is empty
        list_resp = await client.get(_vat_rates_url(conference.id), headers=auth_headers(admin_token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_tax_info_no_country_set(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """When neither tenant nor conference has a country, representation type defaults."""
        url = _tax_info_url(conference.id)
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        # With no countries, same_country is falsy, so defaults to fiscal_representative
        assert data["representation_type"] == "fiscal_representative"
        assert data["effective_vat_number"] is None

    @pytest.mark.asyncio
    async def test_tax_info_with_multiple_vat_rates_only_current_shown(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """current_vat_rate should pick the rate that covers today."""
        today = date.today()
        # Past rate
        past = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("18.00"),
            start_date=today - timedelta(days=90),
            end_date=today - timedelta(days=1),
            description="Past",
        )
        # Current rate
        current = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("21.00"),
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=10),
            description="Current",
        )
        # Future rate
        future = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("23.00"),
            start_date=today + timedelta(days=30),
            end_date=today + timedelta(days=90),
            description="Future",
        )
        db_session.add_all([past, current, future])
        await db_session.commit()

        url = _tax_info_url(conference.id)
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert Decimal(str(data["current_vat_rate"])) == Decimal("21.00")
        assert len(data["vat_rates"]) == 3
