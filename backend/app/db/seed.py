"""Database seeding script for initial data."""

import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import hash_password
from app.db.session import async_session_maker
from app.models.module import Module
from app.models.user import User, UserRole

settings = get_settings()


async def seed_super_admin(session: AsyncSession) -> None:
    """Create the initial super admin user if it doesn't exist."""
    result = await session.execute(
        select(User).where(User.email == settings.SUPER_ADMIN_EMAIL)
    )
    existing = result.scalar_one_or_none()

    if existing:
        print(f"Super admin already exists: {settings.SUPER_ADMIN_EMAIL}")
        return

    admin = User(
        tenant_id=None,  # Super admin has no tenant
        email=settings.SUPER_ADMIN_EMAIL,
        password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
        full_name="System Administrator",
        role=UserRole.SUPER_ADMIN.value,
        is_active=True,
    )
    session.add(admin)
    await session.commit()
    print(f"Created super admin: {settings.SUPER_ADMIN_EMAIL}")


async def seed_default_modules(session: AsyncSession) -> None:
    """Create default platform modules."""
    default_modules = [
        {
            "code": "conferences",
            "name": "Conference Management",
            "description": "Create and manage conferences, including basic settings and branding.",
        },
        {
            "code": "locations",
            "name": "Location Management",
            "description": "Manage venues, rooms, booths, and virtual locations for your conferences.",
        },
        {
            "code": "sponsors",
            "name": "Sponsor Management",
            "description": "Manage conference sponsors, tiers, and visibility.",
        },
        {
            "code": "cfp",
            "name": "Call for Papers",
            "description": "Manage call for papers, review submissions, and coordinate with speakers.",
        },
        {
            "code": "speakers",
            "name": "Speaker Management",
            "description": "Manage speakers, bios, and session assignments.",
        },
        {
            "code": "sessions",
            "name": "Session Management",
            "description": "Create and schedule conference sessions, tracks, and rooms.",
        },
        {
            "code": "attendees",
            "name": "Attendee Management",
            "description": "Register and manage conference attendees, tickets, and check-ins.",
        },
        {
            "code": "analytics",
            "name": "Analytics & Reports",
            "description": "View attendance analytics, engagement metrics, and generate reports.",
        },
        {
            "code": "volunteers",
            "name": "Volunteer Management",
            "description": "Recruit, manage, and coordinate conference volunteers, track hours and assignments.",
        },
        {
            "code": "service_providers",
            "name": "Service Provider Management",
            "description": "Manage external service providers, contractors, and vendors for your conferences.",
        },
    ]

    for module_data in default_modules:
        result = await session.execute(
            select(Module).where(Module.code == module_data["code"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"Module already exists: {module_data['code']}")
            continue

        module = Module(**module_data)
        session.add(module)
        print(f"Created module: {module_data['code']}")

    await session.commit()


async def seed_database() -> None:
    """Run all seed functions."""
    print("Starting database seeding...")

    async with async_session_maker() as session:
        await seed_super_admin(session)
        await seed_default_modules(session)

    print("Database seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed_database())
