"""Generic CRUD router factory for conference-scoped settings endpoints.

Eliminates boilerplate by generating standard list/create/update/delete
endpoints for any conference-scoped settings model that follows the
common pattern of:
    - tenant_id / conference_id scoping
    - uniqueness validation on a named field
    - audit logging on create/update/delete
"""

from collections.abc import Awaitable, Callable, Sequence
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog

from ._shared import _check_conference_admin, _resolve_conference

# Type alias for the Conference model returned by _resolve_conference
type Conference = Any


# ---------------------------------------------------------------------------
# Callback type aliases
# ---------------------------------------------------------------------------

# Called before delete; raise an exception to block deletion.
# Signature: (entity, conference, db) -> None
PreDeleteCheck = Callable[..., Awaitable[None]]

# Called after the entity has been deleted (but before commit).
# Signature: (entity, conference, db) -> None
PostDeleteHook = Callable[..., Awaitable[None]]

# Called after the entity has been updated and fields applied (but before commit).
# Signature: (entity, update_data, conference, db) -> None
PostUpdateHook = Callable[..., Awaitable[None]]

# Called to transform the create-schema data dict before constructing the model.
# Signature: (data_dict, conference, db) -> data_dict
PreCreateTransform = Callable[..., Awaitable[dict[str, Any]]]

# Custom response builder: (entity, conference, db) -> response_schema instance
ResponseBuilder = Callable[..., Awaitable[BaseModel]]


def _sentence_case(s: str) -> str:
    """Capitalise only the first letter: 'volunteer role' -> 'Volunteer role'."""
    return s[0].upper() + s[1:] if s else s


def _make_unique_phrase(unique_field: str, unique_field_label: str | None) -> str:
    """Build the natural-language phrase for uniqueness error messages.

    Examples:
        name  -> "named"
        slug  -> "with slug"
        code  -> "with code"
        title -> "titled"
    """
    label = unique_field_label or unique_field
    if label == "name":
        return "named"
    if label == "title":
        return "titled"
    return f"with {label}"


def create_crud_router(
    *,
    prefix: str,
    entity_name: str,
    model_class: type[DeclarativeBase],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    response_schema: type[BaseModel],
    list_response_schema: type[BaseModel],
    # Field used for uniqueness checks. None to skip uniqueness validation.
    unique_field: str | None = "name",
    # Label used in error messages for the unique field (e.g. "name", "slug", "code").
    unique_field_label: str | None = None,
    # Columns to order by in the list endpoint. Accepts attribute names on the model.
    # Each entry is either a string (ascending) or a tuple (attr_name, "desc").
    order_by: Sequence[str | tuple[str, str]] = ("name",),
    # Audit action prefix, e.g. "volunteer_role" -> "volunteer_role.create"
    audit_resource_type: str | None = None,
    # Optional field name on the model to use as a human-readable label in
    # audit log details and delete messages. Defaults to unique_field or "name".
    label_field: str | None = None,
    # Fields from the create schema to include in the audit "details" dict on create.
    # Defaults to [unique_field] if unique_field is set, else ["name"].
    audit_create_fields: list[str] | None = None,
    # Additional detail fields to include in audit "details" on create.
    extra_audit_create_fields: list[str] | None = None,
    # Optional hooks
    pre_delete_check: PreDeleteCheck | None = None,
    post_delete_hook: PostDeleteHook | None = None,
    post_update_hook: PostUpdateHook | None = None,
    pre_create_transform: PreCreateTransform | None = None,
    response_builder: ResponseBuilder | None = None,
    # Fields to exclude from model_dump when creating the model from schema
    create_exclude_fields: set[str] | None = None,
    # Fields to exclude from model_dump when updating the model from schema
    update_exclude_fields: set[str] | None = None,
    # The path parameter name for the entity ID in update/delete endpoints.
    # E.g. "role_id", "type_id". Derived from entity_name if not provided.
    id_param_name: str | None = None,
) -> APIRouter:
    """Create an APIRouter with standard CRUD endpoints for a conference-scoped settings entity."""

    router = APIRouter()

    # Derive defaults
    _resource_type = audit_resource_type or entity_name
    _label_field = label_field or unique_field or "name"
    _human_name = entity_name.replace("_", " ")
    _human_name_cap = _sentence_case(_human_name)
    _audit_create = audit_create_fields or ([unique_field] if unique_field else ["name"])
    if extra_audit_create_fields:
        _audit_create = _audit_create + extra_audit_create_fields
    _create_exclude = create_exclude_fields or set()
    _update_exclude = update_exclude_fields or set()

    # Build the uniqueness error phrase once
    _unique_phrase = _make_unique_phrase(unique_field, unique_field_label) if unique_field else ""

    # Build order_by clause helpers
    def _get_order_clauses() -> list:
        clauses = []
        for entry in order_by:
            if isinstance(entry, tuple):
                attr_name, direction = entry
                col = getattr(model_class, attr_name)
                clauses.append(col.desc() if direction == "desc" else col.asc())
            else:
                clauses.append(getattr(model_class, entry).asc())
        return clauses

    def _unique_error(field_value: Any) -> str:
        """Build the uniqueness error message."""
        return f"A {_human_name} {_unique_phrase} '{field_value}' already exists"

    # ------------------------------------------------------------------
    # LIST
    # ------------------------------------------------------------------
    @router.get(f"/{prefix}", response_model=list_response_schema)
    async def list_entities(
        conference_id: UUID,
        current_user: CurrentUserDep,
        db: DbSessionDep,
    ) -> Any:
        conference = await _resolve_conference(conference_id, current_user, db)

        query = (
            select(model_class)
            .where(
                model_class.conference_id == conference.id,
                model_class.tenant_id == conference.tenant_id,
            )
            .order_by(*_get_order_clauses())
        )
        result = await db.execute(query)
        entities = result.scalars().all()

        if response_builder:
            items = [await response_builder(e, conference, db) for e in entities]
        else:
            items = [response_schema.model_validate(e) for e in entities]

        return list_response_schema(items=items, total=len(items))

    list_entities.__doc__ = f"List all {_human_name}s for a conference."
    list_entities.__name__ = f"list_{entity_name}s"
    list_entities.__qualname__ = f"list_{entity_name}s"

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------
    @router.post(f"/{prefix}", response_model=response_schema)
    async def create_entity(
        conference_id: UUID,
        entity_data: create_schema,  # type: ignore[valid-type]
        current_user: CurrentUserDep,
        db: DbSessionDep,
        request: Request,
    ) -> Any:
        conference = await _resolve_conference(conference_id, current_user, db)
        await _check_conference_admin(conference_id, current_user, db)

        # Uniqueness check
        if unique_field:
            field_value = getattr(entity_data, unique_field)
            existing = await db.execute(
                select(model_class).where(
                    model_class.conference_id == conference.id,
                    model_class.tenant_id == conference.tenant_id,
                    getattr(model_class, unique_field) == field_value,
                )
            )
            if existing.scalar_one_or_none():
                raise ValidationError(_unique_error(field_value))

        data_dict = entity_data.model_dump(exclude=_create_exclude)

        if pre_create_transform:
            data_dict = await pre_create_transform(data_dict, conference, db)

        entity = model_class(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            **data_dict,
        )
        db.add(entity)

        audit_details: dict[str, Any] = {"conference_id": str(conference.id)}
        for f in _audit_create:
            val = getattr(entity_data, f, None)
            if val is not None:
                audit_details[f] = val if isinstance(val, str) else str(val)

        audit_log = AuditLog(
            tenant_id=conference.tenant_id,
            user_id=current_user.user_id,
            action=f"{_resource_type}.create",
            resource_type=_resource_type,
            resource_id=entity.id,
            details=audit_details,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)

        await db.commit()
        await db.refresh(entity)

        if response_builder:
            return await response_builder(entity, conference, db)
        return response_schema.model_validate(entity)

    create_entity.__doc__ = f"Create a new {_human_name} for a conference."
    create_entity.__name__ = f"create_{entity_name}"
    create_entity.__qualname__ = f"create_{entity_name}"

    # ------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------
    @router.put(f"/{prefix}/{{entity_id}}", response_model=response_schema)
    async def update_entity(
        conference_id: UUID,
        entity_id: UUID,
        entity_data: update_schema,  # type: ignore[valid-type]
        current_user: CurrentUserDep,
        db: DbSessionDep,
        request: Request,
    ) -> Any:
        conference = await _resolve_conference(conference_id, current_user, db)
        await _check_conference_admin(conference_id, current_user, db)

        result = await db.execute(
            select(model_class).where(
                model_class.id == entity_id,
                model_class.conference_id == conference.id,
            )
        )
        entity = result.scalar_one_or_none()
        if not entity:
            raise NotFoundError(f"{_human_name_cap} with ID '{entity_id}' not found")

        # Uniqueness check on update
        if unique_field:
            new_value = getattr(entity_data, unique_field, None)
            current_value = getattr(entity, unique_field)
            if new_value is not None and new_value != current_value:
                existing = await db.execute(
                    select(model_class).where(
                        model_class.conference_id == conference.id,
                        model_class.tenant_id == conference.tenant_id,
                        getattr(model_class, unique_field) == new_value,
                        model_class.id != entity_id,
                    )
                )
                if existing.scalar_one_or_none():
                    raise ValidationError(_unique_error(new_value))

        update_data = entity_data.model_dump(exclude_unset=True, exclude=_update_exclude)
        for field, value in update_data.items():
            setattr(entity, field, value)

        if post_update_hook:
            await post_update_hook(entity, update_data, conference, db)

        audit_log = AuditLog(
            tenant_id=conference.tenant_id,
            user_id=current_user.user_id,
            action=f"{_resource_type}.update",
            resource_type=_resource_type,
            resource_id=entity.id,
            details={"updated_fields": list(update_data.keys())},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)

        await db.commit()
        await db.refresh(entity)

        if response_builder:
            return await response_builder(entity, conference, db)
        return response_schema.model_validate(entity)

    update_entity.__doc__ = f"Update an existing {_human_name}."
    update_entity.__name__ = f"update_{entity_name}"
    update_entity.__qualname__ = f"update_{entity_name}"

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------
    @router.delete(f"/{prefix}/{{entity_id}}")
    async def delete_entity(
        conference_id: UUID,
        entity_id: UUID,
        current_user: CurrentUserDep,
        db: DbSessionDep,
        request: Request,
    ) -> dict:
        conference = await _resolve_conference(conference_id, current_user, db)
        await _check_conference_admin(conference_id, current_user, db)

        result = await db.execute(
            select(model_class).where(
                model_class.id == entity_id,
                model_class.conference_id == conference.id,
            )
        )
        entity = result.scalar_one_or_none()
        if not entity:
            raise NotFoundError(f"{_human_name_cap} with ID '{entity_id}' not found")

        entity_label = getattr(entity, _label_field)

        if pre_delete_check:
            await pre_delete_check(entity, conference, db)

        audit_details: dict[str, Any] = {_label_field: entity_label}
        audit_log = AuditLog(
            tenant_id=conference.tenant_id,
            user_id=current_user.user_id,
            action=f"{_resource_type}.delete",
            resource_type=_resource_type,
            resource_id=entity.id,
            details=audit_details,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)

        if post_delete_hook:
            await post_delete_hook(entity, conference, db)

        await db.delete(entity)
        await db.commit()

        return {"message": f"{_human_name_cap} '{entity_label}' deleted successfully"}

    delete_entity.__doc__ = f"Delete a {_human_name}."
    delete_entity.__name__ = f"delete_{entity_name}"
    delete_entity.__qualname__ = f"delete_{entity_name}"

    return router
