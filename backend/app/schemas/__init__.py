"""Pydantic schemas for request/response validation."""

from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    UserResponse,
)
from app.schemas.tenant import (
    TenantCreate,
    TenantUpdate,
    TenantResponse,
    TenantListResponse,
)
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserInDB,
)
from app.schemas.module import (
    ModuleCreate,
    ModuleUpdate,
    ModuleResponse,
    TenantModuleAssign,
    TenantModuleResponse,
)
from app.schemas.conference import (
    ConferenceCreate,
    ConferenceUpdate,
    ConferenceResponse,
    ConferenceListResponse,
    ConferenceStats,
    TeamMember,
    SocialLinks,
)

__all__ = [
    # Auth
    "LoginRequest",
    "TokenResponse",
    "RefreshRequest",
    "UserResponse",
    # Tenant
    "TenantCreate",
    "TenantUpdate",
    "TenantResponse",
    "TenantListResponse",
    # User
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    # Module
    "ModuleCreate",
    "ModuleUpdate",
    "ModuleResponse",
    "TenantModuleAssign",
    "TenantModuleResponse",
    # Conference
    "ConferenceCreate",
    "ConferenceUpdate",
    "ConferenceResponse",
    "ConferenceListResponse",
    "ConferenceStats",
    "TeamMember",
    "SocialLinks",
]
