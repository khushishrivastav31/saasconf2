"""Dedup helpers for CFP paper decision notifications.

Both the immediate per-decision trigger (``papers.update_paper``) and the
batched program-publish flow (``program/publish.py``) write to the same
``CFPPaper.notification_sent_at`` column so a paper is only ever notified
once, whichever trigger fires first.
"""

from datetime import datetime

from app.models.cfp_papers import CFPPaper


def paper_already_notified(paper: CFPPaper) -> bool:
    """Whether this paper has already had a decision notification sent/queued."""
    return paper.notification_sent_at is not None


def mark_paper_notified(paper: CFPPaper, now: datetime) -> None:
    """Record that a decision notification has been sent/queued for this paper."""
    paper.notification_sent_at = now


def clear_paper_notification(paper: CFPPaper) -> None:
    """Reset the dedup marker so a *new* decision gets a fresh notification.

    A paper can flip accepted <-> rejected more than once (admin correction,
    program re-shuffling). ``notification_sent_at`` must only suppress a
    duplicate send for the *current* decision, not block a genuinely new one
    that supersedes an earlier notified decision — so every real status
    transition clears it before the new decision is (re-)evaluated.
    """
    paper.notification_sent_at = None
