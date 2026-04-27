"""Schemas for training broadcast messaging.

Mirrors the conference bulk-send shape: one MessageThread per recipient, all
sharing a ``bulk_id`` so the admin can see "the broadcast" as a group while
each recipient gets their own 1:1 reply thread.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TrainingBroadcastRequest(BaseModel):
    """Admin request to broadcast a message to all attendees of a training registration.

    The ``registration_id`` is supplied via the URL path; this body carries
    only the message content. A ``MessageTemplate.id`` may be supplied to
    pre-load subject + body server-side, but the client typically renders the
    template into the request fields client-side and sends raw text.
    """

    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    template_id: UUID | None = None
    screen_overlay_id: UUID | None = None


class TrainingBroadcastRecipient(BaseModel):
    """A single recipient resolved from a registration's attendees."""

    model_config = ConfigDict(from_attributes=True)

    attendee_id: UUID  # TrainingRegistrationAttendee.id (the per-seat row)
    email: str
    first_name: str
    last_name: str
    thread_id: UUID  # the 1:1 thread created for this recipient


class TrainingBroadcastResponse(BaseModel):
    """Result of a training broadcast send."""

    bulk_id: UUID
    registration_id: UUID
    sent_count: int
    skipped_count: int = 0  # recipients with no email or duplicates
    created_at: datetime
    recipients: list[TrainingBroadcastRecipient]


class PlacementBroadcastRequest(BaseModel):
    """Admin request to broadcast to attendees on a placement.

    Same body shape as ``TrainingBroadcastRequest``; the ``placement_id``
    is supplied via the URL path. The fan-out collects attendees from
    every registration on that placement, dedupes by lowercased email,
    and creates one ``MessageThread`` per surviving attendee anchored on
    that attendee's own registration.

    ``attendee_ids`` narrows the audience: omit (or send an empty list)
    to message every attendee on the placement; supply a list of
    ``TrainingRegistrationAttendee`` ids to message only those. Useful
    for the per-attendee message button on the registrations view —
    the FE sends a single id and gets a one-recipient broadcast.
    """

    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    template_id: UUID | None = None
    screen_overlay_id: UUID | None = None
    attendee_ids: list[UUID] | None = None


class PlacementBroadcastResponse(BaseModel):
    """Result of a placement-wide training broadcast.

    ``recipients`` includes every attendee that received a thread,
    regardless of which registration they were on. The thread anchor
    (``domain_entity_id``) on each created row points at the recipient's
    *own* registration, so the unified portal inbox still shows them
    grouped per registration.
    """

    bulk_id: UUID
    placement_id: UUID
    sent_count: int
    skipped_count: int = 0
    created_at: datetime
    recipients: list[TrainingBroadcastRecipient]


class AttendeesBroadcastRequest(BaseModel):
    """Admin request to broadcast to a list of attendees regardless of placement.

    Used by the "Search attendee" recipient mode in the Compose dialog —
    attendees may sit on different training sessions, but the admin
    sees a single send.
    """

    attendee_ids: list[UUID] = Field(..., min_length=1)
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    template_id: UUID | None = None
    screen_overlay_id: UUID | None = None


class AttendeesBroadcastResponse(BaseModel):
    """Result of a search-attendee broadcast.

    No single ``placement_id`` makes sense — the response just lists the
    recipients that actually received a thread.
    """

    bulk_id: UUID
    sent_count: int
    skipped_count: int = 0
    created_at: datetime
    recipients: list[TrainingBroadcastRecipient]
