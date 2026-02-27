"""Centralized domain constants for the SaaSConf platform."""

from typing import ClassVar


class ModuleCode:
    """Module codes used for access control and feature gating."""

    ANALYTICS = "analytics"
    ATTENDEES = "attendees"
    CFP = "cfp"
    CONFERENCES = "conferences"
    INVOICES = "invoices"
    LOCATIONS = "locations"
    NEWS = "news"
    PROGRAM = "program"
    REGISTRATION = "registration"
    SERVICE_PROVIDERS = "service_providers"
    SESSIONS = "sessions"
    SPEAKERS = "speakers"
    SPONSORS = "sponsors"
    VOLUNTEERS = "volunteers"


class ResourceType:
    """Resource types used in audit logging."""

    ATTACHMENT = "attachment"
    BOOKING_PACKAGE = "booking_package"
    CFP = "cfp"
    CONFERENCE = "conference"
    CONFERENCE_VAT_RATE = "conference_vat_rate"
    DISCOUNT_CODE = "discount_code"
    EMAIL_TEMPLATE = "email_template"
    FISCAL_REPRESENTATIVE = "fiscal_representative"
    INVOICE = "invoice"
    LOCATION = "location"
    MESSAGE_THREAD = "message_thread"
    MODULE = "module"
    PAPER = "paper"
    PLATFORM_CURRENCY = "platform_currency"
    PROGRAM_DAY = "program_day"
    PROGRAM_SESSION = "program_session"
    PROGRAM_TIME_SLOT = "program_time_slot"
    PROGRAM_TRACK = "program_track"
    REVIEW_QUESTION = "review_question"
    SCORE_SCALE = "score_scale"
    SCREEN_OVERLAY = "screen_overlay"
    SERVICE_PROVIDER = "service_provider"
    SPONSOR = "sponsor"
    SPONSOR_CONTRACT = "sponsor_contract"
    SUBMISSION = "submission"
    TENANT = "tenant"
    TENANT_MODULE = "tenant_module"
    USER = "user"
    USER_CONFERENCE_ACCESS = "user_conference_access"
    VOLUNTEER = "volunteer"
    SESSION_VOLUNTEER_TASK = "session_volunteer_task"
    VOLUNTEER_ASSIGNMENT = "volunteer_assignment"


class EntityType:
    """Entity types used for the polymorphic attachment system."""

    APPLICANT_PICTURE = "applicant_picture"
    APPLICANT_VIDEO = "applicant_video"
    COMMITTEE_MEMBER = "committee_member"
    CONFERENCE_LOGO = "conference_logo"
    INVOICE = "invoice"
    MESSAGE = "message"
    PAPER_VIDEO = "paper_video"
    SERVICE_PROVIDER = "service_provider"
    SCREEN_OVERLAY_IMAGE = "screen_overlay_image"
    SPONSOR = "sponsor"
    SPONSOR_PACKAGE_CONTRACT = "sponsor_package_contract"
    TENANT_LOGO = "tenant_logo"


class InvoiceStatus:
    """Invoice lifecycle statuses."""

    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

    ALL: ClassVar[set[str]] = {DRAFT, SENT, PAID, OVERDUE, CANCELLED}


class ContractStatus:
    """Sponsor contract lifecycle statuses."""

    DRAFT = "draft"
    SENT = "sent"
    SIGNED = "signed"

    ALL: ClassVar[set[str]] = {DRAFT, SENT, SIGNED}
