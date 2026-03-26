"""Program snapshot building and diff computation."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Any

from app.models.training_program import ProgramYearTraining


def build_snapshot(placements: list[ProgramYearTraining]) -> list[dict[str, Any]]:
    """Serialize current placements into a JSON-safe snapshot list."""
    result: list[dict[str, Any]] = []
    for p in placements:
        duration = p.training.duration if p.training and p.training.duration else 1
        trainer_ids: list[str] = []
        trainer_names: list[str] = []
        for ta in p.trainer_assignments or []:
            trainer_ids.append(str(ta.trainer_id))
            trainer_names.append(f"{ta.trainer.first_name} {ta.trainer.last_name}")

        result.append(
            {
                "placement_id": str(p.id),
                "training_id": str(p.training_id),
                "training_name": p.training.name if p.training else "",
                "training_slug": p.training.slug if p.training else None,
                "training_abbreviation": p.training.abbreviation if p.training else None,
                "training_color": p.training.color if p.training else None,
                "start_date": p.start_date.isoformat(),
                "duration": duration,
                "location_id": str(p.location_id) if p.location_id else None,
                "location_name": p.location.name if p.location else None,
                "location_code": p.location.code if p.location else None,
                "placement_type": p.placement_type or "open",
                "trainer_ids": trainer_ids,
                "trainer_names": trainer_names,
            }
        )
    return result


@dataclass
class PlacementChange:
    """A single placement that was added, removed, or modified."""

    change_type: str  # "added" | "removed" | "modified"
    placement_id: str
    training_name: str
    training_slug: str | None
    start_date: str
    duration: int
    location_name: str | None
    location_code: str | None
    # For modified: what changed
    changes: list[str] = field(default_factory=list)
    # Trainer info
    old_trainer_ids: list[str] = field(default_factory=list)
    new_trainer_ids: list[str] = field(default_factory=list)
    old_trainer_names: list[str] = field(default_factory=list)
    new_trainer_names: list[str] = field(default_factory=list)


@dataclass
class TrainerChange:
    """Changes affecting a specific trainer."""

    trainer_id: str
    trainer_name: str
    added_trainings: list[str] = field(default_factory=list)  # human-readable descriptions
    removed_trainings: list[str] = field(default_factory=list)
    modified_trainings: list[str] = field(default_factory=list)


@dataclass
class ProgramDiff:
    """The diff between two program snapshots."""

    placement_changes: list[PlacementChange] = field(default_factory=list)
    affected_trainer_ids: set[str] = field(default_factory=set)
    per_trainer_changes: dict[str, TrainerChange] = field(default_factory=dict)

    @property
    def has_changes(self) -> bool:
        return len(self.placement_changes) > 0


def _format_date_de(iso_date: str) -> str:
    """Format YYYY-MM-DD → DD.MM.YYYY."""
    parts = iso_date.split("-")
    if len(parts) == 3:
        return f"{parts[2]}.{parts[1]}.{parts[0]}"
    return iso_date


def _placement_label(entry: dict[str, Any]) -> str:
    """Human-readable label for a placement."""
    slug = entry.get("training_slug") or entry.get("training_abbreviation") or entry.get("training_name", "?")
    date_str = _format_date_de(entry.get("start_date", ""))
    loc = entry.get("location_code") or entry.get("location_name") or ""
    parts = [slug, date_str]
    if loc:
        parts.append(loc)
    return " — ".join(parts)


def _compute_end_date(start_date: str, duration: int) -> str:
    """Compute end date from start_date ISO string and duration."""
    d = datetime.date.fromisoformat(start_date)
    end = d + datetime.timedelta(days=max(duration, 1) - 1)
    return end.isoformat()


def compute_diff(old_snapshot: list[dict[str, Any]], new_snapshot: list[dict[str, Any]]) -> ProgramDiff:
    """Compute the diff between two snapshots."""
    diff = ProgramDiff()

    old_by_id = {e["placement_id"]: e for e in old_snapshot}
    new_by_id = {e["placement_id"]: e for e in new_snapshot}

    # All trainer names we encounter
    trainer_name_map: dict[str, str] = {}

    # Build trainer name map from both snapshots
    for entries in (old_snapshot, new_snapshot):
        for e in entries:
            for tid, tname in zip(e.get("trainer_ids", []), e.get("trainer_names", []), strict=False):
                trainer_name_map[tid] = tname

    def _ensure_trainer(tid: str) -> TrainerChange:
        if tid not in diff.per_trainer_changes:
            diff.per_trainer_changes[tid] = TrainerChange(
                trainer_id=tid,
                trainer_name=trainer_name_map.get(tid, "Unknown"),
            )
        return diff.per_trainer_changes[tid]

    # Removed placements (in old but not in new)
    for pid, old_entry in old_by_id.items():
        if pid not in new_by_id:
            change = PlacementChange(
                change_type="removed",
                placement_id=pid,
                training_name=old_entry.get("training_name", ""),
                training_slug=old_entry.get("training_slug"),
                start_date=old_entry.get("start_date", ""),
                duration=old_entry.get("duration", 1),
                location_name=old_entry.get("location_name"),
                location_code=old_entry.get("location_code"),
                old_trainer_ids=old_entry.get("trainer_ids", []),
                old_trainer_names=old_entry.get("trainer_names", []),
            )
            diff.placement_changes.append(change)
            label = _placement_label(old_entry)
            for tid in old_entry.get("trainer_ids", []):
                diff.affected_trainer_ids.add(tid)
                tc = _ensure_trainer(tid)
                tc.removed_trainings.append(label)

    # Added placements (in new but not in old)
    for pid, new_entry in new_by_id.items():
        if pid not in old_by_id:
            change = PlacementChange(
                change_type="added",
                placement_id=pid,
                training_name=new_entry.get("training_name", ""),
                training_slug=new_entry.get("training_slug"),
                start_date=new_entry.get("start_date", ""),
                duration=new_entry.get("duration", 1),
                location_name=new_entry.get("location_name"),
                location_code=new_entry.get("location_code"),
                new_trainer_ids=new_entry.get("trainer_ids", []),
                new_trainer_names=new_entry.get("trainer_names", []),
            )
            diff.placement_changes.append(change)
            label = _placement_label(new_entry)
            for tid in new_entry.get("trainer_ids", []):
                diff.affected_trainer_ids.add(tid)
                tc = _ensure_trainer(tid)
                tc.added_trainings.append(label)

    # Modified placements (in both)
    for pid in old_by_id:
        if pid not in new_by_id:
            continue
        old_e = old_by_id[pid]
        new_e = new_by_id[pid]

        changes: list[str] = []

        # Check date change
        if old_e.get("start_date") != new_e.get("start_date"):
            changes.append(
                f"Date: {_format_date_de(old_e.get('start_date', ''))} → {_format_date_de(new_e.get('start_date', ''))}"
            )

        # Check location change
        old_loc = old_e.get("location_name") or ""
        new_loc = new_e.get("location_name") or ""
        if old_loc != new_loc:
            changes.append(f"Location: {old_loc or '(none)'} → {new_loc or '(none)'}")

        # Check trainer changes
        old_tids = set(old_e.get("trainer_ids", []))
        new_tids = set(new_e.get("trainer_ids", []))
        added_tids = new_tids - old_tids
        removed_tids = old_tids - new_tids

        if added_tids or removed_tids:
            added_names = [trainer_name_map.get(t, "?") for t in added_tids]
            removed_names = [trainer_name_map.get(t, "?") for t in removed_tids]
            parts = []
            if added_names:
                parts.append(f"Added: {', '.join(added_names)}")
            if removed_names:
                parts.append(f"Removed: {', '.join(removed_names)}")
            changes.append(f"Trainers: {'; '.join(parts)}")

        if not changes:
            continue

        change = PlacementChange(
            change_type="modified",
            placement_id=pid,
            training_name=new_e.get("training_name", ""),
            training_slug=new_e.get("training_slug"),
            start_date=new_e.get("start_date", ""),
            duration=new_e.get("duration", 1),
            location_name=new_e.get("location_name"),
            location_code=new_e.get("location_code"),
            changes=changes,
            old_trainer_ids=list(old_tids),
            new_trainer_ids=list(new_tids),
            old_trainer_names=old_e.get("trainer_names", []),
            new_trainer_names=new_e.get("trainer_names", []),
        )
        diff.placement_changes.append(change)

        label = _placement_label(new_e)
        # Affected: trainers who were added or removed from this placement,
        # plus existing trainers if date/location changed
        date_or_loc_changed = any(c for c in changes if c.startswith(("Date:", "Location:")))
        if date_or_loc_changed:
            for tid in old_tids | new_tids:
                diff.affected_trainer_ids.add(tid)
                tc = _ensure_trainer(tid)
                tc.modified_trainings.append(label)
        for tid in added_tids:
            diff.affected_trainer_ids.add(tid)
            tc = _ensure_trainer(tid)
            tc.added_trainings.append(label)
        for tid in removed_tids:
            diff.affected_trainer_ids.add(tid)
            tc = _ensure_trainer(tid)
            tc.removed_trainings.append(label)

    return diff
