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
| `email_settings.py` | Email template config for invoices/schedule notifications + Messaging Mode toggle (`/messaging-settings`) |
| `portal_settings.py` | Public registration portal settings |
| `registration_questions.py` | Portal registration form question CRUD |
| `messaging.py` | Broadcasts (per-registration, per-placement, by-attendees) + attachment upload/download (PR #157, #161) |
| `messaging_admin.py` | Broadcasts list (groups by `bulk_id`), attendee search for the Compose dialog |
| `messaging_templates.py` | Training-only message template CRUD (filters `category='training'`, PR #160) |
| `admin_threads.py` | Tenant-wide training thread inbox: list / detail / reply / archive / unarchive / read (PR #168, mirrors the conference Messaging tab) |
| `news.py` | Tenant-wide training news CRUD + send to all attendees (PR #170) |
| `screen_overlays.py` | Tenant-wide training screen overlay CRUD + image upload/serve (PR #169) |

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

## Messaging architecture (PRs #150–#168)

Training threads piggy-back on the same `message_threads` / `messages` / `message_participants` tables as conferences. The discriminator is `MessageThread.domain` ∈ `{conference, training}` plus `domain_entity_id` (the polymorphic anchor, points to a `TrainingRegistration` for training threads). Migration 213 added the columns; 214 made `conference_id` nullable so training threads can leave it NULL.

### Broadcast pipeline (`backend/app/services/training_messaging/`)

- `_core.py` — `_AnchoredAttendee`, `_PreparedRecipient`, dedup helper, `_emit_threads_for_attendees`, `_dispatch_broadcast_emails`, `_duplicate_attachments_per_message`. Dispatch branches on the tenant-wide **Messaging Mode**: `email_only` sends `send_direct_message_email` per recipient (full body); `in_app` sends `send_new_message_notification(domain="training", …)` with a portal link instead.
- `broadcasts.py` — three broadcast surfaces (`broadcast_to_registration_attendees`, `broadcast_to_placement_attendees`, `broadcast_to_attendees_by_id`). All share the same fan-out shape: one thread per attendee, all sharing a `bulk_id`. Each anchors on the attendee's *own* registration via `domain_entity_id`. `_resolve_messaging_context` reads the per-tenant Messaging Mode + slug.

### Admin Messages tab (PR #168)

- `GET /trainings/messaging/threads` — paginated tenant-wide list. Filters: `archived`, `has_attachments`, `unread_only`, subject `search`. `unread_only` matches threads where the current admin has no participant row OR `last_read_at` is older than the latest message.
- `GET /trainings/messaging/threads/{id}` — detail with messages + participants; `sender.is_me` flagged for the calling admin so the FE can style speech bubbles correctly.
- `POST /trainings/messaging/threads/{id}/reply` — admin reply with optional attachments. Auto-adds the admin as a participant if they aren't one (broadcasts only attach the original sender).
- `POST /trainings/messaging/threads/{id}/{archive,unarchive,read}` — toggle / mark.

The admin tab reuses the cfp_portal helpers (`_resolve_senders`, `_fetch_message_attachments`, `_resolve_domain_entity_names`, `_link_attachments_to_message`) so the portal-side and admin-side response shapes can't drift.

### Messaging Mode toggle (PR #167)

Stored at `tenant.settings.training_messaging_settings.messaging_mode`. Whitelist `{in_app, email_only}`. Default is `email_only` to preserve historical training-broadcast behavior (full body in the recipient's inbox). Endpoint pair: `GET / PUT /trainings/messaging-settings`. Conferences use a per-conference setting at `conference.settings.messaging_mode`; trainings use tenant-wide because there's no per-training admin scope.

### Email gating

- Conference notifications gate on `Conference.settings.email_sending_enabled` via `_is_email_enabled_for_conference`.
- Training notifications gate on `Tenant.settings.training_email_settings.email_sending_enabled` via `_is_email_enabled_for_training` (added in PR #163 alongside the notifier generalization).
- `send_new_message_notification(domain="conference"|"training", …)` dispatches to the right gate.

### Templates (PRs #155, #160)

`message_templates` got a `category` discriminator in migration 215 (default `conference`). The trainings module only ever reads/writes `category='training'` rows (`/trainings/messaging/templates`). The conference admin endpoint stays unscoped for back-compat. **Known data caveat**: pre-#160 templates created from the trainings settings tab were tagged `conference` by the migration backfill — admins re-create them from Trainings → Settings → Message Templates to get the correct tag (PR #165 surfaces an empty-state hint pointing to that path).

### Cross-domain UX rules (PRs #163, #164)

- `_notify_other_participants` (cfp_portal helper) is domain-aware: admin-link composition picks `/modules/conferences/{id}` or `/modules/trainings`. Adds a `training_attendee` participant branch so portal-side replies on training threads now produce admin emails.
- `SenderInfo.is_me` (PR #164) is set server-side against the union of the portal user's identities (applicant + every matching `training_attendee`). The portal `MessagesPage/ThreadDetailPane.tsx` reads `msg.sender.is_me` for self-side styling so cross-domain threads style consistently.

## News articles (PR #170)

`news_articles` got the same `domain` + nullable `conference_id` treatment in migration 217 (mirrors the screen-overlays pattern from migration 216). New router under `/api/v1/trainings/news`: GET list, POST create, GET / PUT / DELETE by id, POST `/{id}/send`. Tenant-scoped, `TenantAdminDep`-gated. The `send` endpoint emails published articles to every `TrainingRegistrationAttendee` in the tenant, deduped by email.

The portal endpoint `/api/v1/portal/news` returns training-domain articles to applicants who have at least one matching `TrainingRegistrationAttendee` row in the tenant (matched by `email_hash`, same identity rule the unified inbox uses). Applicants without that match see only conference news.

## Screen overlays (PR #169)

`screen_overlays.conference_id` becomes nullable in migration 216; new `domain` discriminator (`conference` | `training`) with a paired CHECK constraint. Compound index `(tenant_id, domain, is_active, trigger_type)` for the portal lookup.

New router `/api/v1/trainings/screen-overlays` (GET list, POST create, GET / PUT / DELETE by id, POST / GET / DELETE `/{id}/image`). Tenant-scoped, `TenantAdminDep`-gated.

The frontend `OverlaySelector` (PR #171) accepts either `conferenceId` (existing) or `trainingScope` to fetch from the right endpoint, so admins can pick a training-domain overlay from the trainings News form, the trainings Compose dialog, and the trainings Message Templates form. The `screen_overlay_id` FK on `news_articles` and `message_threads` works for both domains since it points to `screen_overlays.id` regardless of overlay's `domain`.

## Migration cheat sheet

| # | What |
|---|------|
| 213 | `messaging` generic anchor — adds `domain` + `domain_entity_id` to `message_threads` |
| 214 | `message_threads.conference_id` nullable (training threads NULL) |
| 215 | `message_templates.category` discriminator (default `conference`, CHECK in/training) |
| 216 | `screen_overlays.domain` + nullable `conference_id` + paired CHECK + index |
| 217 | `news_articles.domain` + nullable `conference_id` + paired CHECK + index |
