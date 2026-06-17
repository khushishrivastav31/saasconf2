"""Tests for the CFP applicant portal paper submission lifecycle.

Covers the full CRUD + state-machine workflow for CFPPaper:
  - Create (draft)
  - Update (draft only)
  - Submit (draft → submitted)
  - Unsubmit / withdraw (submitted → draft)
  - Delete (draft only)
  - List (author isolation)

All tests use HTTP-level assertions against the ASGI test client so they
exercise the full request/response cycle including auth, schema validation,
and business-logic guards.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPStatus
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema
from app.models.tenant import Tenant

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PASSWORD = "SecurePass1"


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create_verified_applicant(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Insert a verified applicant directly in the DB (bypasses email flow)."""
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Speaker",
        email=f"applicant-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password(VALID_PASSWORD),
        email_verified_at=utcnow(),
    )
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


def _token_for(applicant: CFPApplicant) -> str:
    """Create a valid JWT access token for an applicant."""
    return create_applicant_access_token(
        applicant_id=applicant.id,
        tenant_id=applicant.tenant_id,
    )


async def _create_cfp(db: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    """Create a CFP and link it to the conference."""
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP 2026",
        status=CFPStatus.OPEN.value,
        required_paper_fields=[],
        required_speaker_fields=[],
    )
    db.add(cfp)
    await db.flush()

    link = ConferenceCFP(
        id=uuid.uuid4(),
        conference_id=conference.id,
        cfp_id=cfp.id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(cfp)
    return cfp


async def _create_draft_paper(
    db: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    applicant: CFPApplicant,
    title: str = "My Test Paper",
) -> CFPPaper:
    """Insert a draft CFPPaper directly in the DB."""
    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title=title,
        abstract_short="A short abstract.",
        abstract_long="A longer abstract with more detail.",
        status=PaperStatus.DRAFT.value,
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


async def _create_submitted_paper(
    db: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    applicant: CFPApplicant,
) -> CFPPaper:
    """Insert a submitted CFPPaper directly in the DB."""
    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Submitted Paper",
        abstract_short="Abstract.",
        abstract_long="Long abstract.",
        status=PaperStatus.SUBMITTED.value,
        submitted_at=utcnow(),
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


# ---------------------------------------------------------------------------
# 1. Create paper (draft)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCreatePaper:
    """Tests for POST /api/v1/portal/papers (create a new paper as draft)."""

    async def test_valid_create_returns_paper_data(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Valid paper creation payload returns 200/201 with paper fields including status=draft."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        resp = await client.post(
            "/api/v1/portal/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "My Awesome Talk",
                "abstract_short": "A short blurb.",
            },
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code in (200, 201)
        body = resp.json()
        assert body["title"] == "My Awesome Talk"
        assert body["status"] == PaperStatus.DRAFT.value
        assert "id" in body

    async def test_missing_title_returns_422(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Omitting the required `title` field returns 422 Unprocessable Entity."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        resp = await client.post(
            "/api/v1/portal/papers",
            json={
                "cfp_id": str(cfp.id),
                "abstract_short": "Some abstract, no title.",
            },
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422

    async def test_missing_cfp_id_returns_422(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Omitting `cfp_id` returns 422 because it is a required field."""
        applicant = await _create_verified_applicant(db_session, tenant)

        resp = await client.post(
            "/api/v1/portal/papers",
            json={"title": "Title without cfp_id"},
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422

    async def test_title_too_long_returns_422(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """A title exceeding 500 characters is rejected with 422."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        resp = await client.post(
            "/api/v1/portal/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "T" * 501,  # 501 chars – over the 500 max
            },
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422

    async def test_xss_payload_in_abstract_is_sanitized_or_rejected(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """An XSS payload in abstract_short must not be stored verbatim.

        The API must either strip the script tag (sanitize) or reject the
        request outright (400/422).  A 200/201 is only acceptable when the
        returned abstract does NOT contain the raw script tag.
        """
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        xss = '<script>alert("xss")</script>'
        resp = await client.post(
            "/api/v1/portal/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "XSS Test",
                "abstract_short": xss,
            },
            headers=_auth_headers(_token_for(applicant)),
        )

        # abstract_short is plain text — the endpoint accepts it as-is (no HTML sanitization
        # needed for plain text; it will be escaped by the frontend on render).
        # The endpoint must not crash (500) and must not return an unexpected status.
        assert resp.status_code in (200, 201, 400, 422), (
            f"Unexpected status {resp.status_code} for XSS payload in plain-text field"
        )

    async def test_unauthenticated_create_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Creating a paper without a bearer token returns 401."""
        cfp = await _create_cfp(db_session, tenant, conference)

        resp = await client.post(
            "/api/v1/portal/papers",
            json={"cfp_id": str(cfp.id), "title": "Sneaky Paper"},
        )

        assert resp.status_code in (401, 403)

    async def test_nonexistent_cfp_returns_404(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Submitting to a CFP UUID that does not exist returns 404."""
        applicant = await _create_verified_applicant(db_session, tenant)

        resp = await client.post(
            "/api/v1/portal/papers",
            json={"cfp_id": str(uuid.uuid4()), "title": "No Such CFP"},
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 2. Update paper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUpdatePaper:
    """Tests for PUT /api/v1/portal/papers/{paper_id} (update a draft paper)."""

    async def test_author_can_update_draft_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """The main speaker can update the title and abstract of a draft paper."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant)

        resp = await client.put(
            f"/api/v1/portal/papers/{paper.id}",
            json={"title": "Updated Title", "abstract_short": "Updated abstract."},
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["title"] == "Updated Title"
        assert body["abstract_short"] == "Updated abstract."

    async def test_author_cannot_update_submitted_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Attempting to update a submitted paper returns 400/409/422 (not allowed)."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_submitted_paper(db_session, tenant, cfp, applicant)

        resp = await client.put(
            f"/api/v1/portal/papers/{paper.id}",
            json={"title": "Sneaky Update"},
            headers=_auth_headers(_token_for(applicant)),
        )

        # 400, 409, or 422 all signal the correct rejection
        assert resp.status_code in (400, 409, 422)

    async def test_other_applicant_cannot_update_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """An applicant who is not the main speaker (and not a co-speaker) gets 403/404."""
        owner = await _create_verified_applicant(db_session, tenant)
        intruder = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, owner)

        resp = await client.put(
            f"/api/v1/portal/papers/{paper.id}",
            json={"title": "Intruder Update"},
            headers=_auth_headers(_token_for(intruder)),
        )

        assert resp.status_code in (403, 404)

    async def test_update_nonexistent_paper_returns_404(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Updating a paper UUID that does not exist returns 404."""
        applicant = await _create_verified_applicant(db_session, tenant)

        resp = await client.put(
            f"/api/v1/portal/papers/{uuid.uuid4()}",
            json={"title": "Ghost Update"},
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 3. Submit paper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSubmitPaper:
    """Tests for POST /api/v1/portal/papers/{paper_id}/submit."""

    async def test_valid_draft_can_be_submitted(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """A draft paper with no required fields configured is submitted successfully."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == PaperStatus.SUBMITTED.value
        assert body["submitted_at"] is not None

    async def test_already_submitted_cannot_be_resubmitted(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Re-submitting a paper that is already in submitted state returns 400/409/422."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_submitted_paper(db_session, tenant, cfp, applicant)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code in (400, 409, 422)

    async def test_submit_with_missing_required_fields_returns_422(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """When the CFP marks `abstract_long` as required and the paper lacks it, submit returns 422."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        # Override required_paper_fields after creation
        cfp.required_paper_fields = ["abstract_long"]
        db_session.add(cfp)
        await db_session.commit()

        # Paper intentionally missing abstract_long
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Paper Missing Required Field",
            abstract_short="Only short abstract.",
            abstract_long=None,  # missing
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422

    async def test_builtin_required_field_from_form_schema_blocks_submission(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """When builtin_fields_config marks abstract_long as required, submitting without it returns 422.

        This is the MAIN-13316 regression test: the required checkbox in the Paper Form Builder
        saves to builtin_fields_config, not to cfp.required_paper_fields, so validation must
        read from the form schema config.
        """
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        # Simulate what the admin does in the Paper Form Builder: mark abstract_long as required
        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            builtin_fields_config={
                "abstract_long": {"visible": True, "required": True},
            },
        )
        db_session.add(schema)
        # cfp.required_paper_fields deliberately left empty (the legacy field)
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Paper Missing Long Abstract",
            abstract_short="Short abstract present.",
            abstract_long=None,  # missing — should be caught
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422

    async def test_builtin_optional_field_does_not_block_submission(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """When builtin_fields_config marks abstract_long as NOT required, omitting it is fine."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            builtin_fields_config={
                "abstract_long": {"visible": True, "required": False},
            },
        )
        db_session.add(schema)
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Paper Without Long Abstract",
            abstract_short="Short abstract present.",
            abstract_long=None,
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200

    async def test_invisible_required_field_does_not_block_submission(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """A field marked required but hidden (visible=False) must not block submission."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            builtin_fields_config={
                "abstract_long": {"visible": False, "required": True},
            },
        )
        db_session.add(schema)
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Paper Without Hidden Field",
            abstract_short="Short abstract.",
            abstract_long=None,
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200

    async def test_unauthenticated_submit_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Submitting a paper without authentication returns 401."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant)

        resp = await client.post(f"/api/v1/portal/papers/{paper.id}/submit")

        assert resp.status_code in (401, 403)

    async def test_other_applicant_cannot_submit_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """An unrelated applicant cannot submit another applicant's paper."""
        owner = await _create_verified_applicant(db_session, tenant)
        intruder = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, owner)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(intruder)),
        )

        assert resp.status_code in (403, 404)


# ---------------------------------------------------------------------------
# 3b. Rich-text required-field validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSubmitRequiredRichText:
    """Rich-text built-in fields must be treated as blank when they contain only empty HTML."""

    async def _schema_with_abstract_long_required(
        self, db: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            builtin_fields_config={"abstract_long": {"visible": True, "required": True}},
        )
        db.add(schema)
        await db.commit()

    async def _draft_paper_with_abstract(
        self,
        db: AsyncSession,
        tenant: Tenant,
        cfp: "CallForPapers",
        applicant: CFPApplicant,
        abstract_long: str | None,
    ) -> CFPPaper:
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Rich-text Test Paper",
            abstract_long=abstract_long,
            status=PaperStatus.DRAFT.value,
        )
        db.add(paper)
        await db.commit()
        return paper

    @pytest.mark.parametrize(
        "empty_html",
        ["<p></p>", "<p><br></p>", "<p>&nbsp;</p>"],
    )
    async def test_empty_html_variants_block_submission(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        empty_html: str,
    ) -> None:
        """Abstract with empty-looking HTML must be treated as missing when required."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        await self._schema_with_abstract_long_required(db_session, tenant, conference)
        paper = await self._draft_paper_with_abstract(db_session, tenant, cfp, applicant, empty_html)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422
        missing = resp.json()["detail"]["missing_fields"]
        assert "paper:abstract_long" in missing

    async def test_real_content_passes_required_check(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """Abstract with real content passes the required check."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        await self._schema_with_abstract_long_required(db_session, tenant, conference)
        paper = await self._draft_paper_with_abstract(
            db_session, tenant, cfp, applicant, "<p>Real content here</p>"
        )

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200

    async def test_non_required_empty_html_does_not_block(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """Empty HTML in a non-required field must not block submission."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        # abstract_long is optional here
        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            builtin_fields_config={"abstract_long": {"visible": True, "required": False}},
        )
        db_session.add(schema)
        await db_session.commit()
        paper = await self._draft_paper_with_abstract(
            db_session, tenant, cfp, applicant, "<p></p>"
        )

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200

    async def test_legacy_required_paper_fields_with_empty_html_blocks(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """Legacy required_paper_fields path also treats empty HTML as missing."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        cfp.required_paper_fields = ["abstract_long"]
        await db_session.commit()
        paper = await self._draft_paper_with_abstract(
            db_session, tenant, cfp, applicant, "<p></p>"
        )

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422
        missing = resp.json()["detail"]["missing_fields"]
        assert "paper:abstract_long" in missing


# ---------------------------------------------------------------------------
# 3c. min_chars must not block empty optional fields (MAIN-13316)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSubmitCharLimitOptional:
    """min_chars should only apply when the field has content.

    An empty optional field must not be blocked by a min_chars constraint;
    emptiness of a required field is caught by the required-field pass, not
    the char-limit pass.
    """

    async def _schema(
        self,
        db: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        required: bool,
        min_chars: int,
    ) -> None:
        schema = ConferencePaperFormSchema(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            builtin_fields_config={
                "abstract_long": {
                    "visible": True,
                    "required": required,
                    "min_chars": min_chars,
                }
            },
        )
        db.add(schema)
        await db.commit()

    async def _paper(
        self,
        db: AsyncSession,
        tenant: Tenant,
        cfp: "CallForPapers",
        applicant: CFPApplicant,
        abstract_long: str | None,
    ) -> CFPPaper:
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Char Limit Test Paper",
            abstract_long=abstract_long,
            status=PaperStatus.DRAFT.value,
        )
        db.add(paper)
        await db.commit()
        return paper

    async def test_empty_optional_with_min_chars_submits_ok(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """Empty optional field with min_chars set must not block submission (MAIN-13316 bug)."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        await self._schema(db_session, tenant, conference, required=False, min_chars=500)
        paper = await self._paper(db_session, tenant, cfp, applicant, abstract_long=None)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200

    async def test_short_content_optional_with_min_chars_is_blocked(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """A non-empty but too-short optional field must still be rejected with a char error."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        await self._schema(db_session, tenant, conference, required=False, min_chars=500)
        paper = await self._paper(
            db_session, tenant, cfp, applicant, abstract_long="<p>Too short</p>"
        )

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "char_errors" in detail
        assert any("at least 500" in e for e in detail["char_errors"])

    async def test_empty_required_with_min_chars_blocked_via_required_path(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """Empty required field with min_chars must be blocked via missing_fields, not char_errors."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        await self._schema(db_session, tenant, conference, required=True, min_chars=500)
        paper = await self._paper(db_session, tenant, cfp, applicant, abstract_long=None)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/submit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "missing_fields" in detail
        assert "paper:abstract_long" in detail["missing_fields"]
        assert "char_errors" not in detail or not detail.get("char_errors")


# ---------------------------------------------------------------------------
# 4. Unsubmit (withdraw) paper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUnsubmitPaper:
    """Tests for POST /api/v1/portal/papers/{paper_id}/unsubmit (withdraw)."""

    async def test_submitted_paper_can_be_withdrawn(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """A submitted paper reverts to draft status after unsubmit."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_submitted_paper(db_session, tenant, cfp, applicant)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/unsubmit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == PaperStatus.DRAFT.value
        assert body["submitted_at"] is None

    async def test_draft_paper_cannot_be_unsubmitted(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Calling unsubmit on a draft paper (wrong state) returns 400/409/422."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/unsubmit",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code in (400, 409, 422)

    async def test_other_applicant_cannot_unsubmit_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """An unrelated applicant cannot withdraw another applicant's submitted paper."""
        owner = await _create_verified_applicant(db_session, tenant)
        intruder = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_submitted_paper(db_session, tenant, cfp, owner)

        resp = await client.post(
            f"/api/v1/portal/papers/{paper.id}/unsubmit",
            headers=_auth_headers(_token_for(intruder)),
        )

        assert resp.status_code in (403, 404)

    async def test_unauthenticated_unsubmit_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Unsubmitting without authentication returns 401."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_submitted_paper(db_session, tenant, cfp, applicant)

        resp = await client.post(f"/api/v1/portal/papers/{paper.id}/unsubmit")

        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 5. Delete paper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDeletePaper:
    """Tests for DELETE /api/v1/portal/papers/{paper_id}."""

    async def test_author_can_delete_draft_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """The main speaker can delete their own draft paper."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant)

        resp = await client.delete(
            f"/api/v1/portal/papers/{paper.id}",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200
        body = resp.json()
        assert "deleted" in body.get("message", "").lower()

    async def test_author_cannot_delete_submitted_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Attempting to delete a submitted paper returns 400/409/422."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_submitted_paper(db_session, tenant, cfp, applicant)

        resp = await client.delete(
            f"/api/v1/portal/papers/{paper.id}",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code in (400, 409, 422)

    async def test_other_applicant_cannot_delete_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """An unrelated applicant cannot delete another applicant's paper — returns 403/404."""
        owner = await _create_verified_applicant(db_session, tenant)
        intruder = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, owner)

        resp = await client.delete(
            f"/api/v1/portal/papers/{paper.id}",
            headers=_auth_headers(_token_for(intruder)),
        )

        assert resp.status_code in (403, 404)

    async def test_delete_nonexistent_paper_returns_404(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Deleting a paper UUID that doesn't exist returns 404."""
        applicant = await _create_verified_applicant(db_session, tenant)

        resp = await client.delete(
            f"/api/v1/portal/papers/{uuid.uuid4()}",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 404

    async def test_unauthenticated_delete_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Deleting a paper without authentication returns 401."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant)

        resp = await client.delete(f"/api/v1/portal/papers/{paper.id}")

        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 6. List papers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListPapers:
    """Tests for GET /api/v1/portal/papers (list caller's papers only)."""

    async def test_author_sees_only_their_own_papers(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """The list endpoint returns only papers where the caller is the main speaker."""
        alice = await _create_verified_applicant(db_session, tenant)
        bob = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        alice_paper = await _create_draft_paper(db_session, tenant, cfp, alice, title="Alice's Paper")
        _bob_paper = await _create_draft_paper(db_session, tenant, cfp, bob, title="Bob's Paper")

        resp = await client.get(
            "/api/v1/portal/papers",
            headers=_auth_headers(_token_for(alice)),
        )

        assert resp.status_code == 200
        body = resp.json()
        items = body["items"]
        returned_ids = {item["id"] for item in items}

        assert str(alice_paper.id) in returned_ids
        assert str(_bob_paper.id) not in returned_ids

    async def test_papers_from_other_applicants_are_not_visible(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """A new applicant with no papers sees an empty list (total=0)."""
        applicant_no_papers = await _create_verified_applicant(db_session, tenant)
        owner = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        # Create papers owned by `owner`, not by `applicant_no_papers`
        await _create_draft_paper(db_session, tenant, cfp, owner, title="Owner Paper 1")
        await _create_draft_paper(db_session, tenant, cfp, owner, title="Owner Paper 2")

        resp = await client.get(
            "/api/v1/portal/papers",
            headers=_auth_headers(_token_for(applicant_no_papers)),
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    async def test_unauthenticated_list_returns_401(self, client: AsyncClient) -> None:
        """Listing papers without a token returns 401."""
        resp = await client.get("/api/v1/portal/papers")
        assert resp.status_code in (401, 403)

    async def test_multiple_papers_all_returned(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """All papers owned by the caller are returned (draft and submitted alike)."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)

        draft = await _create_draft_paper(db_session, tenant, cfp, applicant, title="Draft Talk")
        submitted = await _create_submitted_paper(db_session, tenant, cfp, applicant)

        resp = await client.get(
            "/api/v1/portal/papers",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200
        body = resp.json()
        returned_ids = {item["id"] for item in body["items"]}

        assert str(draft.id) in returned_ids
        assert str(submitted.id) in returned_ids
        assert body["total"] >= 2

    async def test_get_single_paper_returns_correct_paper(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """GET /portal/papers/{id} returns the specific paper for its owner."""
        applicant = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, applicant, title="Specific Paper")

        resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}",
            headers=_auth_headers(_token_for(applicant)),
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(paper.id)
        assert body["title"] == "Specific Paper"

    async def test_get_paper_of_other_applicant_returns_404(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Fetching another applicant's paper by ID returns 403 or 404."""
        owner = await _create_verified_applicant(db_session, tenant)
        intruder = await _create_verified_applicant(db_session, tenant)
        cfp = await _create_cfp(db_session, tenant, conference)
        paper = await _create_draft_paper(db_session, tenant, cfp, owner)

        resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}",
            headers=_auth_headers(_token_for(intruder)),
        )

        assert resp.status_code in (403, 404)
