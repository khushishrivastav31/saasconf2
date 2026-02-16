# API Reference

Base URL: `/api/v1`

---

## Table of Contents

1. [Common Patterns](#common-patterns)
2. [Authentication](#1-authentication)
3. [Tenants (Admin)](#2-tenants-admin)
4. [Modules (Admin)](#3-modules-admin)
5. [Audit Logs (Admin)](#4-audit-logs-admin)
6. [Admin Settings](#5-admin-settings)
7. [Users](#6-users)
8. [User Conference Access](#7-user-conference-access)
9. [My Company](#8-my-company)
10. [Applicant Activity](#9-applicant-activity)
11. [Conferences](#10-conferences)
12. [Volunteers](#11-volunteers)
13. [Locations](#12-locations)
14. [Service Providers](#13-service-providers)
15. [Call for Papers (CFP)](#14-call-for-papers-cfp)
16. [Conference Settings](#15-conference-settings)
17. [Paper Form Schema](#16-paper-form-schema)
18. [Sponsors](#17-sponsors)
19. [Invoices](#18-invoices)
20. [Program Design](#19-program-design)
21. [Messaging](#20-messaging)
22. [Attachments](#21-attachments)
23. [CFP Portal](#22-cfp-portal)

---

## Common Patterns

### Health Check

```
GET /health
```

Returns the API health status. No authentication required.

### Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained via the `/api/v1/auth/login` endpoint and refreshed via `/api/v1/auth/refresh`.

### Roles

| Role | Description |
|------|-------------|
| `super_admin` | Platform-level administrator with access to all tenants |
| `tenant_admin` | Tenant-level administrator managing their own organization |
| `user` | Regular tenant user with optional per-conference access |
| `applicant` | CFP portal user (separate authentication flow) |

### Pagination

Paginated endpoints accept `page` and `page_size` query parameters and return:

```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "pages": 8
}
```

### Error Format

All errors follow a consistent format:

```json
{
  "detail": "Human-readable error message",
  "type": "error_type"
}
```

Common error types:

| Status | Type | Description |
|--------|------|-------------|
| 400 | `validation_error` | Invalid request data |
| 401 | `authentication_error` | Missing or invalid token |
| 403 | `authorization_error` | Insufficient permissions |
| 404 | `not_found` | Resource not found |
| 409 | `conflict` | Duplicate or conflicting resource |
| 429 | `rate_limit` | Too many requests |

### Multi-Tenancy

The API uses row-level security (RLS). Most resources are scoped to the authenticated user's tenant. Super admins can operate across tenants by specifying `tenant_id` where applicable.

### Module Gating

Feature endpoints (conferences, volunteers, locations, CFP, etc.) require the corresponding module to be enabled for the tenant. Requests to gated endpoints without the module return `403`.

---

## 1. Authentication

Prefix: `/auth`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/login` | Authenticate and receive access/refresh tokens (rate-limited: 5/min) | Public |
| POST | `/auth/refresh` | Refresh access token using refresh token (rate-limited: 10/min) | Public |
| POST | `/auth/logout` | Revoke refresh tokens and blacklist access token | Bearer |
| GET | `/auth/me` | Get current authenticated user information | Bearer |
| PATCH | `/auth/me/preferences` | Update current user preferences (e.g., notification settings) | Bearer |

---

## 2. Tenants (Admin)

Prefix: `/admin/tenants`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/tenants` | List all tenants with pagination and search | Super Admin |
| POST | `/admin/tenants` | Create a new tenant | Super Admin |
| GET | `/admin/tenants/{tenant_id}` | Get tenant details by ID | Super Admin |
| PUT | `/admin/tenants/{tenant_id}` | Update tenant details | Super Admin |
| DELETE | `/admin/tenants/{tenant_id}` | Soft-delete (deactivate) a tenant | Super Admin |
| DELETE | `/admin/tenants/{tenant_id}/permanent` | Permanently delete a tenant and all data | Super Admin |
| GET | `/admin/tenants/{tenant_id}/modules` | List modules assigned to a tenant | Super Admin |
| POST | `/admin/tenants/{tenant_id}/modules` | Assign a module to a tenant | Super Admin |
| PUT | `/admin/tenants/{tenant_id}/modules/{module_id}` | Update a tenant module assignment | Super Admin |
| DELETE | `/admin/tenants/{tenant_id}/modules/{module_id}` | Remove a module from a tenant | Super Admin |
| GET | `/admin/tenants/{tenant_id}/super-user` | Get the designated super user for a tenant | Super Admin |
| PUT | `/admin/tenants/{tenant_id}/super-user` | Set or change the tenant super user | Super Admin |
| DELETE | `/admin/tenants/{tenant_id}/super-user` | Remove the tenant super user designation | Super Admin |
| POST | `/admin/tenants/{tenant_id}/logo` | Upload a tenant logo | Super Admin |
| GET | `/admin/tenants/{tenant_id}/logo` | Get the tenant logo image | Public |
| DELETE | `/admin/tenants/{tenant_id}/logo` | Delete the tenant logo | Super Admin |

---

## 3. Modules (Admin)

Prefix: `/admin/modules`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/modules` | List all platform modules | Super Admin |
| POST | `/admin/modules` | Create a new platform module | Super Admin |
| GET | `/admin/modules/{module_id}` | Get module details by ID | Super Admin |
| PUT | `/admin/modules/{module_id}` | Update module details | Super Admin |

---

## 4. Audit Logs (Admin)

Prefix: `/admin/audit-logs`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/audit-logs` | List audit logs with filtering, search, and pagination | Super Admin |
| GET | `/admin/audit-logs/actions` | Get all distinct audit action types | Super Admin |
| GET | `/admin/audit-logs/resource-types` | Get all distinct resource types | Super Admin |
| GET | `/admin/audit-logs/export` | Export audit logs as CSV file | Super Admin |

---

## 5. Admin Settings

Prefix: `/admin/settings`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/settings/currencies` | List platform currencies with pagination | Bearer |
| POST | `/admin/settings/currencies` | Create a new platform currency | Super Admin |
| PUT | `/admin/settings/currencies/{currency_id}` | Update a platform currency | Super Admin |
| DELETE | `/admin/settings/currencies/{currency_id}` | Delete a platform currency | Super Admin |
| GET | `/admin/settings/currencies/{currency_code}/suggested-format` | Get suggested number format for a currency code | Bearer |
| GET | `/admin/settings/number-format-presets` | Get list of number format presets | Bearer |
| GET | `/admin/settings/email-templates` | List platform email templates | Super Admin |
| GET | `/admin/settings/email-templates/{template_type}` | Get a specific platform email template | Super Admin |
| PUT | `/admin/settings/email-templates/{template_type}` | Update a platform email template | Super Admin |

---

## 6. Users

Prefix: `/users`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/users` | List users in the tenant with pagination and search | Tenant Admin |
| GET | `/users/pronoun-options` | Get available pronoun options | Bearer |
| POST | `/users` | Create a new user in the tenant | Tenant Admin |
| GET | `/users/{user_id}` | Get user details by ID | Tenant Admin |
| PUT | `/users/{user_id}` | Update user details | Tenant Admin |
| DELETE | `/users/{user_id}` | Deactivate a user | Tenant Admin |

---

## 7. User Conference Access

Prefix: `/user-conference-access`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/user-conference-access/my-access/{conference_id}` | Get current user's access level for a conference | Bearer |
| POST | `/user-conference-access` | Grant a user access to a conference | Tenant Admin |
| GET | `/user-conference-access/user/{user_id}` | List all conference access entries for a user | Tenant Admin |
| GET | `/user-conference-access/conference/{conference_id}` | List all user access entries for a conference | Tenant Admin |
| PUT | `/user-conference-access/{access_id}` | Update a conference access entry | Tenant Admin |
| DELETE | `/user-conference-access/{access_id}` | Revoke a conference access entry | Tenant Admin |
| POST | `/user-conference-access/user/{user_id}/bulk-grant` | Grant a user access to multiple conferences at once | Tenant Admin |
| POST | `/user-conference-access/user/{user_id}/bulk-revoke` | Revoke a user's access from multiple conferences at once | Tenant Admin |

---

## 8. My Company

Prefix: `/my-company`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/my-company` | Get the current tenant's company details | Tenant Admin |
| PUT | `/my-company` | Update the current tenant's company details | Tenant Admin |
| POST | `/my-company/logo` | Upload a company logo | Tenant Admin |
| DELETE | `/my-company/logo` | Delete the company logo | Tenant Admin |

---

## 9. Applicant Activity

Prefix: `/applicant-activity`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/applicant-activity` | List applicant activity logs with filtering and pagination | Tenant Admin |
| GET | `/applicant-activity/grouped` | List activity logs grouped by applicant with pagination | Tenant Admin |
| GET | `/applicant-activity/activity-types` | Get all possible activity types | Tenant Admin |
| GET | `/applicant-activity/export` | Export activity logs as CSV file | Tenant Admin |

---

## 10. Conferences

Prefix: `/conferences`

Requires the `conferences` module to be enabled.

### Core

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences` | List conferences with pagination, search, and filters | Bearer + Module |
| POST | `/conferences` | Create a new conference | Tenant Admin + Module |
| GET | `/conferences/stats` | Get conference statistics for the tenant | Bearer + Module |
| GET | `/conferences/{conference_id}` | Get conference details by ID | Bearer + Module |
| PUT | `/conferences/{conference_id}` | Update conference details | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}` | Delete a conference | Conference Admin + Module |
| GET | `/conferences/{conference_id}/delete-preview` | Preview what would be deleted with a conference | Conference Admin + Module |
| GET | `/conferences/{conference_id}/export/invoices` | Export conference invoices as CSV | Conference Admin + Module |
| GET | `/conferences/{conference_id}/export/papers` | Export conference papers as CSV | Conference Admin + Module |
| POST | `/conferences/{conference_id}/publish` | Publish a conference | Conference Admin + Module |
| POST | `/conferences/{conference_id}/unpublish` | Unpublish a conference | Conference Admin + Module |

### Logo

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/conferences/{conference_id}/logo` | Upload a conference logo | Conference Admin + Module |
| GET | `/conferences/{conference_id}/logo` | Get the conference logo image | Public |
| DELETE | `/conferences/{conference_id}/logo` | Delete the conference logo | Conference Admin + Module |

### Associations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/volunteers` | List volunteers linked to a conference | Bearer + Module |
| POST | `/conferences/{conference_id}/volunteers` | Link a volunteer to a conference | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}/volunteers/{volunteer_id}` | Unlink a volunteer from a conference | Conference Admin + Module |
| GET | `/conferences/{conference_id}/locations` | List locations linked to a conference | Bearer + Module |
| POST | `/conferences/{conference_id}/locations` | Link a location to a conference | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}/locations/{location_id}` | Unlink a location from a conference | Conference Admin + Module |
| GET | `/conferences/{conference_id}/cfps` | List CFPs linked to a conference | Bearer + Module |
| POST | `/conferences/{conference_id}/cfps` | Link a CFP to a conference | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}/cfps/{cfp_id}` | Unlink a CFP from a conference | Conference Admin + Module |

### Conference Service Providers

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/service-providers` | List service providers for a conference | Bearer + Module |
| POST | `/conferences/{conference_id}/service-providers` | Add a service provider to a conference | Conference Admin + Module |
| PUT | `/conferences/{conference_id}/service-providers/{provider_id}` | Update a conference service provider | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}/service-providers/{provider_id}` | Remove a service provider from a conference | Conference Admin + Module |

---

## 11. Volunteers

Prefix: `/volunteers`

Requires the `volunteers` module to be enabled.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/volunteers` | List volunteers with pagination, search, and filters | Bearer + Module |
| GET | `/volunteers/stats` | Get volunteer statistics for the tenant | Bearer + Module |
| POST | `/volunteers` | Create a new volunteer | Tenant Admin + Module |
| GET | `/volunteers/{volunteer_id}` | Get volunteer details by ID | Bearer + Module |
| PUT | `/volunteers/{volunteer_id}` | Update volunteer details | Tenant Admin + Module |
| DELETE | `/volunteers/{volunteer_id}` | Delete a volunteer | Tenant Admin + Module |
| POST | `/volunteers/{volunteer_id}/approve` | Approve a volunteer | Tenant Admin + Module |

---

## 12. Locations

Prefix: `/locations`

Requires the `locations` module to be enabled.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/locations` | List locations with pagination, search, and filters | Bearer + Module |
| GET | `/locations/tree` | Get locations as a hierarchical tree structure | Bearer + Module |
| GET | `/locations/stats` | Get location statistics for the tenant | Bearer + Module |
| POST | `/locations` | Create a new location | Tenant Admin + Module |
| GET | `/locations/{location_id}` | Get location details by ID | Bearer + Module |
| PUT | `/locations/{location_id}` | Update location details | Tenant Admin + Module |
| DELETE | `/locations/{location_id}` | Delete a location | Tenant Admin + Module |

---

## 13. Service Providers

Prefix: `/locations/{location_id}/service-providers`

Requires the `locations` module to be enabled. Service providers are nested under a specific location.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/locations/{location_id}/service-providers` | List service providers for a location | Bearer + Module |
| POST | `/locations/{location_id}/service-providers` | Create a service provider for a location | Tenant Admin + Module |
| PUT | `/locations/{location_id}/service-providers/{provider_id}` | Update a service provider | Tenant Admin + Module |
| DELETE | `/locations/{location_id}/service-providers/{provider_id}` | Delete a service provider | Tenant Admin + Module |

---

## 14. Call for Papers (CFP)

Prefix: `/cfp`

Requires the `cfp` module to be enabled.

### CFPs

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/` | List all CFPs with pagination and search | Bearer + Module |
| POST | `/cfp/` | Create a new CFP | Tenant Admin + Module |
| GET | `/cfp/stats` | Get CFP statistics for the tenant | Bearer + Module |
| GET | `/cfp/{cfp_id}` | Get CFP details by ID | Bearer + Module |
| PUT | `/cfp/{cfp_id}` | Update CFP details | Tenant Admin + Module |
| DELETE | `/cfp/{cfp_id}` | Delete a CFP | Tenant Admin + Module |

### Topics

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/topics` | List all CFP topics | Bearer + Module |
| POST | `/cfp/topics` | Create a new topic | Tenant Admin + Module |
| PUT | `/cfp/topics/{topic_id}` | Update a topic | Tenant Admin + Module |
| DELETE | `/cfp/topics/{topic_id}` | Delete a topic | Tenant Admin + Module |

### Submissions

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/{cfp_id}/submissions` | List submissions for a CFP with pagination | Bearer + Module |
| GET | `/cfp/{cfp_id}/submissions/stats` | Get submission statistics for a CFP | Bearer + Module |
| POST | `/cfp/{cfp_id}/submissions` | Create a submission for a CFP | Tenant Admin + Module |
| GET | `/cfp/{cfp_id}/submissions/{submission_id}` | Get submission details | Bearer + Module |
| PUT | `/cfp/{cfp_id}/submissions/{submission_id}` | Update a submission | Tenant Admin + Module |
| DELETE | `/cfp/{cfp_id}/submissions/{submission_id}` | Delete a submission | Tenant Admin + Module |

### Papers

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/papers` | List all papers with pagination and filters | Bearer + Module |
| GET | `/cfp/papers/stats` | Get paper statistics | Bearer + Module |
| POST | `/cfp/papers` | Create a new paper | Tenant Admin + Module |
| GET | `/cfp/papers/{paper_id}` | Get paper details by ID | Bearer + Module |
| PUT | `/cfp/papers/{paper_id}` | Update paper details | Tenant Admin + Module |
| POST | `/cfp/papers/{paper_id}/submit` | Submit a paper for review | Tenant Admin + Module |
| POST | `/cfp/papers/{paper_id}/unsubmit` | Withdraw a paper from review | Tenant Admin + Module |
| DELETE | `/cfp/papers/{paper_id}` | Delete a paper | Tenant Admin + Module |
| GET | `/cfp/papers/{paper_id}/assignments` | List reviewer assignments for a paper | Bearer + Module |
| GET | `/cfp/papers/{paper_id}/reviews` | List reviews for a paper | Bearer + Module |

### Cospeaker Invitations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/papers/my-invitations` | List cospeaker invitations for the current user | Bearer + Module |
| POST | `/cfp/papers/{paper_id}/cospeakers/{applicant_id}/accept` | Accept a cospeaker invitation | Bearer + Module |
| POST | `/cfp/papers/{paper_id}/cospeakers/{applicant_id}/decline` | Decline a cospeaker invitation | Bearer + Module |

### Paper Assignments

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/paper-assignments` | List paper-to-reviewer assignments | Bearer + Module |
| POST | `/cfp/paper-assignments` | Create a paper-to-reviewer assignment | Tenant Admin + Module |
| POST | `/cfp/paper-assignments/auto-assign` | Auto-assign papers to reviewers | Tenant Admin + Module |
| DELETE | `/cfp/paper-assignments/{assignment_id}` | Delete a paper assignment | Tenant Admin + Module |

### Applicants

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/applicants` | List CFP applicants with pagination | Bearer + Module |
| POST | `/cfp/applicants` | Create a new applicant | Tenant Admin + Module |
| PUT | `/cfp/applicants/{applicant_id}` | Update an applicant | Tenant Admin + Module |
| DELETE | `/cfp/applicants/{applicant_id}` | Delete an applicant | Tenant Admin + Module |

### Committee Members

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cfp/committee-members` | List committee members | Bearer + Module |
| POST | `/cfp/committee-members` | Add a committee member | Tenant Admin + Module |
| PUT | `/cfp/committee-members/{member_id}` | Update a committee member | Tenant Admin + Module |
| DELETE | `/cfp/committee-members/{member_id}` | Remove a committee member | Tenant Admin + Module |

---

## 15. Conference Settings

Prefix: `/conferences/{conference_id}/settings`

All conference settings endpoints are scoped to a specific conference. They require Tenant Admin or Super Admin access.

### Volunteer Roles

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/volunteer-roles` | List volunteer roles | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/volunteer-roles` | Create a volunteer role | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/volunteer-roles/{role_id}` | Update a volunteer role | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/volunteer-roles/{role_id}` | Delete a volunteer role | Tenant Admin |

### Location Types

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/location-types` | List location types | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/location-types` | Create a location type | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/location-types/{type_id}` | Update a location type | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/location-types/{type_id}` | Delete a location type | Tenant Admin |

### Currencies

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/currencies` | List conference currencies | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/currencies` | Add a currency to the conference | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/currencies/{currency_id}` | Update a conference currency | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/currencies/{currency_id}` | Remove a currency from the conference | Tenant Admin |

### Sponsor Packages

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/sponsor-packages` | List sponsor packages | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/sponsor-packages` | Create a sponsor package | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/sponsor-packages/{package_id}` | Update a sponsor package | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/sponsor-packages/{package_id}` | Delete a sponsor package | Tenant Admin |

### Booking Periods

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/booking-periods` | List booking periods | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/booking-periods` | Create a booking period | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/booking-periods/{period_id}` | Update a booking period | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/booking-periods/{period_id}` | Delete a booking period | Tenant Admin |

### Booking Options

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/booking-options` | List booking options | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/booking-options` | Create a booking option | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/booking-options/{option_id}` | Update a booking option | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/booking-options/{option_id}` | Delete a booking option | Tenant Admin |

### Booking Packages

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/booking-packages` | List booking packages | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/booking-packages` | Create a booking package | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/booking-packages/{package_id}` | Update a booking package | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/booking-packages/{package_id}` | Delete a booking package | Tenant Admin |

### Booking Matrix

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/booking-matrix` | Get the full booking pricing matrix (periods x options) | Tenant Admin |

### Discount Codes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/discount-codes` | List discount codes | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/discount-codes` | Create a discount code | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/discount-codes/{discount_code_id}` | Update a discount code | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/discount-codes/{discount_code_id}` | Delete a discount code | Tenant Admin |

### Session Types

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/session-types` | List session types | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/session-types` | Create a session type | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/session-types/{session_type_id}` | Update a session type | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/session-types/{session_type_id}` | Delete a session type | Tenant Admin |

### Committee Roles

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/committee-roles` | List committee roles | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/committee-roles` | Create a committee role | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/committee-roles/{role_id}` | Update a committee role | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/committee-roles/{role_id}` | Delete a committee role | Tenant Admin |

### Score Scales

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/score-scales` | List review score scales | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/score-scales` | Create a score scale | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/score-scales/{scale_id}` | Update a score scale | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/score-scales/{scale_id}` | Delete a score scale | Tenant Admin |

### Review Criteria

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/review-criteria` | List review criteria | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/review-criteria` | Create a review criterion | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/review-criteria/{criterion_id}` | Update a review criterion | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/review-criteria/{criterion_id}` | Delete a review criterion | Tenant Admin |

### Review Questions

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/review-criteria/{criterion_id}/questions` | List questions for a review criterion | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/review-criteria/{criterion_id}/questions` | Create a question for a review criterion | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/review-criteria/{criterion_id}/questions/{question_id}` | Update a review question | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/review-criteria/{criterion_id}/questions/{question_id}` | Delete a review question | Tenant Admin |

### Review Form Settings

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/review-form-settings` | Get review form settings | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/review-form-settings` | Update review form settings | Tenant Admin |

### Pronouns

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/pronouns` | List pronoun options | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/pronouns` | Create a pronoun option | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/pronouns/{option_id}` | Update a pronoun option | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/pronouns/{option_id}` | Delete a pronoun option | Tenant Admin |

### Email Templates

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/settings/email-templates` | List conference email templates | Tenant Admin |
| GET | `/conferences/{conference_id}/settings/email-templates/{template_type}` | Get a specific conference email template | Tenant Admin |
| POST | `/conferences/{conference_id}/settings/email-templates` | Create a conference email template | Tenant Admin |
| PUT | `/conferences/{conference_id}/settings/email-templates/{template_type}` | Update a conference email template | Tenant Admin |
| DELETE | `/conferences/{conference_id}/settings/email-templates/{template_type}` | Delete a conference email template | Tenant Admin |

---

## 16. Paper Form Schema

Prefix: `/conferences/{conference_id}/paper-form-schema`

Manage the custom paper submission form layout for a conference.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/paper-form-schema` | Get the paper form schema (builtin + custom fields) | Tenant Admin |
| PUT | `/conferences/{conference_id}/paper-form-schema` | Update builtin fields configuration | Tenant Admin |
| POST | `/conferences/{conference_id}/paper-form-schema/fields` | Add a custom field to the form | Tenant Admin |
| PUT | `/conferences/{conference_id}/paper-form-schema/fields/reorder` | Reorder custom fields | Tenant Admin |
| PUT | `/conferences/{conference_id}/paper-form-schema/fields/{field_id}` | Update a custom field | Tenant Admin |
| DELETE | `/conferences/{conference_id}/paper-form-schema/fields/{field_id}` | Delete a custom field | Tenant Admin |
| GET | `/conferences/{conference_id}/paper-form-schema/has-submissions` | Check if any papers have been submitted for this conference | Tenant Admin |

---

## 17. Sponsors

Prefix: `/conferences/{conference_id}/sponsors`

Requires the `sponsors` module to be enabled.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/sponsors` | List sponsors for a conference | Bearer + Module |
| POST | `/conferences/{conference_id}/sponsors` | Create a sponsor | Conference Admin + Module |
| GET | `/conferences/{conference_id}/sponsors/{sponsor_id}` | Get sponsor details by ID | Bearer + Module |
| PUT | `/conferences/{conference_id}/sponsors/{sponsor_id}` | Update sponsor details | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}/sponsors/{sponsor_id}` | Delete a sponsor | Conference Admin + Module |

---

## 18. Invoices

Prefix: `/conferences/{conference_id}/invoices`

Requires the `invoices` module to be enabled.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/invoices` | List invoices for a conference | Bearer + Module |
| POST | `/conferences/{conference_id}/invoices` | Create an invoice | Conference Admin + Module |
| GET | `/conferences/{conference_id}/invoices/{invoice_id}` | Get invoice details by ID | Bearer + Module |
| PUT | `/conferences/{conference_id}/invoices/{invoice_id}` | Update invoice details | Conference Admin + Module |
| DELETE | `/conferences/{conference_id}/invoices/{invoice_id}` | Delete an invoice | Conference Admin + Module |

---

## 19. Program Design

Prefix: `/conferences/{conference_id}/program`

Manage conference program schedule including days, time slots, tracks, sessions, and the schedule grid.

### Days

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/program/days` | List program days for the conference | Bearer |
| POST | `/conferences/{conference_id}/program/days` | Create a program day | Conference Admin |
| POST | `/conferences/{conference_id}/program/days/generate` | Auto-generate program days from conference dates | Conference Admin |
| PUT | `/conferences/{conference_id}/program/days/{day_id}` | Update a program day | Conference Admin |
| DELETE | `/conferences/{conference_id}/program/days/{day_id}` | Delete a program day | Conference Admin |

### Time Slots

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/program/days/{day_id}/slots` | List time slots for a day | Bearer |
| POST | `/conferences/{conference_id}/program/days/{day_id}/slots` | Create a time slot for a day | Conference Admin |
| POST | `/conferences/{conference_id}/program/days/{day_id}/slots/batch` | Create multiple time slots at once | Conference Admin |
| PUT | `/conferences/{conference_id}/program/slots/{slot_id}` | Update a time slot | Conference Admin |
| DELETE | `/conferences/{conference_id}/program/slots/{slot_id}` | Delete a time slot | Conference Admin |

### Tracks

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/program/tracks` | List program tracks | Bearer |
| POST | `/conferences/{conference_id}/program/tracks` | Create a program track | Conference Admin |
| PUT | `/conferences/{conference_id}/program/tracks/reorder` | Reorder program tracks | Conference Admin |
| PUT | `/conferences/{conference_id}/program/tracks/{track_id}` | Update a program track | Conference Admin |
| DELETE | `/conferences/{conference_id}/program/tracks/{track_id}` | Delete a program track | Conference Admin |

### Sessions

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/program/sessions` | List program sessions | Bearer |
| GET | `/conferences/{conference_id}/program/sessions/enriched` | List sessions with enriched details (speaker, paper info) | Bearer |
| POST | `/conferences/{conference_id}/program/sessions` | Create a program session | Conference Admin |
| PUT | `/conferences/{conference_id}/program/sessions/{session_id}` | Update a program session | Conference Admin |
| PUT | `/conferences/{conference_id}/program/sessions/{session_id}/move` | Move a session to a different slot/track | Conference Admin |
| DELETE | `/conferences/{conference_id}/program/sessions/{session_id}` | Delete a program session | Conference Admin |

### Grid

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/program/grid` | Get the full program grid (all days) | Bearer |
| GET | `/conferences/{conference_id}/program/grid/{day_id}` | Get the program grid for a specific day | Bearer |

### Publish

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/program/publish/preview` | Preview the program before publishing | Conference Admin |
| POST | `/conferences/{conference_id}/program/publish` | Publish the program | Conference Admin |
| POST | `/conferences/{conference_id}/program/update` | Update the published program | Conference Admin |
| GET | `/conferences/{conference_id}/program/sessions/export` | Export program sessions as CSV | Conference Admin |

---

## 20. Messaging

Prefix: `/conferences/{conference_id}/messaging`

Conference-scoped messaging system for communication between admins and applicants.

### Threads

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/messaging/threads` | List message threads with pagination and filters | Bearer |
| GET | `/conferences/{conference_id}/messaging/threads/{thread_id}` | Get thread details with messages | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads` | Create a new message thread | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads/{thread_id}/reply` | Reply to a thread | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads/{thread_id}/archive` | Archive a thread | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads/{thread_id}/unarchive` | Unarchive a thread | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads/{thread_id}/flag` | Flag or unflag a thread | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads/{thread_id}/note` | Add an internal note to a thread | Bearer |
| GET | `/conferences/{conference_id}/messaging/threads/{thread_id}/export` | Export a thread as a downloadable file | Bearer |
| POST | `/conferences/{conference_id}/messaging/threads/{thread_id}/read` | Mark a thread as read | Bearer |

### Attachments

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/conferences/{conference_id}/messaging/upload` | Upload a message attachment | Bearer |
| GET | `/conferences/{conference_id}/messaging/attachments/{attachment_id}/download` | Download a message attachment | Bearer |

### Bulk Messaging

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/conferences/{conference_id}/messaging/bulk-send` | Send a bulk message to multiple recipients | Conference Admin |
| GET | `/conferences/{conference_id}/messaging/bulk-threads` | List bulk message threads | Bearer |
| GET | `/conferences/{conference_id}/messaging/unread-count` | Get unread message count for the conference | Bearer |

### Recipient Lists

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/messaging/recipient-lists` | List saved recipient lists | Bearer |
| POST | `/conferences/{conference_id}/messaging/recipient-lists` | Create a recipient list | Conference Admin |
| GET | `/conferences/{conference_id}/messaging/recipient-lists/{list_id}` | Get recipient list details | Bearer |
| PUT | `/conferences/{conference_id}/messaging/recipient-lists/{list_id}` | Update a recipient list | Conference Admin |
| DELETE | `/conferences/{conference_id}/messaging/recipient-lists/{list_id}` | Delete a recipient list | Conference Admin |

### Templates

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/conferences/{conference_id}/messaging/templates` | List message templates | Bearer |
| POST | `/conferences/{conference_id}/messaging/templates` | Create a message template | Conference Admin |
| PUT | `/conferences/{conference_id}/messaging/templates/{template_id}` | Update a message template | Conference Admin |
| DELETE | `/conferences/{conference_id}/messaging/templates/{template_id}` | Delete a message template | Conference Admin |

### Global Unread Count

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/messaging/unread-count` | Get total unread count across all conferences | Bearer |

---

## 21. Attachments

Prefix: `/attachments`

Generic file attachment system for various entity types.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/attachments` | List attachments for a specific entity (requires `entity_type` and `entity_id` query params) | Bearer |
| POST | `/attachments` | Upload a file attachment (multipart form with `entity_type`, `entity_id`, `file`) | Tenant Admin |
| GET | `/attachments/{attachment_id}/download` | Download an attachment file | Bearer |
| DELETE | `/attachments/{attachment_id}` | Delete an attachment | Tenant Admin |

Supported entity types: `location`, `volunteer`, `conference`, `service_provider`, `applicant_picture`, `applicant_video`, `paper_video`, `sponsor_logo`.

---

## 22. CFP Portal

The CFP (Call for Papers) Portal is a separate-facing interface for applicants (speakers) to submit and manage their paper proposals. It uses a distinct authentication flow with applicant accounts.

### Portal Authentication

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/portal/{tenant_slug}/register` | Register a new applicant account | Public |
| POST | `/portal/{tenant_slug}/verify-email` | Verify applicant email address | Public |
| POST | `/portal/{tenant_slug}/forgot-password` | Request a password reset email | Public |
| POST | `/portal/{tenant_slug}/reset-password` | Reset password with token | Public |
| POST | `/portal/{tenant_slug}/login` | Authenticate applicant and receive tokens | Public |
| POST | `/portal/{tenant_slug}/refresh` | Refresh applicant access token | Public |
| GET | `/portal/me` | Get current applicant profile | Applicant |
| PUT | `/portal/me` | Update current applicant profile | Applicant |
| GET | `/portal/pronoun-options` | Get available pronoun options | Applicant |
| GET | `/portal/me/committee-memberships` | List applicant's committee memberships | Applicant |
| PUT | `/portal/me/committee-memberships/{membership_id}` | Update a committee membership | Applicant |
| GET | `/portal/tenant/{tenant_slug}` | Get public tenant information for portal branding | Public |
| GET | `/portal/{tenant_slug}/{abbreviation}` | Get CFP portal landing page data for a conference | Public |

### Portal Papers

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/topics` | List available CFP topics | Applicant |
| GET | `/portal/conferences` | List conferences with open CFPs | Applicant |
| GET | `/portal/conferences/{conference_id}` | Get conference detail for the portal | Applicant |
| GET | `/portal/papers` | List applicant's own papers | Applicant |
| GET | `/portal/papers/{paper_id}` | Get paper details | Applicant |
| POST | `/portal/papers` | Create a new paper submission | Applicant |
| PUT | `/portal/papers/{paper_id}` | Update a paper submission | Applicant |
| POST | `/portal/papers/{paper_id}/submit` | Submit a paper for review | Applicant |
| POST | `/portal/papers/{paper_id}/unsubmit` | Withdraw a paper from review | Applicant |
| DELETE | `/portal/papers/{paper_id}` | Delete a paper submission | Applicant |

### Portal Invitations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/invitations` | List cospeaker invitations | Applicant |
| POST | `/portal/invitations/{paper_id}/accept` | Accept a cospeaker invitation | Applicant |
| POST | `/portal/invitations/{paper_id}/decline` | Decline a cospeaker invitation | Applicant |

### Portal Attachments

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/portal/attachments` | Upload a paper attachment | Applicant |
| GET | `/portal/attachments/{attachment_id}/download` | Download a paper attachment | Applicant |

### Portal Assigned Papers (Reviewer)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/assigned-papers` | List papers assigned for review | Applicant |
| GET | `/portal/assigned-papers/{paper_id}` | Get assigned paper details | Applicant |

### Portal Reviews

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/assignments/{assignment_id}/review-config` | Get review form configuration for an assignment | Applicant |
| POST | `/portal/assignments/{assignment_id}/review` | Submit or save a review | Applicant |
| GET | `/portal/papers/{paper_id}/feedback` | Get review feedback for a paper (visible to author) | Applicant |

### Portal Messaging

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/messages` | List applicant message threads | Applicant |
| GET | `/portal/messages/{thread_id}` | Get thread details with messages | Applicant |
| POST | `/portal/messages` | Create a new message thread | Applicant |
| POST | `/portal/messages/{thread_id}/reply` | Reply to a thread | Applicant |
| POST | `/portal/messages/{thread_id}/read` | Mark a thread as read | Applicant |
| POST | `/portal/messages/{thread_id}/archive` | Archive a thread | Applicant |
| POST | `/portal/messages/{thread_id}/unarchive` | Unarchive a thread | Applicant |
| GET | `/portal/messages/unread-count` | Get unread message count | Applicant |
| POST | `/portal/messages/upload` | Upload a message attachment | Applicant |
| GET | `/portal/messages/attachments/{attachment_id}/download` | Download a message attachment | Applicant |

### Portal Form Schema

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/cfp/{cfp_id}/paper-form-schema` | Get the paper submission form schema for a CFP | Applicant |
