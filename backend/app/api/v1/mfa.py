"""MFA (Multi-Factor Authentication) endpoints.

Setup, verification, and removal of TOTP-based MFA for admin users.
"""

import io

import qrcode  # type: ignore[import-untyped]
import qrcode.image.svg  # type: ignore[import-untyped]
from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.mfa import (
    decrypt_secret,
    encrypt_secret,
    generate_recovery_codes,
    generate_totp_secret,
    get_provisioning_uri,
    hash_recovery_codes,
    verify_totp_code,
)
from app.core.utils import utcnow
from app.models.audit import AuditAction, AuditLog
from app.models.user_totp import UserTOTP
from app.schemas.auth import (
    MFARecoveryCodesResponse,
    MFASetupResponse,
    MFAStatusResponse,
    MFAVerifySetupRequest,
)

router = APIRouter()


@router.get("/mfa/status", response_model=MFAStatusResponse)
async def mfa_status(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MFAStatusResponse:
    """Check whether MFA is enabled for the current user."""
    result = await db.execute(
        select(UserTOTP).where(UserTOTP.user_id == current_user.user_id, UserTOTP.is_verified.is_(True))
    )
    totp = result.scalar_one_or_none()
    return MFAStatusResponse(mfa_enabled=totp is not None)


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def mfa_setup(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MFASetupResponse:
    """Begin MFA setup — generates a TOTP secret and QR code.

    The secret is stored (encrypted) but not activated until the user
    confirms with a valid code via ``POST /auth/mfa/verify-setup``.
    """
    # Check if already set up
    result = await db.execute(select(UserTOTP).where(UserTOTP.user_id == current_user.user_id))
    existing = result.scalar_one_or_none()

    if existing and existing.is_verified:
        raise ValidationError("MFA is already enabled. Disable it first before re-enrolling.")

    # Generate new secret
    raw_secret = generate_totp_secret()
    uri = get_provisioning_uri(raw_secret, current_user.email)

    # Generate QR code as SVG
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    qr_svg = buf.getvalue().decode()

    # Store (or replace pending) record
    if existing:
        existing.encrypted_secret = encrypt_secret(raw_secret)
        existing.is_verified = False
        existing.recovery_codes = None
        existing.verified_at = None
    else:
        totp = UserTOTP(
            user_id=current_user.user_id,
            encrypted_secret=encrypt_secret(raw_secret),
            is_verified=False,
        )
        db.add(totp)

    await db.commit()

    return MFASetupResponse(
        secret=raw_secret,
        provisioning_uri=uri,
        qr_code_svg=qr_svg,
    )


@router.post("/mfa/verify-setup", response_model=MFARecoveryCodesResponse)
async def mfa_verify_setup(
    data: MFAVerifySetupRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> MFARecoveryCodesResponse:
    """Confirm MFA setup by providing a valid TOTP code from the authenticator app.

    Returns recovery codes that should be stored offline.
    """
    result = await db.execute(select(UserTOTP).where(UserTOTP.user_id == current_user.user_id))
    totp_record = result.scalar_one_or_none()

    if not totp_record:
        raise ValidationError("No MFA setup in progress. Call POST /auth/mfa/setup first.")

    if totp_record.is_verified:
        raise ValidationError("MFA is already verified and active.")

    raw_secret = decrypt_secret(totp_record.encrypted_secret)
    if not verify_totp_code(raw_secret, data.code):
        raise AuthenticationError("Invalid TOTP code. Please try again.")

    # Generate recovery codes
    codes = generate_recovery_codes()
    totp_record.recovery_codes = hash_recovery_codes(codes)
    totp_record.is_verified = True
    totp_record.verified_at = utcnow()

    # Audit
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.MFA_ENABLED,
            resource_type="user",
            resource_id=current_user.user_id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()

    return MFARecoveryCodesResponse(recovery_codes=codes)


@router.delete("/mfa/disable")
async def mfa_disable(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Disable MFA for the current user."""
    result = await db.execute(
        select(UserTOTP).where(UserTOTP.user_id == current_user.user_id, UserTOTP.is_verified.is_(True))
    )
    totp_record = result.scalar_one_or_none()

    if not totp_record:
        raise ValidationError("MFA is not enabled.")

    await db.delete(totp_record)

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.MFA_DISABLED,
            resource_type="user",
            resource_id=current_user.user_id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()

    return {"message": "MFA has been disabled"}
