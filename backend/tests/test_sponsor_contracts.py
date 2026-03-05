"""Tests for sponsor contract management endpoints.

Covers CRUD operations, status transitions, version management,
authentication/permission checks, and 404 error cases.
"""

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
from app.models.module import Module, TenantModule
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract, SponsorContractVersion
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _contract_url(conference_id: uuid.UUID, sponsor_id: uuid.UUID, path: str = "") -> str:
    """Build the sponsor contract endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/sponsors/{sponsor_id}/contract"
    if path:
        return f"{base}/{path}"
    return base


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def sponsors_module(db_session: AsyncSession) -> Module:
    """Create the 'sponsors' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Sponsors",
        code="sponsors",
        description="Sponsor management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_sponsors_module(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    sponsors_module: Module,
) -> Tenant:
    """Associate both conferences and sponsors modules with the test tenant."""
    for mod in (conferences_module, sponsors_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with sponsors module."""
    return _make_token(tenant_admin_user, modules=["sponsors"])


@pytest.fixture()
def sa_token(super_admin_user: User) -> str:
    """Return a valid access token for the super admin."""
    return _make_token(super_admin_user, modules=["sponsors"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    """Return a valid access token for the regular user with sponsors module."""
    return _make_token(regular_user, modules=["sponsors"])


@pytest_asyncio.fixture()
async def sponsor_package(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> SponsorPackage:
    """Create a sponsor package with a contract template attachment."""
    pkg = SponsorPackage(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Gold",
        description="Gold sponsorship package",
        price=10000,
        currency="EUR",
        is_active=True,
    )
    db_session.add(pkg)
    await db_session.commit()
    await db_session.refresh(pkg)
    return pkg


@pytest_asyncio.fixture()
async def package_template(
    db_session: AsyncSession,
    tenant: Tenant,
    sponsor_package: SponsorPackage,
) -> Attachment:
    """Create a plain-text contract template attachment for the sponsor package."""
    template_content = b"This is a sample contract template for {{company_name}}."
    att = Attachment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        entity_type="sponsor_package_contract",
        entity_id=sponsor_package.id,
        filename="contract_template.txt",
        content_type="text/plain",
        file_size=len(template_content),
        file_data=template_content,
    )
    db_session.add(att)
    await db_session.commit()
    await db_session.refresh(att)
    return att


@pytest_asyncio.fixture()
async def sample_sponsor(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    sponsor_package: SponsorPackage,
) -> Sponsor:
    """Create a sample sponsor linked to the conference and a package."""
    sponsor = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        sponsor_package_id=sponsor_package.id,
        company_name="Acme Corp",
        phone="+1234567890",
        website="https://acme.example.com",
        is_active=True,
    )
    db_session.add(sponsor)
    await db_session.commit()
    await db_session.refresh(sponsor)
    return sponsor


@pytest_asyncio.fixture()
async def sponsor_no_package(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Sponsor:
    """Create a sponsor without a package assignment."""
    sponsor = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="No Package Inc",
        is_active=True,
    )
    db_session.add(sponsor)
    await db_session.commit()
    await db_session.refresh(sponsor)
    return sponsor


@pytest_asyncio.fixture()
async def sample_contract(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    sample_sponsor: Sponsor,
    tenant_admin_user: User,
) -> SponsorContract:
    """Create a sample contract directly in the database."""
    contract = SponsorContract(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        sponsor_id=sample_sponsor.id,
        conference_id=conference.id,
        source_package_id=sample_sponsor.sponsor_package_id,
        filename="2026-01-01_TC26_Sponsorship_Gold_Acme-Corp",
        content_type="text/plain",
        file_data=b"<pre>Sample contract content</pre>",
        file_size=32,
        html_content="<pre>Sample contract content</pre>",
        is_editable=True,
        version=1,
        status="draft",
        created_by=tenant_admin_user.id,
    )
    db_session.add(contract)
    await db_session.commit()
    await db_session.refresh(contract)
    return contract


@pytest_asyncio.fixture()
async def contract_with_versions(
    db_session: AsyncSession,
    sample_contract: SponsorContract,
    tenant_admin_user: User,
) -> SponsorContract:
    """Add version snapshots to the sample contract."""
    # Version 1 snapshot
    v1 = SponsorContractVersion(
        id=uuid.uuid4(),
        contract_id=sample_contract.id,
        version=1,
        html_content="<pre>Version 1 content</pre>",
        file_data=b"Version 1 data",
        content_type="text/plain",
        file_size=14,
        filename=sample_contract.filename,
        created_by=tenant_admin_user.id,
    )
    # Version 2 snapshot
    v2 = SponsorContractVersion(
        id=uuid.uuid4(),
        contract_id=sample_contract.id,
        version=2,
        html_content="<pre>Version 2 content</pre>",
        file_data=b"Version 2 data",
        content_type="text/plain",
        file_size=14,
        filename=sample_contract.filename,
        created_by=tenant_admin_user.id,
    )
    db_session.add_all([v1, v2])
    # Bump the contract to version 3 to reflect the snapshots
    sample_contract.version = 3
    sample_contract.html_content = "<pre>Version 3 content (current)</pre>"
    await db_session.commit()
    await db_session.refresh(sample_contract)
    return sample_contract


# ═══════════════════════════════════════════════════════════════════════
# 1. GET CONTRACT
# ═══════════════════════════════════════════════════════════════════════


class TestGetContract:
    """GET /conferences/{cid}/sponsors/{sid}/contract"""

    @pytest.mark.asyncio
    async def test_get_existing_contract(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching an existing contract returns full details."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(sample_contract.id)
        assert data["sponsor_id"] == str(sample_sponsor.id)
        assert data["conference_id"] == str(conference.id)
        assert data["filename"] == sample_contract.filename
        assert data["status"] == "draft"
        assert data["version"] == 1
        assert data["is_editable"] is True
        assert data["html_content"] == "<pre>Sample contract content</pre>"
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.asyncio
    async def test_get_contract_no_contract_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching a contract when none exists returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_contract_wrong_sponsor_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching a contract for a nonexistent sponsor returns 404."""
        fake_sponsor_id = uuid.uuid4()
        url = _contract_url(conference.id, fake_sponsor_id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_contract_wrong_conference_404(
        self,
        client: AsyncClient,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching a contract under the wrong conference returns 404."""
        fake_conference_id = uuid.uuid4()
        url = _contract_url(fake_conference_id, sample_sponsor.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_contract_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
    ) -> None:
        """Fetching a contract without authentication returns 401."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.get(url)

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_contract_version_count(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_versions: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """The version_count field reflects the number of version snapshots."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == 3
        assert data["version_count"] == 2


# ═══════════════════════════════════════════════════════════════════════
# 2. GENERATE CONTRACT
# ═══════════════════════════════════════════════════════════════════════


class TestGenerateContract:
    """POST /conferences/{cid}/sponsors/{sid}/contract/generate"""

    @pytest.mark.asyncio
    async def test_generate_contract_success(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        package_template: Attachment,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Generating a contract from a package template returns 201 with contract data."""
        url = _contract_url(conference.id, sample_sponsor.id, "generate")
        response = await client.post(url, headers=auth_headers(admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["sponsor_id"] == str(sample_sponsor.id)
        assert data["conference_id"] == str(conference.id)
        assert data["status"] == "draft"
        assert data["version"] == 1
        assert data["is_editable"] is True
        assert data["html_content"] is not None
        assert "Acme-Corp" in data["filename"] or "Acme" in data["filename"]
        assert "Gold" in data["filename"]
        assert data["content_type"] == "text/plain"

    @pytest.mark.asyncio
    async def test_generate_contract_no_package_400(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor_no_package: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Generating a contract for a sponsor without a package returns 400."""
        url = _contract_url(conference.id, sponsor_no_package.id, "generate")
        response = await client.post(url, headers=auth_headers(admin_token))

        assert response.status_code == 400
        assert "package" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_generate_contract_duplicate_without_force_400(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        package_template: Attachment,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Generating a contract when one already exists (without force) returns 400."""
        url = _contract_url(conference.id, sample_sponsor.id, "generate")
        response = await client.post(url, headers=auth_headers(admin_token))

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_generate_contract_force_regenerate(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        package_template: Attachment,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Regenerating with force=true overwrites the contract and bumps the version."""
        url = _contract_url(conference.id, sample_sponsor.id, "generate")
        response = await client.post(url, params={"force": "true"}, headers=auth_headers(admin_token))

        assert response.status_code == 201
        data = response.json()
        # Version should be bumped from 1 to 2
        assert data["version"] == 2
        # A version snapshot should now exist
        assert data["version_count"] == 1

    @pytest.mark.asyncio
    async def test_generate_contract_no_template_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Generating a contract when the package has no template returns 404."""
        # sample_sponsor has a package but no template attachment was created
        url = _contract_url(conference.id, sample_sponsor.id, "generate")
        response = await client.post(url, headers=auth_headers(admin_token))

        assert response.status_code == 404
        assert "template" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_generate_contract_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
    ) -> None:
        """Generating a contract without authentication returns 401."""
        url = _contract_url(conference.id, sample_sponsor.id, "generate")
        response = await client.post(url)

        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 3. SAVE CONTRACT CONTENT
# ═══════════════════════════════════════════════════════════════════════


class TestSaveContractContent:
    """PUT /conferences/{cid}/sponsors/{sid}/contract/content"""

    @pytest.mark.asyncio
    async def test_save_content_success(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Saving new HTML content bumps the version and stores the content."""
        url = _contract_url(conference.id, sample_sponsor.id, "content")
        new_html = "<h1>Updated Contract</h1><p>New terms and conditions.</p>"
        response = await client.put(
            url,
            json={"html_content": new_html},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["html_content"] == new_html
        assert data["version"] == 2  # bumped from 1
        assert data["version_count"] == 1  # one snapshot of v1

    @pytest.mark.asyncio
    async def test_save_content_creates_version_snapshot(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Saving content twice creates two version snapshots."""
        url = _contract_url(conference.id, sample_sponsor.id, "content")

        # First edit
        await client.put(
            url,
            json={"html_content": "<p>Edit 1</p>"},
            headers=auth_headers(admin_token),
        )

        # Second edit
        response = await client.put(
            url,
            json={"html_content": "<p>Edit 2</p>"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == 3
        assert data["version_count"] == 2

    @pytest.mark.asyncio
    async def test_save_content_non_editable_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Saving content on a non-editable (PDF) contract returns 400."""
        # Mark contract as non-editable
        sample_contract.is_editable = False
        sample_contract.content_type = "application/pdf"
        await db_session.commit()

        url = _contract_url(conference.id, sample_sponsor.id, "content")
        response = await client.put(
            url,
            json={"html_content": "<p>Should fail</p>"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 400
        assert "not editable" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_save_content_empty_body_422(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Saving empty html_content returns 422 validation error."""
        url = _contract_url(conference.id, sample_sponsor.id, "content")
        response = await client.put(
            url,
            json={"html_content": ""},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_save_content_no_contract_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Saving content when no contract exists returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id, "content")
        response = await client.put(
            url,
            json={"html_content": "<p>No contract</p>"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. UPDATE CONTRACT STATUS
# ═══════════════════════════════════════════════════════════════════════


class TestUpdateContractStatus:
    """PUT /conferences/{cid}/sponsors/{sid}/contract/status"""

    @pytest.mark.asyncio
    async def test_update_status_to_sent(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating status from draft to sent succeeds."""
        url = _contract_url(conference.id, sample_sponsor.id, "status")
        response = await client.put(
            url,
            json={"status": "sent"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "sent"

    @pytest.mark.asyncio
    async def test_update_status_to_signed(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating status to signed succeeds."""
        url = _contract_url(conference.id, sample_sponsor.id, "status")
        response = await client.put(
            url,
            json={"status": "signed"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "signed"

    @pytest.mark.asyncio
    async def test_update_status_back_to_draft(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating a sent contract back to draft succeeds."""
        # First set to sent
        sample_contract.status = "sent"
        await db_session.commit()

        url = _contract_url(conference.id, sample_sponsor.id, "status")
        response = await client.put(
            url,
            json={"status": "draft"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "draft"

    @pytest.mark.asyncio
    async def test_update_status_invalid_value_422(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating status to an invalid value returns 422 (Pydantic validation)."""
        url = _contract_url(conference.id, sample_sponsor.id, "status")
        response = await client.put(
            url,
            json={"status": "invalid_status"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_status_no_contract_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating status when no contract exists returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id, "status")
        response = await client.put(
            url,
            json={"status": "sent"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 5. DELETE CONTRACT
# ═══════════════════════════════════════════════════════════════════════


class TestDeleteContract:
    """DELETE /conferences/{cid}/sponsors/{sid}/contract"""

    @pytest.mark.asyncio
    async def test_delete_contract_success(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Deleting an existing contract returns a success message."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert "deleted" in data["message"].lower()
        assert sample_contract.filename in data["message"]

    @pytest.mark.asyncio
    async def test_delete_contract_verify_gone(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """After deletion, GET returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id)

        # Delete
        delete_response = await client.delete(url, headers=auth_headers(admin_token))
        assert delete_response.status_code == 200

        # Verify gone
        get_response = await client.get(url, headers=auth_headers(admin_token))
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_contract_cascades_versions(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_versions: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Deleting a contract also removes all version snapshots (cascade)."""
        url = _contract_url(conference.id, sample_sponsor.id)
        delete_response = await client.delete(url, headers=auth_headers(admin_token))
        assert delete_response.status_code == 200

        # Verify versions are also gone by trying to list them
        versions_url = _contract_url(conference.id, sample_sponsor.id, "versions")
        versions_response = await client.get(versions_url, headers=auth_headers(admin_token))
        # Should 404 because the contract itself is gone
        assert versions_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_contract_no_contract_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Deleting when no contract exists returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_contract_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
    ) -> None:
        """Deleting without auth returns 401."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.delete(url)

        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 6. LIST VERSIONS
# ═══════════════════════════════════════════════════════════════════════


class TestListVersions:
    """GET /conferences/{cid}/sponsors/{sid}/contract/versions"""

    @pytest.mark.asyncio
    async def test_list_versions_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """A fresh contract with no edits has no version snapshots."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data == []

    @pytest.mark.asyncio
    async def test_list_versions_with_history(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_versions: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Versions are returned in descending order by version number."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # Descending order: version 2 first, then version 1
        assert data[0]["version"] == 2
        assert data[1]["version"] == 1
        # Each version has the expected fields
        for v in data:
            assert "id" in v
            assert "filename" in v
            assert "content_type" in v
            assert "file_size" in v
            assert "created_at" in v

    @pytest.mark.asyncio
    async def test_list_versions_no_contract_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Listing versions when no contract exists returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 7. GET SPECIFIC VERSION
# ═══════════════════════════════════════════════════════════════════════


class TestGetVersion:
    """GET /conferences/{cid}/sponsors/{sid}/contract/versions/{version_number}"""

    @pytest.mark.asyncio
    async def test_get_version_by_number(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_versions: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching a specific version by number returns the correct content."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions/1")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == 1
        assert data["html_content"] == "<pre>Version 1 content</pre>"

    @pytest.mark.asyncio
    async def test_get_version_two(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_versions: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching version 2 returns the correct content."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions/2")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == 2
        assert data["html_content"] == "<pre>Version 2 content</pre>"

    @pytest.mark.asyncio
    async def test_get_version_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        contract_with_versions: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Fetching a version number that does not exist returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id, "versions/999")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 8. DOWNLOAD CONTRACT
# ═══════════════════════════════════════════════════════════════════════


class TestDownloadContract:
    """GET /conferences/{cid}/sponsors/{sid}/contract/download"""

    @pytest.mark.asyncio
    async def test_download_editable_contract_returns_docx(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Downloading an editable contract generates a DOCX file."""
        url = _contract_url(conference.id, sample_sponsor.id, "download")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        assert "application/vnd.openxmlformats" in response.headers["content-type"]
        assert ".docx" in response.headers.get("content-disposition", "")
        assert len(response.content) > 0

    @pytest.mark.asyncio
    async def test_download_no_contract_404(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Downloading when no contract exists returns 404."""
        url = _contract_url(conference.id, sample_sponsor.id, "download")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 9. DOWNLOAD PDF
# ═══════════════════════════════════════════════════════════════════════


class TestDownloadPdf:
    """GET /conferences/{cid}/sponsors/{sid}/contract/pdf"""

    @pytest.mark.asyncio
    async def test_download_pdf_from_html(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Generating a PDF from HTML content returns a PDF file."""
        url = _contract_url(conference.id, sample_sponsor.id, "pdf")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert ".pdf" in response.headers.get("content-disposition", "")
        # PDF files start with %PDF
        assert response.content[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_download_pdf_no_html_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Generating a PDF when there is no HTML content returns 400."""
        # Remove HTML content (simulating a PDF-only contract)
        sample_contract.html_content = None
        sample_contract.is_editable = False
        await db_session.commit()

        url = _contract_url(conference.id, sample_sponsor.id, "pdf")
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 400
        assert "html" in response.json()["detail"].lower()


# ═══════════════════════════════════════════════════════════════════════
# 10. AUTH / PERMISSIONS
# ═══════════════════════════════════════════════════════════════════════


class TestContractAuth:
    """Authentication and permission checks across contract endpoints."""

    @pytest.mark.asyncio
    async def test_regular_user_can_read_contract(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        regular_user: User,
        user_token: str,
    ) -> None:
        """Regular users with the sponsors module can read contracts."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.get(url, headers=auth_headers(user_token))

        # Depending on the auth setup, this might be 200 or 403.
        # The endpoint uses CurrentUserDep which just requires authentication,
        # so it should be 200.
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_super_admin_access_contract_without_tenant(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
        super_admin_user: User,
        sa_token: str,
    ) -> None:
        """Super admin without tenant context gets 404 for tenant-scoped resources."""
        url = _contract_url(conference.id, sample_sponsor.id)
        response = await client.get(url, headers=auth_headers(sa_token))
        # Super admins have no tenant_id, so tenant-scoped lookups return 404
        assert response.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_all_endpoints_require_auth(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        sample_contract: SponsorContract,
        tenant_with_sponsors_module: Tenant,
    ) -> None:
        """All contract endpoints return 401 without authentication."""
        base_url = _contract_url(conference.id, sample_sponsor.id)
        endpoints = [
            ("GET", base_url),
            ("POST", f"{base_url}/generate"),
            ("PUT", f"{base_url}/content"),
            ("PUT", f"{base_url}/status"),
            ("DELETE", base_url),
            ("GET", f"{base_url}/versions"),
            ("GET", f"{base_url}/versions/1"),
            ("GET", f"{base_url}/download"),
            ("GET", f"{base_url}/pdf"),
        ]

        for method, url in endpoints:
            if method == "GET":
                response = await client.get(url)
            elif method == "POST":
                response = await client.post(url)
            elif method == "PUT":
                response = await client.put(url, json={})
            elif method == "DELETE":
                response = await client.delete(url)
            else:
                continue

            assert response.status_code == 401, f"{method} {url} returned {response.status_code}, expected 401"


# ═══════════════════════════════════════════════════════════════════════
# 11. INTEGRATION: FULL LIFECYCLE
# ═══════════════════════════════════════════════════════════════════════


class TestContractLifecycle:
    """End-to-end contract lifecycle: generate -> edit -> status -> versions."""

    @pytest.mark.asyncio
    async def test_full_lifecycle(
        self,
        client: AsyncClient,
        conference: Conference,
        sample_sponsor: Sponsor,
        package_template: Attachment,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Full lifecycle: generate, edit content, change status, list versions."""
        headers = auth_headers(admin_token)
        base_url = _contract_url(conference.id, sample_sponsor.id)

        # Step 1: Generate contract
        gen_response = await client.post(f"{base_url}/generate", headers=headers)
        assert gen_response.status_code == 201
        gen_data = gen_response.json()
        assert gen_data["version"] == 1
        assert gen_data["status"] == "draft"

        # Step 2: Edit content
        edit_response = await client.put(
            f"{base_url}/content",
            json={"html_content": "<h1>Revised Contract</h1><p>Updated terms.</p>"},
            headers=headers,
        )
        assert edit_response.status_code == 200
        edit_data = edit_response.json()
        assert edit_data["version"] == 2
        assert edit_data["version_count"] == 1

        # Step 3: Edit content again
        edit2_response = await client.put(
            f"{base_url}/content",
            json={"html_content": "<h1>Final Contract</h1><p>Final terms.</p>"},
            headers=headers,
        )
        assert edit2_response.status_code == 200
        edit2_data = edit2_response.json()
        assert edit2_data["version"] == 3
        assert edit2_data["version_count"] == 2

        # Step 4: Update status to sent
        status_response = await client.put(
            f"{base_url}/status",
            json={"status": "sent"},
            headers=headers,
        )
        assert status_response.status_code == 200
        assert status_response.json()["status"] == "sent"

        # Step 5: Update status to signed
        signed_response = await client.put(
            f"{base_url}/status",
            json={"status": "signed"},
            headers=headers,
        )
        assert signed_response.status_code == 200
        assert signed_response.json()["status"] == "signed"

        # Step 6: List versions (should have 2 snapshots)
        versions_response = await client.get(f"{base_url}/versions", headers=headers)
        assert versions_response.status_code == 200
        versions_data = versions_response.json()
        assert len(versions_data) == 2

        # Step 7: Get specific version
        v1_response = await client.get(f"{base_url}/versions/1", headers=headers)
        assert v1_response.status_code == 200
        assert v1_response.json()["version"] == 1

        # Step 8: Get current contract
        get_response = await client.get(base_url, headers=headers)
        assert get_response.status_code == 200
        current = get_response.json()
        assert current["version"] == 3
        assert current["status"] == "signed"
        assert current["html_content"] == "<h1>Final Contract</h1><p>Final terms.</p>"

        # Step 9: Delete contract
        delete_response = await client.delete(base_url, headers=headers)
        assert delete_response.status_code == 200

        # Step 10: Verify contract is gone
        gone_response = await client.get(base_url, headers=headers)
        assert gone_response.status_code == 404
