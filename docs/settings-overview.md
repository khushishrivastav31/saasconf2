# Conference Settings - Complete Guide

Comprehensive guide to configuring and managing all conference settings in SaaSConf.

---

## Table of Contents

1. [Settings Overview](#settings-overview)
2. [Accessing Settings](#accessing-settings)
3. [Settings Categories](#settings-categories)
4. [People & Roles Settings](#people--roles-settings)
5. [Conference Setup Settings](#conference-setup-settings)
6. [CFP & Reviews Settings](#cfp--reviews-settings)
7. [Communication Settings](#communication-settings)
8. [Finance Settings](#finance-settings)
9. [General Conference Details](#general-conference-details)
10. [Booking & Registration Settings](#booking--registration-settings)
11. [Settings Configuration Checklist](#settings-configuration-checklist)
12. [Settings Templates by Conference Type](#settings-templates-by-conference-type)
13. [Settings Best Practices](#settings-best-practices)
14. [Common Configuration Mistakes](#common-configuration-mistakes)

---

## Settings Overview

The Settings section is the control center for your conference. It's organized into five main categories with 25+ individual settings areas, allowing you to configure everything from financial details to communication templates to program structure.

### What Settings Control

Settings determine:
- **Who**: People categories, roles, and pronouns
- **What**: Session types, location types, booking options
- **How Much**: Currencies, VAT rates, pricing matrices
- **How**: Email templates, messaging, payment methods
- **When**: Booking periods, deadlines (configured separately)

### Settings vs. Data

**Settings** define the *structure and rules* for your conference:
- Session types (e.g., "Keynote", "Workshop", "Tutorial")
- Booking options (e.g., "2-Day Pass", "Virtual Access")
- Email templates (e.g., "Registration Confirmation")

**Data** uses those settings to create *actual conference content*:
- Actual sessions (e.g., "Opening Keynote by Dr. Smith")
- Actual registrations (e.g., "John Doe with 2-Day Pass")
- Actual emails sent (e.g., confirmation to john@example.com)

**Rule**: Configure settings *before* creating data that depends on them.

---

## Accessing Settings

### Navigation Path

1. Navigate to your conference in the dashboard
2. Click the **Settings** tab in the conference navigation
3. Use the collapsible sidebar to browse settings categories

### Settings Sidebar

The settings sidebar is organized into 5 groups:
- **People & Roles** (3 settings)
- **Conference Setup** (3 settings)
- **CFP & Reviews** (3 settings)
- **Communication** (6 settings)
- **Finance** (7 settings)

**Tip**: Click the collapse button (`<<`) to minimize the sidebar for more content space.

### Permission Requirements

| Permission Level | Access |
|-----------------|--------|
| **Conference Admin** | All settings except restricted items |
| **Tenant Admin** | All settings including Stripe Setup and Invoice Numbering |
| **Super Admin** | All settings including system-level configurations |
| **Committee Member** | No settings access (read-only on some areas) |

**Restricted Settings** (Tenant Admin / Super Admin only):
- Invoice Numbering (Finance)
- Stripe Setup (Finance)

---

## Settings Categories

### Quick Reference Map

| Category | Settings Included | Purpose |
|----------|------------------|---------|
| **People & Roles** | Volunteer Tasks, Committee Roles, Pronoun Options | Define people categories and identity options |
| **Conference Setup** | Location Types, Session Types, Sponsor Packages | Structure program and sponsorship |
| **CFP & Reviews** | Paper Form, Score Scales, Review Criteria | Configure call for papers and review process |
| **Communication** | Email Settings, Email Templates, Messaging, Message Templates, Recipient Lists, Screen Overlays | Manage all conference communications |
| **Finance** | Currency & Tax, Numbering, Company Data, Bank Accounts, Invoice Templates, ZUGFeRD, Stripe Setup | Financial configuration and invoicing |

### Settings Not in Settings Tab

Some configurations are managed elsewhere:
- **Booking Options/Packages/Periods**: Booking tab (pricing configuration)
- **Discount Codes**: Booking tab (promotional pricing)
- **VAT Rates**: Finance > Currency & Tax (see VAT Settings section in handbook)
- **General Details**: Details tab (conference name, dates, country, timezone)
- **Conference Logo**: Details tab (branding)
- **Modules**: Controlled by tenant admins (enables/disables major features)

---

## People & Roles Settings

Define how people are categorized and identified throughout your conference.

### Volunteer Tasks

**Path**: Settings > People & Roles > Volunteer Tasks

**What It Is**: Task definitions that volunteers can be assigned to during the conference.

**Use Cases**:
- Registration desk coverage
- Session room assistance
- Speaker support
- Audio/visual setup
- Catering coordination

**Configuration**:
- **Name**: Task name (e.g., "Registration Desk", "Room Monitor")
- **Description**: Detailed task description
- **Color**: Hex color for visual identification in schedules
- **Active Status**: Enable/disable tasks

**Dependencies**:
- Requires **Volunteers module** to be enabled
- Used in: Volunteer Task Assignment, Volunteer Assignment, Volunteer Schedule

**Detailed Documentation**: See `.claude/docs/modules.md` > Volunteer Task System

---

### Committee Roles

**Path**: Settings > People & Roles > Committee Roles

**What It Is**: Roles for program committee members who review CFP submissions.

**Use Cases**:
- Program Chair
- Track Chair
- Reviewer
- External Reviewer
- Advisory Board

**Configuration**:
- **Name**: Role name (e.g., "Track Chair")
- **Description**: Role responsibilities
- **Active Status**: Enable/disable roles

**Dependencies**:
- Used in: CFP Committee management
- Affects: Review assignment, committee member permissions

**Best Practice**: Define roles before inviting committee members.

---

### Pronoun Options

**Path**: Settings > People & Roles > Pronoun Options

**What It Is**: Pronoun choices offered to attendees, speakers, and volunteers.

**Common Options**:
- he/him
- she/her
- they/them
- prefer not to say

**Configuration**:
- **Value**: Pronoun text (e.g., "they/them")
- **Active Status**: Enable/disable options

**Dependencies**:
- **CRITICAL**: Must be configured before registration opens
- Used in: Registration forms, Replace Attendee modal, CFP applications, volunteer registration
- Dropdown will be empty if not configured

**Best Practice**: Add at minimum 4 options including "prefer not to say" for inclusivity.

**Detailed Documentation**: See troubleshooting section in handbook for "No Pronouns Available" error.

---

## Conference Setup Settings

Structure your conference program and sponsorship offerings.

### Location Types

**Path**: Settings > Conference Setup > Location Types

**What It Is**: Categories of locations where sessions can take place.

**Use Cases**:
- Conference Room (with capacity numbers)
- Workshop Space
- Exhibit Hall
- Virtual Room
- Outdoor Space

**Configuration**:
- **Name**: Location type (e.g., "Main Hall")
- **Description**: Location details
- **Active Status**: Enable/disable types

**Dependencies**:
- Used in: Location management, session assignment
- Affects: Program grid layout, attendee navigation

**Best Practice**: Create location types that match your venue structure before building program.

---

### Session Types

**Path**: Settings > Conference Setup > Session Types

**What It Is**: Categories of program sessions with duration and properties.

**Use Cases**:
- Keynote (90 min)
- Regular Talk (30 min)
- Tutorial (4 hours)
- Panel (60 min)
- Lightning Talk (10 min)

**Configuration**:
- **Name**: Session type name
- **Duration**: Default length in minutes
- **Color**: Hex color for visual identification
- **Is Tutorial**: Boolean flag for tutorial sessions
- **Active Status**: Enable/disable types

**Special Properties**:
- **Is Tutorial**: Affects booking behavior (attendees can only book one tutorial)
- **Duration**: Used for automatic program grid layout

**Dependencies**:
- Used in: Session creation, program design, registration session selection
- Affects: Booking logic, program grid

**Best Practice**: Define all session types before creating actual sessions.

---

### Sponsor Packages

**Path**: Settings > Conference Setup > Sponsor Packages

**What It Is**: Sponsorship tiers with associated benefits and pricing.

**Use Cases**:
- Platinum Sponsor (€10,000)
- Gold Sponsor (€5,000)
- Silver Sponsor (€2,500)
- Bronze Sponsor (€1,000)
- Community Sponsor (€500)

**Configuration**:
- **Name**: Package name (e.g., "Gold Sponsor")
- **Price**: Package cost
- **Currency**: Currency code (EUR, USD, etc.)
- **Benefits**: Rich-text description of benefits
- **Display Order**: Sort order for public display
- **Active Status**: Enable/disable packages

**Dependencies**:
- Used in: Sponsor management, sponsor contracts
- Affects: Invoice creation for sponsors, public sponsor listings

**Best Practice**: Include detailed benefits in description for transparency.

---

## CFP & Reviews Settings

Configure your call for papers and review process.

### Paper Form Builder

**Path**: Settings > CFP & Reviews > Paper Form

**What It Is**: Custom form builder for CFP submission forms.

**Use Cases**:
- Add custom fields to CFP submissions
- Require additional metadata
- Collect speaker bio, abstract, keywords
- Request travel support information

**Configuration**:
- **Field Types**: Text, textarea, select, checkbox, radio
- **Validation**: Required fields, character limits
- **Order**: Drag-and-drop field ordering

**Dependencies**:
- Used in: CFP portal submission form
- Affects: Submission data structure, review information

**Detailed Documentation**: See `.claude/docs/modules.md` for form schema details.

---

### Score Scales

**Path**: Settings > CFP & Reviews > Score Scales

**What It Is**: Rating scales used by reviewers to score submissions.

**Use Cases**:
- 1-5 scale
- 1-10 scale
- Accept/Maybe/Reject scale
- Strong Accept/Accept/Borderline/Reject/Strong Reject

**Configuration**:
- **Name**: Scale name (e.g., "5-Point Scale")
- **Min Value**: Lowest score
- **Max Value**: Highest score
- **Active Status**: Enable/disable scales

**Dependencies**:
- Used in: Review criteria configuration
- Affects: Review score calculations, acceptance decisions

**Best Practice**: Use consistent scales across all review criteria for easier comparison.

---

### Review Criteria

**Path**: Settings > CFP & Reviews > Review Criteria

**What It Is**: Specific aspects reviewers evaluate in submissions.

**Use Cases**:
- Relevance to conference
- Technical quality
- Originality
- Presentation clarity
- Impact potential

**Configuration**:
- **Name**: Criterion name (e.g., "Technical Quality")
- **Description**: What reviewers should evaluate
- **Score Scale**: Linked score scale
- **Weight**: Relative importance (for weighted scoring)
- **Active Status**: Enable/disable criteria

**Dependencies**:
- Requires: Score scales to be defined first
- Used in: Review forms, score aggregation
- Affects: Acceptance decisions, ranking

**Best Practice**: Provide clear descriptions so reviewers score consistently.

**Detailed Documentation**: See `.claude/docs/modules.md` for review configuration details.

---

## Communication Settings

Manage all conference communication channels and templates.

### Email Settings

**Path**: Settings > Communication > Email Settings

**What It Is**: SMTP server configuration for sending conference emails.

**Configuration**:
- **SMTP Host**: Mail server hostname (e.g., smtp.gmail.com)
- **SMTP Port**: Port number (465 for SSL, 587 for TLS)
- **Username**: SMTP authentication username
- **Password**: SMTP authentication password (encrypted)
- **From Email**: Sender email address
- **From Name**: Sender display name
- **Use SSL/TLS**: Encryption settings

**Dependencies**:
- **CRITICAL**: Must be configured for ANY email functionality
- Affects: All automated emails (registration, invoices, CFP, messaging)

**Security Note**: Passwords are encrypted at rest. Use app-specific passwords for Gmail.

**Best Practice**: Test email settings before conference launch using a test recipient.

---

### Email Templates

**Path**: Settings > Communication > Email Templates

**What It Is**: Customizable HTML email templates for automated communications.

**Available Templates**:
- **Registration**: Confirmation, cancellation, replacement
- **Invoices**: Send invoice, credit note, payment confirmation
- **CFP**: Submission confirmation, acceptance, rejection
- **Volunteers**: Assignment confirmation, schedule updates
- **Sponsor Contracts**: Contract send, signature reminder
- **Deadlines**: 7-day reminder, 1-day reminder, due reminder

**Template Features**:
- **Rich-text editor**: WYSIWYG HTML editing
- **Variable placeholders**: Dynamic content insertion
- **Preview mode**: See rendered output before saving
- **Default templates**: System-provided starting points

**Common Placeholders**:
- `[Recipient Name]`: Recipient's full name
- `[Conference Name]`: Conference title
- `[Invoice Number]`: Invoice reference
- `[Payment Link]`: Stripe payment URL (credit card invoices)
- `[Custom Message]`: Admin-provided custom text

**Dependencies**:
- Requires: Email Settings configured
- Used in: All automated email sending
- Affects: Professional appearance, attendee experience

**Best Practice**: Customize templates with conference branding before launch.

**Detailed Documentation**: See `.claude/docs/invoices.md` > Email System for full placeholder list.

---

### Messaging Settings

**Path**: Settings > Communication > Messaging

**What It Is**: Internal messaging system configuration for communicating with attendees, speakers, sponsors.

**Configuration**:
- **Enable Messaging**: Turn messaging on/off
- **Reply-To Email**: Email for message replies
- **Sender Name**: Display name for messages

**Dependencies**:
- Used in: Messaging tab, bulk communications
- Affects: Message delivery, reply handling

**Best Practice**: Set reply-to email to a monitored inbox for attendee responses.

---

### Message Templates

**Path**: Settings > Communication > Msg Templates

**What It Is**: Pre-written message templates for bulk communications.

**Use Cases**:
- "Welcome to the conference"
- "Program update notification"
- "Last-minute venue change"
- "Post-conference survey"

**Configuration**:
- **Name**: Template name (internal)
- **Subject**: Email subject line
- **Body**: Rich-text message content
- **Active Status**: Enable/disable templates

**Dependencies**:
- Used in: Messaging tab when sending bulk messages
- Affects: Speed of communication, consistency

**Best Practice**: Create templates for recurring messages to save time.

---

### Recipient Lists

**Path**: Settings > Communication > Recipient Lists

**What It Is**: Named groups of people for targeted bulk messaging.

**Use Cases**:
- "All Keynote Speakers"
- "Gold Sponsors"
- "Tutorial Attendees"
- "Dietary Restrictions Group"

**Configuration**:
- **Name**: List name (e.g., "Gold Sponsors")
- **Description**: List purpose
- **Members**: Manual or query-based selection

**Dependencies**:
- Used in: Messaging tab, discount code bulk generation
- Affects: Targeting for communications and promotions

**Best Practice**: Update lists regularly as registrations change.

---

### Screen Overlays

**Path**: Settings > Communication > Screen Overlays

**What It Is**: Full-screen modal messages shown to portal users on login or schedule.

**Use Cases**:
- Welcome message for first-time portal visitors
- Important announcement (venue change, COVID policy)
- Scheduled reminder (CFP deadline approaching)
- Promotional message (early bird ending)

**Configuration**:
- **Title**: Overlay heading
- **Body**: Rich-text content
- **Image**: Optional image upload (JPEG, PNG, WebP, GIF)
- **Trigger Type**: first_registration, scheduled, always
- **Schedule Date**: When to show (for scheduled type)
- **Animation**: Fade, slide, zoom effects

**Trigger Behaviors**:
- **first_registration**: Shown once per user (localStorage tracking)
- **scheduled**: Shown on/after schedule date
- **always**: Shown every portal login

**Image Handling**:
- Max file size: 5MB
- Allowed types: JPEG, PNG, WebP, GIF (no SVG for security)
- Auto-strips EXIF metadata
- Cache-busted URLs for updates

**Dependencies**:
- Used in: CFP Portal, Registration Portal
- Affects: User experience, announcement visibility

**Security Note**: SVG files blocked to prevent XSS attacks.

**Detailed Documentation**: See `.claude/docs/modules.md` > Screen Overlays for technical details.

---

## Finance Settings

Configure all financial and invoicing settings.

### Currency & Tax

**Path**: Settings > Finance > Currency & Tax

**What It Is**: Primary financial settings including currency, tax rates, and number formatting.

**Configuration**:

**Currency Settings**:
- **Default Currency**: Conference currency (EUR, USD, GBP, etc.)
- **Invoice Currency**: Optional separate currency for invoices
- **Number Format**: Decimal separator, thousands separator, currency symbol position

**VAT Settings**:
- **Conference Country**: Determines domestic VAT rules
- **VAT Rates by Country**: Override global VAT rates for specific countries
- **VAT Decision Table**: 24 rules for VAT calculation (view-only)

**Number Format Presets**:
- **European (1.234,56 €)**: Dot thousands, comma decimal, symbol after
- **US (€1,234.56)**: Comma thousands, dot decimal, symbol before
- **Custom**: Define your own separators and symbol position

**Dependencies**:
- **CRITICAL**: Must be set before creating any invoices
- Affects: All invoice calculations, VAT compliance, PDF generation
- Used in: Invoice creation, booking pricing, registration

**VAT Decision Factors**:
1. Attendance type (in_person, virtual, hybrid_onsite, hybrid_online)
2. Customer type (B2B with VAT number, B2C without)
3. Customer location (domestic, EU, non-EU)

**VAT Outcomes**:
- Charge VAT (yes/no)
- VAT rate source (conference country, customer country, none)
- Reverse charge (yes/no)
- OSS applicable (yes/no)

**Best Practice**:
- Set conference country based on physical event location (or organizer location for virtual events)
- Review VAT decision table to understand tax treatment
- Consult tax advisor for special arrangements

**Detailed Documentation**: See "VAT Settings" section in handbook for VAT Decision Table examples.

---

### Invoice Numbering

**Path**: Settings > Finance > Numbering

**Restriction**: Tenant Admin / Super Admin only

**What It Is**: Invoice number generation settings and sequence management.

**Configuration**:
- **Prefix**: Text before number (e.g., "INV-", "2024-")
- **Number Sequence**: Starting number, current number
- **Padding**: Zero-padding (e.g., 001 vs 1)
- **Suffix**: Text after number (optional)
- **Credit Note Prefix**: Separate prefix for credit notes (e.g., "CN-")

**Number Format Examples**:
- `INV-2024-001`
- `CONF24-00001`
- `2024/001`

**Sequence Management**:
- Automatically increments on invoice send
- Cannot decrement (audit trail protection)
- Separate sequences for invoices and credit notes

**Dependencies**:
- Affects: All sent invoices, credit notes
- Used in: PDF generation, legal compliance

**Best Practice**:
- Use year in prefix for easy annual tracking
- Use 3-4 digit padding for professional appearance
- Never manually edit sequence after production use

**Detailed Documentation**: See `.claude/docs/invoices.md` > Invoice Settings for number generation logic.

---

### Invoice Company Data

**Path**: Settings > Finance > Company Data

**What It Is**: Your organization's legal information printed on invoices.

**Configuration**:
- **Company Name**: Legal entity name
- **Street Address**: Company address
- **Postal Code**: ZIP/postal code
- **City**: Company city
- **Country**: Company country (dropdown)
- **VAT Number**: Your company VAT registration number
- **Tax Number**: Additional tax ID if required
- **Registration Number**: Company registration number
- **Email**: Company contact email
- **Phone**: Company phone number
- **Website**: Company website URL

**Dependencies**:
- **CRITICAL**: Required for legally valid invoices
- Used in: Invoice PDF generation, credit notes
- Affects: Legal compliance, professional appearance

**Validation**:
- VAT number validated using same 3-stage validation as customer VAT
- Country must be selected from dropdown (ISO codes stored)

**Best Practice**:
- Use exact legal entity name as registered
- Verify VAT number is correct (green checkmark)
- Include all legally required information for your jurisdiction

---

### Bank Accounts

**Path**: Settings > Finance > Bank Accounts

**What It Is**: Bank account details for bank transfer invoices.

**Configuration**:
- **Bank Name**: Financial institution name
- **Account Holder**: Account holder name
- **IBAN**: International Bank Account Number
- **SWIFT/BIC**: Bank identifier code
- **Account Number**: Local account number (if not using IBAN)
- **Sort Code**: Bank sort code (UK)
- **Routing Number**: Routing number (US)
- **Currency**: Account currency
- **Default Account**: Mark as default for new invoices

**Multiple Accounts**:
- Add multiple accounts for different currencies
- Select account when creating bank transfer invoice

**Dependencies**:
- Used in: Bank transfer invoice PDF generation
- Affects: Payment instructions on invoices

**Validation**:
- IBAN format validation (checksum verification)
- SWIFT/BIC format validation

**Best Practice**:
- Verify IBAN and SWIFT codes are correct before sending invoices
- Add separate accounts for each currency you invoice in
- Mark most-used account as default

**Security Note**: Bank details are visible on invoices sent to customers.

---

### Invoice Templates

**Path**: Settings > Finance > Invoice Templates

**What It Is**: PDF template configuration and customization for invoices.

**Configuration**:
- **Template Type**: bank_transfer, credit_card, credit_note
- **Header Text**: Custom header text
- **Footer Text**: Custom footer text (legal notices, payment terms)
- **Logo**: Conference logo (configured in Details tab)
- **Colors**: Primary color for accents
- **Notes**: Default notes added to invoices

**Template Types**:
- **bank_transfer**: Shows bank account details for wire transfer
- **credit_card**: Shows Stripe payment link with QR code
- **credit_note**: Negative invoice for cancellations

**PDF Features**:
- Conference branding (logo, colors)
- Line item table with VAT breakdown
- Reverse charge notice (if applicable)
- Payment instructions (bank details or payment link)
- QR code for online payment (credit card only)

**Dependencies**:
- Requires: Company Data configured
- Requires: Bank Accounts configured (for bank transfer)
- Used in: PDF generation for all invoices
- Affects: Invoice appearance, payment instructions

**Best Practice**:
- Add payment terms to footer (e.g., "Payment due within 30 days")
- Include legal notices required in your jurisdiction
- Test PDF generation before sending to customers

**Detailed Documentation**: See `.claude/docs/invoices.md` > PDF Generation for full PDF feature list.

---

### ZUGFeRD Settings

**Path**: Settings > Finance > ZUGFeRD

**What It Is**: ZUGFeRD/Factur-X electronic invoice format configuration (German/French standard).

**What ZUGFeRD Is**:
- Hybrid PDF/XML invoice format
- PDF readable by humans + embedded XML for automated processing
- Required by many German and French public sector organizations

**Configuration**:
- **Enable ZUGFeRD**: Turn on/off XML embedding
- **Profile**: BASIC, COMFORT, EXTENDED
- **Format**: ZUGFeRD (German) or Factur-X (French)

**Dependencies**:
- Used in: Invoice PDF generation (embeds XML)
- Affects: Invoice file size, e-invoicing compliance

**Best Practice**:
- Only enable if required by customers
- Use BASIC profile unless customer specifies otherwise
- Test with customer's accounting system before widespread use

---

### Stripe Setup

**Path**: Settings > Finance > Stripe Setup

**Restriction**: Tenant Admin / Super Admin only

**What It Is**: Stripe payment integration for credit card invoices.

**Configuration**:
- **Enable Stripe**: Turn on/off credit card payments
- **Secret Key**: Stripe API secret key (encrypted)
- **Publishable Key**: Stripe public key (for future client-side use)
- **Webhook Secret**: Webhook signature verification secret

**Setup Process**:
1. Create Stripe account at stripe.com
2. Get API keys from Stripe Dashboard > Developers > API keys
3. Configure webhook:
   - URL: `https://your-domain.com/api/v1/stripe/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`
   - Copy webhook secret
4. Enter keys in SaaSConf Settings > Stripe Setup

**Payment Flow**:
1. Create invoice with template_type = "credit_card"
2. Send invoice → System creates Stripe Payment Link
3. Customer receives email with "Pay Online" button
4. Customer clicks → Redirects to Stripe checkout
5. Customer pays → Stripe creates PaymentIntent
6. Webhook notifies SaaSConf → Invoice status changes to "paid"

**Dependencies**:
- Requires: Valid Stripe account
- Requires: Webhook configured and verified
- Used in: Credit card invoice creation, payment processing, refunds
- Affects: Online payment availability

**Security**:
- Secret key encrypted at rest
- Webhook signature verification prevents spoofing
- PCI compliance handled by Stripe (no card data stored in SaaSConf)

**Best Practice**:
- Use live keys for production, test keys for testing
- Monitor Stripe dashboard for payment issues
- Test full payment flow before announcing credit card option

**Detailed Documentation**: See `.claude/docs/invoices.md` > Stripe Payment Integration for complete setup guide.

---

## General Conference Details

**Path**: Details Tab (not in Settings Tab)

**What It Is**: Core conference information and branding.

**Configuration**:
- **Name**: Conference title
- **Slug**: URL-friendly identifier (used in portal URLs)
- **Description**: Rich-text conference description
- **Start Date**: Conference start date
- **End Date**: Conference end date
- **Country**: Conference country (affects VAT, timezone defaults)
- **Timezone**: Conference timezone (for all date/time display)
- **City**: Conference city
- **Venue**: Venue name and address
- **Website**: Conference website URL
- **Contact Email**: Public contact email
- **Conference Logo**: Branding image (PNG, JPEG, WebP)

**Portal URLs** (auto-generated from slug):
- CFP Portal: `https://your-domain.com/{tenant}/portal/{slug}/cfp`
- Registration Portal: `https://your-domain.com/{tenant}/portal/{slug}/register`

**Dependencies**:
- **CRITICAL**: Country and timezone affect all date/time display and VAT calculation
- Affects: Portal access, invoice generation, email timestamps

**Best Practice**:
- Set country based on physical event location (or organizer location for virtual)
- Verify timezone before creating sessions (changes affect all existing times)
- Upload high-resolution logo (min 400px width for invoice PDFs)

---

## Booking & Registration Settings

**Path**: Booking Tab (not in Settings Tab)

Settings related to attendee registration pricing and packages.

### Booking Options

**What It Is**: Individual registration items attendees can purchase.

**Use Cases**:
- "2-Day Conference Pass"
- "1-Day Pass (Day 1)"
- "Virtual Access Only"
- "Student Ticket"
- "Networking Dinner Add-on"

**Configuration**:
- **Name**: Option name
- **Description**: Rich-text details
- **Is Active**: Enable/disable option
- **Linked to Program Day**: Optional program day association

**Dependencies**:
- Used in: Booking packages, pricing matrix, discount codes
- Affects: Registration form, invoice line items

**Program Day Linking**:
- If linked to a day with separately_bookable sessions, attendee selects sessions during registration
- Used for tutorial days, workshop selection

---

### Booking Packages

**What It Is**: Bundles of booking options sold together.

**Use Cases**:
- "Full Conference Pass" = 2-Day Pass + Networking Dinner
- "Speaker Package" = Conference Pass + Hotel Voucher
- "Premium Experience" = Conference + Tutorial + Dinner + T-shirt

**Configuration**:
- **Name**: Package name
- **Description**: Rich-text details
- **Included Options**: Which booking options are bundled
- **Is Active**: Enable/disable package

**Dependencies**:
- Requires: Booking options defined first
- Used in: Registration form package selection
- Affects: Pricing calculation, invoice itemization

---

### Booking Periods

**What It Is**: Time-based pricing periods (e.g., early bird, regular, late).

**Use Cases**:
- "Early Bird" (until Feb 1)
- "Regular" (Feb 2 - Apr 30)
- "Late Registration" (May 1 - Conference Start)
- "On-Site Registration" (during conference)

**Configuration**:
- **Name**: Period name
- **Start Date**: Period begins
- **End Date**: Period ends
- **Is Active**: Enable/disable period

**Dependencies**:
- Used in: Pricing matrix (period × option = price)
- Affects: Registration form pricing display

---

### Pricing Matrix

**What It Is**: Grid of prices for each booking option in each booking period.

**Example**:
| Option | Early Bird | Regular | Late |
|--------|-----------|---------|------|
| 2-Day Pass | €200 | €250 | €300 |
| 1-Day Pass | €120 | €150 | €180 |
| Virtual | €50 | €75 | €100 |

**Configuration**:
- **Period (row)**: Booking period
- **Option (column)**: Booking option
- **Price (cell)**: Cost in conference currency

**Dependencies**:
- Requires: Booking options and periods defined
- Used in: Registration form pricing, invoice calculation
- Affects: Revenue, registration conversion

**Best Practice**:
- Create significant early bird discount to encourage early registration
- Set regular period longest to capture most registrations
- Late period should discourage last-minute registration (higher price)

---

### Discount Codes

**What It Is**: Promotional codes for reduced pricing.

**Use Cases**:
- Speaker discount code (50% off)
- Sponsor attendee codes (free passes)
- Student discount codes (30% off)
- Referral program codes (€20 off)

**Configuration**:
- **Code**: Text code attendees enter (e.g., "SPEAKER2024")
- **Description**: Internal description
- **Discount Type**: Percentage or fixed amount
- **Discount Value**: Percentage (25%) or amount (€50)
- **Currency**: For fixed discounts
- **Start/End Date**: Validity period
- **Max Uses**: Usage limit (0 = unlimited)
- **Is Active**: Enable/disable code
- **Is Combinable**: Can be used with other discounts

**Applicability**:
- **Scoped to Booking Options**: Only applies to specific options (or all if empty)
- **Scoped to Booking Periods**: Only valid in specific periods (or all if empty)

**Bulk Generation**:
- Generate codes for multiple people at once
- Sources: Sponsors, Speakers, Committee, Recipient Lists
- Template variables: `[FirstName]`, `[LastName]`, `[Email]`, `[Counter]`
- Example: `SPEAKER-[LastName]-[Counter]` → `SPEAKER-Smith-001`

**Dependencies**:
- Used in: Registration form checkout
- Affects: Invoice totals, revenue tracking

**Detailed Documentation**: See `.claude/docs/modules.md` > Booking Module — Discount Codes

---

## Settings Configuration Checklist

Use this checklist when setting up a new conference. Items are ordered by dependencies.

### Phase 1: Foundation (Before Any Content Creation)

**General Details** (Details Tab):
- [ ] Set conference name, slug, dates
- [ ] Set conference country (affects VAT and timezone)
- [ ] Set timezone (affects all date/time display)
- [ ] Upload conference logo
- [ ] Add venue details, website, contact email

**Finance - Company Data** (Settings > Finance):
- [ ] Enter legal company name
- [ ] Add complete company address
- [ ] Add company VAT number (verify with green checkmark)
- [ ] Add tax number, registration number if required
- [ ] Add company contact email, phone, website

**Finance - Currency & Tax** (Settings > Finance):
- [ ] Set default conference currency
- [ ] Configure number format (EU vs US style)
- [ ] Review VAT decision table
- [ ] Override VAT rates if needed (consult tax advisor)

**Email Settings** (Settings > Communication):
- [ ] Configure SMTP server (host, port, username, password)
- [ ] Set "From Email" and "From Name"
- [ ] Test email sending with test recipient

### Phase 2: Structure (Before Building Program)

**People & Roles** (Settings > People & Roles):
- [ ] Add pronoun options (minimum: he/him, she/her, they/them, prefer not to say)
- [ ] Create committee roles if using CFP
- [ ] Create volunteer tasks if using volunteers module

**Conference Setup** (Settings > Conference Setup):
- [ ] Create location types matching venue structure
- [ ] Create session types with durations and colors
- [ ] Create sponsor packages with pricing and benefits

**CFP & Reviews** (Settings > CFP & Reviews) — If using CFP:
- [ ] Design paper form (add custom fields)
- [ ] Create score scales (e.g., 1-5)
- [ ] Create review criteria linked to score scales

### Phase 3: Finance & Invoicing (Before Sending First Invoice)

**Finance - Numbering** (Settings > Finance):
- [ ] Set invoice number prefix (e.g., "INV-2024-")
- [ ] Set credit note prefix (e.g., "CN-2024-")
- [ ] Configure zero-padding (e.g., 001 vs 1)
- [ ] Set starting sequence number

**Finance - Bank Accounts** (Settings > Finance):
- [ ] Add bank account details (IBAN, SWIFT, account holder)
- [ ] Verify IBAN and SWIFT codes (validation checks)
- [ ] Mark default account
- [ ] Add additional accounts for other currencies if needed

**Finance - Invoice Templates** (Settings > Finance):
- [ ] Customize invoice header and footer text
- [ ] Add payment terms to footer
- [ ] Add legal notices required in your jurisdiction
- [ ] Test PDF generation

**Finance - Stripe Setup** (Settings > Finance) — If using credit card payments:
- [ ] Create Stripe account
- [ ] Get API keys (secret, publishable)
- [ ] Configure webhook in Stripe dashboard
- [ ] Enter keys in SaaSConf
- [ ] Test full payment flow

**Finance - ZUGFeRD** (Settings > Finance) — Only if required:
- [ ] Enable ZUGFeRD if customers require it
- [ ] Select profile (BASIC recommended)
- [ ] Test with customer's accounting system

### Phase 4: Communication (Before Launch)

**Communication - Email Templates** (Settings > Communication):
- [ ] Customize registration confirmation template
- [ ] Customize invoice send template
- [ ] Customize credit note template
- [ ] Customize CFP submission confirmation (if using CFP)
- [ ] Customize CFP acceptance/rejection templates (if using CFP)
- [ ] Test all templates with sample data

**Communication - Messaging** (Settings > Communication):
- [ ] Enable messaging if using bulk communications
- [ ] Set reply-to email to monitored inbox
- [ ] Set sender name

**Communication - Message Templates** (Settings > Communication):
- [ ] Create welcome message template
- [ ] Create program update template
- [ ] Create post-conference survey template

**Communication - Screen Overlays** (Settings > Communication):
- [ ] Create welcome overlay for first portal visit
- [ ] Create CFP deadline reminder overlay (if using CFP)
- [ ] Upload images and test animations

### Phase 5: Booking & Registration (Before Registration Opens)

**Booking Options** (Booking Tab):
- [ ] Create all ticket types (2-day, 1-day, virtual, etc.)
- [ ] Add rich-text descriptions
- [ ] Link to program days if using session selection
- [ ] Activate all options

**Booking Periods** (Booking Tab):
- [ ] Create early bird period with dates
- [ ] Create regular period with dates
- [ ] Create late period with dates (optional)
- [ ] Verify dates don't overlap

**Pricing Matrix** (Booking Tab):
- [ ] Set price for each option in each period
- [ ] Verify early bird discounts are significant (20-30%)
- [ ] Test pricing display on registration form

**Discount Codes** (Booking Tab):
- [ ] Create speaker discount codes
- [ ] Create sponsor discount codes
- [ ] Generate bulk codes if needed
- [ ] Test code redemption

### Phase 6: Final Testing (Before Public Launch)

**End-to-End Testing**:
- [ ] Complete full registration as attendee
- [ ] Receive and verify registration confirmation email
- [ ] Verify invoice generated correctly with all company data
- [ ] Test payment flow (bank transfer and/or credit card)
- [ ] Test CFP submission (if using CFP)
- [ ] Test portal login and screen overlay display
- [ ] Test messaging to attendees

**Launch Checklist**:
- [ ] All settings reviewed and saved
- [ ] All templates tested with real data
- [ ] All integrations working (email, Stripe)
- [ ] Portal URLs tested and shared with team
- [ ] Support email monitored

---

## Settings Templates by Conference Type

Pre-configured settings recommendations for common conference types.

### Academic Conference

**Recommended Settings**:

**Session Types**:
- Keynote (90 min)
- Full Paper (30 min)
- Short Paper (15 min)
- Poster Session (2 hours)
- Doctoral Consortium (4 hours)
- Panel Discussion (60 min)

**Booking Options**:
- Full Conference Pass (3 days)
- Single Day Pass
- Student Pass (50% discount)
- Virtual Access Only

**Booking Periods**:
- Early Bird (6 months before): 30% discount
- Regular (3 months before): Standard price
- Late (1 month before): 15% surcharge

**CFP Settings**:
- Score Scale: 1-5 (Strong Accept to Strong Reject)
- Review Criteria:
  - Technical Quality (weight: 30%)
  - Relevance (weight: 25%)
  - Originality (weight: 25%)
  - Presentation Clarity (weight: 20%)

**Pronouns**: Include academic titles option

**Volunteer Tasks**:
- Session Chair
- Registration Desk
- Poster Setup
- Audio/Visual Support

---

### Tech/Professional Conference

**Recommended Settings**:

**Session Types**:
- Keynote (60 min)
- Talk (45 min)
- Workshop (3 hours)
- Lightning Talk (10 min)
- Panel (60 min)
- Networking Session (90 min)

**Booking Options**:
- 2-Day Conference Pass
- 1-Day Pass (specify day)
- Workshop Add-on
- Virtual Ticket
- Networking Dinner Add-on

**Booking Packages**:
- Premium Experience = Conference + Workshop + Dinner
- Virtual Plus = Virtual + Workshop Recording Access

**Booking Periods**:
- Super Early Bird (8 months before): 40% discount
- Early Bird (4 months before): 25% discount
- Regular (1 month before): Standard price
- Last Minute (1 week before): 20% surcharge

**Discount Codes**:
- Speaker code (100% off conference, 50% off dinner)
- Sponsor attendee codes (free passes based on package tier)
- Referral code (€50 off for referrer and referee)

**Sponsor Packages**:
- Platinum (€15,000): 10 free passes, booth, keynote slot
- Gold (€10,000): 5 free passes, booth
- Silver (€5,000): 2 free passes, logo on website
- Bronze (€2,500): Logo on website

**Volunteer Tasks**:
- Registration
- Speaker Support
- Booth Setup
- Social Media Coverage

---

### Virtual Conference

**Recommended Settings**:

**Session Types**:
- Keynote (60 min)
- Talk (30 min)
- Virtual Workshop (90 min)
- Q&A Session (20 min)
- Virtual Networking (30 min)

**Booking Options**:
- All-Access Pass
- Single-Day Access
- On-Demand Only (recordings)

**Booking Periods**:
- Early Bird (3 months before): 30% discount
- Regular (1 month before): Standard price
- Late (1 week before): 10% surcharge

**Location Types**:
- Zoom Room A, B, C
- YouTube Live
- Discord Channel

**VAT Configuration**:
- **CRITICAL**: Virtual conferences trigger different VAT rules
- Attendance type: "virtual"
- B2B customers in EU: Reverse charge (require VAT number)
- B2C customers in EU: OSS rate (customer country VAT)

**Email Templates**:
- Add platform links (Zoom, Discord, etc.) to all confirmations
- Include tech support contact for platform issues

---

### Hybrid Conference

**Recommended Settings**:

**Session Types**:
- Keynote (90 min) [hybrid]
- In-Person Talk (30 min)
- Virtual Talk (30 min)
- Hybrid Panel (60 min)
- In-Person Workshop (4 hours)

**Booking Options**:
- In-Person Pass (2 days)
- Virtual Pass (2 days)
- Hybrid Pass (in-person + virtual)
- In-Person + Workshop
- Virtual + Workshop Recording

**Location Types**:
- Main Hall (300 capacity) [hybrid setup]
- Room A (50 capacity)
- Room B (50 capacity)
- Zoom Room 1 (virtual only)
- Zoom Room 2 (virtual only)

**Booking Periods**:
- Early Bird (5 months before): 35% discount
- Regular (2 months before): Standard price
- Late (2 weeks before): 15% surcharge

**VAT Configuration**:
- Attendance type:
  - "hybrid_onsite" for in-person bookings
  - "hybrid_online" for virtual bookings
- B2B virtual attendees in EU: Require VAT number (reverse charge)

**Special Considerations**:
- Separate pricing for in-person vs virtual (virtual 40-50% of in-person)
- Include technology fee in in-person price (cameras, streaming)
- Workshop pricing higher for in-person (venue, catering costs)

---

## Settings Best Practices

### Configuration Order

**Always configure in this order**:

1. **General Details** (country, timezone, currency) — Affects everything
2. **Company Data** (legal info, VAT number) — Required for invoices
3. **Email Settings** (SMTP) — Required for communications
4. **People & Roles** (pronouns, roles) — Required before user data
5. **Structure** (session types, locations) — Required before program
6. **Finance** (numbering, bank accounts, templates) — Required before first invoice
7. **Communication** (templates, overlays) — Required before launch
8. **Booking** (options, periods, pricing) — Required before registration

**Why**: Later settings depend on earlier ones. Setting currency after creating invoices causes inconsistency.

---

### Settings That Affect Other Features

**Country** (Details Tab):
- Affects: VAT calculation, timezone defaults, number format presets
- Impact: Changing after invoices exist invalidates VAT calculations
- **Rule**: Set once and don't change

**Timezone** (Details Tab):
- Affects: All date/time display, session schedules, deadline reminders
- Impact: Changing after sessions exist shifts all times visually
- **Rule**: Set once based on venue location, don't change

**Currency** (Finance Settings):
- Affects: Invoice calculations, pricing display, Stripe integration
- Impact: Changing after invoices exist creates inconsistency
- **Rule**: Set once and don't change

**Pronoun Options** (People & Roles):
- Affects: Registration forms, Replace Attendee modal, CFP applications
- Impact: Adding options is safe, deleting options breaks existing data
- **Rule**: Add early, rarely delete

**Session Types** (Conference Setup):
- Affects: Program grid layout, booking logic (tutorials)
- Impact: Changing "Is Tutorial" flag after registrations breaks booking rules
- **Rule**: Define completely before sessions, don't change flags

**Score Scales** (CFP & Reviews):
- Affects: Review score calculations, acceptance decisions
- Impact: Changing scale after reviews exist invalidates comparisons
- **Rule**: Define before reviews start, don't change

---

### Settings Validation

**Before Launch, Verify**:

**Finance Settings**:
- [ ] Company VAT number shows green checkmark (valid)
- [ ] Bank IBAN shows green checkmark (valid format)
- [ ] Invoice number sequence starts at correct number
- [ ] Test invoice PDF renders correctly with all company data
- [ ] Stripe test payment completes successfully

**Email Settings**:
- [ ] Test email sends successfully
- [ ] Email arrives in inbox (not spam)
- [ ] From name and email appear correctly
- [ ] Reply-to email is monitored inbox

**Communication Settings**:
- [ ] All email templates render correctly with placeholders
- [ ] Screen overlays display properly in portal
- [ ] Message templates have correct formatting

**Booking Settings**:
- [ ] Pricing matrix has no empty cells
- [ ] Early bird period ends before regular starts
- [ ] Discount codes validate correctly in checkout
- [ ] Session selection works for tutorial days

**CFP Settings** (if using):
- [ ] Paper form includes all required fields
- [ ] Review criteria total to 100% weight
- [ ] Score scales match expected range

---

## Common Configuration Mistakes

### Mistake 1: Setting Currency After Creating Invoices

**Problem**: Invoices created before currency setting use system default, creating mixed-currency invoice list.

**Symptom**: Some invoices show EUR, others show USD.

**Fix**:
- Set currency in Finance Settings before creating first invoice
- If already happened: Manually update currency on draft invoices, recreate sent invoices

**Prevention**: Follow configuration checklist order (currency in Phase 1).

---

### Mistake 2: Changing Country After Program Built

**Problem**: VAT calculations depend on conference country. Changing invalidates all existing invoice VAT.

**Symptom**: Old invoices have wrong VAT rate, new invoices have different rate.

**Fix**:
- Recalculate VAT on all draft invoices
- Sent invoices cannot be updated (cancel and recreate if needed)

**Prevention**: Never change country after creating invoices or registrations.

---

### Mistake 3: Not Configuring Pronouns Before Registration

**Problem**: Replace Attendee modal has empty pronoun dropdown if not configured.

**Symptom**: Cannot complete Replace Attendee action, admin sees empty dropdown.

**Fix**:
- Go to Settings > People & Roles > Pronoun Options
- Add options (he/him, she/her, they/them, prefer not to say)
- Retry Replace Attendee

**Prevention**: Add pronouns in Phase 1 (before any registrations).

---

### Mistake 4: Using Weak Early Bird Discounts

**Problem**: Early bird discount too small (5-10%) doesn't incentivize early registration.

**Symptom**: Most registrations happen in regular period, cash flow issues.

**Fix**:
- Increase early bird discount to 25-35%
- Extend early bird period to capture more registrations
- Communicate early bird deadline prominently

**Prevention**: Use 30% discount as starting point, A/B test if needed.

---

### Mistake 5: Not Testing Email Before Launch

**Problem**: SMTP settings incorrect, no emails sent after registration opens.

**Symptom**: Attendees don't receive confirmation emails, complaints increase.

**Fix**:
- Verify SMTP settings (host, port, username, password)
- Test sending to multiple email providers (Gmail, Outlook, Yahoo)
- Check spam folder
- Review email server logs for errors

**Prevention**: Send test emails during Phase 1 (Email Settings configuration).

---

### Mistake 6: Missing Company Data Fields

**Problem**: Required legal fields (VAT number, registration number) not filled.

**Symptom**: Invoices legally invalid, customers cannot process for payment.

**Fix**:
- Complete all company data fields in Finance > Company Data
- Verify VAT number with green checkmark
- Regenerate PDFs for sent invoices (if possible)

**Prevention**: Complete company data in Phase 1, verify all required fields for jurisdiction.

---

### Mistake 7: Forgetting to Configure Webhook for Stripe

**Problem**: Stripe payments succeed but invoice status stays "sent" instead of "paid".

**Symptom**: Manual reconciliation required, payment tracking broken.

**Fix**:
- Configure webhook in Stripe dashboard
- URL: `https://your-domain.com/api/v1/stripe/webhook`
- Events: payment_intent.succeeded, payment_intent.payment_failed, charge.succeeded
- Enter webhook secret in SaaSConf

**Prevention**: Follow Stripe Setup checklist in Phase 3 completely.

---

### Mistake 8: Overlapping Booking Periods

**Problem**: Early bird and regular periods overlap (early bird ends Mar 1, regular starts Feb 28).

**Symptom**: System doesn't know which price to show on Feb 28-Mar 1.

**Fix**:
- Adjust period dates so they don't overlap
- Early bird ends: Feb 28 23:59
- Regular starts: Mar 1 00:00

**Prevention**: Configure periods sequentially with no gaps or overlaps.

---

### Mistake 9: Empty Pricing Matrix Cells

**Problem**: Created booking option but forgot to set price for some periods.

**Symptom**: Registration form shows "Price not set" or blank, cannot complete checkout.

**Fix**:
- Go to Booking Tab > Pricing Matrix
- Fill in all cells (every option × every period)
- Verify no empty cells remain

**Prevention**: Complete entire pricing matrix immediately after creating options/periods.

---

### Mistake 10: Changing Session Type "Is Tutorial" After Registrations

**Problem**: Session type flagged as tutorial after attendees already registered for multiple "tutorial" sessions.

**Symptom**: Booking validation breaks, system prevents new registrations.

**Fix**:
- Revert "Is Tutorial" flag to original value
- If tutorial limit needed, create new session type for future sessions

**Prevention**: Define all session types with correct flags before building program.

---

## Cross-Reference Guide

Settings documentation is distributed across multiple resources. Use this guide to find detailed information.

### Where to Find Detailed Documentation

**Invoice Settings**:
- **Numbering, Company Data, Bank Accounts, Templates, ZUGFeRD**: See `.claude/docs/invoices.md` > Invoice Settings
- **PDF Generation**: See `.claude/docs/invoices.md` > PDF Generation
- **VAT Configuration**: See "VAT Settings" section in handbook

**Stripe Integration**:
- **Setup, Payment Flow, Webhooks, Refunds**: See `.claude/docs/invoices.md` > Stripe Payment Integration

**Email System**:
- **Templates, Placeholders, Email Sending**: See `.claude/docs/invoices.md` > Email System
- **SMTP Configuration**: See `.claude/docs/devops.md` > Email Configuration

**Booking Settings**:
- **Discount Codes, Bulk Generation**: See `.claude/docs/modules.md` > Booking Module — Discount Codes
- **Session Selection in Registration**: See `.claude/docs/modules.md` > Registration Module > Session Selection

**Communication Settings**:
- **Screen Overlays, Image Upload, Trigger Types**: See `.claude/docs/modules.md` > Screen Overlays

**Volunteer Settings**:
- **Volunteer Tasks (Roles), Task Assignment, Scheduling**: See `.claude/docs/modules.md` > Volunteer Task System

**CFP Settings**:
- **Paper Form Builder, Score Scales, Review Criteria**: See `.claude/docs/modules.md` (CFP section)

**Security & Validation**:
- **VAT Number Validation, Country Fields, Field Validation**: See `.claude/docs/security.md`

---

## Summary

The Settings section provides comprehensive control over your conference configuration. By following the configuration checklist, avoiding common mistakes, and consulting the detailed documentation for specific areas, you can set up a professional, compliant conference platform.

**Key Takeaways**:

1. **Order Matters**: Configure general settings (country, currency, timezone) first, structure settings second, finance third.

2. **Test Everything**: Verify email sending, payment processing, VAT calculations before launch.

3. **Don't Change Core Settings**: Country, timezone, currency should be set once and never changed.

4. **Use Templates**: Start with a conference type template (academic, tech, virtual, hybrid) and customize.

5. **Consult Documentation**: Settings interact with many features — read detailed docs for critical areas (invoices, VAT, Stripe).

6. **Plan Ahead**: Configure pronouns, templates, and structures before data creation (registrations, sessions, reviews).

---

**Next Steps**: After completing settings configuration, proceed to building your conference content (program, sessions, sponsors, CFP) using the structures you've defined.
