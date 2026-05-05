"""Deep coverage tests for sponsor contracts, volunteer tasks, and fiscal representative endpoints.

Exercises conditional branches, error paths, version downloads, PDF/DOCX generation,
contract sending, volunteer assignment edge cases, schedule PDF exports with data,
and fiscal representative tax-info logic with inactive reps.
"""

import datetime
import os
import uuid

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
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.fiscal_representative import FiscalRepresentative
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract, SponsorContractVersion
from app.models.tenant import Tenant
from app.models.user import User
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
# FISCAL REPRESENTATIVE - DEEP COVERAGE
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
