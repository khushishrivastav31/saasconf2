"""SQLAlchemy models."""

from app.models.applicant_activity import ApplicantActivityLog, ApplicantActivityType
from app.models.applicant_token import ApplicantEmailVerification, ApplicantRefreshToken
from app.models.associations import ConferenceCFP, ConferenceLocation, ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.cfp import CallForPapers, CFPApplicant, Submission
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.platform_currency import PlatformCurrency
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.review import (
    PaperReview,
    ReviewAnswer,
    ReviewCriterion,
    ReviewFormSettings,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewScoreScale,
)
from app.models.service_provider import ServiceProvider
from app.models.settings import (
    BookingOption,
    BookingPeriod,
    DiscountCode,
    DiscountCodeOption,
    EmailTemplate,
    PronounOption,
    SessionType,
    TenantLocationType,
    VolunteerRole,
)
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant
from app.models.token import RefreshToken
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
from app.models.volunteer import Volunteer

__all__ = [
    "ApplicantActivityLog",
    "ApplicantActivityType",
    "ApplicantEmailVerification",
    "ApplicantRefreshToken",
    "Attachment",
    "AuditLog",
    "BookingOption",
    "BookingPeriod",
    "CFPApplicant",
    "CallForPapers",
    "Conference",
    "ConferenceCFP",
    "ConferenceLocation",
    "ConferencePaperFormSchema",
    "ConferenceVolunteer",
    "DiscountCode",
    "DiscountCodeOption",
    "EmailTemplate",
    "Invoice",
    "Location",
    "Message",
    "MessageParticipant",
    "MessageThread",
    "Module",
    "PaperFormField",
    "PaperReview",
    "PlatformCurrency",
    "ProgramDay",
    "ProgramSession",
    "ProgramTimeSlot",
    "ProgramTrack",
    "PronounOption",
    "RefreshToken",
    "ReviewAnswer",
    "ReviewCriterion",
    "ReviewFormSettings",
    "ReviewQuestion",
    "ReviewScaleOption",
    "ReviewScoreScale",
    "ServiceProvider",
    "SessionType",
    "Sponsor",
    "Submission",
    "Tenant",
    "TenantLocationType",
    "TenantModule",
    "User",
    "UserConferenceAccess",
    "Volunteer",
    "VolunteerRole",
]
