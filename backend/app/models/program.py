"""Program design models for conference schedule grid builder.

Models:
- ProgramDay: Conference days
- ProgramTimeSlot: Time slots per day
- ProgramTrack: Parallel session columns/rooms
- ProgramSession: Sessions placed in the grid
"""

import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, Time, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ProgramDay(Base):
    """
    Conference day for program design.

    Each conference can have multiple days, each with its own set of time slots.
    """

    __tablename__ = "program_days"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    time_slots: Mapped[list["ProgramTimeSlot"]] = relationship(
        "ProgramTimeSlot",
        back_populates="program_day",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProgramTimeSlot.sort_order",
    )

    __table_args__ = (
        Index("idx_program_days_conference", "tenant_id", "conference_id"),
        Index("uq_program_days_conference_date", "conference_id", "date", unique=True),
    )

    def __repr__(self) -> str:
        return f"<ProgramDay {self.date} ({self.name})>"


class ProgramTimeSlot(Base):
    """
    Time slot within a program day.

    Each day has multiple time slots (rows in the grid).
    """

    __tablename__ = "program_time_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    program_day_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_days.id", ondelete="CASCADE"),
        nullable=False,
    )
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Session-free slot (breaks, lunch, etc.) - normal sessions cannot be placed here
    is_session_free: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    program_day: Mapped["ProgramDay"] = relationship("ProgramDay", back_populates="time_slots")
    sessions: Mapped[list["ProgramSession"]] = relationship(
        "ProgramSession",
        back_populates="start_slot",
        foreign_keys="ProgramSession.start_slot_id",
    )

    __table_args__ = (
        Index("idx_program_slots_day", "program_day_id"),
        Index("uq_program_slots_day_start", "program_day_id", "start_time", unique=True),
    )

    def __repr__(self) -> str:
        return f"<ProgramTimeSlot {self.start_time}-{self.end_time}>"


class ProgramTrack(Base):
    """
    Track (column) for program design.

    Each day has its own set of tracks representing parallel session streams.
    """

    __tablename__ = "program_tracks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    program_day_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_days.id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    program_day: Mapped["ProgramDay | None"] = relationship(
        "ProgramDay",
        foreign_keys=[program_day_id],
    )
    sessions: Mapped[list["ProgramSession"]] = relationship(
        "ProgramSession",
        back_populates="start_track",
        foreign_keys="ProgramSession.start_track_id",
    )

    __table_args__ = (
        Index("idx_program_tracks_conference", "tenant_id", "conference_id"),
        Index("idx_program_tracks_day", "program_day_id"),
    )

    def __repr__(self) -> str:
        return f"<ProgramTrack {self.name}>"


class ProgramSession(Base):
    """
    Session placed in the program grid.

    A session occupies a cell (or multiple cells) in the grid,
    defined by start_slot_id (row) and start_track_id (column).
    Sessions can span multiple slots (vertically) and tracks (horizontally).
    """

    __tablename__ = "program_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Grid placement
    start_slot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_time_slots.id", ondelete="RESTRICT"),
        nullable=False,
    )
    start_track_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_tracks.id", ondelete="SET NULL"),
        nullable=True,  # NULL = general event spanning all tracks
    )

    # Span configuration
    slot_span: Mapped[int] = mapped_column(Integer, default=1)  # Vertical span (rows)
    track_span: Mapped[int] = mapped_column(Integer, default=1)  # Horizontal span (0 = all tracks)

    # Session details
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_types.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Separately bookable (inherited from session type)
    separately_bookable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # General events (breaks, lunch, etc.) - span all tracks
    is_general_event: Mapped[bool] = mapped_column(Boolean, default=False)

    # Allow placing in session-free time slots (override protection)
    allow_in_session_free: Mapped[bool] = mapped_column(Boolean, default=False)

    # Visual
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # Future: link to accepted paper
    paper_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cfp_papers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Metadata
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    start_slot: Mapped["ProgramTimeSlot"] = relationship(
        "ProgramTimeSlot",
        back_populates="sessions",
        foreign_keys=[start_slot_id],
    )
    start_track: Mapped["ProgramTrack | None"] = relationship(
        "ProgramTrack",
        back_populates="sessions",
        foreign_keys=[start_track_id],
    )

    __table_args__ = (
        Index("idx_program_sessions_conference", "conference_id"),
        Index("idx_program_sessions_slot", "start_slot_id"),
    )

    def __repr__(self) -> str:
        return f"<ProgramSession {self.title}>"
