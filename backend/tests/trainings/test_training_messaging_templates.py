"""Admin training-broadcast template CRUD.

Templates live on the existing tenant-scoped ``MessageTemplate`` model.
PR 4a exposes them via ``/trainings/messaging/templates`` so the
``TrainingBroadcastDialog`` can pick / save / edit a template without
faking a conference context.

What this file pins:
  - List, create, update, delete happy paths.
  - Tenant uniqueness on ``name`` (DB constraint surfaces as 400).
  - Tenant isolation: templates from another tenant don't appear in mine.
  - Auth: non-admin gets 403, missing-tenant token gets 403.
  - Templates created via the conference-side endpoint show up here too
    (shared pool — the existing model already had this property; this is
    a regression pin).
"""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.messaging import TEMPLATE_CATEGORY_CONFERENCE, TEMPLATE_CATEGORY_TRAINING, MessageTemplate
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers
from tests.trainings.conftest import training_admin_token

TEMPLATES_BASE = "/api/v1/trainings/messaging/templates"


class TestList:
    async def test_lists_only_training_category_for_my_tenant(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_other_tenant: Tenant,
        training_admin: User,
    ) -> None:
        # My training-category templates — these should appear.
        db_session.add_all(
            [
                MessageTemplate(
                    tenant_id=training_tenant.id,
                    name="Welcome",
                    subject="Welcome to the training",
                    body_html="<p>Hi [First Name]</p>",
                    category=TEMPLATE_CATEGORY_TRAINING,
                ),
                MessageTemplate(
                    tenant_id=training_tenant.id,
                    name="Reminder",
                    subject="Reminder for [Training Name]",
                    body_html="<p>Reminder body</p>",
                    category=TEMPLATE_CATEGORY_TRAINING,
                ),
            ]
        )
        # Conference-category template on the SAME tenant — must NOT appear,
        # this is the bug PR 215 was specifically meant to fix.
        db_session.add(
            MessageTemplate(
                tenant_id=training_tenant.id,
                name="Working Group",
                subject="conf subject",
                body_html="<p>conf body</p>",
                category=TEMPLATE_CATEGORY_CONFERENCE,
            )
        )
        # Another tenant — must NOT appear regardless of category.
        db_session.add(
            MessageTemplate(
                tenant_id=training_other_tenant.id,
                name="Other tenant template",
                subject="x",
                body_html="<p>x</p>",
                category=TEMPLATE_CATEGORY_TRAINING,
            )
        )
        await db_session.commit()

        resp = await client.get(TEMPLATES_BASE, headers=auth_headers(training_admin_token(training_admin)))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 2
        names = sorted(item["name"] for item in body["items"])
        assert names == ["Reminder", "Welcome"]

    async def test_non_admin_returns_403(
        self,
        client: AsyncClient,
        training_non_admin: User,
        training_tenant: Tenant,
    ) -> None:
        resp = await client.get(TEMPLATES_BASE, headers=auth_headers(training_admin_token(training_non_admin)))
        assert resp.status_code == 403, resp.text


class TestCreate:
    async def test_creates_template_then_appears_in_list(
        self,
        client: AsyncClient,
        training_admin: User,
    ) -> None:
        resp = await client.post(
            TEMPLATES_BASE,
            json={
                "name": "Reminder for [Training Name]",
                "subject": "Reminder",
                "body_html": "<p>Hi [First Name]</p>",
            },
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["name"] == "Reminder for [Training Name]"
        assert body["subject"] == "Reminder"

        listed = await client.get(TEMPLATES_BASE, headers=auth_headers(training_admin_token(training_admin)))
        assert listed.json()["total"] == 1

    async def test_duplicate_name_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        db_session.add(
            MessageTemplate(
                tenant_id=training_tenant.id,
                name="Reminder",
                subject="x",
                body_html="<p>x</p>",
                category=TEMPLATE_CATEGORY_TRAINING,
            )
        )
        await db_session.commit()

        resp = await client.post(
            TEMPLATES_BASE,
            json={
                "name": "Reminder",
                "subject": "Different subject",
                "body_html": "<p>Different body</p>",
            },
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 400, resp.text
        assert "already exists" in resp.text

    async def test_create_writes_training_category(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_admin: User,
    ) -> None:
        """The training endpoint must always stamp ``category='training'`` —
        otherwise the new row would default to conference and disappear from
        its own list view."""
        resp = await client.post(
            TEMPLATES_BASE,
            json={
                "name": "Day-of instructions",
                "subject": "Day of [Training Name]",
                "body_html": "<p>Body</p>",
            },
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 201, resp.text
        # Round-trip: GET it back; if category=conference it'd be filtered out.
        listed = await client.get(TEMPLATES_BASE, headers=auth_headers(training_admin_token(training_admin)))
        assert listed.json()["total"] == 1
        # And the row in the DB has the right category.
        row = (
            await db_session.execute(select(MessageTemplate).where(MessageTemplate.name == "Day-of instructions"))
        ).scalar_one()
        assert row.category == TEMPLATE_CATEGORY_TRAINING


class TestUpdate:
    async def test_updates_subject_and_body(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        t = MessageTemplate(
            tenant_id=training_tenant.id,
            name="Reminder",
            subject="Old subject",
            body_html="<p>Old body</p>",
            category=TEMPLATE_CATEGORY_TRAINING,
        )
        db_session.add(t)
        await db_session.commit()
        await db_session.refresh(t)

        resp = await client.put(
            f"{TEMPLATES_BASE}/{t.id}",
            json={"subject": "New subject", "body_html": "<p>New body</p>"},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["subject"] == "New subject"
        assert body["body_html"] == "<p>New body</p>"
        # Name untouched.
        assert body["name"] == "Reminder"

    async def test_rename_to_existing_name_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        a = MessageTemplate(
            tenant_id=training_tenant.id,
            name="A",
            subject="x",
            body_html="<p>x</p>",
            category=TEMPLATE_CATEGORY_TRAINING,
        )
        b = MessageTemplate(
            tenant_id=training_tenant.id,
            name="B",
            subject="y",
            body_html="<p>y</p>",
            category=TEMPLATE_CATEGORY_TRAINING,
        )
        db_session.add_all([a, b])
        await db_session.commit()
        await db_session.refresh(a)

        resp = await client.put(
            f"{TEMPLATES_BASE}/{a.id}",
            json={"name": "B"},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 400, resp.text

    async def test_cannot_update_conference_category_template(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        """A conference-category row in the same tenant must be invisible to
        the training-side update endpoint — 404, not silent rewrite."""
        cf = MessageTemplate(
            tenant_id=training_tenant.id,
            name="Working Group",
            subject="conf",
            body_html="<p>conf</p>",
            category=TEMPLATE_CATEGORY_CONFERENCE,
        )
        db_session.add(cf)
        await db_session.commit()
        await db_session.refresh(cf)

        resp = await client.put(
            f"{TEMPLATES_BASE}/{cf.id}",
            json={"subject": "Hijacked"},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 404, resp.text

    async def test_other_tenant_template_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_other_tenant: Tenant,
        training_admin: User,
    ) -> None:
        # Template lives in another tenant; my admin token can't see it.
        t = MessageTemplate(
            tenant_id=training_other_tenant.id,
            name="Other",
            subject="x",
            body_html="<p>x</p>",
            category=TEMPLATE_CATEGORY_TRAINING,
        )
        db_session.add(t)
        await db_session.commit()
        await db_session.refresh(t)

        resp = await client.put(
            f"{TEMPLATES_BASE}/{t.id}",
            json={"subject": "Hostile edit"},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 404, resp.text


class TestDelete:
    async def test_deletes_template(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        t = MessageTemplate(
            tenant_id=training_tenant.id,
            name="To delete",
            subject="x",
            body_html="<p>x</p>",
            category=TEMPLATE_CATEGORY_TRAINING,
        )
        db_session.add(t)
        await db_session.commit()
        await db_session.refresh(t)

        resp = await client.delete(
            f"{TEMPLATES_BASE}/{t.id}",
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 204, resp.text

        # Row gone.
        gone = await db_session.execute(select(MessageTemplate).where(MessageTemplate.id == t.id))
        assert gone.scalar_one_or_none() is None

    async def test_cannot_delete_conference_category_template(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        """Same protection as update — a conference-category row in this
        tenant is opaque to the training-side delete endpoint."""
        cf = MessageTemplate(
            tenant_id=training_tenant.id,
            name="Working Group",
            subject="conf",
            body_html="<p>conf</p>",
            category=TEMPLATE_CATEGORY_CONFERENCE,
        )
        db_session.add(cf)
        await db_session.commit()
        await db_session.refresh(cf)

        resp = await client.delete(
            f"{TEMPLATES_BASE}/{cf.id}",
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 404, resp.text
        # Row is still there.
        still = await db_session.execute(select(MessageTemplate).where(MessageTemplate.id == cf.id))
        assert still.scalar_one_or_none() is not None
