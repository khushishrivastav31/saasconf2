"""Training-broadcast service (package).

Public API:
  - ``broadcast_to_registration_attendees`` — fan out to one registration's attendees.
  - ``broadcast_to_placement_attendees`` — fan out to every attendee on a placement.
  - ``substitute_training_variables`` — placeholder rendering used by both surfaces.
  - ``PARTICIPANT_TYPE_TRAINING_ATTENDEE`` — participant-type string for training threads.
  - ``send_direct_message_email`` — re-exported from ``app.core.email`` so tests
    can patch ``app.services.training_messaging.send_direct_message_email``
    without reaching into ``_core``.

Was a single ``training_messaging.py`` file before this PR. Split into a
package when the placement-level broadcast pushed the file past the
project's 400-LOC ceiling.
"""

from ._core import (
    PARTICIPANT_TYPE_TRAINING_ATTENDEE,
    send_direct_message_email,
    substitute_training_variables,
)
from .broadcasts import (
    broadcast_to_placement_attendees,
    broadcast_to_registration_attendees,
)

__all__ = [
    "PARTICIPANT_TYPE_TRAINING_ATTENDEE",
    "broadcast_to_placement_attendees",
    "broadcast_to_registration_attendees",
    "send_direct_message_email",
    "substitute_training_variables",
]
