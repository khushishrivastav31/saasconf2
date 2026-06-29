"""In-app thread creation for speaker expense workflow events.

Creates MessageThread + Message + MessageParticipant rows so the bell
badge lights up for the right audience:

- send_submitted_thread  → admin bell (speaker submitted an expense)
- send_outcome_thread    → speaker bell (admin approved/rejected/paid)

All helpers are best-effort: the caller wraps in try/except so a DB
hiccup never rolls back the status transition that already committed.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from html import escape
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.messaging import THREAD_DOMAIN_CONFERENCE, Message, MessageParticipant, MessageThread

logger = logging.getLogger(__name__)


async def create_expense_submitted_thread(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    applicant_id: UUID,
    expense_title: str,
    expense_amount_str: str,
) -> None:
    """Create a thread that lights up the admin bell when a speaker submits.

    The speaker is added as an already-read participant (they just submitted).
    Every active ADMIN / SUPER_USER for the tenant is added as unread.
    """
    from app.models.user import User, UserRole
    from app.models.user_tenant_role import TenantRoleLevel, UserTenantRole

    # Include both global tenant admins (User.role) and users with an
    # explicit conference-admin UserTenantRole row. The two populations
    # overlap in practice but are not identical — use DISTINCT to avoid
    # duplicate participant rows.
    admin_result = await db.execute(
        select(User)
        .outerjoin(UserTenantRole, UserTenantRole.user_id == User.id)
        .where(
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            or_(
                User.role == UserRole.TENANT_ADMIN.value,
                UserTenantRole.level.in_([TenantRoleLevel.ADMIN, TenantRoleLevel.SUPER_USER]),
            ),
        )
        .distinct()
    )
    admins = admin_result.scalars().all()

    safe_title = escape(expense_title)
    safe_amount = escape(expense_amount_str)

    thread = MessageThread(
        tenant_id=tenant_id,
        conference_id=conference_id,
        domain=THREAD_DOMAIN_CONFERENCE,
        subject=f"Expense submitted: {expense_title}",
    )
    db.add(thread)
    await db.flush()

    db.add(
        Message(
            tenant_id=tenant_id,
            thread_id=thread.id,
            sender_type="applicant",
            sender_id=applicant_id,
            body_html=f"<p>I have submitted a new expense for review: <strong>{safe_title}</strong> ({safe_amount}).</p>",
        )
    )

    # Speaker is the submitter — mark as read immediately
    db.add(
        MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant_id,
            last_read_at=datetime.now(UTC),
        )
    )

    for admin in admins:
        db.add(
            MessageParticipant(
                tenant_id=tenant_id,
                thread_id=thread.id,
                participant_type="user",
                participant_id=admin.id,
                last_read_at=None,  # unread — lights up the bell
            )
        )

    await db.commit()


async def create_expense_outcome_thread(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    applicant_id: UUID,
    admin_user_id: UUID,
    subject: str,
    body_html: str,
) -> None:
    """Create a thread that lights up the speaker bell on approve/reject/paid.

    The speaker is added as unread; the acting admin is added as already-read.
    """
    thread = MessageThread(
        tenant_id=tenant_id,
        conference_id=conference_id,
        domain=THREAD_DOMAIN_CONFERENCE,
        subject=subject,
    )
    db.add(thread)
    await db.flush()

    db.add(
        Message(
            tenant_id=tenant_id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=admin_user_id,
            body_html=body_html,
        )
    )

    # Speaker participant — unread, lights up portal bell
    db.add(
        MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant_id,
            last_read_at=None,
        )
    )

    # Admin participant — already read
    db.add(
        MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=admin_user_id,
            last_read_at=datetime.now(UTC),
        )
    )

    await db.commit()
