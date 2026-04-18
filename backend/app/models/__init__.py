"""SQLAlchemy models."""

from app.models.alumni import Alumni, AlumniSource
from app.models.applicant_activity import ApplicantActivityLog, ApplicantActivityType
from app.models.applicant_token import ApplicantEmailVerification, ApplicantRefreshToken
from app.models.associations import ConferenceCFP, ConferenceLocation
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
from app.models.certification_body import CertificationBody
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
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.deadline import Deadline
from app.models.email_log import EmailLog
from app.models.exchange_rate import ExchangeRate
from app.models.fiscal_representative import FiscalRepresentative
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.holiday_config import CustomBlockedDay, TenantHolidayConfig
from app.models.inhouse_training import InhouseTraining
from app.models.invoice import Invoice
from app.models.invoice_event import InvoiceEvent
from app.models.location import Location
from app.models.messaging import (
    DynamicRecipientList,
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
from app.models.offer_attendee import OfferAttendee
from app.models.offer_document import OfferDocument, OfferDocumentVersion
from app.models.offer_placement import OfferPlacement
from app.models.offer_template import OfferTemplate
from app.models.paper_form_variant import PaperFormVariant, PaperFormVariantField
from app.models.payment_reminder import PaymentReminder
from app.models.platform_currency import PlatformCurrency
from app.models.portal_user import PortalRefreshToken, PortalUser  # noqa: F401
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
from app.models.syllabus import Syllabus
from app.models.tenant import Tenant
from app.models.token import RefreshToken
from app.models.trainer import Trainer, TrainerUnavailability
from app.models.training import Training, TrainingLanguage, TrainingTheme
from app.models.training_attendee import TrainingAttendee  # noqa: F401
from app.models.training_attendee_history import TrainingAttendeeHistory  # noqa: F401
from app.models.training_invoice import TrainingInvoice  # noqa: F401
from app.models.training_program import PlacementTrainer, ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
from app.models.user_password_reset import UserPasswordReset
from app.models.user_tenant_role import TenantRoleLevel, TenantRoleScope, UserTenantRole
from app.models.user_totp import UserTOTP
from app.models.volunteer_profile import VolunteerProfile
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
    "CertificationBody",
    "Conference",
    "ConferenceCFP",
    "ConferenceCurrency",
    "ConferenceLocation",
    "ConferencePaperFormSchema",
    "CospeakerInvitationStatus",
    "CustomBlockedDay",
    "Customer",
    "CustomerOffer",
    "Deadline",
    "DiscountCode",
    "DiscountCodeOption",
    "DynamicRecipientList",
    "EmailLog",
    "EmailTemplate",
    "ExchangeRate",
    "ExpenseCategory",
    "ExpenseTier",
    "FiscalRepresentative",
    "InhouseTraining",
    "Invoice",
    "InvoiceEvent",
    "Location",
    "Message",
    "MessageParticipant",
    "MessageTemplate",
    "MessageThread",
    "Module",
    "NewsArticle",
    "OfferAttendee",
    "OfferDocument",
    "OfferDocumentVersion",
    "OfferPlacement",
    "OfferTemplate",
    "PaperFormField",
    "PaperFormVariant",
    "PaperFormVariantField",
    "PaperLevel",
    "PaperReview",
    "PaperStatus",
    "PaymentReminder",
    "PlacementTrainer",
    "PlatformCurrency",
    "ProgramDay",
    "ProgramSession",
    "ProgramTimeSlot",
    "ProgramTrack",
    "ProgramYearTraining",
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
    "Syllabus",
    "Tenant",
    "TenantHolidayConfig",
    "TenantLocationType",
    "TenantModule",
    "TenantRoleLevel",
    "TenantRoleScope",
    "ThreadFlag",
    "Trainer",
    "TrainerUnavailability",
    "Training",
    "TrainingLanguage",
    "TrainingProgramYear",
    "TrainingRegistration",
    "TrainingRegistrationAttendee",
    "TrainingTheme",
    "User",
    "UserConferenceAccess",
    "UserPasswordReset",
    "UserTOTP",
    "UserTenantRole",
    "VolunteerAssignment",
    "VolunteerProfile",
    "VolunteerRole",
]
