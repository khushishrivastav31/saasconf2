# Training Module Architecture

## Backend API Endpoints (`backend/app/api/v1/trainings/`)

| File | Purpose |
|------|---------|
| `__init__.py` | Router aggregation — includes all sub-routers |
| `_shared.py` | Tenant filter, accessible training IDs, response builders |
| `_invoice_helpers.py` | `invoice_to_dict`, `build_credit_note`, `get_invoice_or_404`, `send_invoice_with_link` |
| `constants.py` | `INVOICE_STATUSES`, `TEMPLATE_TYPES`, `CANCELLABLE_STATUSES`, `ATTENDEE_STATUSES` |
| `core.py` | Training CRUD (list, create, update, delete), search, filtering |
| `programs.py` | Program year CRUD (list, create, update, delete) |
| `program_publishing.py` | Publish/unpublish, preview changes, confirm update, snapshots, trainer emails |
| `program_placements.py` | Placement CRUD (add/edit/remove trainings from program year), toggle guaranteed |
| `program_trainers.py` | Assign/remove trainers to placements, check availability, conflict detection |
| `attendees.py` | Central attendee registry, park/unpark, reassign entry point |
| `registrations.py` | List registrations grouped by training, offer attendees, exam field updates |
| `invoices.py` | Invoice list, get, PDF, by-customer, pending invoicing |
| `invoice_operations.py` | Create, update draft, send, cancel (+ credit note), mark-paid, resend, delete |
| `invoice_replace.py` | Replace invoice with billing correction (cancel → credit note → new invoice) |
| `invoice_sync.py` | Stripe webhook sync endpoint |
| `offers.py` | Customer offer CRUD (create, list, update status, add/remove placements) |
| `offer_attendees.py` | Offer attendee CRUD (add/edit/remove attendees on offers) |
| `offer_invoicing.py` | Generate invoice from accepted offer |
| `offer_documents.py` | Offer PDF generation, versioning, send/resend |
| `offer_templates.py` | Offer document template CRUD |
| `customers.py` | Customer (billing contact) CRUD |
| `inhouse.py` | Inhouse training management |
| `finance.py` | Invoice summary, revenue metrics, overdue aging |
| `trainers.py` | Trainer CRUD, photo upload, availability |
| `themes.py` | Training theme CRUD |
| `languages.py` | Training/exam language CRUD |
| `syllabi.py` | Training syllabus CRUD |
| `certification_bodies.py` | Certification body CRUD |
| `location_types.py` | Location type CRUD |
| `holidays.py` | Holiday/blocked days management |
| `policies.py` | Cancellation, refund, payment terms |
| `email_settings.py` | Email template config for invoices/schedule notifications |
| `portal_settings.py` | Public registration portal settings |
| `registration_questions.py` | Portal registration form question CRUD |

## Core Services (`backend/app/core/`)

| File | Purpose |
|------|---------|
| `attendee_reassignment.py` | Full reassign flow: find old reg → cancel invoice + credit note → new reg + invoice |
| `training_invoice_number.py` | Generate next invoice number from tenant settings (sequential) |
| `training_invoice_pdf.py` | Render invoice/credit note PDF via WeasyPrint |
| `training_stripe_helper.py` | Create/deactivate Stripe payment links, refund via payment intent |
| `training_registration_emails.py` | Send invoice, reminder, confirmation emails |
| `program_snapshot.py` | Serialize placements to snapshot JSON, compute diff between versions |
| `trainer_schedule_pdf.py` | Generate trainer schedule PDF with calendar grid |

## Database Models (`backend/app/models/`)

| Model file | Key models |
|------------|-----------|
| `training.py` | `Training` — name, slug, duration, color, theme, language, syllabus |
| `training_program.py` | `TrainingProgramYear`, `ProgramYearTraining` (placement), `PlacementTrainer`, `ProgramSnapshot` |
| `training_registration.py` | `TrainingRegistration`, `TrainingRegistrationAttendee` |
| `training_attendee.py` | `TrainingAttendee` — central identity (email-based dedup) |
| `training_attendee_history.py` | `TrainingAttendeeHistory` — park/reassign events |
| `training_invoice.py` | `TrainingInvoice` — draft/sent/paid/cancelled, credit notes via `related_invoice_id` |
| `trainer.py` | `Trainer`, `TrainerUnavailability` |
| `inhouse_training.py` | `InhouseTraining` — standalone trainer invoicing |

### Key Relationships

```
TrainingProgramYear
  └─ ProgramYearTraining (placements)
       ├─ Training, Location
       ├─ PlacementTrainer → Trainer
       └─ TrainingRegistration
            ├─ TrainingRegistrationAttendee → TrainingAttendee
            └─ TrainingInvoice

CustomerOffer
  ├─ Customer
  ├─ OfferPlacement → ProgramYearTraining
  ├─ OfferAttendee
  ├─ OfferDocument (PDF versions)
  └─ TrainingInvoice (optional)

TrainingAttendee (central identity, email-based)
  ├─ TrainingAttendeeHistory (park events with source_id, placement_id)
  ├─ TrainingRegistrationAttendee → TrainingRegistration
  └─ OfferAttendee → CustomerOffer
```

## Frontend Structure (`frontend/src/pages/Trainings/`)

### Main Tabs

| File | Purpose |
|------|---------|
| `TrainingsListTab.tsx` | Training catalog CRUD |
| `RegistrationsTab.tsx` | Registrations grouped by placement |
| `AttendeesTab.tsx` | Central attendee list |
| `ParkingLotTab.tsx` | Parked attendees, reassign to new placement |
| `TeamTab.tsx` | Trainer overview |
| `CustomersTab.tsx` | Customer list with detail flyout |
| `OfferManagementTab.tsx` | Offer list, status filters |
| `PendingInvoicingTab.tsx` | Registrations/offers awaiting invoicing |
| `InhouseTrainingsTab.tsx` | Inhouse training management |
| `PaymentRemindersTab.tsx` | Overdue invoice reminders |
| `MessagesTab.tsx` / `NewsTab.tsx` / `SocialTab.tsx` | Communication channels |

### Directories

| Directory | Key files |
|-----------|-----------|
| `InvoicesTab/` | `index.tsx` (list), `DetailPanel.tsx`, `CreateForm.tsx`, `ReplaceDialog.tsx`, `DraftDetailsEditor.tsx`, `LineItemsEditor.tsx`, `formatters.tsx`, `types.ts` |
| `CustomerDetailPanel/` | `index.tsx` (shell), `DetailsTab.tsx`, `OffersTab/` (with `AttendeeRow`, `PlacementRowWithAttendees`, `OfferRow`), `DocumentsTab.tsx`, `CustomerInvoicesTab.tsx` |
| `program/` | `DesignProgramTab.tsx`, `FinalProgramTab.tsx`, `AssignTrainersTab.tsx`, `YearCalendarGrid.tsx`, `ProgramYearManager.tsx`, sidebars |
| `settings/` | `CompanyDataTab.tsx`, `CurrencyTaxTab.tsx`, `TrainersSettingsTab.tsx`, `InvoiceTemplatesTab.tsx`, `RegistrationPortalTab.tsx`, `StripeSetupTab.tsx`, etc. |
| `analytics/` | `RevenueTab.tsx`, `TrainingsStatisticsTab.tsx` |

### Shared Components

| File | Purpose |
|------|---------|
| `RegistrationRow.tsx` | Expandable registration row with attendee details + park button |
| `OfferAttendeeRow.tsx` | Offer attendee row + `groupOfferAttendeesByOffer` helper |
| `OfferDocumentsSection.tsx` | Offer PDF preview/send section |
| `OfferInvoiceForm.tsx` | Invoice creation form from offer data |
| `SendDocumentModal.tsx` | Email delivery modal for documents |

## Key Flows

### Invoice Lifecycle
- **Draft** → edit line items, billing info → **Send** (assigns number, emails recipient)
- If `credit_card`: Stripe payment link created and included in email
- **Sent** → **Paid** (manual mark-paid or Stripe webhook)
- **Cancel**: any sent/paid/overdue → status `cancelled` + auto-create credit note (negated amounts, `related_invoice_id` link)
- **Replace** (billing correction): cancel original → credit note → new invoice with corrected billing; if original was paid via Stripe, payment intent ID transfers to new invoice (**no automatic refund**)

### Offer Flow
- Create offer → add placements + attendees + pricing → **Send** (PDF email)
- Customer **accepts/rejects** → status update
- If accepted: **Offer Invoice** generates invoice from offer line items

### Attendee Parking + Reassignment
1. **Park**: attendee marked `parked`, `TrainingAttendeeHistory` event recorded with `source_id` (registration) and `placement_id`
2. **Reassign**: pick new placement →
   - Find old registration from park event (3 fallback strategies)
   - Cancel old invoice → credit note
   - Create new registration (copies billing from old)
   - Create new invoice (if old was paid: transfer payment, mark new as paid)
   - Clean up empty old registration

### Program Year Lifecycle
- **Draft**: edit calendar, add/remove placements, assign trainers
- **Publish**: create snapshot v1, email all assigned trainers with schedule PDF
- **Update**: preview diff → confirm → create snapshot v(n+1), email only affected trainers with change summary

### Stripe Integration
- **Payment links**: created on send for `template_type: credit_card`, stored on invoice
- **Refund**: only on **direct cancel** of paid CC invoice (via `refund_training_payment`)
- **No refund**: on replace or reassign — payment transfers to new invoice instead
- **Deactivate**: old payment link deactivated on replace of unpaid CC invoice
