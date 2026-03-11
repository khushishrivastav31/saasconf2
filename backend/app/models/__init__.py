"""SQLAlchemy models."""

from app.models.alumni import Alumni, AlumniSource
from app.models.applicant_activity import ApplicantActivityLog, ApplicantActivityType
from app.models.applicant_token import ApplicantEmailVerification, ApplicantRefreshToken
from app.models.associations import ConferenceCFP, ConferenceLocation, ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.booking import (
    BookingOption,
    BookingPackage,
    BookingPackageOption,
    BookingPeriod,
    DiscountCode,
    DiscountCodeOption,
)
from app.models.budget import Budget, BudgetCategory, BudgetLineItem
from app.models.cfp import CallForPapers, CFPCommitteeMember, CFPTopic, Submission
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import (
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperComment,
    CFPPaperCospeaker,
    CospeakerInvitationStatus,
    PaperLevel,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.deadline import Deadline
from app.models.fiscal_representative import FiscalRepresentative
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.invoice import Invoice
from app.models.invoice_event import InvoiceEvent
from app.models.location import Location
from app.models.messaging import (
    Message,
    MessageParticipant,
    MessageTemplate,
    MessageThread,
    RecipientList,
    RecipientListMember,
    ThreadFlag,
)
from app.models.module import Module, TenantModule
from app.models.news import NewsArticle
from app.models.payment_reminder import PaymentReminder
from app.models.platform_currency import PlatformCurrency
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationItem,
    RegistrationItemType,
    RegistrationMode,
    RegistrationStatus,
)
from app.models.registration_question_answer import RegistrationQuestionAnswer
from app.models.review import (
    PaperReview,
    ReviewAnswer,
    ReviewCriterion,
    ReviewFormSettings,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewScoreScale,
)
from app.models.screen_overlay import ScreenOverlay
from app.models.service_provider import ServiceProvider
from app.models.settings import (
    CFPCommitteeRole,
    ConferenceCurrency,
    EmailTemplate,
    PronounOption,
    SessionType,
    SponsorPackage,
    TenantLocationType,
    VolunteerRole,
)
from app.models.speaker_expense import (
    ExpenseCategory,
    ExpenseTier,
    SpeakerExpense,
    SpeakerExpenseAllowance,
    SpeakerExpenseAllowanceDefault,
)
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract, SponsorContractVersion
from app.models.tenant import Tenant
from app.models.token import RefreshToken
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
from app.models.user_password_reset import UserPasswordReset
from app.models.volunteer import Volunteer
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment

__all__ = [
    "Alumni",
    "AlumniSource",
    "ApplicantActivityLog",
    "ApplicantActivityType",
    "ApplicantEmailVerification",
    "ApplicantRefreshToken",
    "Attachment",
    "AuditLog",
    "BillingProfile",
    "BookingOption",
    "BookingPackage",
    "BookingPackageOption",
    "BookingPeriod",
    "Budget",
    "BudgetCategory",
    "BudgetLineItem",
    "CFPApplicant",
    "CFPCommitteeMember",
    "CFPCommitteeRole",
    "CFPPaper",
    "CFPPaperAssignment",
    "CFPPaperComment",
    "CFPPaperCospeaker",
    "CFPTopic",
    "CallForPapers",
    "Conference",
    "ConferenceCFP",
    "ConferenceCurrency",
    "ConferenceLocation",
    "ConferencePaperFormSchema",
    "ConferenceVolunteer",
    "CospeakerInvitationStatus",
    "Deadline",
    "DiscountCode",
    "DiscountCodeOption",
    "EmailTemplate",
    "ExpenseCategory",
    "ExpenseTier",
    "FiscalRepresentative",
    "Invoice",
    "InvoiceEvent",
    "Location",
    "Message",
    "MessageParticipant",
    "MessageTemplate",
    "MessageThread",
    "Module",
    "NewsArticle",
    "PaperFormField",
    "PaperLevel",
    "PaperReview",
    "PaperStatus",
    "PaymentReminder",
    "PlatformCurrency",
    "ProgramDay",
    "ProgramSession",
    "ProgramTimeSlot",
    "ProgramTrack",
    "PronounOption",
    "RecipientList",
    "RecipientListMember",
    "RefreshToken",
    "Registration",
    "RegistrationItem",
    "RegistrationItemType",
    "RegistrationMode",
    "RegistrationQuestionAnswer",
    "RegistrationStatus",
    "ReviewAnswer",
    "ReviewCriterion",
    "ReviewFormSettings",
    "ReviewQuestion",
    "ReviewScaleOption",
    "ReviewScoreScale",
    "ScreenOverlay",
    "ServiceProvider",
    "SessionType",
    "SessionVolunteerTask",
    "SpeakerExpense",
    "SpeakerExpenseAllowance",
    "SpeakerExpenseAllowanceDefault",
    "Sponsor",
    "SponsorContract",
    "SponsorContractVersion",
    "SponsorPackage",
    "Submission",
    "Tenant",
    "TenantLocationType",
    "TenantModule",
    "ThreadFlag",
    "User",
    "UserConferenceAccess",
    "UserPasswordReset",
    "Volunteer",
    "VolunteerAssignment",
    "VolunteerRole",
]
