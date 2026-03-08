# SaaSConf Tenant UI Handbook

*Complete Guide to Managing Conferences on the SaaSConf Platform*

---

Last Updated: March 8, 2026
Version: 2.0
Audience: Tenant Admins, Conference Admins, Team Members

---

## Table of Contents

This comprehensive handbook covers all aspects of using the SaaSConf platform to manage your conferences. It is organized into the following major sections:

### Getting Started
1. Introduction to SaaSConf
2. Conference Dashboard
3. Team Management
4. Social Media Integration

### Financial Management
5. Booking Options & Packages
6. Discount Codes
7. Invoice Management
8. Payment Integration (Stripe, Bank Transfer, ZUGFeRD)

### Attendee Management
9. Managing Attendees & Registrations

### Call for Papers (CFP)
10. CFP Setup & Configuration
11. CFP Topics & Committee
12. CFP Review Process & Decisions

### Program & Content
13. Program Design & Sessions
14. Speakers Management
15. News & Announcements

### Operations
16. Volunteers & Task Management
17. Locations & Venues
18. Sponsors & Contracts
19. Service Providers

### Communication
20. Messaging Module
21. Email Templates
22. Screen Overlays

### Advanced Features
23. Alumni Management
24. Deadlines & Reminders
25. Analytics & Reporting
26. Invoice Settings

### Configuration
27. Complete Settings Guide
28. Registration Management

### Resources
29. Best Practices & Conference Templates
30. Troubleshooting & Common Issues
31. Glossary & FAQ

---

## 1. Introduction to SaaSConf

### Overview

SaaSConf is a comprehensive multi-tenant platform for conference management. Each tenant (organization) can manage multiple conferences, handle call for papers (CFP), coordinate speakers and volunteers, manage registrations, process invoicing, and much more — all within a unified interface.

This handbook guides you through the tenant admin interface, explaining how to configure and manage your conferences effectively.

### User Roles and Permissions

SaaSConf has a hierarchical permission system with four distinct roles:

#### Super Admin
- Scope: Platform-wide access
- Who has this role: SaaSConf platform administrators only
- Capabilities:
  - Manage all tenant companies
  - Configure platform-wide modules
  - View audit logs across all tenants
  - Access administrative dashboard with system-wide statistics
- Restrictions: Cannot access individual tenant data unless explicitly granted access

#### Tenant Admin
- Scope: Full access within their organization (tenant)
- Who has this role: Organization administrators designated during tenant setup
- Capabilities:
  - Create, edit, and delete conferences
  - Invite and manage team members
  - Configure all conference settings
  - Access all enabled modules
  - Manage billing and invoicing
  - Upload logos and branding assets
  - Configure email templates
- Restrictions: Cannot access other tenants' data or platform administration

#### Conference Admin (Team Member with Admin Access)
- Scope: Admin access to specific conferences only
- Who has this role: Team members granted admin-level conference access
- Capabilities:
  - Edit conference details within assigned conferences
  - Manage team members for assigned conferences
  - Configure settings for assigned conferences
  - Create/edit sessions, speakers, sponsors
  - Access all modules within assigned conferences
- Restrictions: Cannot create new conferences, cannot access unassigned conferences, cannot manage tenant-level users
- Configuration: Set via "Edit Team Member" → "Conference Access" → Select conference → Choose "Admin" access level

#### Team Member (Read-Only User)
- Scope: Read-only access to assigned conferences or all conferences
- Who has this role: Team members with read-only access level
- Capabilities:
  - View all data within assigned conferences
  - Export data (CSV, PDF reports)
  - View dashboards and statistics
  - Access portal previews
- Restrictions: Cannot create, edit, or delete any data. Cannot invite users or change settings.
- Configuration: Set via "Edit Team Member" → Role: "Read-only" + "Conference Access" configuration

[Screenshot: Team page showing role badges - Admin (purple), Read-only (gray)]

### Navigation Overview

The SaaSConf interface is organized into three main areas:

#### Top Navigation Bar
Located at the top of every page, this bar provides:
- Logo/Home Link: Returns to main dashboard
- User Menu (top-right): Access to profile settings, theme toggle (light/dark mode), and logout
- Notifications Icon: Message notifications (if enabled in your profile)

[Screenshot: Top navigation bar with user menu expanded]

#### Main Dashboard
Your landing page after login shows:
- For Super Admins: Cards linking to Companies, Modules, and Audit Logs
- For Tenant Admins/Users: List of available modules (if tenant has modules enabled)
- Welcome Message: Displays your name or email
- Quick Stats: Conference counts by status (upcoming, ongoing, past)

[Screenshot: Tenant user dashboard showing module cards]

#### Conference Management Area
Accessed via the "Conferences" page, which shows:
- Conference Grid: Visual cards for each conference with logo, dates, location, status badge
- Filter Bar: Filter by status (upcoming, ongoing, past, draft)
- Stats Summary: Total, upcoming, ongoing, and past conference counts
- Create Conference Button: Visible only to Tenant Admins

Each conference card displays:
- Conference logo (if uploaded)
- Conference name and abbreviation
- Status badge (upcoming/blue, ongoing/green, past/gray, draft/yellow)
- Start and end dates
- Location with venue type indicator (hybrid/virtual)
- Team member count
- Published/Draft indicator
- Delete button (Super Admin and Tenant Super User only)

[Screenshot: Conferences page showing grid view with status badges and filters]

### Accessing Your Conference

To access a conference:

1. Navigate to the Conferences page from your dashboard
2. Locate your conference in the grid (use the filter dropdown if you have many conferences)
3. Click anywhere on the conference card to open the conference detail view

[Screenshot: Conference card being hovered, showing cursor pointer]

The Conference Detail page opens with a sidebar navigation showing all available sections. The sidebar is organized into logical groups:
- Overview: Details, Team, Social
- Content Management: CFPs, Papers, Speakers, Sessions, News
- Event Operations: Volunteers, Locations, Sponsors, Booking, Invoices
- Program Management: Program Design, Program Build
- Communication: Messaging, Screen Overlays
- Data: Attendees, Alumni, Deadlines
- Configuration: Settings (with sub-sections)

[Screenshot: Conference detail sidebar navigation with expanded Settings section]

### What Happens Automatically

When you first log in:
- System loads your user profile and determines your role
- Dashboard displays content based on your permissions
- Theme preference (light/dark) is applied automatically if set
- Unread message notifications appear (if enabled)
- Approaching/overdue deadlines trigger warning toasts (up to 7 days before due date)

### Best Practices

1. Role Assignment: Assign the minimum necessary role. Use read-only access for team members who only need to view data.
2. Conference-Specific Access: For large teams, use conference-specific access instead of "All Conferences" to reduce clutter and improve security.
3. Theme Preference: Set your theme preference in the user menu for consistent visual experience.
4. Browser Compatibility: SaaSConf works best in modern browsers (Chrome, Firefox, Safari, Edge). Enable JavaScript and allow cookies.
5. Navigation Tips: Use the sidebar collapse button (left sidebar) to maximize workspace on smaller screens.

---

## 2. Conference Dashboard

### Overview

The Conference Dashboard is your central hub for managing a single conference. It opens when you click a conference card from the Conferences page. The dashboard consists of a Details tab (your default view), a collapsible sidebar for navigation, and a header showing conference status and quick actions.

The Details tab provides an overview of all conference information and quick editing capabilities for core settings.

### Prerequisites

- Permission Required: At least read-only access to the conference
- For Editing: Admin access (Tenant Admin or Conference Admin role)
- Browser: Modern browser with JavaScript enabled

### Conference Status

Conferences automatically move through status phases based on dates:

#### Status Types and Meanings

Upcoming (Blue Badge)
- Conference start date is in the future
- Most common status during planning phase
- All features fully accessible for configuration

Ongoing (Green Badge)
- Current date is between start_date and end_date
- Conference is actively happening
- Portal typically shows live program and session details

Past (Gray Badge)
- Current date is after end_date
- Conference has concluded
- Data remains accessible for reporting and historical reference
- Can still be edited (dates can be changed to reactivate)

Draft (Yellow Badge)
- Custom status for conferences not yet ready for publication
- No automatic status rules apply
- Manually controlled via publish toggle

[Screenshot: Conference header showing status badge and conference name]

### Quick Stats and Overview

The Details tab displays real-time statistics and metadata:

#### Displayed Information
- Conference Logo: Visual branding identifier (shown in header and cards)
- Basic Details: Name, abbreviation, description
- Dates: Start date, end date
- Location Details: Venue name, address, city, state/province, postal code, country
- Timezone: Conference timezone (auto-suggested based on country)
- Event Type: Onsite, Virtual, or Hybrid
- Venue URL: Optional link to venue website or map
- Virtual Platform URL: Streaming platform link (for virtual/hybrid events)
- Contact Information: Support email, contact email, phone (used in templates and invoices)
- Website: Conference website URL
- Portal URLs: Auto-generated shareable links for attendee/applicant access

[Screenshot: Details tab showing all conference information fields]

### Editing Conference Information

All fields in the Details tab auto-save after a 500ms delay when you stop typing. A save status indicator appears in the top-right corner of each section.

#### Save Status Indicators
- Saving... (gray, spinning icon): Changes are being sent to server
- Saved (green, checkmark): Changes saved successfully
- Save failed (red, X icon): Error occurred; check your connection

[Screenshot: Save status indicators in different states]

#### Basic Details Section

Conference Name (Required)
- Main identifier for the conference
- Displayed on all pages, emails, and invoices
- Character limit: 255 characters
- Validation: Cannot be empty
- Example: "International Conference on Software Engineering 2026"

Abbreviation (Optional but Recommended)
- Short form of conference name
- Used in URL generation for portal access
- Best Practice: Use consistent abbreviations (e.g., "ICSE2026")

[Screenshot: Basic details section with name and abbreviation fields]

Conference Description (Optional)
- Rich-text field supporting formatting (bold, italic, lists, links)
- Displayed on portal landing pages
- Toolbar: Basic formatting options appear on selection
- Safety: HTML is automatically sanitized
- Best Practice: Keep to 2-3 paragraphs for portal readability

[Screenshot: Rich text editor with formatting toolbar visible]

Website (Optional)
- Main conference website URL
- Auto-normalized on blur (adds `https://` if missing)
- Validation: Must be valid URL format if provided
- Example: Enter `example.com`, system converts to `https://example.com`

#### Date and Time Settings

Start Date (Required)
- First day of the conference
- Used for status calculation (upcoming/ongoing/past)
- Smart Behavior: If you set start date after existing end date, end date auto-adjusts to match

End Date (Required)
- Last day of the conference
- Constraint: Must be same as or after start date
- Default: If not set, defaults to start date (single-day conference)

Timezone (Required)
- Determines how session times are displayed in portal
- Auto-Suggestion: When you select a country, system suggests default timezone
- Dropdown Options: Searchable list of common timezones (e.g., "Europe/Berlin", "America/New_York")
- Best Practice: Set timezone before creating sessions to avoid confusion

[Screenshot: Date fields and timezone dropdown]

#### Contact Information Section

These fields populate placeholders in email templates and invoice templates.

Support Email (Optional)
- Used as reply-to address in automated emails
- Validation: Email format checked on blur
- Error Display: Red border + error message if invalid
- Example: `support@conference.org`

Contact Email (Optional)
- General contact email for attendees
- Validation: Email format checked on blur

Phone (Optional)
- Contact phone number
- Validation: International format checked on blur (e.g., `+49 123 456789`)
- Error Display: Red border + error message if invalid
- Format: Accepts `+` prefix or `00` prefix

[Screenshot: Contact information fields with validation error shown]

#### Location Section

Venue Name (Optional)
- Name of the physical or virtual venue
- Example: "Berlin Congress Center"

Address (Optional)
- Street address of venue
- Displayed on attendee information pages

Postal Code / City / State/Province (Optional)
- Standard address components
- Used for location display on conference cards

Country (Required for Timezone Auto-Suggestion)
- Dropdown with full country list
- Smart Behavior: Selecting country auto-suggests timezone if timezone is currently empty

Event Type (Required)
- Three options:
  - Onsite: Physical venue only
  - Virtual: Online-only event
  - Hybrid: Both physical and online
- UI Impact: Virtual/Hybrid shows additional field for streaming platform URL

Venue URL (Optional)
- Link to venue website or map
- Auto-normalized on blur (adds `https://` if missing)

Streaming Platform URL (Conditional - Virtual/Hybrid Only)
- URL for online attendees to access sessions
- Only shown if Event Type is Virtual or Hybrid
- Auto-normalized on blur
- Example: `https://zoom.us/j/123456789`

[Screenshot: Location section with event type dropdown and conditional streaming URL field]

#### Portal URLs Section

This section auto-generates shareable URLs for attendee/applicant access. You cannot edit these URLs directly; they update automatically based on tenant slug and conference abbreviation.

General Portal Login
- Use Case: Share for users to register/login to the general portal
- Actions: Copy button, Open in new tab button

Conference Landing Page (Only if abbreviation is set)
- Use Case: Direct applicants to this conference's CFP portal
- Actions: Copy button, Open in new tab button
- Smart Display: Only appears if abbreviation field has a value

[Screenshot: Portal URLs section with copy and open buttons]

### Logo Upload

The conference logo is displayed on conference cards, in the header, and optionally in email templates.

#### Upload Process
1. Click "Upload Logo" button (or "Replace Logo" if one exists)
2. File picker opens - select image file
3. Upload begins immediately (spinning icon, "Uploading..." label)
4. On success, logo refreshes with cache-busting timestamp
5. Status returns to idle

[Screenshot: Logo upload section showing logo preview, upload button, and delete button]

#### Logo Requirements
- Allowed Formats: JPEG, PNG, WebP, GIF
- Not Allowed: SVG
- Max File Size: 10 MB
- Metadata automatically removed for privacy

#### Logo Preview
- Flexible width (min 96px, max 192px) and fixed height (96px)
- Aspect Ratio: Preserved automatically
- Background: Light gray in light mode, dark gray in dark mode
- Placeholder: Building icon shown if no logo uploaded

#### Delete Logo
- Click "Delete Logo" button
- Confirmation required: Yes
- Impact: Logo removed from all locations (cards, header, emails)
- Restoration: Upload again to restore (previous logo not recoverable)

Error Handling:
- Invalid file type: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF."
- File too large: "File size exceeds 10MB limit."
- Network error: "Failed to upload logo. Please try again."
- Errors appear below buttons as red text, auto-dismiss after 3 seconds

### Edge Cases

#### Date Conflicts
- Setting start date after end date: End date auto-adjusts to match start date
- Past dates: Allowed - useful for importing historical conferences

#### Empty Required Fields
- Name: Save fails silently if name is empty (validation prevents this in practice)
- Timezone: Can be empty but recommended to set before creating sessions

#### Invalid Email/Phone
- Auto-save behavior: If validation error appears on blur, auto-save is blocked until fixed
- User must: Correct the value and blur again to trigger save
- Visual cue: Red border persists until valid value entered

#### Network Issues
- Save failed state: Appears after timeout or error response
- User action: Check connection, try editing field again to retry
- Data loss: No data loss - form retains all entered values

#### Logo Upload Issues
- Upload in progress: Cannot select new file while upload is processing
- Multiple uploads: Uploading new logo automatically replaces old one
- Delete during upload: Not possible - delete button disabled during upload

### Validation Rules

#### Email Fields (Support Email, Contact Email)
- Pattern: Standard email format
- Case: Normalized to lowercase on save
- Empty: Valid (fields are optional)
- Error Message: "Please enter a valid email address."

#### Phone Field
- Format: International format required (+49..., or 0049...)
- Empty: Valid (field is optional)
- Error Message: "Please enter a valid international phone number (e.g., +49 123 456789)."

#### URL Fields (Website, Venue URL, Streaming Platform URL)
- Normalization: Auto-prepends `https://` on blur if protocol missing
- Empty: Valid (fields are optional except where conditional)

#### Date Fields
- Start Date: No past date validation (historical conferences allowed)
- End Date: Must be >= start date

#### Text Length
- Name: Max 255 characters
- Abbreviation: Max 50 characters
- Description: No hard limit (rich text field)
- Venue Name, Address, City, State: Max 255 characters each

### Best Practices

1. Fill Core Fields First: Set name, dates, and timezone before inviting team or creating sessions
2. Abbreviation Consistency: Use year + event acronym (e.g., "ICSE2026") for easy portal URL sharing
3. Logo Aspect Ratio: Use landscape logos (16:9 or 4:3) for best display in conference cards
4. Contact Fields: Always fill support_email and contact_email for professional automated emails
5. Timezone Accuracy: Double-check timezone - changing it after publishing program causes confusion
6. Description Length: Keep description under 500 words for portal readability
7. Portal URLs: Copy and test portal URLs before sharing publicly to ensure abbreviation is correct
8. Auto-Save Awareness: Wait for "Saved" indicator before navigating away to prevent data loss

### Common Issues

Issue: Changes not saving
- Cause: Validation error in email/phone field, or network issue
- Solution: Check for red borders indicating validation errors; fix and retry

Issue: Logo not updating after upload
- Cause: Browser cache
- Solution: Hard refresh page (Ctrl+F5 / Cmd+Shift+R); system uses cache-busting URLs to prevent this

Issue: Portal URL not showing conference landing page
- Cause: Abbreviation field is empty
- Solution: Set abbreviation field and save; URL section will appear automatically

Issue: Timezone dropdown not showing expected timezone
- Cause: Timezone list includes canonical names only
- Solution: Search for city name in dropdown (e.g., "Berlin" → "Europe/Berlin")

Issue: Save status stuck on "Saving..."
- Cause: Network timeout or server error
- Solution: Check browser console for errors; refresh page to see if save succeeded; retry edit

### Related Features

- Conference Team (Section 3): Configure team members for this conference
- Social Media (Section 4): Add social links to conference profile
- Settings > Financial Settings: Configure invoice templates using contact placeholders
- Settings > Email Templates: Use contact placeholders in templates
- Program Design: Session times use conference timezone
- Portal Landing Page: Conference description appears on portal

---

## 3. Team Management

### Overview

The Conference Team feature allows you to list team members associated with a specific conference (e.g., conference chairs, program committee chairs, organizers). This is separate from user accounts — team members listed here do not automatically get login access.

Key Distinction:
- Team Tab (Conference Level): Lists people associated with this conference (displayed publicly, no login access)
- Team Page (Tenant Level): Manages user accounts with login credentials (accessible via main navigation)

To grant login access to someone, use the Team page in the main navigation and invite them as a user.

[Screenshot: Conference Details sidebar with Team tab highlighted]

### Prerequisites

- Permission Required: Read-only access to view team members
- For Editing: Conference Admin or Tenant Admin role
- Browser: Modern browser with JavaScript enabled

### Step-By-Step Instructions

#### Viewing Team Members

1. Navigate to your conference detail page
2. Click the Team tab in the sidebar (under the Details section)
3. Team members display as cards showing:
   - Full name (first + last)
   - Role label (if set)
   - Manager badge (if marked as manager)
   - Email and phone (if provided)

[Screenshot: Team tab showing existing team members with role and manager badges]

#### Adding a Team Member

Note: Only users with admin access see the "Add Team Member" form.

1. Scroll to the blue "Add Team Member" form at the bottom of the Team tab
2. Fill in required fields:
   - First Name * (Required)
   - Last Name * (Required)
3. Fill in optional fields:
   - Role: Job title or position (e.g., "Conference Chair", "Program Committee Chair")
   - Email: Contact email (validates on blur)
   - Phone: Contact phone (validates on blur using international format)
4. Check Conference Manager checkbox if this person has managerial responsibility
5. Click Add Member button
6. Member appears immediately in the list above
7. Save status indicator shows "Saving..." then "Saved"

[Screenshot: Add Team Member form with all fields visible and validation error on email field]

#### Editing a Team Member

1. Locate the team member card in the list
2. Click the Edit icon (pencil) in the top-right of the card
3. The card expands into an inline edit form with blue background
4. Modify fields as needed (same fields as add form)
5. Click Save Changes button
6. Form collapses back to card view
7. Save status indicator confirms save

[Screenshot: Team member card in edit mode showing expanded form]

Validation:
- First Name and Last Name cannot be empty
- Email must be valid format (checked on blur)
- Phone must be valid international format (checked on blur)
- Save button is disabled while validation errors exist

#### Removing a Team Member

1. Locate the team member card
2. Click the Delete icon (trash can) in the top-right of the card
3. Confirmation dialog appears
4. Click Remove to confirm, or Cancel to abort
5. Team member is removed from the list immediately
6. Save status indicator confirms deletion

[Screenshot: Confirmation dialog for removing team member]

Important: This does not delete the person's user account (if they have one). It only removes them from this conference's team listing.

### What Happens Automatically

#### On Add
- Full name is constructed from first_name + last_name
- Empty optional fields are stored as empty strings
- Conference team count updates on conference card
- Save status shows "Saving..." → "Saved" progression

#### On Edit
- Form pre-populates with current values
- Validation runs on blur for email/phone fields
- Cancel button restores original values without saving

#### On Remove
- Team member record is deleted
- Team count decrements on conference card

#### Validation
- Email: Standard email format validation
- Phone: International format validation
- Empty Values: Treated as valid for optional fields
- Errors Clear: Validation errors clear when user types valid value and blurs

### Edge Cases

#### Duplicate Names
- Allowed: System does not check for duplicate names
- Best Practice: Use role field to differentiate (e.g., "Conference Chair 2025" vs "Conference Chair 2026")

#### Special Characters in Names
- Allowed: Full Unicode support in first_name, last_name, role fields
- Display: Renders correctly in both light and dark modes

#### Empty Email/Phone
- Allowed: Both fields are optional
- Display: Empty fields are hidden in card view (only name and role shown)

#### Invalid Email Format
- Detection: Checked on blur (when field loses focus)
- UI: Red border + error message: "Please enter a valid email address."
- Save Blocking: Add/Save button disabled while error exists
- Fix: Type valid email and blur again to clear error

#### Invalid Phone Format
- Detection: Checked on change (live validation)
- UI: Red border + error message: "Please enter a valid international phone number (e.g., +49 123 456789)."
- Save Blocking: Add/Save button disabled while error exists
- Examples: `+49 123 456789`, `0049 123 456789` are valid; `123456789` is invalid

#### Network Failure During Save
- UI: Save status shows "Save failed"
- Data: Local form retains entered values
- Recovery: Try editing field again to retry save operation

#### Concurrent Edits
- Scenario: Two users edit same team member simultaneously
- Behavior: Last save wins (no conflict detection)
- Mitigation: Save status indicator shows when changes are being saved

### Validation Rules

#### First Name and Last Name
- Required: Yes
- Max Length: 255 characters
- Allowed Characters: Full Unicode (letters, spaces, hyphens, apostrophes, etc.)
- Trimming: Leading/trailing whitespace removed on save

#### Role
- Required: No
- Max Length: 255 characters
- Purpose: Job title or position label
- Display: Shows as small gray badge next to name

#### Email
- Required: No
- Validation: Standard email format
- Normalization: Lowercased on save
- Error Message: "Please enter a valid email address."
- Timing: Validated on blur

#### Phone
- Required: No
- Validation: International format
- Accepted Formats: `+49 123 456789`, `0049 123 456789`
- Error Message: "Please enter a valid international phone number (e.g., +49 123 456789)."
- Timing: Validated on change (live)

#### Conference Manager Checkbox
- Type: Boolean
- Default: False (unchecked)
- Display: Blue "Manager" badge appears on card if true

### Best Practices

1. Separate from User Accounts: Remember this is a display-only list. To grant login access, use the Team page in main navigation.
2. Use Role Field: Always specify role for clarity (e.g., "General Chair", "Program Chair", "Publicity Chair")
3. Manager Flag: Use for organizing committee hierarchy; helps identify key decision-makers
4. Contact Info: Provide email/phone only if you want this information publicly visible on portal
5. Consistent Naming: Use full formal names for professionalism
6. Ordering: Add members in order of seniority or importance (list displays in insertion order)

### Common Issues

Issue: Changes not saving
- Cause: Validation error in email or phone field
- Solution: Check for red borders; correct invalid values and try again

Issue: Added member not appearing
- Cause: Save failed due to network issue
- Solution: Check "Save failed" status indicator; retry by adding again

Issue: Cannot find edit button
- Cause: User has read-only access
- Solution: Contact tenant admin to grant conference admin access

Issue: Removed member still shows on portal
- Cause: Portal cache
- Solution: Wait 5 minutes for cache to clear, or hard refresh portal page

Issue: Phone validation failing
- Cause: Missing country code or invalid format
- Solution: Ensure phone starts with `+` or `00` followed by country code (e.g., `+49 123 456789`)

### Related Features

- Team Page (Main Navigation): Invite users with login access to your tenant
- Conference Access Control: Grant specific users admin or read-only access to this conference
- Settings > Email Templates: Team member details may be used in custom templates
- Portal Display: Team members can be displayed on public-facing portal pages

---

## 4. Social Media Integration

### Overview

The Social Media tab allows you to configure social media links for your conference. These links appear on your conference's public portal pages, making it easy for attendees and applicants to follow conference updates on their preferred platforms.

[Screenshot: Social Media tab in conference sidebar]

### Prerequisites

- Permission Required: Read-only access to view social links
- For Editing: Conference Admin or Tenant Admin role
- Browser: Modern browser with JavaScript enabled

### Step-By-Step Instructions

#### Viewing Social Media Links

1. Navigate to your conference detail page
2. Click the Social tab in the sidebar (under the Details section)
3. Existing social media links display as labeled input fields:
   - Platform name on the left (e.g., "Twitter", "Facebook", "LinkedIn")
   - URL input field in the center
   - Delete button (X icon) on the right (admin only)

[Screenshot: Social tab showing existing social media links with delete buttons]

#### Adding a Social Media Channel

Note: Only users with admin access see the "Add Channel" form.

1. Scroll to the bottom of the Social tab
2. Click the Select platform... dropdown
3. Choose from available platforms:
   - Twitter
   - Facebook
   - LinkedIn
   - Instagram
   - YouTube
   - GitHub
   - Mastodon
   - Custom... (for unlisted platforms)
4. If you selected "Custom...":
   - A text input appears labeled "Platform name"
   - Enter the platform name (e.g., "Bluesky", "Discord")
5. Click Add Channel button
6. New platform appears in the list above with empty URL field
7. Enter the URL for your profile/page
8. Changes auto-save after 500ms delay

[Screenshot: Add Channel dropdown showing platform options including Custom]

#### Editing Social Media URLs

1. Locate the platform in the list
2. Click in the URL input field
3. Type or paste your profile/page URL
4. Click outside the field (blur) to trigger auto-save
5. Save status indicator shows "Saving..." → "Saved"

[Screenshot: Social media URL field being edited with save status indicator]

URL Normalization: The system does NOT auto-normalize URLs in social fields (unlike other URL fields). Enter full URLs including `https://`.

#### Deleting a Social Media Channel

1. Locate the platform in the list
2. Click the Delete button (X icon) on the right side of the row
3. Platform is removed immediately
4. Save triggers automatically (no confirmation dialog)

[Screenshot: Delete button hover state on social media row]

Important: Deletion is immediate and cannot be undone. To restore, add the platform again and re-enter the URL.

### What Happens Automatically

#### On Add
- Platform is added with empty string value
- Field appears in the list immediately
- No save happens until you enter a URL (adding a platform with empty URL is allowed)

#### On URL Change
- Debounced auto-save triggers 500ms after you stop typing
- Save status indicator shows progress
- Changes persist immediately

#### On Delete
- Platform key is removed
- Immediate save (no debounce delay)
- Field disappears from list

#### Display Order
- Known platforms (Twitter, Facebook, etc.) appear first in dropdown order
- Custom platforms appear after known platforms in insertion order

### Connecting Social Media Accounts

Important Clarification: This feature does not connect your social media accounts for auto-posting. It only stores display links.

#### What This Feature Does:
- Stores social media profile/page URLs
- Displays these links on your public conference portal
- Allows attendees/applicants to follow your accounts manually

#### What This Feature Does NOT Do:
- Auto-post conference updates to social media
- Import posts from social media
- Require authentication or API keys
- Schedule posts

For Auto-Posting: SaaSConf does not currently support automated social media posting. You must post updates manually to your social channels.

[Screenshot: Social media links displaying on public portal]

### Social Media Settings

There are no additional settings for social media beyond the URLs. Each URL is treated as a simple display link.

#### Display Behavior
- Links open in new browser tab
- Icons may be displayed on portal (depends on portal theme)

#### Privacy
- Links are public - visible to anyone viewing your portal
- No authentication or private data is stored
- URLs are not validated for account ownership

### Edge Cases

#### Duplicate Platforms
- Prevention: Dropdown only shows platforms not already in the list
- After Deletion: Deleted platforms reappear in dropdown for re-adding

#### Custom Platform Name Conflicts
- Scenario: Add custom platform "Twitter" when official Twitter exists
- Behavior: Creates separate entry
- Display: Shows as "Twitter" label
- Best Practice: Avoid naming custom platforms with existing platform names

#### Empty URLs
- Allowed: Platforms can exist with empty URLs
- Display: Empty URL fields are shown (not hidden)
- Save: Saves empty string to database
- Portal: Platforms with empty URLs may be hidden on portal (theme-dependent)

#### Invalid URLs
- Validation: None - system accepts any text
- Best Practice: Always enter full URLs including `https://`
- Example: `https://twitter.com/yourconference`

#### Network Failure During Save
- UI: Save status shows "Save failed"
- Data: Local state retains entered URL
- Recovery: Try editing field again to retry

#### Special Characters in URLs
- Allowed: Full URL encoding supported
- Example: `https://example.com/path?param=value&other=123`

### Validation Rules

#### Platform Name (Custom Only)
- Required: Yes, if "Custom..." is selected
- Max Length: Unlimited (practical limit ~50 characters for UI)
- Allowed Characters: Full Unicode

#### URL Field
- Required: No (empty URLs are allowed)
- Validation: None - accepts any text
- Max Length: 2048 characters (browser limit for URLs)
- Normalization: None - enter exactly as you want it stored

#### Debounce Timing
- Delay: 500ms after last keystroke
- Purpose: Reduce server requests while typing
- Override: Blur (clicking outside field) does not trigger immediate save; waits for debounce

### Best Practices

1. Use Full URLs: Always include `https://` protocol (e.g., `https://twitter.com/yourconf`, not `twitter.com/yourconf`)
2. Verify Links: Test each link on portal before sharing publicly to ensure correctness
3. Platform Selection: Use official platform options when available instead of custom
4. Custom Names: Use clear, recognizable names for custom platforms (e.g., "Discord Server", not "Chat")
5. Consistency: Use consistent URL formats across platforms (profile URLs, not post URLs)
6. Privacy: Only add links to accounts you manage or have permission to share
7. Maintenance: Review and update links annually (social media URLs can change)

### Common Issues

Issue: Changes not saving
- Cause: Network issue or server error
- Solution: Check browser console; refresh page to verify if changes persisted; retry edit

Issue: Platform not appearing in dropdown
- Cause: Platform already added to the list
- Solution: Scroll through existing links to find it, or delete and re-add

Issue: Link not working on portal
- Cause: Incomplete URL (missing `https://`)
- Solution: Edit URL to include full protocol: `https://twitter.com/...`

Issue: Cannot delete platform
- Cause: User has read-only access
- Solution: Contact conference admin to grant edit access

Issue: Custom platform name looks wrong
- Cause: Name was transformed (lowercased, underscores)
- Solution: Delete and re-add with desired capitalization for display label

Issue: Save status stuck on "Saving..."
- Cause: Network timeout
- Solution: Refresh page; if changes didn't persist, re-enter URL

### Related Features

- Portal Landing Page: Social links display on public-facing portal pages
- News Tab: Manually share news updates; copy links to post on social media
- Messaging Module: Send email updates to attendees (consider announcing new social channels)
- Conference Description: Mention social media in conference description for visibility

---

**End of Sections 1-4**

## 5. Booking Options Setup

### Overview

The Booking Options system manages how attendees register for your conference through a pricing matrix that combines **booking periods** (columns) and **booking options** (rows). This flexible system allows you to create time-based pricing (early bird, regular, late) for different attendance types (full conference, day passes, tutorials).

**Key Concepts**:
- **Booking Periods**: Time windows with specific pricing (e.g., "Early Bird: Jan 1 - Feb 28")
- **Booking Options**: What attendees can purchase (e.g., "2-Day Pass", "Tutorial Only")
- **Pricing Matrix**: The intersection of periods and options determines the price
- **Auto-Sync**: Booking options automatically created from program days

### Prerequisites

Before setting up booking options:

1. **Conference Settings Complete**:
   - Conference dates set
   - Currency configured (Settings > General > Currency)
   - Program days created (optional but recommended)

2. **Access Requirements**:
   - Conference admin or super admin role
   - Conference must be in "draft" or "upcoming" status

3. **Planning Checklist**:
   - Define pricing periods (early bird, regular, late, etc.)
   - Determine registration types (full conference, day passes, tutorials)
   - Set price points for each period/option combination
   - Decide on attendance types (in-person, virtual, hybrid)

### Understanding Booking Periods vs Booking Options

**Booking Periods** (Matrix Columns):
- Define **when** prices apply
- Each period has a date range (start_date to end_date)
- Optional per-period currency override
- Example periods: "Blind Bird", "Early Bird", "Regular", "Late"

**Booking Options** (Matrix Rows):
- Define **what** attendees can buy
- Can be linked to specific conference days
- Optional attendance type (in_person, virtual, hybrid_onsite, hybrid_online)
- Example options: "Tutorial", "Day 1", "Day 2", "Full Conference"

**Important**: Booking options are **automatically created** from your program days when you first load the Booking tab. This ensures consistency between your program schedule and registration options.

### Step-by-Step Instructions

#### Creating Booking Periods

1. **Navigate to Booking Settings**:
   - Go to Conference Detail page
   - Click **Settings** tab
   - Select **Booking** from the settings menu

2. **Add Your First Period**:
   - Click **+ Period** button (top right)
   - Fill in the form:
     - **Period Name** *: "Early Bird" (example)
     - **Start Date** *: First day this pricing is valid
     - **End Date** *: Last day this pricing is valid
     - **Currency**: Leave empty to use conference currency, or override per period
   - Click **Create**

3. **Add Additional Periods** (recommended sequence):
   - Period 1: "Blind Bird" (announcement to 2 months before)
   - Period 2: "Early Bird" (2 months before to 1 month before)
   - Period 3: "Regular" (1 month before to conference start)
   - Period 4: "Late/On-Site" (during conference)

4. **Edit Period Inline**:
   - Click anywhere on the period header column
   - Fields become editable
   - Adjust name, dates, or currency
   - Click **Save** or **Cancel**

5. **Delete Period**:
   - Hover over period header
   - Click trash icon that appears
   - Confirm deletion (warning: this removes all prices for this period)

[Screenshot Placeholder: Pricing matrix showing periods as columns with edit mode]

#### Creating Booking Options

**Method 1: Auto-Sync from Program Days** (Recommended)

1. **Create Program Days First**:
   - Go to **Program** tab
   - Add conference days (e.g., "Day 1", "Day 2", "Tutorial Day")
   - System automatically creates matching booking options when you return to Booking tab

2. **Review Auto-Created Options**:
   - Navigate to Settings > Booking
   - Options appear as rows in the matrix
   - Each option is linked to its program day (shown with calendar icon badge)

**Method 2: Manual Creation**

1. **Click + Option Button**:
   - Located at top right of Booking tab

2. **Fill in Option Details**:
   - **Name** *: "Full Conference Pass" (example)
   - **Description**: Optional detailed description for attendees
   - **Link to Program Day**: Select from dropdown (optional)
   - **Attendance Type**: Select one:
     - `in_person` - Physical attendance only
     - `virtual` - Online attendance only
     - `hybrid_onsite` - Hybrid event, attending in person
     - `hybrid_online` - Hybrid event, attending online

3. **Save the Option**:
   - Click **Create**
   - Option appears as new row in matrix

4. **Edit Option Name Inline**:
   - Click on option name in matrix
   - Field becomes editable
   - Press Enter to save or Esc to cancel

5. **Link/Unlink Program Days**:
   - Click calendar badge next to option name
   - Dropdown shows available days
   - Select day to link
   - Click X icon to unlink

[Screenshot Placeholder: Add Option modal with all fields]

#### Setting Up the Pricing Matrix

1. **Understanding the Grid**:
   - Each cell = price for one option during one period
   - Empty cells = option not available during that period
   - Currency symbol shows per period if different from conference default

2. **Enter Prices**:
   - Click on any price cell
   - Type the amount (e.g., 500.00)
   - Press Tab or click outside cell to save
   - System auto-saves each change

3. **Pricing Strategy Examples**:

   **Example 1 - Decreasing Discount (Common)**:
   ```
                Early Bird  |  Regular  |  Late
   Tutorial        €100     |   €150    |  €200
   Day 1           €300     |   €400    |  €500
   Day 2           €300     |   €400    |  €500
   Full Pass       €550     |   €700    |  €900
   ```

   **Example 2 - Flash Sales**:
   ```
                Blind Bird  | Early Bird |  Regular
   Full Pass       €400     |    €600    |   €700
   (Only 50 tickets at Blind Bird pricing)
   ```

   **Example 3 - Day-Specific Availability**:
   ```
                Early Bird  |  Regular  |  On-Site
   Tutorial        €100     |   €150    |    —
   Day 1           €300     |   €400    |  €450
   Day 2           €300     |   €400    |  €450
   ```
   (Tutorial not sold on-site, only pre-conference)

4. **Clear a Price**:
   - Click cell
   - Delete value
   - Press Tab or click away
   - Empty cell = option not available in that period

[Screenshot Placeholder: Full pricing matrix with example prices]

#### Currency Configuration Per Period

**Why Use Period-Specific Currencies?**
- Conference in Europe, but early bird pricing in USD for US attendees
- Multi-currency events (different prices for local vs international)
- Currency hedging (lock in exchange rates per period)

**How to Configure**:

1. **Conference Default**:
   - Settings > General > Currency: "EUR"
   - All periods inherit EUR unless overridden

2. **Period Override**:
   - Click on period header to edit
   - Select different currency from dropdown
   - Example: Early Bird = USD, Regular = EUR
   - System shows currency symbol in each cell: "$" or "€"

3. **Currency Lock**:
   - If conference currency is set, period currency field is disabled (grayed out)
   - To allow per-period currencies, remove conference default currency first
   - **Warning**: Changing currencies after registrations exist may cause issues

[Screenshot Placeholder: Period edit showing currency dropdown]

#### Linking Booking Options to Program Days

**Purpose**: Ensures registration options match your schedule. When linked:
- Option name syncs with day name (bi-directional)
- Attendees see session selection during registration
- System knows which days each registrant can access

**How to Link**:

1. **During Option Creation**:
   - Select day from "Link to Program Day" dropdown
   - Only unlinked days appear in list

2. **After Creation** (inline):
   - Click calendar icon badge next to option
   - Popover shows available days
   - Click day to link
   - Green checkmark indicates currently linked day

3. **Update Linked Day**:
   - Click calendar badge
   - Choose different day from list
   - Previous link is removed automatically

4. **Unlink Day**:
   - Click small X button next to calendar badge
   - Or click calendar badge > "Unlink day" at bottom of popover

**Visual Indicators**:
- **Linked**: Blue badge with day name + date
- **Unlinked**: Dashed border badge "Link to day"
- **Hover State**: Badge highlights on mouse over (admins only)

[Screenshot Placeholder: Day picker popover showing available days]

#### Auto-Sync from Program Days

**What Happens Automatically**:

When you create program days, the system:
1. Detects unlinked program days on Booking tab load
2. Creates one booking option per program day
3. Links option to day automatically
4. Copies day name to option name
5. Sets attendance_type to null (you configure manually)

**When Sync Runs**:
- First time you visit Booking tab after creating program days
- Only creates options for **unlinked** days (won't duplicate)
- Silent operation (no confirmation needed)

**Post-Sync Actions**:
1. Review auto-created options
2. Set attendance types (in_person, virtual, etc.)
3. Enter prices in the matrix
4. Adjust option names if needed (syncs back to day name)

**Prevent Sync**:
- If you don't want auto-sync, delete program days before visiting Booking tab
- Or manually create options first (they'll link automatically, preventing sync)

### Automation Details

**Name Synchronization** (Bi-directional):
- User edits option name "Day 1" → "Day 1 - Keynotes"
- System updates program day name to "Day 1 - Keynotes"
- Program schedule reflects new name

**Reverse sync** also works:
- User edits program day name "Day 2" → "Day 2 - Workshops"
- System updates booking option name to "Day 2 - Workshops"

**Sort Order**:
- Options display in ascending sort_order
- Periods display in ascending sort_order

### Edge Cases

**Scenario 1: Period dates overlap**
- System allows overlapping periods (intentional flexibility)
- Attendee sees all active periods during registration
- Use case: Parallel tracks with different pricing

**Scenario 2: Delete option with existing registrations**
- System prevents deletion (shows error message)
- Must cancel or reassign registrations first
- Protects data integrity

**Scenario 3: Delete period with prices set**
- System warns: "This will delete all prices for this period"
- Confirmation required
- Prices permanently removed (no undo)

**Scenario 4: Change currency after setting prices**
- Prices remain as numbers, but currency symbol changes
- **Warning**: Incorrect amounts if not converted
- Best practice: Set currency first, then prices

**Scenario 5: Unlink day from option**
- Option remains, link removed
- Prices stay intact
- Option name no longer syncs with day name

**Scenario 6: Create option without program days**
- Fully supported (manual workflow)
- No day badge appears
- Attendees register without session selection

**Scenario 7: All days already linked**
- Day picker shows "All days are assigned"
- Must unlink existing option first
- One day per option limit enforced

### Validation

**User-Facing Validation**:
- Period name: Required, max 100 characters
- Period dates: Start date ≤ End date
- Option name: Required, max 200 characters
- Price values: Numeric, ≥ 0, max 2 decimal places
- Unique period name per conference
- Unique option name per conference

**Error Messages**:
- "Period name already exists": Choose different name
- "End date must be after start date": Adjust dates
- "Invalid currency code": Use 3-letter ISO code (EUR, not euro)
- "Option name already exists": Choose different name or edit existing
- "Day already linked to another option": Unlink first

### Best Practices

1. **Start with Program Schedule**:
   - Create program days first
   - Let system auto-create options
   - Reduces manual work and keeps names consistent

2. **Use Clear Period Names**:
   - Good: "Early Bird (50% off)", "Regular", "Last Chance"
   - Avoid: "Period 1", "A", "TBD"

3. **Set Attendance Types**:
   - Always specify in_person vs virtual for VAT calculation
   - Affects invoice tax rules

4. **Plan Period Dates Carefully**:
   - No gaps between periods (attendees can't register)
   - Consider timezone issues (use conference local time)
   - Example timeline:
     - Early Bird: Announcement → 60 days before
     - Regular: 60 days before → 14 days before
     - Late: 14 days before → conference end

5. **Price Consistency**:
   - Full conference pass should be < sum of individual days
   - Incentivize early registration (decreasing discounts)
   - Round to friendly numbers (€299 better than €297.50)

6. **Currency Strategy**:
   - Use single currency if possible (simplifies accounting)
   - If multi-currency, lock exchange rates per period
   - Communicate clearly to attendees which currency applies when

7. **Test Before Launch**:
   - Create test registration to verify pricing
   - Check all period/option combinations
   - Verify email confirmations show correct prices

8. **Document Pricing Logic**:
   - Use option descriptions to explain what's included
   - Example: "Full Conference: Includes all keynotes, sessions, lunch, and evening event"

### Common Issues

**Issue: "Booking options not appearing on registration page"**
- Cause: No active period covering current date
- Fix:
  1. Check period dates include today
  2. Ensure at least one option has a price in active period

**Issue: "Prices not saving"**
- Cause: Slow internet or update failure
- Fix:
  1. Wait 2-3 seconds after entering price
  2. Refresh page to verify save
  3. Re-enter price if not persisted

**Issue: "Currency symbol shows wrong currency"**
- Cause: Period currency override
- Fix:
  1. Click period header to edit
  2. Check currency field (may be different from conference default)
  3. Change to desired currency or clear to inherit conference default

**Issue: "Can't delete booking option"**
- Cause: Option linked to existing registrations
- Fix:
  1. Go to Registrations tab
  2. Find registrations using this option
  3. Cancel or replace attendee bookings
  4. Retry deletion

**Issue: "Day picker shows no days"**
- Cause: All days already linked to options
- Fix:
  1. Go to option linked to desired day
  2. Click calendar badge > Unlink
  3. Return to new option
  4. Day now appears in picker

### Related Features

- **Booking Packages** (Section 6): Bundle multiple options together
- **Discount Codes** (Section 7): Apply discounts to specific options/periods
- **Registration**: Attendees select options during signup
- **Program Design**: Days auto-sync to booking options
- **Invoice Management**: Registrations create invoices with booking option line items

---

## 6. Booking Packages

### Overview

Booking Packages allow you to **bundle multiple booking options together** into a single purchasable item with automatic pricing. Packages are compositions of options (e.g., "Tutorial + Day 1 + Day 2" = "Full Experience Package") that simplify registration for attendees and let you create strategic pricing.

**Key Benefits**:
- **Simplified Registration**: Attendees choose packages instead of individual days
- **Dynamic Pricing**: Package price = sum of component option prices per period
- **Discount Strategies**: Set option prices so packages are cheaper than à la carte
- **Flexibility**: Packages and individual options coexist (attendees can mix)

**Example Package**:
```
"Full Conference + Tutorial"
  ├─ Tutorial (€150 early bird)
  ├─ Day 1 (€400 early bird)
  └─ Day 2 (€400 early bird)
  = €950 total (vs €1000 if separate full pass + tutorial)
```

### Prerequisites

Before creating packages:

1. **Booking Options Exist**:
   - At least 2 booking options created
   - Options have prices set in at least one period

2. **Clear Package Strategy**:
   - Determine which options to bundle
   - Decide if package pricing is discounted or premium
   - Name packages clearly for attendees

3. **Access Requirements**:
   - Conference admin role
   - Booking options tab accessible

### Understanding Package Pricing

**Automatic Calculation**:
Packages **do not have fixed prices**. Instead:

```
Package Price (per period) = Sum of component option prices in that period
```

**Example**:
```
Package: "Workshop Pass"
  ├─ Tutorial (Early Bird: €100, Regular: €150)
  └─ Day 1 Workshop (Early Bird: €200, Regular: €300)

Results:
  Early Bird period → €100 + €200 = €300
  Regular period → €150 + €300 = €450
```

**Why This Design?**:
- Simplifies pricing management (change option price once, affects all packages)
- Ensures consistency (no manual errors between packages and options)
- Supports dynamic pricing strategies (early bird affects packages automatically)

**Discount Strategy**:
To offer package discounts:
1. Set individual option prices higher
2. Create package with lower total
3. Adjust option prices to incentivize package purchase

### Step-by-Step Instructions

#### Creating a Package

1. **Navigate to Packages Section**:
   - Go to Settings > Booking
   - Scroll down to "Booking Packages" section

2. **Click + Package Button**:
   - Located in Packages section header

3. **Fill in Package Details**:
   - **Package Name** *: "Full Conference Experience" (example)
   - **Description**: Detailed explanation for attendees
     - Example: "Includes all keynotes, sessions, workshops, lunch, and networking events"
   - **Included Options** *: Select checkboxes for options to include
     - Must select at least 1 option
     - Can select all options if desired
   - **Active**: Toggle on/off (default: on)
     - Inactive packages don't appear in registration

4. **Click Create**:
   - Package appears in table
   - Prices auto-calculate from selected options

[Screenshot Placeholder: Package modal with checkboxes for options]

#### Editing a Package

1. **Click Edit Icon** (pencil) next to package:
   - Modal opens with current values pre-filled

2. **Modify Fields**:
   - Change name or description
   - Add/remove options via checkboxes
   - Toggle active status

3. **Save Changes**:
   - Prices recalculate if options changed
   - Updates immediately in table

#### Viewing Package Pricing

**Packages Section Table**:
- **Package Column**: Name, description, included options (blue badges)
- **Period Columns**: Auto-calculated price for each period
- **Active Column**: Yes/No indicator
- **Actions Column**: Edit, Delete buttons

**Price Display**:
- Shows currency symbol from period
- Formatted amount (e.g., "€950.00")
- "—" if no prices set for any component options in that period

**Example Table View**:
```
Package                    | Early Bird | Regular | Active | Actions
---------------------------|------------|---------|--------|--------
Full Conference            | €550       | €700    | Yes    | ✏️ 🗑️
Tutorial Only              | €100       | €150    | Yes    | ✏️ 🗑️
Conference + Tutorial      | €650       | €850    | Yes    | ✏️ 🗑️
Premium (All Inclusive)    | €800       | €1000   | No     | ✏️ 🗑️
```

[Screenshot Placeholder: Packages table with calculated prices]

#### Deleting a Package

1. **Click Delete Icon** (trash) next to package:
   - Confirmation dialog appears

2. **Confirm Deletion**:
   - Warning: "Are you sure you want to delete 'Package Name'? This action cannot be undone."
   - Click **Delete** to confirm

3. **Effect**:
   - Package removed from list
   - Does **not** affect component options (they remain)
   - Existing registrations using this package are unaffected (historical data preserved)

**Important**: You cannot delete packages with active registrations (system prevents this).

### Package Pricing Strategies

#### Strategy 1: Discount Bundles
Incentivize full conference attendance with package discounts.

```
Individual Prices:
  Day 1: €300
  Day 2: €300
  Day 3: €200
  Total à la carte: €800

Package Price:
  Full Conference: €700
  Savings: €100 (12.5% discount)
```

**When to Use**: Maximize attendee engagement, increase multi-day commitment.

#### Strategy 2: Premium Add-Ons
Create packages with exclusive content at premium pricing.

```
Base Package:
  Standard Conference: €500

Premium Package:
  Standard Conference: €500
  VIP Dinner: €200
  Private Masterclass: €300
  Total: €1000 (vs €950 if sold separately)
```

**When to Use**: Offer exclusive experiences, create tiers, segment audience.

#### Strategy 3: Early Bird Bundles
Combine early registration with package savings.

```
Early Bird Period:
  Full Conference Package: €400 (vs €600 regular)
  Includes: All days + tutorial

Regular Period:
  Full Conference Package: €600
  Includes: All days + tutorial (same content, higher price)
```

**When to Use**: Drive early registrations, improve cash flow planning.

#### Strategy 4: Workshop Passes
Bundle hands-on sessions for technical conferences.

```
Workshop Pass Package:
  Tutorial Day: €150
  Workshop Track (2 sessions): €200
  Lab Access: €100
  Total: €450

Vs individual workshops: €500+ depending on selection
```

**When to Use**: Technical/training conferences, hands-on tracks.

### Edge Cases

**Scenario 1: Package with no prices in a period**
- **Cause**: All component options have empty prices in that period
- **Display**: "—" in period column
- **Effect**: Package not purchasable during that period (hidden from registration)

**Scenario 2: Package with mix of priced and unpriced options**
- **Calculation**: Sum only priced options, ignore unpriced
- **Example**:
  ```
  Package: Tutorial + Day 1
    Tutorial Early Bird: €100
    Day 1 Early Bird: (empty)
  Package Early Bird Price: €100
  ```

**Scenario 3: Deleting an option used in packages**
- **System Behavior**: Prevents deletion, shows error
- **Error**: "Cannot delete option 'Day 1' - used in 3 packages"
- **Fix**: Remove option from all packages first, then delete

**Scenario 4: Currency mismatch between periods in same package**
- **Example**:
  ```
  Early Bird period: USD
  Regular period: EUR
  ```
- **Display**: Shows "$500" for Early Bird, "€600" for Regular
- **Warning**: Confusing for attendees, avoid if possible

**Scenario 5: Package with all options**
- **Fully supported**: Select all checkboxes
- **Use Case**: "All Access Pass"
- **Pricing**: Sum of all option prices

**Scenario 6: Empty package (no options selected)**
- **Validation**: Modal prevents creation, requires at least 1 option
- **Error**: "Package must include at least one booking option"

**Scenario 7: Inactive package with existing registrations**
- **Effect**: Historical registrations remain valid
- **New Registrations**: Package hidden from selection
- **Reporting**: Still appears in registration reports

### Validation

**User-Facing Validation**:
- Package name: Required, max 200 characters
- Description: Optional, max 1000 characters
- Options: At least 1 must be selected
- Duplicate name check (case-insensitive)

**Error Messages**:
- "Package name already exists": Choose different name
- "Must select at least one option": Check at least 1 option
- "Invalid option ID": Option was deleted, refresh page
- "Cannot delete package - used in active registrations": Deactivate first, then delete after event

### Best Practices

1. **Clear Naming**:
   - Good: "Full Conference Pass", "Workshop Bundle", "Premium Experience"
   - Avoid: "Package A", "Option 1+2", "Special"

2. **Detailed Descriptions**:
   - List exactly what's included
   - Mention any exclusions
   - Example: "Includes: All keynotes, breakout sessions, lunch daily, conference bag. Excludes: Pre-conference tutorial, evening networking dinner."

3. **Logical Bundles**:
   - Group related content (all workshops, full conference, etc.)
   - Avoid arbitrary combinations (Day 1 + Day 3 but not Day 2)

4. **Pricing Strategy Clarity**:
   - If offering discounts, communicate savings clearly in description
   - Example: "Save €150 vs individual day passes"

5. **Limit Package Count**:
   - Offer 3-5 packages max (too many = decision paralysis)
   - Classic structure: Basic, Standard, Premium

6. **Active Management**:
   - Deactivate packages once sold out or no longer relevant
   - Don't delete packages with registrations (breaks historical data)

7. **Test Before Launch**:
   - Create test registration for each package
   - Verify prices calculate correctly
   - Check invoice line items

8. **Monitor Popular Packages**:
   - Use registration reports to see package uptake
   - Adjust pricing or offerings based on popularity

### Common Issues

**Issue: "Package price shows €0.00"**
- Cause: No component options have prices set in any period
- Fix:
  1. Go to Booking Options section
  2. Set prices for at least one option in the package
  3. Return to Packages section
  4. Price now displays correctly

**Issue: "Package missing from registration page"**
- Cause: Package inactive OR no prices in current active period
- Fix:
  1. Check package Active status (must be Yes)
  2. Verify current date falls within at least one period
  3. Ensure all component options have prices in active period

**Issue: "Can't add option to package"**
- Cause: Option was deleted or deactivated
- Fix:
  1. Refresh page to reload options list
  2. Check if option appears in Booking Options section
  3. Reactivate option if deactivated

**Issue: "Package prices don't match manual calculation"**
- Cause: User miscalculated or viewing different period
- Fix:
  1. Verify which period column you're viewing
  2. Manually sum option prices in that specific period
  3. Check for empty prices (ignored in sum)

**Issue: "Deleting package fails"**
- Cause: Active registrations using this package
- Fix:
  1. Deactivate package first (prevents new registrations)
  2. Wait until after conference
  3. Archive or cancel affected registrations
  4. Retry deletion

### Related Features

- **Booking Options** (Section 5): Component options bundled into packages
- **Discount Codes** (Section 7): Can apply discounts to packages
- **Registration**: Attendees select packages during signup
- **Invoices**: Package appears as single line item on invoices
- **Reporting**: Package analytics show most popular bundles

---

## 7. Discount Codes

### Overview

Discount Codes enable you to offer price reductions to specific attendees, groups, or during promotional periods. The system supports both **individual codes** (manually created) and **bulk generation** (automatically created from lists of people like sponsors, speakers, or committee members).

**Key Features**:
- **Flexible Discounts**: Percentage-based or fixed-amount
- **Scoped Applicability**: Apply to specific options, periods, or all
- **Usage Limits**: Control total uses per code
- **Combinability**: Stack multiple codes or enforce exclusivity
- **Bulk Generation**: Create hundreds of codes from templates
- **Template Variables**: Personalize codes with names, emails, etc.

**Example Use Cases**:
- Sponsor perks (20% off for sponsor employees)
- Speaker discounts (free registration)
- Early supporters ("EARLYBIRD" for first 100 registrants)
- Committee member discounts
- Alumni pricing
- Promotional campaigns

### Prerequisites

Before creating discount codes:

1. **Booking Options Set Up**:
   - At least one booking option exists
   - Options have prices in at least one period

2. **Access Requirements**:
   - Conference admin role

3. **Planning Checklist**:
   - Define discount purpose (sponsor, speaker, promo, etc.)
   - Determine discount value (percentage or fixed amount)
   - Set usage limits (unlimited or capped)
   - Decide applicability scope (all options or specific)
   - Choose combinability (stackable or exclusive)

### Understanding Discount Types

**Percentage Discounts**:
- Reduces price by % of subtotal
- Example: 20% off
- Applied as: final_price = subtotal × (1 - 0.20)
- Display: "20% off"

**Fixed Amount Discounts**:
- Reduces price by fixed currency amount
- Example: €50 off
- Applied as: final_price = subtotal - 50
- Display: "€50 off"

**Important**: Fixed discounts require currency specified. If multi-currency conference, create separate codes per currency.

### Step-by-Step Instructions

#### Creating Individual Discount Codes

1. **Navigate to Discount Codes Section**:
   - Go to Settings > Booking
   - Scroll to "Discount Codes" section at bottom

2. **Click + Discount Code**:
   - Located in section header

3. **Fill in Code Details**:
   - **Code** *: "EARLYBIRD2024" (example)
     - Alphanumeric, case-insensitive
     - Unique per conference
     - Recommend uppercase for clarity
   - **Description** *: Internal note
     - Example: "20% early bird discount for first 50 registrations"
   - **Discount Type** *: Select `Percentage` or `Fixed Amount`
   - **Discount Value** *: Enter amount
     - Percentage: 1-100 (e.g., 20 for 20%)
     - Fixed: Monetary amount (e.g., 50 for €50 off)
   - **Currency**: Required if Fixed Amount
     - Select from platform currencies

4. **Set Applicability** (Optional):
   - **Applicable Options**: Select checkboxes for options
     - Empty = applies to all options
     - Selected = applies only to those options
   - **Applicable Periods**: Select checkboxes for periods
     - Empty = applies to all periods
     - Selected = applies only during those periods

5. **Configure Limits**:
   - **Valid From**: Start date (optional)
   - **Valid Until**: End date (optional)
   - **Max Uses**: Total redemptions allowed
     - 0 = unlimited
     - Example: 50 for first 50 registrations
   - **Active**: Toggle on/off (default: on)
   - **Combinable**: Toggle on/off (default: off)
     - On = can stack with other combinable codes
     - Off = exclusive, cannot combine

6. **Click Create**:
   - Code appears in table
   - Usage count starts at 0

[Screenshot Placeholder: Discount code modal with all fields]

#### Creating Bulk Discount Codes

**Overview**: Generate hundreds of personalized codes from lists of people (sponsors, speakers, committee, custom lists).

**Use Case Example**: Create unique discount code for each speaker, personalized with their name:
```
Speaker: Jane Doe → Code: CONF2024JaneDoe_001
Speaker: John Smith → Code: CONF2024JohnSmith_002
```

**Step-by-Step**:

1. **Click "Generate Bulk" Button**:
   - Located next to + Discount Code button
   - Opens 2-step wizard modal

2. **Step 1: Configure Settings**

   **Choose Source**:
   - **Sponsors**: All conference sponsors (company contacts)
   - **Speakers**: Accepted CFP applicants
   - **Committee**: Program committee members
   - **Recipient List**: Custom mailing list

   **Select People** (for Sponsors, Speakers, Committee):
   - Table shows all people from source
   - Checkboxes to select individuals
   - "Select All" checkbox in header
   - Shows: Name, Email, Company (if applicable)

   **Select Recipient List** (if source = Recipient List):
   - Dropdown of available lists
   - Shows list name and recipient count
   - Auto-loads recipients when selected

   **Define Templates**:
   - **Description Template** *:
     - Example: Conference discount for [FullName]
   - **Code Template** *:
     - Example: [ConferenceSlug][LastName]_[Counter]
   - **Counter Settings**:
     - Start: Initial counter value (default: 1)
     - Padding: Zero-padding (default: 3 → "001", "002")

   **Template Variables Available**:
   - [ConferenceSlug]: Conference slug
   - [FirstName]: Person's first name
   - [LastName]: Person's last name
   - [FullName]: First + Last name
   - [CompanyName]: Company/organization name
   - [Email]: Email address
   - [Counter]: Sequential number (001, 002, etc.)

   **Shared Settings** (same as individual codes):
   - Discount Type
   - Discount Value
   - Currency (if fixed amount)
   - Applicable Options (checkboxes)
   - Applicable Periods (checkboxes)
   - Valid From / Valid Until
   - Max Uses **per code**
   - Active toggle
   - Combinable toggle

3. **Step 2: Preview & Confirm**

   **Preview Table**:
   - Shows all codes to be generated
   - Columns: Person Name, Code, Description
   - **Duplicate Detection**: Highlights duplicate codes in red
     - Warning: "Duplicate codes detected - adjust template to make unique"
   - **Validation**: Checks for invalid characters, length limits

   **Summary**:
   - Total codes to create: X
   - Duplicates: Y (if any)

   **Actions**:
   - **Back**: Return to step 1 to adjust
   - **Cancel**: Close modal without creating
   - **Generate**: Create all codes (disabled if duplicates)

4. **Generation Completes**:
   - Modal closes
   - Success message: "Created X discount codes"
   - Codes appear in discount table
   - Each code usage_count = 0

[Screenshot Placeholder: Bulk discount wizard Step 1]
[Screenshot Placeholder: Bulk discount wizard Step 2 with preview]

#### Template Variable Examples

**Example 1: Simple Sequential**
```
Template: CONF2024_[Counter]
Result:
  CONF2024_001
  CONF2024_002
  CONF2024_003
```

**Example 2: Personalized with Names**
```
Template: [ConferenceSlug][FirstName][LastName]
Result:
  AGILETD2024JaneDoe
  AGILETD2024JohnSmith
  AGILETD2024SarahJones
```

**Example 3: Company-Based**
```
Template: [CompanyName]_SPONSOR_[Counter]
Result:
  AcmeCorp_SPONSOR_001
  TechInc_SPONSOR_002
  GlobalLLC_SPONSOR_003
```

### Applicability Scoping

**Scope 1: All Options, All Periods** (default)
- No checkboxes selected in modal
- Code applies universally
- Most flexible for attendees

**Scope 2: Specific Options Only**
- Check options in "Applicable Options" section
- Code only reduces price for those options
- Example: "Tutorial discount" applies only to tutorial option

**Scope 3: Specific Periods Only**
- Check periods in "Applicable Periods" section
- Code only valid during those periods
- Example: "Early bird code" only for Early Bird period

**Scope 4: Specific Options AND Periods**
- Check both options and periods
- Code applies only to intersection
- Example: "Workshop early bird" = workshop options during early bird period only

**How Scoping Works (Registration Flow)**:
1. Attendee selects booking options
2. Attendee enters discount code
3. System checks:
   - Code exists and is active?
   - Current date within valid from/until?
   - Selected options match applicable_option_ids? (if set)
   - Current period matches applicable_period_ids? (if set)
   - Usage count < max_uses? (if > 0)
4. If all checks pass: Apply discount
5. If any fail: Show error message

**Applicability Display** (admin UI):
- "All" = empty applicability (universal)
- Blue badges = specific options listed
- Purple badges = specific periods listed

[Screenshot Placeholder: Discount table showing applicability badges]

### Usage Tracking and Limits

**Usage Count**:
- Incremented when registration is confirmed (invoice created)
- Displayed as: usage_count / max_uses (e.g., "5 / 50")
- "∞" if max_uses = 0 (unlimited)

**Max Uses**:
- 0 = unlimited redemptions
- Positive integer = cap on total uses
- Example: 100 = first 100 registrations

**Usage Enforcement**:
- At registration: System checks usage_count < max_uses
- If reached limit: Error "Discount code EARLYBIRD has reached its usage limit"
- Real-time check (prevents race conditions)

### Combinable vs Non-Combinable Codes

**Non-Combinable** (default):
- Only one code allowed per registration
- If attendee enters second code, first is removed
- Enforces exclusive discounts (e.g., choose speaker OR sponsor discount)

**Combinable**:
- Multiple codes can be stacked
- Discounts apply sequentially
- Example:
  ```
  Subtotal: €500
  Code 1: 10% off → €450
  Code 2: €50 off → €400
  Final: €400
  ```

**Rules for Combinability**:
- Non-combinable + non-combinable = Error "Cannot combine codes"
- Combinable + combinable = Allowed, stacks
- Non-combinable + combinable = Error (non-combinable takes precedence)

**Stacking Order** (if combinable):
1. Percentage discounts applied first (in order entered)
2. Fixed discounts applied second (in order entered)

**UI Indicator**:
- Discount table "Comb." column:
  - Purple badge "Yes" if combinable
  - Gray "No" if not combinable

### Common Issues

**Issue: "Discount code not applying at registration"**

**Causes & Fixes**:
1. **Code inactive**: Toggle to active in admin
2. **Outside valid dates**: Adjust Valid From/Until or wait until active period
3. **Usage limit reached**: Increase max_uses or create new code
4. **Wrong options selected**: Check applicable options (attendee's choices must match)
5. **Wrong period**: Check applicable periods (current date must fall in allowed period)

**Issue: "Bulk generation created duplicate codes"**
- Cause: Template doesn't include unique variable like [Counter] or [Email]
- Fix:
  1. Cancel generation if in preview step
  2. Adjust template to include [Counter] or other unique field
  3. Regenerate

**Issue: "Discount shows wrong currency"**
- Cause: Fixed amount code created with wrong currency
- Fix:
  1. Edit discount code
  2. Change currency field to correct currency
  3. Save

**Issue: "Can't delete discount code"**
- Cause: Code has been used (usage_count > 0)
- Fix:
  1. Deactivate code instead (prevents future use)
  2. Or, if you must delete:
     - Find registrations using this code
     - Cancel or update registrations
     - Retry deletion

**Issue: "Combinable codes not stacking"**
- Cause: One code is non-combinable
- Fix:
  1. Check all codes in registration
  2. Verify all have Combinable = Yes
  3. Edit non-combinable codes to enable combinability

### Best Practices

1. **Clear Code Names**:
   - Good: "EARLYBIRD2024", "SPEAKER20", "SPONSOR50"
   - Avoid: "CODE1", "DISC", "ABC123"

2. **Limit Code Sharing**:
   - Unique codes per person (bulk generation)
   - Prevents abuse and tracks individual usage

3. **Set Expiration Dates**:
   - Prevents outdated codes from being used
   - Example: Early bird code expires when regular period starts

4. **Usage Limits for Promotions**:
   - "First 100 registrations get 30% off" → max_uses = 100
   - Creates urgency

5. **Percentage vs Fixed**:
   - Use percentage for tiered discounts (speaker 50%, sponsor 20%)
   - Use fixed for specific campaigns ("€100 off for alumni")

6. **Test Before Launch**:
   - Create test discount code
   - Complete test registration
   - Verify discount applies correctly
   - Check invoice shows discount line item

7. **Document Codes Internally**:
   - Use Description field extensively
   - Example: "Generated for PyConDE 2024 speakers, 100% off, valid until conf start"

8. **Monitor Usage**:
   - Check usage_count / max_uses regularly
   - Extend max_uses if popular codes reach limit
   - Deactivate codes once event starts (if pre-registration only)

9. **Combinability Strategy**:
   - Default: Non-combinable (simplifies pricing)
   - Enable combinable only for small discounts (avoid revenue loss)

10. **Bulk Generation Naming**:
    - Include [Counter] to ensure uniqueness
    - Include [ConferenceSlug] for multi-event accounts
    - Test with 2-3 people first before generating hundreds

### Validation

**User-Facing Validation**:
- Code: Required, 1-50 characters, alphanumeric + underscore/hyphen
- Description: Required, max 200 characters
- Discount Value: Required, numeric, > 0
- Max Uses: Numeric, ≥ 0
- Valid dates: End date ≥ Start date (if both provided)
- Unique code per conference (case-insensitive)
- Discount value ≤ 100 if percentage

**Error Messages**:
- "Discount code already exists": Choose different code
- "Discount value must be between 0 and 100 for percentage discounts": Adjust value
- "Currency required for fixed amount discounts": Select currency
- "End date must be after start date": Adjust dates

### Related Features

- **Booking Options** (Section 5): Discounts apply to options
- **Booking Packages** (Section 6): Discounts apply to packages
- **Booking Periods** (Section 5): Discounts can be period-specific
- **Registration**: Attendees enter codes during signup
- **Invoices**: Discounts appear as line items on invoices
- **Sponsors**: Source for bulk generation
- **CFP Applicants**: Source for bulk generation (speakers)
- **Committee**: Source for bulk generation

---

## 8. Invoice Management

### Overview

SaaSConf provides a comprehensive invoicing system for managing conference payments from sponsors, speakers, and registrations. This section covers invoice creation, lifecycle management, payment integration, and PDF generation.

**Core Capabilities**:
- Multi-template invoices (bank transfer, credit card, credit notes)
- Automated VAT calculation (EU compliance)
- Stripe payment integration
- PDF generation with customizable templates
- ZUGFeRD/Factur-X e-invoicing (EU B2B compliance)
- Invoice correction workflows (replace vs cancel)
- Audit trail and event logging
- Recipient search across sponsors, speakers, registrations

### Invoice Types

**Bank Transfer**:
- Traditional invoice with bank details
- Manual payment reconciliation
- Best for: Large sponsors, public sector, SEPA region

**Credit Card**:
- Stripe-integrated invoice with payment link
- Automated payment tracking
- Best for: Quick payments, international attendees, small amounts

**Credit Note**:
- Negative invoice issued when canceling a paid invoice
- Immutable (cannot edit or delete)
- Auto-generated by system when canceling invoices

### Invoice Lifecycle & Statuses

**Status Flow**:
```
draft → sent → paid
  ↓      ↓       ↓
deleted  ↓   cancelled (creates credit note)
       overdue
         ↓
      reopened → sent
```

**Status Definitions**:
- **Draft**: Editable, no invoice number, can delete
- **Sent**: Invoice number assigned, emailed to recipient, read-only
- **Overdue**: Due date passed, payment not received (auto-updated)
- **Paid**: Payment received (manual or Stripe)
- **Cancelled**: Invoice voided, credit note issued, immutable

**Key Business Rules**:
- Draft invoices: Fully editable, can be deleted
- Sent/Overdue invoices: Read-only except status changes
- Paid invoices: Can be reopened or cancelled (refund + credit note)
- Credit notes: Always "sent" status, cannot be deleted

### VAT Validation & Requirements

The system automatically determines VAT number requirements based on EU tax regulations.

#### When is a VAT Number Required?

**Required (Legally Mandatory)**:
- Virtual or hybrid-online conferences
- Customer in a different EU country than conference country
- B2B transaction (company name provided)

**Why**: Virtual/online services to EU businesses are subject to **reverse charge** under EU VAT regulations. The buyer must have a valid VAT registration number to self-account for VAT in their country.

**Visual Indicator**: Red asterisk (*) next to VAT Number field

---

**Recommended (Best Practice)**:
- In-person or hybrid-onsite conferences
- Customer in the same country or different EU country
- B2B transaction (company name provided)

**Why**: Providing a VAT number helps with tax compliance and enables the customer to reclaim input VAT on the purchase.

**Visual Indicator**: Yellow "(Recommended for B2B)" label

---

**Optional**:
- B2C transactions (no company name)
- Non-EU customers
- Any scenario not covered above

#### VAT Number Validation

When you enter a VAT number, the system performs a 3-stage validation cascade:

1. **Format & Checksum**: Validates the format and mathematical checksum
2. **Regex Fallback**: More lenient pattern matching if strict validation fails
3. **VIES Registry** (EU): Online verification against the official EU VAT registry

**Validation States**:
- ✅ **Valid** (Green checkmark): VAT number verified
- ❌ **Invalid** (Red X): VAT number format or checksum failed
- ⚠️ **Unverified** (Yellow warning): Format is correct but VIES registry unavailable
- 🔄 **Checking** (Spinner): Validation in progress

#### Warning Messages

When creating an invoice with VAT issues, you'll see warning banners:

**Error Warnings (Red)**:
- Displayed when VAT is legally required but missing or invalid
- Contains explanation of the legal requirement
- Can be overridden by tenant admins or super admins

**Recommended Warnings (Yellow)**:
- Displayed when VAT is recommended but missing or invalid
- Contains best practice explanation
- Can be acknowledged by any user

**Info Messages (Blue)**:
- Displayed when VAT requirement rules are applied
- Documents the decision made by the system
- Shows the VAT rule reference for transparency

### Creating an Invoice

1. **Navigate to Invoices Tab**:
   - Go to conference detail page
   - Click **Invoices** tab

2. **Click Create Invoice**:
   - Button located at top right

3. **Fill in Required Fields**:
   
   **Recipient Information**:
   - **Company Name**: Optional, but triggers B2B VAT rules if provided
   - **Street Address** *: Required
   - **Postal Code** *: Required
   - **City** *: Required
   - **Country** *: Required (use dropdown)
   - **VAT Number**: May be required based on scenario (see above)
   - **Email**: Recipient email for invoice delivery

   **Invoice Details**:
   - **Template Type**: bank_transfer, credit_card, or credit_note
   - **Issue Date**: Date invoice created
   - **Due Date**: Payment deadline
   - **Currency**: Select from platform currencies

   **Line Items**:
   - **Description**: What is being purchased
   - **Quantity**: Number of items
   - **Unit Price**: Price per item
   - **Discount**: Optional per-line discount
   - Click **+ Add Line Item** to add more rows

4. **Review VAT Warnings** (if any appear):
   - Red warnings = compliance risk (required VAT missing)
   - Yellow warnings = best practice reminders
   - Blue info = VAT rule applied

5. **Click Save**:
   - Invoice created with status "draft"
   - No invoice number yet (assigned when sent)

[Screenshot Placeholder: Invoice create form with all fields]

**Note**: VAT is automatically calculated based on:
- Conference country
- Customer country
- Attendance type (in-person, virtual, hybrid)
- Customer type (B2B if VAT number provided, B2C otherwise)

### Recipient Search

When creating an invoice, you can search for recipients from existing records to auto-populate address fields:

**Search Sources**:
- **Sponsors**: Company name, email, address auto-filled
- **Speakers**: Name and contact details from CFP system
- **Committee Members**: Contact information from committee
- **Volunteers**: Registered volunteer details
- **Registrations**: Attendee registration data

**How to Use**:
1. Start typing in recipient name field
2. Dropdown shows up to 10 results per category
3. Click result to auto-fill all fields
4. Adjust fields as needed before saving

[Screenshot Placeholder: Recipient search dropdown with category results]

### Sending an Invoice

1. **Open Draft Invoice**:
   - Click invoice in list to open detail panel

2. **Review All Details**:
   - Verify recipient information is correct
   - Check line items and amounts
   - Review VAT warnings (if any)

3. **Click Send Button**:
   - If VAT warnings exist:
     - System prompts for acknowledgment
     - Admins can choose to send anyway after review
   
4. **System Automatically**:
   - Generates invoice number (sequential, per conference)
   - Sets issue_date to today
   - Changes status to "sent"
   - **For Credit Card invoices**: Creates Stripe payment link
   - Sends email to recipient with PDF attachment
   - Logs "invoice_sent" event

5. **Email Contents**:
   - Subject: "Invoice [NUMBER]" or "Credit Note [NUMBER]"
   - Body: Configurable message from settings
   - Attachment: PDF invoice
   - **Credit card only**: "Pay Online" button with Stripe link

**Resending**:
- Click **Send** on already-sent invoice
- Uses existing invoice number and payment link
- Logs event with resend flag

[Screenshot Placeholder: Send invoice dialog with VAT warning acknowledgment]

### Invoice Actions

#### Editing Invoices

**Rules**:
- Only **draft** invoices can be fully edited
- **Sent** invoices are read-only to maintain audit trail
- To modify a sent invoice, use **Replace Invoice** (for billing corrections) or cancel and create new

**Editable Fields** (draft only):
- All recipient fields
- All line items
- Currency, dates, notes
- Template type (can change before sending)

#### Replacing an Invoice (Billing Correction)

Use **Replace Invoice** when the buyer provided incorrect billing information but the invoice should remain valid.

**When to Use**:
- Company name entered incorrectly
- Wrong VAT number provided
- Address needs correction
- PO/procurement code missing or wrong

**How It Works**:

1. **Open Sent/Overdue/Paid Invoice**:
   - Click invoice to open detail panel

2. **Click Replace Invoice**:
   - Button in actions menu

3. **Fill in Replacement Form**:
   - **Reason for Replacement** *: Required documentation
   - **Corrected Billing Fields**: Only change what's wrong
   - **Custom Email Message**: Optional message to recipient

4. **System Automatically**:
   - Cancels old invoice (creates credit note)
   - Creates new invoice with corrected billing information
   - **Keeps all active registrations linked** (no disruption)
   - Sends both credit note and new invoice emails using templates from settings

**Status Inheritance**:
- **Paid invoices**: New invoice inherits "paid" status (customer already paid)
- **Sent invoices**: New invoice gets "sent" status (customer still needs to pay)

**Stripe Handling** (Credit Card Invoices Only):
- **Paid invoices**: No new payment link needed (already paid)
- **Sent invoices**: Old payment link deactivated, new payment link created automatically

**Important Notes**:
- ✅ Registrations stay active and linked
- ✅ At least one billing field must be different from original
- ✅ Email templates from settings are used
- ❌ Cannot replace draft, credit note, or already-replaced invoices
- ❌ Bank transfer invoices don't use Stripe (manual handling)

**Use Case Example**:
> Customer enters "Acme Corp" but their legal entity is "Acme Corporation GmbH". Replace the invoice with the corrected name without affecting their confirmed conference registrations.

[Screenshot Placeholder: Replace invoice dialog with reason and corrected fields]

#### Cancelling an Invoice

Use **Cancel Invoice** when you need to truly cancel an invoice (not just correct billing details).

**Standard Cancellation** (No Registrations):

1. **Open Sent/Overdue/Paid Invoice**:
   - Click invoice in list

2. **Click Cancel Invoice**:
   - Button in actions menu

3. **Enter Cancellation Reason** *:
   - Required documentation
   - Example: "Customer requested cancellation due to event postponement"

4. **System Automatically**:
   - Creates **credit note** (negative invoice)
   - Changes invoice status to **Cancelled**
   - Links credit note to original invoice
   - Sends credit note email using template from settings

---

**Enhanced Cancellation** (With Registrations):

For invoices linked to attendee registrations, you can optionally cancel the registrations when cancelling the invoice.

**Steps**:

1. **Open Invoice with Registrations**:
   - Must be sent, overdue, or paid

2. **Click Cancel Invoice**

3. **Fill in Cancellation Details**:
   - **Cancellation Reason** *: Why invoice is being cancelled
   - **Check "Cancel all registrations"**: If you want to revoke conference access
   - **Cancellation Message for Attendees**: Optional custom message

4. **System Automatically**:
   - Cancels the invoice + creates credit note
   - **Cancels all linked registrations** (status → CANCELLED)
   - Removes conference access for those attendees
   - Keeps user accounts active (can access portal for other events)
   - Sends cancellation email to each attendee using template from settings

**Stripe Refund Handling** (Credit Card Invoices Only):
- **Paid invoices**: System automatically issues full Stripe refund
- **Sent invoices**: System deactivates payment link (prevents payment)
- **Bank transfer**: Manual refund handling required (outside system)

**Important Notes**:
- ✅ Attendees lose access to THIS conference only
- ✅ User accounts remain active for future events
- ✅ All actions logged in audit trail
- ✅ Email templates from settings are used
- ❌ This action cannot be undone
- ❌ Leave "Cancel all registrations" unchecked if you only need to cancel the invoice

**Decision Guide**:
- **Billing correction only?** → Use **Replace Invoice** (keeps registrations active)
- **True cancellation (event cancelled, refund needed)?** → Use **Cancel Invoice** with "Cancel all registrations" checked
- **Wrong invoice sent?** → Use **Cancel Invoice** without checking registrations, then create correct invoice

[Screenshot Placeholder: Cancel invoice dialog with registration cancellation option]

#### Marking as Paid (Bank Transfer)

For bank transfer invoices paid outside the system:

1. **Open Sent Invoice**:
   - Must be template_type = "bank_transfer"

2. **Click Mark as Paid**:
   - Button in actions menu

3. **Enter Payment Details**:
   - **Payment Date** *: When payment received
   - **Comment**: Bank reference number, transaction ID, etc.

4. **System Updates**:
   - Status → "paid"
   - Logs "manual_payment_recorded" event with comment

[Screenshot Placeholder: Mark paid dialog with date and comment fields]

#### Converting to Credit Card

Convert a bank transfer invoice to credit card payment:

1. **Open Draft or Sent Invoice**:
   - Must be template_type = "bank_transfer"
   - Status can be "draft", "sent", or "overdue"

2. **Click Convert to Credit Card**:
   - Button in actions menu

3. **System Automatically**:
   - Changes template_type to "credit_card"
   - Creates Stripe payment link
   - Logs "converted_to_credit_card" event
   - Sends email with updated invoice + "Pay Online" button

**Email Contents**:
- Subject: "Payment Link for Invoice [NUMBER]"
- Message: "Your invoice can now be paid online"
- Button: "Pay Online" (links to Stripe checkout)

**Use Case**: Sponsor prefers online payment over bank transfer.

#### Reopening an Invoice

Reopen a paid, cancelled, or overdue invoice back to "sent" status:

1. **Open Paid/Cancelled/Overdue Invoice**

2. **Click Reopen**:
   - Button in actions menu

3. **Enter Comment** *:
   - Reason for reopening
   - Example: "Payment was reversed by bank, reopening invoice"

4. **System Updates**:
   - Status → "sent"
   - Logs "invoice_reopened" event

**Use Cases**:
- Bank reversal/chargeback
- Mistakenly marked as paid
- Need to resend after cancellation

### Stripe Payment Integration

#### Configuration

**Stripe Settings** (Conference Settings → Stripe Setup):
- **Enabled**: Toggle to activate Stripe payments
- **Secret Key** *: From Stripe Dashboard
- **Publishable Key**: For future client-side use
- **Webhook Secret** *: For webhook signature verification

**Setup Steps**:

1. **Create Stripe Account**:
   - Go to stripe.com
   - Complete business verification

2. **Get API Keys**:
   - Stripe Dashboard → Developers → API keys
   - Copy Secret key and Publishable key

3. **Configure Webhook**:
   - Stripe Dashboard → Developers → Webhooks
   - Click "Add endpoint"
   - Events to send:
     - payment_intent.succeeded
     - payment_intent.payment_failed
     - charge.succeeded
   - Copy Webhook signing secret

4. **Enter Keys in SaaSConf**:
   - Settings → Stripe Setup
   - Paste Secret key, Publishable key, Webhook secret
   - Toggle Enabled to "On"
   - Click Save

[Screenshot Placeholder: Stripe settings form with all keys]

#### How Payment Links Work

**Flow**:
```
1. Admin creates credit card invoice
2. Admin clicks "Send Invoice"
3. System creates Stripe Payment Link
4. Email sent with "Pay Online" button
5. Customer clicks button → Stripe checkout page
6. Customer pays → Stripe creates PaymentIntent
7. Webhook notifies SaaSConf → Invoice status → "paid"
```

**Payment Link vs PaymentIntent**:
- **Payment Link**: Reusable URL to Stripe checkout page
- **PaymentIntent**: Created automatically when customer pays via link
- **Important**: Payment Link has no PaymentIntent ID until customer pays

#### Webhook Handling

**Handled Events**:

1. **payment_intent.succeeded**:
   - Updates invoice status to "paid"
   - Logs "payment_succeeded" event

2. **payment_intent.payment_failed**:
   - Logs "payment_failed" event with error message
   - Does not change invoice status (remains "sent")

3. **charge.succeeded**:
   - Captures charge_id for record-keeping
   - Logs charge details

**Event Logging**:
- All Stripe events logged for audit trail
- Includes: event_type, status, stripe_object_id, amount, error_message
- View in Invoice Detail Panel → Events tab

[Screenshot Placeholder: Invoice events timeline showing Stripe payment]

### Invoice PDF Generation

PDFs are generated automatically when you:
- Send an invoice
- Download an invoice
- Include invoice as email attachment

#### PDF Features

**Standard Features**:
- Conference branding (logo, colors from settings)
- All invoice details (recipient, line items, totals)
- VAT calculation breakdown
- Reverse charge notice (if applicable)
- Bank details or payment link
- QR code for online payment (credit card invoices)

**Customization** (Settings → Invoice Template):
- **Header**: Repeated on every page (logo, company info)
- **Body**: Main invoice content with placeholders
- **Footer**: Repeated on every page (bank details, legal text)

**Placeholders** (40+ available):

**Company** (9 placeholders):
- [COMPANY_NAME], [COMPANY_ADDRESS], [COMPANY_CITY]
- [COMPANY_POSTAL_CODE], [COMPANY_COUNTRY], [COMPANY_VAT]
- [COMPANY_TAX_ID], [COMPANY_TAX_SYSTEM], [COMPANY_LOGO]

**Recipient** (7 placeholders):
- [RECIPIENT_NAME], [RECIPIENT_ADDRESS], [RECIPIENT_CITY]
- [RECIPIENT_POSTAL_CODE], [RECIPIENT_COUNTRY], [RECIPIENT_VAT]
- [RECIPIENT_EMAIL]

**Invoice** (7 placeholders):
- [INVOICE_NUMBER], [ISSUE_DATE], [DUE_DATE], [ITEMS_TABLE]
- [NOTES], [CREDIT_NOTE_NUMBER], [ORIGINAL_INVOICE_NUMBER]

**Financial** (11 placeholders):
- [SUBTOTAL], [TAX_RATE], [TAX_AMOUNT], [TOTAL], [CURRENCY]
- [SECOND_CURRENCY], [SECOND_TOTAL], [SECOND_SUBTOTAL]
- [SECOND_TAX_AMOUNT], [CURRENCY_2], [EXCHANGE_RATE]

**Banking** (3 placeholders):
- [BANK_NAME], [IBAN], [BIC]

**Contact** (4 placeholders):
- [CONTACT_EMAIL], [PHONE], [FISCAL_REP_NAME], [FISCAL_REP_VAT]

[Screenshot Placeholder: Invoice template editor with placeholders panel]

#### Dual Currency Support

For international invoices, display amounts in two currencies:

**Settings** (Conference Settings → Invoice Settings):
- **Second Currency**: USD (example)
- **Exchange Rate**: 1.18 (EUR to USD)

**Placeholders**:
```
[SECOND_CURRENCY] → "USD"
[SECOND_TOTAL] → "$1,180.00"
[SECOND_SUBTOTAL] → "$1,000.00"
[SECOND_TAX_AMOUNT] → "$180.00"
[EXCHANGE_RATE] → "1.18"
```

**Use Case**: Conference in EU (EUR), but international sponsors prefer USD reference.

#### Number Formatting

**Presets** (Settings → Invoice Settings → Number Format):
- **European**: `.` thousands, `,` decimal (e.g., "1.234,56")
- **US**: `,` thousands, `.` decimal (e.g., "1,234.56")
- **French**: space thousands, `,` decimal (e.g., "1 234,56")
- **Swiss**: `'` thousands, `.` decimal (e.g., "1'234.56")
- **Indian**: Lakhs/crores system (e.g., "12,34,567.89")

**Custom Format**:
- Thousands separator: `.`, `,`, space, `'`
- Decimal separator: `.`, `,`
- Decimal places: 0-4

[Screenshot Placeholder: Number format preset selector]

### ZUGFeRD/Factur-X E-Invoicing

#### Overview

ZUGFeRD and Factur-X are identical hybrid e-invoicing standards that combine human-readable PDF with machine-readable XML data in a single file.

**Why ZUGFeRD?**
- **EU Compliance**: German B2B e-invoicing mandatory from 2025-2028
- **Automated Processing**: Customers import invoices directly into accounting systems
- **Single File**: PDF/A-3 format embeds XML, no separate files needed
- **EN 16931 Standard**: Full EU standard compliance

#### Configuration

**Enable ZUGFeRD** (Settings → Invoice Settings → ZUGFeRD Settings):

**Required Fields**:
- **Enabled**: Toggle to activate
- **Profile**: Compliance level (recommended: **EN16931**)
- **Seller VAT ID** *: Required for e-invoicing

**Optional Fields**:
- **Seller Contact Email**: Invoice issuer email
- **Seller Contact Phone**: Invoice issuer phone
- **Payment Terms Code**: Net days (default: 30)
- **Payment Means Code**: Payment method (default: 30 = credit transfer)

**Profile Selection**:

**EN16931 (COMFORT)** - Recommended:
- Full EU standard compliance
- Required for public sector contracts
- Supported by all major accounting software
- Balanced between simplicity and features

**MINIMUM** - Basic:
- Bare minimum fields
- Limited adoption
- Use only if explicitly required

**EXTENDED** - Complex:
- Maximum detail
- Overly complex for most use cases
- Rarely needed

[Screenshot Placeholder: ZUGFeRD settings form]

#### Data Requirements

For ZUGFeRD to generate successfully, invoices must have:

**Seller Requirements**:
- Company Name
- VAT ID
- Country (ISO code: DE, FR, etc.)
- Address, City, Postal Code

**Buyer Requirements**:
- Name
- Country (must be ISO 3166-1 alpha-2)
- Address, City (recommended)
- VAT ID (recommended for B2B)

**Financial Requirements**:
- Invoice Number
- Issue Date, Due Date
- Currency (ISO code: EUR, USD, etc.)
- Subtotal, Tax Rate, Tax Amount, Total

**Line Items**:
- Minimum 1 line item required
- Each item: description, quantity, unit_price, total

#### How It Works

**Automatic Generation**:
1. Admin clicks "Send Invoice" or "Download PDF"
2. System checks if ZUGFeRD enabled in settings
3. Validates invoice data against requirements
4. Generates standard PDF
5. Generates ZUGFeRD XML
6. Embeds XML in PDF as attachment (PDF/A-3b compliance)
7. Returns hybrid PDF

**Graceful Fallback**:
- If validation fails → returns standard PDF (logs warning)
- If XML generation fails → returns standard PDF
- If embedding fails → returns standard PDF
- **Never blocks invoice generation**

**Email Integration**:
- ZUGFeRD PDFs use filename prefix: zugferd_[INVOICE_NUMBER].pdf
- Standard PDFs use: invoice_[INVOICE_NUMBER].pdf
- Clear indicator to recipients

### Contact Persons

Add multiple contact persons to an invoice for coordination:

**Fields** (per contact):
- First Name / Last Name
- Email
- Phone
- Comment/Role (e.g., "Finance Manager", "Procurement Lead")

**Use Case**: Multiple stakeholders at sponsor company (finance contact, marketing manager, procurement).

**How to Add**:
1. Open invoice in edit mode
2. Scroll to Contact Persons section
3. Click + Add Contact
4. Fill in fields
5. Save invoice

[Screenshot Placeholder: Invoice contact persons section]

### Invoice Events (Audit Trail)

All invoice actions are logged:

**Event Types**:
- Creation, Updates, Status changes
- VAT calculations
- Stripe payments/refunds
- Email sends
- Payment link creation
- Refund initiated/succeeded/failed

**View Events**:
1. Open invoice in detail panel
2. Click **Events** tab
3. Timeline shows all events with:
   - Timestamp
   - Event type
   - Status (succeeded, failed, pending)
   - User who triggered
   - Stripe object IDs (if applicable)
   - Error messages (if failed)

**Event Icons**:
- ✓ Success (green)
- ✗ Error (red)
- ⟳ Pending (gray)

[Screenshot Placeholder: Invoice events timeline]

### Best Practices

1. **Always Collect VAT Numbers for B2B EU Transactions**:
   - Required by law for reverse charge scenarios
   - Recommended for all B2B invoices
   - Use built-in validation (green checkmark)

2. **Verify VAT Numbers Before Sending**:
   - Invalid VAT numbers can cause tax audit issues
   - Check for green checkmark indicator
   - Re-validate if VIES was unavailable (yellow warning)

3. **Document VAT Decisions**:
   - Review VAT requirement banners
   - Check rule reference
   - Keep records of admin overrides

4. **Create Drafts Early**:
   - Lock in pricing and terms before event
   - Easy to update before sending
   - No invoice number until sent (clean numbering)

5. **Review VAT Warnings Carefully**:
   - Red (error) warnings = compliance risks
   - Yellow (warning) warnings = best practice reminders
   - Don't ignore warnings, address if possible

6. **Use Recipient Search**:
   - Pre-populate address fields accurately
   - Reduces data entry errors
   - Consistent data across system

7. **Add Internal Comments**:
   - Use "Internal Comment" field for notes
   - Not visible to customers
   - Useful for team coordination

8. **Track Payment Status**:
   - Check invoice events for payment confirmations
   - Follow up on overdue invoices
   - Use credit card option for faster payment

9. **Choose the Right Correction Method**:
   - **Billing info wrong?** → Use "Replace Invoice" (fast, keeps registrations active)
   - **Amount or items wrong?** → Cancel and create new invoice
   - **True cancellation needed?** → Use "Cancel Invoice" with registration options

10. **Handle Registrations Carefully**:
    - Review before checking "Cancel all registrations"
    - Only use for true cancellations (event cancelled, full refund)
    - Use "Replace Invoice" for billing corrections to avoid disruption

11. **Communicate with Attendees**:
    - System sends automatic emails using templates from settings
    - Add custom messages for clarity (optional field in dialogs)
    - Follow up personally for sensitive situations (full event cancellation)

12. **ZUGFeRD Best Practices**:
    - Use EN16931 profile for maximum compatibility
    - Validate invoices before sending to customers
    - Test with customer's accounting software first
    - Ensure buyer country is ISO code (DE, not Germany)

### Troubleshooting

**Issue: VAT Number Won't Validate**

**Yellow "Unverified" warning**:
- VAT format is correct, but VIES registry is temporarily down
- Safe to send invoice
- Recommend customer double-check their VAT number

**Red "Invalid" error**:
- VAT format or checksum failed
- Ask customer to verify their VAT number
- Check country code matches (e.g., DE for Germany)
- Admins can override if certain the number is correct

---

**Issue: VAT Rate is Wrong**
- Fix:
  1. Check conference country setting
  2. Check customer country setting
  3. Review attendance type (in-person vs virtual)
  4. Check for tenant-specific rate overrides

---

**Issue: Invoice Stuck in Draft**
- Cause: Missing required fields
- Fix:
  1. Verify recipient name, complete address
  2. Check at least one line item exists with description
  3. Ensure currency selected
  4. Fill in all required fields marked with *

---

**Issue: Can't Edit Sent Invoice**
- Cause: By design to maintain audit compliance
- Fix for Billing Corrections (wrong name, address, VAT, PO):
  1. Use **Replace Invoice** feature
  2. Enter corrected billing information
  3. System automatically handles cancellation and reissuance
  4. Registrations stay active
- Fix for Other Changes (amounts, line items, dates):
  1. Cancel the sent invoice (creates credit note)
  2. Create new invoice with correct details
  3. Send the new invoice

**Tip**: Always use "Replace Invoice" for simple billing corrections to avoid disrupting attendee registrations.

---

**Issue: Credit Card Payment Failed**
- Cause: Card declined, customer closed window, link expired
- Fix:
  1. Check invoice events for error details
  2. Customer can retry using same payment link
  3. Or create new invoice if needed
  4. Contact customer to resolve payment issue

---

**Issue: Replace Invoice Says "No Fields Changed"**
- Cause: At least one billing field must be different from original
- Fix:
  1. Verify you're actually changing a value
  2. Check if you typed exact same information
  3. Try changing company name, VAT number, or address
  4. If you need to change amounts/line items (not billing), cancel and create new instead

---

**Issue: Registrations Cancelled by Mistake**
- Cause: Checked "Cancel all registrations" when shouldn't have
- Fix (manual recovery):
  1. Manually reactivate registrations in Registrations tab
  2. Manually restore conference access for affected users
  3. Contact affected attendees to explain error
- Prevention:
  - Only check "Cancel all registrations" for true cancellations (event cancelled, refund issued)
  - For billing corrections, always use "Replace Invoice" instead

---

**Issue: Stripe Payment Not Marked as Paid**
- Cause: Webhook not configured or failed
- Fix:
  1. Verify webhook configured in Stripe Dashboard
  2. Check webhook secret correct in conference settings
  3. Check invoice events for PAYMENT_FAILED
  4. Use manual sync: Click "Sync Stripe Payment" button on invoice
  5. Or bulk sync: Settings → Invoices → "Sync All Stripe Payments"

---

**Issue: ZUGFeRD PDF Fails Validation**
- Cause: Missing required data or incorrect format
- Fix:
  1. Check validation status indicator in invoice detail panel
  2. Ensure buyer country is ISO code (DE, not Germany)
  3. Verify seller VAT ID in settings
  4. Fill in missing required fields
  5. Regenerate PDF

---

**Issue: Payment Link Not Working**
- Cause: Stripe not configured or link deactivated
- Fix:
  1. Verify Stripe enabled in conference settings
  2. Check secret key valid
  3. Check events for payment link deactivation
  4. If deactivated: Convert to credit card again to create new link

---

**Issue: Email Not Sending**
- Cause: SMTP settings or recipient email issue
- Fix:
  1. Verify recipient email valid
  2. Ensure PDF generation successful
  3. Test with different email address

### Related Features

- **Registration**: Attendee replacement affects invoices
- **Booking Options** (Section 5): Attendance type affects VAT calculation
- **Sponsors**: Invoice recipients from sponsor records
- **CFP Applicants**: Invoice recipients from speakers
- **Settings**: Email templates, company info, invoice templates

---

**End of Sections 5-8**

# SaaSConf Tenant UI Handbook - Part 2 (Filtered)
## Sections 26-50 - User-Focused Content Only

---

## Attendee Management (Continued)

### Session Selection

Admins can select or change tutorial/workshop sessions for:
- Main booking option (if the option has bookable sessions)
- Each add-on item (if the item has bookable sessions)

Session selection displays:
- Available session groups (e.g., "Monday Morning Tutorials")
- Available sessions per slot
- Speaker names and session titles
- Current selection highlighted

![Screenshot: Expanded attendee row showing all detail sections]

### Add-on Items Management (Admin Only)

Admins can add items to pending registrations:

**Adding an Item:**
1. Expand an attendee row (status must be "Registered - Pending Invoice")
2. Click "+ Add Item" in the Add-on Items section
3. Select item type:
   - Booking Option: Select from active booking options dropdown
   - Tutorial: Creates a pending tutorial assignment (session selected later)
4. Click "Add" to attach the item to the registration

**Removing an Item:**
1. Expand an attendee row
2. Click "Remove" next to the item (only visible for pending registrations)
3. Item is immediately removed (no confirmation dialog)

**Session Assignment:**
- For booking option items: Session selector displays if option has bookable sessions
- For tutorial items: Marked as "to be selected" until session is assigned
- Session changes trigger immediate updates

![Screenshot: Add item form with booking option dropdown]

### Invoice Links

Invoice numbers in the expanded view are clickable:

**Behavior:**
1. Click on an invoice number
2. Page navigates to the Invoices tab with the invoice highlighted
3. URL includes `?tab=invoices&invoice=<invoice_id>` for direct linking

This enables quick navigation from attendee to their invoice details without manual searching.

![Screenshot: Invoice number as clickable link in attendee details]

## Exporting Attendee Lists

### CSV Export Function

The Export CSV button (top-right of the page) generates a downloadable CSV file with all attendee data.

**CSV Export Features:**
- Available to: Admins only
- Records included: Up to 50,000 registrations (safety cap)
- Filters: Export includes ALL attendees (search/filters do not apply to export)
- File naming: `<conference_abbreviation>_attendees.csv`

**CSV Columns:**
1. First Name
2. Last Name
3. Email
4. Phone
5. Job Title
6. Department
7. Pronouns
8. Company Name
9. Booking Option Name
10. Main Session Name
11. Add-on Items (comma-separated list)
12. Registration Mode
13. Status
14. Invoice Number
15. Created At
16. Updated At
17. Notes
18. Billing Contact Email

![Screenshot: Export CSV button in header]

### Export Performance Optimization

**Export Process:**
1. Click "Export CSV" button
2. Button shows "Exporting..." state
3. Server generates CSV in memory
4. Browser downloads file with conference-specific name
5. Button returns to normal state

**Time Estimates:**
- 100 attendees: < 1 second
- 1,000 attendees: 2-3 seconds
- 10,000 attendees: 15-20 seconds
- 50,000 attendees: ~60 seconds (maximum)

![Screenshot: Exporting state with disabled button]

### Export Use Cases

**Common Export Scenarios:**

**Badge Printing:**
Export attendee list and import into badge printing software (name, company, session).

**Email Communications:**
Extract email addresses for bulk email campaigns (use Billing Contact Email for billing notifications).

**Session Planning:**
Use Main Session Name and Add-on Items columns to determine room capacity needs.

**Financial Reconciliation:**
Export with Invoice Number to reconcile payments against accounting systems.

**Volunteer Assignments:**
Export attendee contact info for volunteer coordinators (meals, special accommodations).

**Post-Event Analysis:**
Export for post-conference reporting, attendance statistics, and demographic analysis.

## Automation

### Real-time Updates

The Attendees tab uses automatic data management:

**Query Invalidation:**
- Attendee list refreshes when registrations are created/deleted
- Invoice data refreshes when invoices are generated/updated
- Statistics recalculate automatically when data changes

**Stale-While-Revalidate:**
- Cached data displays immediately on tab switch
- Background fetch updates data if stale
- Smooth user experience with no loading spinners for cached data

### Search Debouncing

Search input implements 300ms debouncing:

**Benefits:**
- Reduces server load by preventing query on every keystroke
- Smooth typing experience with no lag
- Immediate feedback with client-side loading state

### Status Synchronization

Registration status is read-only and automatically synchronized with invoice status:

**Status Flow:**
1. Registration created → Status: "Registered - Pending Invoice"
2. Invoice generated → Status: "Invoiced"
3. Invoice paid → Status: "Paid"
4. Invoice cancelled → Status: "Cancelled"

Users cannot manually change status; it's determined by the invoice lifecycle.

## Edge Cases

### Deleted Booking Options

**Scenario:** A registration references a booking option that has been deleted.

**Behavior:**
- Booking option name displays as "(deleted)"
- Add-on items with deleted options show "(deleted)"
- Session selectors do not load for deleted options
- Export CSV includes "(deleted)" for option name

**Prevention:**
- Booking options should be deactivated rather than deleted
- System maintains referential integrity via foreign keys

### Large Attendee Lists

**Scenario:** Conference has 10,000+ attendees.

**Behavior:**
- Initial load shows first 100 attendees (configurable)
- Search queries remain capped at 100 results
- Export CSV handles up to 50,000 records
- Statistics calculate across all attendees (no pagination)

**Performance:**
- Table renders quickly due to 100-record limit
- Statistics use aggregation queries for speed

### Missing Invoice Data

**Scenario:** Invoice data has not loaded or billing profile is missing.

**Behavior:**
- Invoice column displays "—" (em dash)
- Invoice link in expanded view displays "—"
- Export CSV includes empty invoice number field
- No errors displayed to user

### Empty Session Selections

**Scenario:** Booking option has sessions available, but attendee has not selected one.

**Behavior:**
- Main Session column displays "—"
- Session selector in expanded view shows no selection
- Add-on items with no session selection show "to be selected" badge
- Export CSV includes empty Main Session Name field

### Concurrent Admin Edits

**Scenario:** Two admins edit the same registration simultaneously.

**Behavior:**
- Last write wins (no optimistic locking)
- Both admins see success messages
- Query invalidation triggers data refresh for both users
- Second admin's changes overwrite first admin's changes

**Best Practice:**
- Coordinate registration edits via team communication
- Use Registration tab for detailed edits (better audit trail)

### Filter Combinations

**Scenario:** User applies multiple filters that return zero results.

**Behavior:**
- Table displays "No attendees match the current filters"
- Statistics remain visible (show all attendees, not filtered subset)
- "Clear filters" button visible and functional
- Export CSV still exports all attendees (filters don't apply to export)

![Screenshot: Empty state with active filters]

## Validation

### Search Input Validation

**Validation Rules:**
- No minimum length requirement
- Special characters allowed (for international names)
- Leading/trailing whitespace trimmed before query
- Empty search returns all attendees

**No Error States:**
- Search never fails; worst case is zero results

### Filter Validation

**Status Filter:**
- Only predefined status values accepted
- Invalid status defaults to "All Statuses"

**Booking Option Filter:**
- Only valid booking option IDs accepted
- Deleted booking options filtered out of dropdown

### Export Validation

**Pre-Export Checks:**
- Export button disabled if no attendees exist
- Export button disabled during export (prevents duplicate requests)
- Admin permission required (non-admins don't see button)

**Export Errors:**
- Network errors display error banner
- Server errors display parsed error message
- Partial downloads handled by browser (not application concern)

### Session Selection Validation

**Booking Option Sessions:**
- Only sessions associated with the booking option are selectable
- Invalid session IDs rejected by backend
- Session selection can be cleared (set to null)

**Tutorial Items:**
- Tutorial type items cannot have booking option assigned
- Booking option type items cannot have tutorial session directly assigned

## Best Practices

### Tab Selection Strategy

**Use the Attendees tab for:**
- Quick overviews and statistics
- Searching for specific attendees by name/email
- Exporting attendee lists for external use
- Viewing session/tutorial distribution across attendees
- Getting attendance counts by booking option

**Use the Registration tab for:**
- Creating new registrations
- Modifying registration details (before invoicing)
- Managing billing information
- Adding/removing registration items
- Deleting pending registrations
- Replacing paid attendees with new attendees

**Rule of Thumb:**
- Attendees tab = Read-only operations, reporting, exports
- Registration tab = Write operations, detailed management

### Search Performance

**Optimize Searches:**
- Use full email addresses for exact matches
- Use last names for faster results (more selective than first names)
- Combine search with status filter to narrow results

**Avoid:**
- Single-character searches (returns too many results)
- Searching for common words (e.g., "Inc", "LLC")

### Export Workflow

**Before Exporting:**
1. Ensure all registrations are finalized (no pending changes)
2. Verify invoice generation is complete
3. Check that session assignments are finalized

**After Exporting:**
1. Open CSV in Excel/Sheets to verify data completeness
2. Check for "(deleted)" booking options and resolve
3. Verify email addresses are valid (no placeholders)

**Export Frequency:**
- Export daily during early registration for tracking trends
- Export weekly during active registration period
- Export final list 1 week before conference for badge printing

### Session Assignment Workflow

**Tutorial Selection Process:**
1. Create registration with main booking option
2. Select tutorial/session via session selector in expanded view
3. Add any add-on items (workshops, extra tutorials)
4. Assign sessions to each add-on item
5. Generate invoice once all sessions are selected

**Avoid:**
- Generating invoices before finalizing session selections
- Changing sessions after invoice is sent (requires invoice regeneration)

### Statistics Monitoring

**Track These Metrics:**
- Total active attendees (in page header) - overall registration progress
- Attendees by booking option - revenue breakdown, pricing strategy validation
- Attendees by session - room capacity planning, speaker notifications

**Use Statistics for:**
- Early Bird vs. Regular pricing effectiveness
- Tutorial popularity (plan future offerings)
- Virtual vs. In-Person attendance trends
- Add-on item adoption rates

### Data Hygiene

**Regular Maintenance:**
- Delete pending registrations that are abandoned (no response after 1 week)
- Verify company names are spelled consistently
- Check for duplicate registrations (same email address)
- Ensure billing contact emails are valid

**Pre-Conference Cleanup:**
- Cancel unpaid registrations 1 week before conference
- Export final attendee list for onsite staff
- Verify all paid attendees have session selections

## Troubleshooting Common Issues

### "No attendees match the current filters"

**Cause:** Active filters exclude all attendees.

**Solution:**
1. Click "Clear filters" button
2. Remove filters one by one to identify the exclusionary filter
3. Adjust filter criteria to match existing data

### Export CSV Button Disabled

**Cause 1:** No attendees exist in the system.

**Solution:** Create at least one registration via Registration tab.

**Cause 2:** Export is already in progress.

**Solution:** Wait for current export to complete (button shows "Exporting...").

**Cause 3:** User lacks admin permissions.

**Solution:** Request admin access from conference admin or tenant admin.

### Invoice Number Not Displayed

**Cause 1:** Invoice has not been generated yet.

**Solution:** Generate invoice via Invoices tab.

**Cause 2:** Billing profile is missing.

**Solution:** Edit registration and add billing profile.

**Cause 3:** Invoice query has not loaded.

**Solution:** Refresh page to trigger invoice data fetch.

### Session Selector Not Appearing

**Cause 1:** Booking option has no bookable sessions configured.

**Solution:** Add sessions to the booking option in Program Design tab.

**Cause 2:** Booking option has been deleted.

**Solution:** Cannot assign sessions to deleted options; recreate booking option or reassign attendee.

**Cause 3:** User is not an admin.

**Solution:** Session selector only displays for admins; non-admins see read-only session name.

### Statistics Show Zero for All Booking Options

**Cause 1:** All registrations are cancelled.

**Solution:** Statistics exclude cancelled registrations; this is expected behavior.

**Cause 2:** Registrations exist but booking options have been deleted.

**Solution:** Recreate booking options or reassign attendees to active options.

**Cause 3:** Filter is active and excludes all results.

**Solution:** Clear filters; statistics calculate across all attendees regardless of filters.

### Search Returns No Results

**Cause 1:** Search term does not match any attendee name or email.

**Solution:** Try alternative spellings, shorter search terms, or browse full list.

**Cause 2:** Status filter excludes matching attendees.

**Solution:** Clear status filter and search again.

**Cause 3:** Attendees have not been created yet.

**Solution:** Create registrations via Registration tab.

### Export Fails with Error

**Cause 1:** Network error during export.

**Solution:** Check internet connection and retry export.

**Cause 2:** Server timeout (too many attendees).

**Solution:** Contact system administrator to increase export timeout limit.

**Cause 3:** Permission error.

**Solution:** Verify admin access to conference.

---

## News Module

The News module enables conference organizers to create, publish, and distribute news articles and announcements to conference participants. Published articles appear in the applicant portal and can be sent via email to targeted recipient groups. The module integrates with the Screen Overlays system to display important announcements on registration pages.

### Accessing the News Module

**Navigation:**
1. Navigate to your conference from the Conferences list
2. Click the News tab in the conference detail navigation
3. The News Articles page displays all articles (drafts and published) for the current conference

Screenshot Placeholder:
```
[Screenshot: Conference detail page with News tab highlighted in navigation bar]
```

**Module Requirements:**
- The News module must be enabled for your tenant
- You must have admin or organizer role for the conference

**Empty State:**
When no articles exist, you'll see an empty state message prompting you to create your first news article.

Screenshot Placeholder:
```
[Screenshot: Empty state showing "No news articles" message with "Create your first news article to share updates with attendees" text]
```

### Creating News Posts

Articles are created in draft mode by default, allowing you to prepare content before making it visible to attendees.

**Creating a New Article:**

1. Click the New Article button (top-right of the News tab)
2. The article creation modal opens with the following fields:
   - Title (required): Article headline (max 500 characters)
   - Body (required): Rich text content using the visual editor
   - Screen Overlay (optional): Link to an existing screen overlay for portal display

Screenshot Placeholder:
```
[Screenshot: "New Article" modal showing title field, rich text editor, and overlay selector]
```

**Form Validation:**
- Title: Cannot be empty or whitespace-only
- Body: Must contain at least one character of content
- Both fields are sanitized server-side (HTML tags allowed, scripts stripped)

**Saving the Article:**
- Click Save to create the article as a draft
- The article appears in the articles list with a "Draft" badge
- Article metadata includes:
  - Author name (automatically captured from your user profile)
  - Creation timestamp
  - Last update timestamp

**Auto-Save Behavior:**
The editor does NOT auto-save. Always click Save before closing the modal to preserve your work.

### Rich Text Editor Usage

The News module uses a full-featured rich text editor with extensive formatting capabilities.

**Text Formatting:**
- Basic: Bold, italic, underline, strikethrough
- Font Family: Arial, Georgia, Times New Roman, Courier, Verdana
- Font Size: 6px to 40px (XXX-Small to XXX-Large)
- Text Color: Color picker for custom text colors
- Highlight: Background color highlighting
- Clear Formatting: Remove all styles from selected text

Screenshot Placeholder:
```
[Screenshot: Rich text editor toolbar showing formatting buttons - undo/redo, font family dropdown, font size dropdown, bold/italic/underline buttons]
```

**Structural Elements:**
- Headings: H1, H2, H3, H4, H5, H6
- Paragraphs: Normal paragraph text (default)
- Lists: Bulleted lists, numbered lists, task lists (checkboxes)
- Blockquotes: Indented quote blocks
- Code Blocks: Monospaced code formatting
- Horizontal Rules: Visual dividers

Screenshot Placeholder:
```
[Screenshot: Toolbar section showing heading dropdown (H1-H6), paragraph, list buttons (bullet, numbered, task), blockquote, code, and horizontal rule]
```

**Advanced Features:**

**Links:**
1. Select text to link
2. Click the link icon in the toolbar
3. Enter the URL in the prompt (e.g., `https://example.com`)
4. Click OK to insert the link
5. To remove a link: select linked text, click link icon, leave URL empty, click OK

**Images:**
Three ways to add images:
1. URL Method: Click image icon → enter image URL → click OK
2. Drag & Drop: Drag image files directly into the editor
3. Paste: Copy image from clipboard → paste into editor

**Image Requirements:**
- Maximum size: 5 MB
- Supported formats: Any browser-supported image format (JPEG, PNG, GIF, WebP)
- Images are embedded as base64 data URLs (stored in the article body)

Screenshot Placeholder:
```
[Screenshot: Rich text editor with an embedded image and visible image resize handles]
```

**Tables:**
1. Click the table icon in the toolbar
2. A 3x3 table with header row is inserted
3. Use table toolbar buttons to:
   - Add/delete rows and columns
   - Merge/split cells
   - Delete entire table
   - Toggle header row/column

Screenshot Placeholder:
```
[Screenshot: Rich text editor showing a table with table manipulation buttons (add row, add column, delete row, etc.) in the toolbar]
```

**YouTube Embeds:**
1. Click the YouTube icon in the toolbar
2. Enter the YouTube video URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
3. Click OK to embed the video player

**Text Alignment:**
- Left align
- Center align
- Right align
- Justify

**Undo/Redo:**
- Use the undo/redo buttons in the toolbar
- Keyboard shortcuts: Cmd+Z (undo), Cmd+Shift+Z (redo) on Mac; Ctrl+Z, Ctrl+Y on Windows

**Character Counter:**
If a maximum length is configured (not default for news), a character counter appears at the bottom of the editor showing current/maximum characters.

### Publishing vs Draft Status

Articles exist in one of two states:

**Draft Status:**
- Badge: Gray "Draft" badge
- Visibility: Visible only to conference admins in the admin interface
- Portal: NOT visible to applicants in the portal
- Published At: `null` (no publication timestamp)
- Use Case: Prepare content, review internally before release

**Published Status:**
- Badge: Green "Published" badge
- Visibility: Visible to conference admins AND eligible portal users
- Portal: Visible to all applicants who have access to the conference
- Published At: Timestamp of when the article was first published
- Use Case: Active news articles shared with conference participants

Screenshot Placeholder:
```
[Screenshot: News articles list showing both draft and published articles with their respective badges]
```

**Publishing an Article:**

1. Locate the draft article in the articles list
2. Click the eye icon (publish button) next to the article
3. Confirm the publish action in the dialog:
   - Message: "Are you sure you want to publish '[Article Title]'? It will become visible to all portal users."
   - Click Publish to confirm
4. The article status updates to "Published" with a green badge
5. The `published_at` timestamp is automatically set to the current date/time

Screenshot Placeholder:
```
[Screenshot: Publish confirmation dialog with warning message and Publish/Cancel buttons]
```

**Unpublishing an Article:**

1. Locate the published article
2. Click the eye-slash icon (unpublish button)
3. Confirm the unpublish action:
   - Message: "Are you sure you want to unpublish '[Article Title]'? It will no longer be visible to portal users."
   - Click Unpublish to confirm
4. The article reverts to draft status
5. The `published_at` timestamp is cleared

**Important Notes:**
- Unpublishing an article immediately hides it from the portal
- Unpublishing does NOT delete the article or its content
- You can re-publish an article multiple times (the timestamp updates each time)
- Portal users who previously viewed the article will no longer see it after unpublishing

### Visibility to Portal Users

**Who Can See Published Articles:**

Portal users (CFP applicants and committee members) can view published news articles if they have access to the conference through:
- Paper Submission: Submitted a paper to a CFP linked to the conference
- Committee Membership: Assigned as a committee member (reviewer, chair, etc.) for the conference

**Portal Display:**

Location: Portal → News page (`/portal/news`)

**Article List View:**
- Articles are displayed as cards in reverse chronological order (newest first)
- Each card shows:
  - Conference name badge (blue pill badge)
  - Article title
  - Publication date and time (formatted: "January 15, 2026, 3:45 PM")
  - Preview of first 200 characters of body text (plain text, HTML stripped)
  - "Read more" / "Show less" toggle for articles exceeding 200 characters

Screenshot Placeholder:
```
[Screenshot: Portal news page showing multiple news article cards with conference badges, titles, dates, and preview text]
```

**Full Article View:**
- Click "Read more" to expand the full article content
- Rich text formatting is preserved (HTML rendered)
- Images, tables, videos, and links are all interactive
- Click "Show less" to collapse back to preview

Screenshot Placeholder:
```
[Screenshot: Expanded news article in portal showing full rich text content with formatting, images, and embedded video]
```

**Filtering:**
- Portal users see articles from ALL conferences they have access to
- Articles are sorted by publication date (most recent first)
- No category or tag filtering (linear chronological feed)

**Refresh Rate:**
- Portal news data refreshes every 30 seconds automatically
- Manual refresh: reload the page or navigate away and back

**No Articles State:**
If a portal user has no accessible conferences or no articles are published, they see:
- Empty state message: "No news articles yet."
- Gray dashed border box

### Email Notifications on Publish

Published articles can be distributed via email to targeted recipient groups.

**Important:** Publishing an article does NOT automatically send emails. Email distribution is a separate, explicit action.

**Sending a News Article by Email:**

1. Ensure the article is published (draft articles cannot be sent)
2. Locate the published article in the articles list
3. Click the envelope icon (send email button) next to the article
4. The "Send News Article" modal opens

Screenshot Placeholder:
```
[Screenshot: News article row with publish icon (green eye), send email icon (envelope), edit icon, and delete icon]
```

**Send Email Modal:**

**Recipient Selection:**
The modal provides filtering options to target specific groups:

1. All Applicants (checkbox, checked by default)
   - Sends to all applicants who submitted papers to CFPs linked to this conference
   - When checked, paper status and committee role filters are disabled

2. Filter by Paper Status (dropdown, disabled if "All Applicants" is checked)
   - Options:
     - All statuses (default)
     - Submitted
     - In Evaluation
     - Final Consideration
     - Accepted
     - Rejected
   - Only sends to applicants whose papers have the selected status

3. Filter by Committee Role (text input, optional)
   - Enter a committee role name (e.g., "Reviewer", "Chair")
   - Case-sensitive exact match
   - Can be combined with paper status filter
   - Sends to committee members with the specified role

Screenshot Placeholder:
```
[Screenshot: "Send News Article" modal showing article title, "All applicants" checkbox, paper status dropdown, and committee role input]
```

**Recipient Preview:**
Below the filters, a text description shows who will receive the email:
- "all applicants" (if All Applicants is checked)
- "applicants with paper status 'Accepted'" (if status filter is active)
- "committee members with role 'Reviewer'" (if committee role filter is active)
- "applicants with paper status 'Submitted' and committee role 'Chair'" (if both filters are active)

**Sending the Email:**

1. Configure recipient filters as desired
2. Click Send button
3. A confirmation warning appears:
   - "Are you sure you want to send this email?"
   - "This will send '[Article Title]' to [recipient description]. This action cannot be undone."
   - Click Back to return to filters, or Yes, Send Emails to proceed

Screenshot Placeholder:
```
[Screenshot: Confirmation warning with amber background showing "Are you sure you want to send this email?" message]
```

4. The system processes the request:
   - Query matching recipients from the database
   - Send individual emails to each recipient
   - Display progress indicator ("Sending...")

5. Success confirmation:
   - Green success banner: "Email sent to X recipients"
   - Modal auto-closes after 2 seconds

Screenshot Placeholder:
```
[Screenshot: Success message "Email sent to 47 recipients" in green banner]
```

**Error Handling:**
- If no recipients match the criteria: "No recipients found matching the criteria" (404 error)
- If the email service fails: "Failed to send emails" (red error banner)

**Email Content:**
- Subject: Article title
- Body: Full HTML content of the article (rich text preserved)
- Sender: Your name (from user profile) or email address
- Conference Context: Conference name is included in the email template
- Recipient Name: Personalized with applicant's first name

**Email Delivery:**
- Emails are sent asynchronously (does not block the UI)
- Each recipient receives an individual email (not BCC)
- Failed deliveries to individual recipients do not block others
- The "emails_sent" count reflects successful deliveries

**Resending:**
You can send the same article multiple times to the same or different recipient groups. There is no built-in tracking to prevent duplicate sends.

### News Categories/Tags

**Current Status:** The News module does NOT currently support categories or tags.

**Implications:**
- Articles are displayed in a single chronological feed
- No filtering by topic, category, or keyword
- No grouping or organization beyond publication date
- Search functionality is not available in the portal

**Workarounds:**
- Use consistent title prefixes (e.g., "[Venue Update]", "[CFP Reminder]") for visual categorization
- Leverage the Screen Overlay system to highlight priority announcements
- Use the email targeting filters to send relevant news to specific groups

### Editing and Deleting Articles

**Editing an Article:**

1. Locate the article in the articles list (draft or published)
2. Click the pencil icon (edit button)
3. The edit modal opens with current values pre-filled:
   - Title field
   - Body (rich text editor with existing content)
   - Screen overlay selector (current selection)
4. Make desired changes
5. Click Save to update the article

Screenshot Placeholder:
```
[Screenshot: Edit modal with "Edit Article" title, showing pre-filled title and rich text editor with existing content]
```

**Edit Behavior:**
- Title and body changes are saved immediately
- Publishing status (draft/published) is NOT changed by editing
- To change publish status, use the publish/unpublish icons instead
- The `updated_at` timestamp updates automatically
- Author and creation date remain unchanged

**Deleting an Article:**

1. Locate the article to delete
2. Click the trash icon (delete button)
3. Confirm deletion in the dialog:
   - Message: "Are you sure you want to delete '[Article Title]'? This action cannot be undone."
   - Click Delete to confirm, or Cancel to abort

Screenshot Placeholder:
```
[Screenshot: Delete confirmation dialog with warning message and red Delete button]
```

4. The article is permanently deleted from the database
5. Success message: "News article '[Title]' deleted successfully"

**Important Notes:**
- Deletion is permanent and cannot be undone
- Deleting a published article immediately removes it from the portal
- Applicants who previously viewed the article will no longer have access
- Consider unpublishing instead of deleting if you may need the content later

### Screen Overlay Integration

News articles can be linked to screen overlays to display announcements on registration and portal pages.

**What are Screen Overlays?**
Screen overlays are modal popups that appear on the portal based on triggers:
- First Registration: Show once on first visit
- Scheduled: Display during a specific date/time range
- Always: Show on every visit (until dismissed)

**Linking an Overlay:**

1. When creating or editing a news article, scroll to the Screen Overlay field
2. Select an overlay from the dropdown (shows all overlays for the conference)
3. Dropdown format: "Overlay Title (Trigger Type)"
   - Example: "COVID-19 Safety Guidelines (First Reg)"
4. Select "No overlay" to remove the link

Screenshot Placeholder:
```
[Screenshot: Screen Overlay dropdown showing options like "Conference Venue Change (Scheduled)", "Welcome Message (First Reg)", "No overlay"]
```

**Behavior:**
- When a linked overlay is triggered, the overlay content is displayed to portal users
- The overlay content is defined separately in the Screen Overlays module
- The news article body is NOT automatically inserted into the overlay
- Use overlays to link to or highlight the full news article

**Use Case Example:**
1. Create a news article: "Keynote Speaker Announced"
2. Create a screen overlay: "Breaking News: Keynote Speaker Announced! Click to read more" (First Reg trigger)
3. Link the overlay to the news article
4. When portal users visit for the first time after publication, they see the overlay
5. Clicking the overlay can deep-link to the full news article (if overlay content includes link)

### Article Metadata and Authorship

Each news article automatically captures metadata for audit and attribution purposes.

**Automatically Captured Fields:**

**Author Information:**
- Author First Name: Captured from the user profile of the article creator
- Author Last Name: Captured from the user profile
- Display format: "By [First Name] [Last Name]"
- If no name is available: "By Unknown"

**Timestamps:**
- created_at: Date and time the article was first created (UTC)
- updated_at: Date and time of the last edit (updates automatically)
- published_at: Date and time the article was first published (null for drafts)
  - Cleared when unpublished
  - Updated when re-published

Screenshot Placeholder:
```
[Screenshot: Article card showing "By Sarah Johnson" and "Published January 15, 2026, 3:45 PM" metadata]
```

**Display Behavior:**
- Admin View: Shows author name, creation date for drafts, published date for published articles
- Portal View: Shows only publication date (author name NOT displayed to portal users in current implementation)

**Format Examples:**
- Admin (draft): "By Sarah Johnson • Created January 14, 2026, 2:30 PM"
- Admin (published): "By Sarah Johnson • Published January 15, 2026, 3:45 PM"
- Portal: "January 15, 2026, 3:45 PM"

### Access Control and Permissions

**Admin Interface:**

**Required Permissions:**
- Must be a conference admin or organizer for the conference
- Tenant must have the "news" module enabled
- Conference must be accessible to your user account

**Capabilities:**
- Create articles (drafts only)
- Edit any article (own or others)
- Publish/unpublish any article
- Delete any article
- Send articles via email

**Cross-Tenant Isolation:**
- Articles are scoped to tenant and conference
- You cannot view or modify articles from other tenants

**Portal Interface:**

**Required Permissions:**
- Must be authenticated as a CFP applicant
- Must have access to at least one conference (via paper submission or committee membership)

**Capabilities:**
- View published articles from accessible conferences only
- Cannot view draft articles
- Cannot create, edit, or delete articles
- Cannot send emails

**Isolation:**
- Applicants only see articles from conferences they're linked to
- Articles from other conferences are hidden (even if published)
- Draft articles are never visible to portal users

### Best Practices

**Content Strategy:**

1. Use Descriptive Titles:
   - Keep titles under 60 characters for readability
   - Use action words ("Announcing", "Reminder", "Update")
   - Include date/context when relevant: "CFP Extended to March 31"

2. Structure Your Content:
   - Start with the most important information (inverted pyramid)
   - Use headings (H2, H3) to break up long articles
   - Add bulleted lists for key points
   - Include a call-to-action (CTA) at the end

3. Visual Enhancements:
   - Add hero images for major announcements
   - Use tables for schedules or comparisons
   - Embed YouTube videos for richer media
   - Apply text highlighting for critical deadlines

**Publication Workflow:**

1. Draft First:
   - Always create articles as drafts initially
   - Review content for accuracy, spelling, grammar
   - Preview formatting in the portal (publish temporarily if needed)

2. Internal Review:
   - Share draft link with co-organizers (via edit modal)
   - Gather feedback before publishing
   - Unpublish during review periods if needed

3. Publish with Purpose:
   - Time publications strategically (e.g., Monday mornings for higher engagement)
   - Link screen overlays for high-priority announcements
   - Send targeted emails to relevant groups only

**Email Targeting:**

1. Segment Your Audience:
   - Use paper status filters to send acceptance letters only to accepted authors
   - Target committee members separately from general applicants
   - Avoid "All Applicants" for role-specific information

2. Test Before Sending:
   - Send to a test recipient list first (use "applicant_ids" filter with your own test accounts)
   - Verify email rendering and links
   - Check for typos and formatting issues

3. Avoid Spam:
   - Don't send the same article multiple times to the same group
   - Limit email frequency (no more than 2-3 per week)
   - Provide clear subject lines (article title becomes subject)

**Archive Management:**

1. Unpublish Outdated Content:
   - Unpublish articles after events have passed (e.g., "CFP Closing Tomorrow")
   - Keep historical articles published if they remain relevant (e.g., "Keynote Speaker Biography")

2. Delete Sparingly:
   - Delete only truly obsolete or incorrect content
   - Unpublish instead of delete to preserve historical record
   - Consider keeping drafts for future reference

### Troubleshooting

**Problem: "News tab is not visible"**
- Cause: News module is not enabled for your tenant
- Solution: Contact your organization admin to enable the "news" module in Modules settings

**Problem: "Cannot create or edit articles"**
- Cause: You do not have admin permissions for the conference
- Solution: Request admin or organizer role assignment from a conference owner

**Problem: "Published article not visible in portal"**
- Cause 1: Applicant does not have access to the conference (no papers or committee membership)
- Solution: Verify the applicant has submitted a paper or is a committee member
- Cause 2: Article was unpublished after initial publication
- Solution: Re-publish the article from the admin interface

**Problem: "Email send returns 'No recipients found'"**
- Cause: Filters are too restrictive (no applicants match the criteria)
- Solution:
  - Check paper status filter (ensure applicants have papers with that status)
  - Verify committee role spelling (case-sensitive exact match)
  - Use "All Applicants" to confirm at least some applicants exist

**Problem: "Rich text editor not loading or frozen"**
- Cause: JavaScript error or browser compatibility issue
- Solution:
  - Refresh the page (Cmd+R / Ctrl+R)
  - Clear browser cache and reload
  - Try a different browser (Chrome, Firefox, Safari, Edge supported)

**Problem: "Images not displaying in email"**
- Cause: Email clients may block base64-encoded images
- Solution: Host images externally (e.g., conference website) and use URL method instead of paste/drag-drop

**Problem: "Article formatting looks different in portal vs admin"**
- Cause: CSS differences between admin and portal views
- Solution: Use standard formatting (headings, lists, paragraphs) instead of custom font sizes/colors for best cross-environment consistency

**Problem: "Cannot delete article"**
- Cause: 404 error suggests article was already deleted or belongs to a different conference/tenant
- Solution: Refresh the page to sync the articles list, verify you're in the correct conference

---

## Volunteers Module

The Volunteers tab is the central hub for managing conference volunteers. It provides a complete interface for creating, linking, and managing volunteer information for your event.

### Accessing Volunteers

Navigate to Conference Detail → Volunteers to access volunteer management features.

### Volunteer Information

Each volunteer record contains:

**Basic Information:**
- First Name (required)
- Last Name (required)
- Email (required, validated)
- Phone (optional, validated for international format)

**Additional Details:**
- Status (pending, approved, active, inactive, rejected)
- T-Shirt Size (XS, S, M, L, XL, XXL)
- Notes (rich text editor for internal comments)

**Emergency Contact:**
- Emergency Contact Name
- Emergency Contact Phone (validated)

**Conference Association:**
- Volunteers are linked to specific conferences
- Same volunteer can be associated with multiple conferences across your tenant
- Removing a volunteer from a conference only unlinks them (doesn't delete the volunteer record)

### Creating New Volunteers

Screenshot placeholder: `volunteers-create-form.png`
*Shows the inline volunteer creation form with all fields*

1. Click Create New in the upper right
2. The creation form appears inline above the volunteer list
3. Fill in required fields:
   - First Name
   - Last Name
   - Email (validated on blur)
4. Optionally add:
   - Phone number (validates international formats like `+491234567` or `00491234567`)
   - T-Shirt Size
   - Comments (rich text)
5. Click Create Volunteer
6. The new volunteer is automatically linked to this conference

**Validation:**
- Email addresses are validated for correct format
- Phone numbers must be in international format (with + or 00 prefix)
- Validation errors appear in red below the field

### Linking Existing Volunteers

Screenshot placeholder: `volunteers-link-dropdown.png`
*Shows the "Link existing..." dropdown with available volunteers*

If you have volunteers from other conferences in your tenant:

1. Click the Link existing... dropdown
2. Select a volunteer from the list
3. The dropdown shows volunteers by name and email
4. Only volunteers not already linked to this conference appear
5. The volunteer is immediately linked to the conference

This is useful for:
- Multi-conference events (same volunteer staff across events)
- Recurring annual conferences
- Volunteers who work across multiple events in your organization

### Editing Volunteer Details

Screenshot placeholder: `volunteers-edit-modal.png`
*Shows the edit modal with all volunteer fields and the attachment section*

1. Click the edit icon (pencil) next to any volunteer
2. A modal opens with all volunteer fields
3. Modify any field:
   - Basic information (name, email, phone)
   - Status (change approval status)
   - T-Shirt Size
   - Notes
   - Emergency contact information
4. Upload attachments (photos, documents) using the attachment section at the bottom
5. Click Save Changes

**Save Status Indicator:**
- Blue "Save Changes" button → ready to save
- Spinning indicator → saving in progress
- Green "Saved!" with checkmark → successfully saved
- Red "Error" → save failed

### Volunteer Status Badges

Screenshot placeholder: `volunteers-status-badges.png`
*Shows volunteers with different status badges (active, approved, pending, inactive, rejected)*

Status badges appear color-coded in the volunteer list:

- Active (green) — Volunteer is actively working at the event
- Approved (blue) — Application approved but not yet active
- Pending (yellow) — Application under review
- Inactive (gray) — Volunteer no longer active
- Rejected (gray) — Application declined

### Volunteer Color Coding

Each volunteer can be assigned a unique color for visual identification in the program grid. This color is conference-specific and helps distinguish volunteers when viewing assignments and schedules.

**Setting Colors:**
- Colors are assigned in the Volunteer Assignment tab
- Click the color dot next to a volunteer's name to cycle through preset colors
- 10 preset colors available: Blue, Green, Amber, Red, Purple, Pink, Cyan, Lime, Orange, Indigo

### Removing Volunteers

Screenshot placeholder: `volunteers-delete-confirm.png`
*Shows the confirmation dialog when removing a volunteer*

1. Click the delete icon (trash) next to a volunteer
2. A confirmation dialog appears explaining the action
3. Click Remove to confirm

**Important:**
- If the volunteer is linked to other conferences, they are only unlinked from this conference
- The volunteer record remains in your tenant for other conferences
- If assigned to tasks, those assignments are removed
- Attachment records are preserved

### Volunteer Communications

Volunteers can be contacted through:

1. Direct Email — Click the email address in the volunteer list to open your mail client
2. Bulk Communications — Use the Communications tab to send emails to all volunteers
3. Schedule Distribution — Export and send volunteer schedules

## Task Assignment

The Task Assignment tab uses a visual program grid to assign volunteer tasks to specific sessions. Tasks define what volunteers will do (e.g., "Registration Desk," "AV Support," "Session Chair").

### Accessing Task Assignment

Navigate to Conference Detail → Volunteers → Task Assignment

Screenshot placeholder: `task-assignment-overview.png`
*Shows the full task assignment interface with sidebar and program grid*

### Understanding Volunteer Tasks

Volunteer tasks (also called "volunteer roles" in the database) are reusable task definitions created in Settings. Each task represents a type of work volunteers perform.

**Common Task Examples:**
- Registration Desk
- AV Support
- Session Chair
- Room Monitor
- Information Booth
- Photography
- Social Media
- Setup/Teardown

**Creating Tasks:**
Tasks are created in Settings → Volunteer Tasks

### Program Grid View

Screenshot placeholder: `task-assignment-grid.png`
*Shows the program grid with sessions displaying assigned tasks*

The program grid displays:

- Horizontal Axis: Program tracks
- Vertical Axis: Time slots
- Session Cards: Color-coded by session type or track
- Task Badges: Small badges on sessions showing assigned tasks and volunteer counts

**Grid Features:**
- Day Tabs — Switch between program days at the top
- Time Labels — Left column shows slot times
- Break Indicators — Session-free slots highlighted in amber with diagonal stripes
- Track Headers — Color-coded track names with colored dots

### Dragging Tasks onto Sessions

Screenshot placeholder: `task-assignment-drag.png`
*Shows a task being dragged from the sidebar onto a session*

The fastest way to assign tasks:

1. Sidebar — Shows all active volunteer tasks with a count of how many sessions each is assigned to
2. Drag — Click and hold a task in the sidebar
3. Drop — Drag onto a session card in the grid
4. Release — Drop to assign the task with a default required count of 1

**Visual Feedback:**
- Task card becomes semi-transparent while dragging
- Session cards highlight when you hover over them
- A floating badge follows your cursor showing the task name

### Clicking Sessions to Manage Tasks

Screenshot placeholder: `task-assignment-modal.png`
*Shows the session task management modal with assigned tasks and add task form*

Click any session card to open the task management modal:

**Assigned Tasks Section:**
- Lists all tasks currently assigned to this session
- Shows format: `[Task Name] - X/Y assigned`
  - X = number of volunteers currently assigned
  - Y = required volunteer count
- Editable "Need" field — Change the required count (1-50)
- Remove button — Click to unassign the task from this session

**Add Task Section:**
- Dropdown to select from available tasks (tasks not already assigned)
- "Volunteers needed" field (1-50)
- Add button to assign the task

**Workflow:**
1. Click a session card
2. Modal shows current task assignments
3. Adjust required counts using the input fields
4. Add new tasks using the dropdown
5. Remove tasks using the "Remove" button
6. Changes save automatically

### Task Count Badges

Screenshot placeholder: `task-count-badges.png`
*Close-up of session cards showing task badges with assignment counts*

Session cards display task badges:

**Badge Color:**
- White/semi-transparent background
- White text

**Badge Content:** `[Task Name] (X/Y)`
- X = assigned volunteers
- Y = required volunteers

**Multiple Tasks:** Multiple badges stack vertically
**No Tasks:** Session shows "No tasks assigned" in italics

**Visual Indicators:**
- Helps quickly identify:
  - Which sessions need volunteer coverage
  - Which tasks are understaffed
  - Session task distribution across the program

### Managing Required Counts

Screenshot placeholder: `task-assignment-count-edit.png`
*Shows the "Need" input field being edited*

Each session-task assignment has a required count (how many volunteers are needed):

- Default: 1 volunteer when first assigned
- Editable: Change in the session modal or inline
- Range: 1-50 volunteers
- Updates Live: Changes save automatically and update the grid

**Example:**
- "Registration Desk" at 08:00-09:00 might need 3 volunteers
- "Session Chair" typically needs 1 volunteer
- "Setup/Teardown" might need 5-10 volunteers

### Removing Task Assignments

To remove a task from a session:

1. Click the session card
2. Click Remove next to the task
3. The task is immediately unassigned
4. Any volunteer assignments to that task are also removed

**Warning:**
Removing a task deletes all volunteer assignments for that task-session combination. This action cannot be undone.

## Volunteer Assignment

The Volunteer Assignment tab uses the same program grid layout to assign specific volunteers to session tasks. This is where you allocate your volunteer team to their scheduled duties.

### Accessing Volunteer Assignment

Navigate to Conference Detail → Volunteers → Volunteer Assignment

Screenshot placeholder: `volunteer-assignment-overview.png`
*Shows the full volunteer assignment interface with volunteer sidebar and program grid*

### Volunteer Sidebar

Screenshot placeholder: `volunteer-assignment-sidebar.png`
*Shows the volunteer sidebar with color dots and assignment counts*

The left sidebar lists all volunteers linked to this conference:

**Volunteer Cards Display:**
- Color Dot — Click to cycle through preset colors (for visual identification)
- Full Name — Volunteer's name
- Assignment Count Badge — Blue circle showing how many sessions they're assigned to

**Search Feature:**
- Search box at the top filters volunteers by name
- Real-time filtering as you type
- Useful for conferences with many volunteers

### Assigning Volunteers via Drag-and-Drop

Screenshot placeholder: `volunteer-assignment-drag.png`
*Shows a volunteer being dragged onto a session card*

The primary assignment method:

1. Drag — Click and hold a volunteer card in the sidebar
2. Drop — Drag onto a session card in the grid
3. Release — Drop to assign

**What Happens:**

- Single Task: If the session has only one task, the volunteer is immediately assigned to it
- Multiple Tasks: If the session has multiple tasks, a modal appears asking which task to assign the volunteer to
- Already Assigned: If the volunteer is already assigned to that task, the drop is ignored (no duplicates)

**Visual Feedback:**
- Volunteer card becomes semi-transparent while dragging
- Session cards highlight when hovering (blue ring)
- Floating badge follows cursor showing volunteer name

### Task Picker Modal (Multi-Task Sessions)

Screenshot placeholder: `volunteer-assignment-task-picker.png`
*Shows the task picker modal when dropping a volunteer on a multi-task session*

When dropping a volunteer on a session with multiple tasks:

1. Modal opens with title: "Assign [Volunteer Name] to task"
2. Lists all tasks for that session as clickable buttons
3. Each button shows:
   - Task name
   - Current assignment count (X/Y format)
   - Green indicator if fully staffed, amber if understaffed
   - "Already assigned" message if volunteer is already on that task (grayed out)
4. Click a task button to complete the assignment

**Example:**
Session "Keynote Hall" has three tasks:
- AV Support (1/2) — Amber, understaffed
- Session Chair (1/1) — Green, fully staffed
- Room Monitor (0/1) — Amber, empty

### Session Detail Modal (Click to Manage)

Screenshot placeholder: `volunteer-assignment-detail-modal.png`
*Shows the session detail modal with task sections and volunteer lists*

Click any session card to open the detailed assignment modal:

**For Each Task:**

**Task Header:**
- Task name
- Badge showing assignment status (X/Y format)
- Green badge if fully staffed, amber if understaffed

**Assigned Volunteers List:**
- Shows all volunteers currently assigned to this task
- Each entry displays:
  - Color dot (volunteer's assigned color)
  - Volunteer full name
  - Remove button (X icon) — click to unassign

**Add Volunteer Dropdown (if not fully staffed):**
- Shows volunteers not yet assigned to this task
- Select a volunteer to add them
- Dropdown disappears once task is fully staffed

**Workflow:**
1. Click a session to see all tasks
2. Review current assignments for each task
3. Add volunteers using the dropdown
4. Remove volunteers using the X icon
5. Changes save instantly

### Program Grid Session Cards

Screenshot placeholder: `volunteer-assignment-session-cards.png`
*Close-up of session cards showing task fill status and assigned volunteer names*

Session cards in the grid display:

**Task Badges (for each assigned task):**
- Badge background:
  - Green — All volunteer slots filled
  - Amber — Understaffed (some slots empty)
- Badge content: `[Task Name] (X/Y)`
- Below each badge: tiny colored dots and first names of assigned volunteers

**Example Badge:**
```
AV Support (2/3)
● John ● Sarah
```
Shows:
- Task name: "AV Support"
- 2 of 3 volunteer slots filled
- John and Sarah are assigned (with their color dots)

**No Tasks Indicator:**
- Sessions without tasks show "No tasks" in italics
- These sessions are not droppable (can't assign volunteers)

### Volunteer Color Assignment

Screenshot placeholder: `volunteer-assignment-colors.png`
*Shows clicking a color dot to cycle through preset colors*

Each volunteer has a conference-specific color for visual identification:

**Setting Colors:**
1. Find the volunteer in the sidebar
2. Click their color dot (left of their name)
3. The color cycles to the next preset color
4. Color updates immediately throughout the interface

**Preset Colors (10 total):**
- Blue (#3B82F6)
- Green (#10B981)
- Amber (#F59E0B)
- Red (#EF4444)
- Purple (#8B5CF6)
- Pink (#EC4899)
- Cyan (#06B6D4)
- Lime (#84CC16)
- Orange (#F97316)
- Indigo (#6366F1)

**Color Purpose:**
- Helps visually distinguish volunteers in the grid
- Makes it easy to see workload distribution at a glance
- Appears in schedules and PDF exports

### Workload Balancing

Screenshot placeholder: `volunteer-assignment-workload.png`
*Shows the sidebar with volunteers having different assignment count badges*

The assignment count badge on each volunteer card helps you balance workload:

- Blue circle with a number shows total session-task assignments
- No badge means the volunteer has zero assignments
- Higher numbers indicate volunteers with more responsibilities

**Best Practices:**
- Aim for even distribution across volunteers
- Some tasks require specialized skills (assign accordingly)
- Consider volunteer availability when scheduling
- Review the Volunteer Schedule tab to check for conflicts

### Conflict Detection

The system helps prevent scheduling conflicts:

**Time Conflicts:**
- Volunteers cannot be assigned to multiple tasks in overlapping time slots
- The system doesn't automatically prevent this (manual checking required)
- Use the Volunteer Schedule tab to review each volunteer's timeline

**Duplicate Prevention:**
- A volunteer cannot be assigned to the same task twice
- Drag-and-drop to an already-assigned task is ignored
- Modal task picker grays out already-assigned tasks

### Removing Assignments

Screenshot placeholder: `volunteer-assignment-remove.png`
*Shows the remove button next to an assigned volunteer in the detail modal*

To unassign a volunteer:

1. Click the session card to open the detail modal
2. Find the volunteer in the assigned list
3. Click the X icon next to their name
4. The volunteer is immediately unassigned

**Bulk Removal:**
- Remove a volunteer from the conference (Volunteers tab) to unassign them from all tasks
- Remove a task from a session (Task Assignment tab) to unassign all volunteers from that task

## Volunteer Schedule

The Volunteer Schedule tab provides a read-only view of each volunteer's complete schedule with PDF export capabilities for distribution.

### Accessing Volunteer Schedule

Navigate to Conference Detail → Volunteers → Volunteer Schedule

Screenshot placeholder: `volunteer-schedule-overview.png`
*Shows the volunteer schedule interface with expandable volunteer cards*

### Schedule List View

The schedule displays all volunteers with assigned tasks in an expandable list format:

Screenshot placeholder: `volunteer-schedule-collapsed.png`
*Shows multiple volunteer cards in collapsed state*

**Collapsed View:**
- Volunteer header bar showing:
  - Expand/collapse arrow icon
  - Color dot (volunteer's assigned color)
  - Full name
  - Session count (e.g., "3 sessions")
  - PDF download button

**Expanded View:**
- Click the header bar or arrow to expand
- Shows complete schedule grouped by day
- Each day section includes a table with session details

### Schedule Details

Screenshot placeholder: `volunteer-schedule-expanded.png`
*Shows an expanded volunteer schedule with day sections and session tables*

For each volunteer, the schedule displays:

**Day Groupings:**
- Sessions organized by program day (e.g., "Day 1," "Conference Day")
- Day name appears as a section header in uppercase

**Session Table Columns:**
1. Time — Start and end time (e.g., "09:00–10:30")
2. Session — Full session title
3. Track — Track name (or "–" if no track)
4. Task — Task name in a blue badge

Screenshot placeholder: `volunteer-schedule-table.png`
*Close-up of the session detail table*

**Empty State:**
If a volunteer has no assignments, the expanded view shows:
> *"No assignments yet."*

### PDF Export (Individual)

Screenshot placeholder: `volunteer-schedule-pdf-button.png`
*Shows the PDF button on an individual volunteer card*

Each volunteer has a PDF download button on their header bar:

1. Click PDF button
2. Browser downloads `volunteer_schedule.pdf`
3. File contains:
   - Volunteer name at the top
   - Conference name
   - Complete schedule table grouped by day
   - Formatted for printing

**PDF Contents:**
- Professional formatting suitable for distribution
- Clear typography and spacing
- Day-grouped layout
- All session details included

**Use Cases:**
- Email to individual volunteers
- Print for volunteer check-in packets
- Provide to volunteers during orientation

### PDF Export (All Volunteers)

Screenshot placeholder: `volunteer-schedule-export-all.png`
*Shows the "Export All PDFs" button in the upper right*

The Export All PDFs button in the upper right corner downloads all schedules:

1. Click Export All PDFs
2. System generates a PDF for each volunteer with assignments
3. Browser downloads `volunteer_schedules.zip`
4. ZIP file contains individual PDFs named by volunteer

Screenshot placeholder: `volunteer-schedule-zip-contents.png`
*Shows the contents of the extracted ZIP file with multiple PDFs*

**ZIP File Structure:**
```
volunteer_schedules.zip
├── volunteer_1_schedule.pdf
├── volunteer_2_schedule.pdf
├── volunteer_3_schedule.pdf
└── ...
```

**Use Cases:**
- Bulk distribution via email
- Print all schedules for volunteer coordinator
- Archive for event records

**Loading State:**
- Button shows "Downloading..." while generating
- For large volunteer teams, this may take a few seconds

### Unassigned Sessions Warning

Screenshot placeholder: `volunteer-schedule-unassigned.png`
*Shows the unassigned sessions table at the bottom*

Below the volunteer list, a warning section appears if any session-tasks are understaffed:

**Header:**
> ⚠️ Unassigned Sessions (X)

Where X is the count of understaffed session-task combinations.

**Table Columns:**
1. Session — Session title
2. Day — Program day name
3. Time — Start and end time
4. Track — Track name (or "–")
5. Task — Task name in blue badge
6. Volunteers — Assignment status in amber (e.g., "1/3")

**Purpose:**
- Quickly identify gaps in volunteer coverage
- Shows how many more volunteers are needed per task
- Helps ensure all critical tasks are fully staffed

### Schedule Distribution

**Recommended Workflow:**

1. Finalize Assignments — Complete all volunteer assignments in the Volunteer Assignment tab
2. Review Schedules — Check each volunteer's schedule for conflicts or overload
3. Export PDFs — Download all schedules as a ZIP file
4. Distribute — Email individual PDFs to volunteers or print for packets
5. Update as Needed — If assignments change, re-export and redistribute

**Email Template Example:**
```
Subject: Your [Conference Name] Volunteer Schedule

Hi [Volunteer Name],

Thank you for volunteering at [Conference Name]! Please find your volunteer schedule attached.

Key Details:
- Please arrive 15 minutes before your first shift
- Check in at the Volunteer Desk
- Bring a copy of this schedule with you

If you have any conflicts or questions, please reply to this email.

See you at the conference!

[Your Name]
[Conference Coordinator]
```

### Empty State

Screenshot placeholder: `volunteer-schedule-empty.png`
*Shows the empty state when no volunteers have assignments*

If no volunteers have been assigned to any tasks, the page displays:

> No volunteer schedules available
> *Assign volunteers to tasks in the Volunteer Assignment tab first.*

## Volunteer Settings

Volunteer Settings is where you define the reusable task types that volunteers can perform. These tasks are then assigned to sessions in the Task Assignment tab.

### Accessing Volunteer Settings

Navigate to Conference Detail → Settings → Volunteer Tasks

Screenshot placeholder: `volunteer-settings-overview.png`
*Shows the volunteer tasks settings page with the tasks table*

### Understanding Volunteer Tasks

**What is a Task?**
A task represents a type of work volunteers perform. Tasks are conference-specific and reusable across multiple sessions.

**Examples:**
- Registration Desk
- AV/Tech Support
- Session Chair
- Room Monitor
- Information Booth
- Photography
- Social Media Coverage
- Setup/Teardown
- Check-in Assistance
- Crowd Control
- Translation Services

### Task List Table

Screenshot placeholder: `volunteer-settings-table.png`
*Shows the tasks table with name, description, and active status*

The tasks table displays:

**Columns:**
1. Name — Short task name (appears in dropdowns and badges)
2. Description — Rich text description (truncated in table)
3. Active — Green "Active" or gray "Inactive" badge

**Actions Column:**
- Edit icon (pencil) — Edit task details
- Delete icon (trash) — Delete the task

Screenshot placeholder: `volunteer-settings-actions.png`
*Close-up of the action buttons*

### Creating a New Task

Screenshot placeholder: `volunteer-settings-create-modal.png`
*Shows the create task modal with all fields*

1. Click Create Task button (upper right)
2. Modal opens with form fields
3. Fill in:
   - Name (required) — Short, descriptive name (e.g., "Registration Desk")
   - Description (optional) — Rich text description of responsibilities
   - Active checkbox — Checked by default
4. Click Save

Screenshot placeholder: `volunteer-settings-description-editor.png`
*Shows the rich text editor for task description*

**Name Guidelines:**
- Keep concise (appears in small badges)
- Use title case (e.g., "Session Chair," not "session chair")
- Be specific (e.g., "AV Support" instead of just "Tech")
- Avoid abbreviations unless universally understood

**Description Best Practices:**
- Describe the task responsibilities clearly
- Include any required skills or qualifications
- Mention tools or equipment needed
- Note reporting structure (e.g., "Reports to Event Coordinator")
- Add time expectations (e.g., "Must arrive 30 minutes early")

**Example Task:**

Name: Registration Desk

Description:
```
**Responsibilities:**
- Greet attendees and verify registrations
- Distribute name badges and welcome packets
- Answer general event questions
- Direct attendees to session rooms

**Requirements:**
- Friendly and professional demeanor
- Basic computer skills
- Able to stand for extended periods

**Reports to:** Registration Coordinator
```

### Editing Task Details

Screenshot placeholder: `volunteer-settings-edit-modal.png`
*Shows the edit task modal*

1. Click the edit icon (pencil) next to a task
2. Modal opens with current task data
3. Modify any field:
   - Name
   - Description (rich text editor)
   - Active status
4. Click Save Changes

Screenshot placeholder: `volunteer-settings-save-status.png`
*Shows the save button in different states (saving, saved, error)*

**Save Status:**
- Blue "Save Changes" → Ready to save
- Spinning + "Saving..." → In progress
- Green checkmark + "Saved!" → Success
- Red "Error" → Failed (error message appears)

**Editing Active Tasks:**
- Tasks currently assigned to sessions can be edited
- Name changes propagate to all assignments immediately
- Description changes don't affect existing assignments (informational only)

### Task Active Status

The Active checkbox controls whether a task appears in assignment interfaces:

**Active (checked):**
- Task appears in the Task Assignment sidebar
- Task appears in session task dropdown menus
- Existing assignments remain visible

**Inactive (unchecked):**
- Task is hidden from assignment interfaces
- Cannot be assigned to new sessions
- Existing assignments remain intact and visible
- Useful for phasing out deprecated tasks

**Use Cases for Inactive:**
- Seasonal tasks (only needed for some conferences)
- Deprecated tasks (replaced by better-defined tasks)
- Experimental tasks (testing before making widely available)

### Deleting Tasks

Screenshot placeholder: `volunteer-settings-delete-confirm.png`
*Shows the delete confirmation dialog*

1. Click the delete icon (trash) next to a task
2. Confirmation dialog appears
3. Click Delete to confirm

**Warning Messages:**
- If task is assigned to sessions, the dialog warns:
  > "This task is currently assigned to X sessions. Deleting it will remove all session-task assignments and volunteer assignments. This cannot be undone."

**What Happens on Delete:**
- Task definition is permanently deleted
- All session-task assignments for this task are deleted
- All volunteer assignments to this task are deleted
- Volunteers are unassigned from those sessions
- This action cannot be undone

**Best Practice:**
Instead of deleting, consider marking the task as Inactive to preserve historical data.

### Task Requirements and Descriptions

Tasks can include detailed requirements and descriptions to help volunteers understand expectations.

Screenshot placeholder: `volunteer-settings-description-display.png`
*Shows a task description with formatted text, lists, and sections*

**Rich Text Formatting:**
- Bold, italic, underline
- Bulleted and numbered lists
- Headings for sections
- Links to external resources

**Common Description Sections:**
1. Responsibilities — What the volunteer will do
2. Requirements — Skills, qualifications, or certifications needed
3. Equipment — Tools or materials provided or required
4. Reports To — Who supervises this task
5. Time Expectations — Shift length, arrival time, break policy
6. Training — Any training provided or required

**Example: AV Support Task**

Name: AV Support

Description:
```
**Responsibilities:**
- Set up microphones and presentation equipment before sessions
- Monitor audio levels during presentations
- Troubleshoot basic technical issues
- Assist speakers with laptop connections and screen sharing

**Requirements:**
- Familiarity with AV equipment (microphones, projectors, laptops)
- Problem-solving skills
- Calm under pressure
- Able to lift equipment (up to 30 lbs)

**Equipment Provided:**
- Two-way radio
- AV toolkit (cables, adapters, batteries)
- Event t-shirt

**Reports To:** Technical Director

**Time Expectations:**
- Arrive 30 minutes before session start
- 15-minute break between sessions
- Stay until speaker departs

**Training:**
Mandatory AV training session on Day 0 at 14:00 in Room A
```

### Task Planning Best Practices

**Before Creating Tasks:**

1. Identify Needs — Review your program and identify which sessions need volunteer support
2. Define Scope — Clearly define what each task entails
3. Estimate Counts — Determine how many volunteers are needed per task per session
4. Consider Skills — Note any special skills or training required
5. Plan Training — Schedule training for complex tasks

**Common Task Categories:**

**Registration & Check-In:**
- Registration Desk
- Badge Distribution
- Check-in Assistance

**Session Support:**
- Session Chair
- Room Monitor
- AV/Tech Support
- Timekeeper

**Information & Hospitality:**
- Information Booth
- Greeter
- Hospitality Suite

**Operations:**
- Setup/Teardown
- Signage
- Equipment Transport

**Communications:**
- Photography
- Social Media
- Live Tweeting

**Accessibility:**
- Accessibility Assistance
- Translation Services

### Task Reusability

Tasks are conference-specific but can be used across all sessions within that conference:

**Single Conference:**
- Each conference has its own set of tasks
- Tasks are not shared between conferences
- This allows for conference-specific customization

**Within Conference:**
- One task can be assigned to unlimited sessions
- Same task can have different required counts per session
- Example: "Session Chair" used for all talk sessions but with varying counts

**Cross-Conference:**
- To reuse tasks across conferences, you must recreate them
- Consider creating a standard set of tasks for your organization
- Copy descriptions from previous conferences to maintain consistency

### Empty State

Screenshot placeholder: `volunteer-settings-empty.png`
*Shows the empty state when no tasks are defined*

If no volunteer tasks have been created yet:

> No volunteer tasks yet
> *Create your first task to get started.*

Click Create Task to define your first volunteer role.

---

## Summary

The Volunteers Module provides a complete workflow for managing conference volunteers:

1. Volunteers Tab — Create and manage volunteer records, link volunteers to conferences
2. Task Assignment — Define what needs to be done by assigning tasks to program sessions
3. Volunteer Assignment — Assign specific volunteers to specific session tasks using drag-and-drop
4. Volunteer Schedule — View and export individual and bulk volunteer schedules as PDFs
5. Volunteer Settings — Define reusable task types with detailed descriptions and requirements

This module streamlines volunteer coordination, ensures adequate coverage for all sessions, and provides volunteers with clear schedules and expectations.

---

## Locations Module

The Locations module manages conference venues, rooms, and virtual spaces. Locations can be organized hierarchically (venues containing rooms) and linked across multiple conferences.

### Location Hierarchy

**Parent-Child Relationships**

Locations support two-level hierarchy:
- Top-level venues (no parent): Conference centers, hotels, university campuses
- Child locations (with parent): Rooms, halls, breakout spaces within a venue

![Screenshot placeholder: Location hierarchy sidebar showing indented structure]

**Hierarchy Rules:**
- Only top-level locations can be parents (single level nesting)
- Parent selection dropdown shows only top-level venues
- Child locations appear indented in the sidebar list with arrow icons
- Orphan children (parent not in current conference) display at top level

**Visual Indicators:**
- Top-level venues with children: Building icon
- Child locations: Right arrow icon (→)
- Green dot: Active location
- Red dot: Inactive location

### Location Types

Location types are conference-scoped settings that define categories like "Room", "Hall", "Virtual", "Outdoor Space".

**Accessing Location Types:**
1. Navigate to Conference > Settings
2. Under Location Types, create custom types
3. Each type has:
   - Name: Display name (e.g., "Conference Room")
   - Slug: Internal identifier (e.g., "room")
   - Description: Optional notes
   - Active toggle: Show/hide in dropdowns

**Common Location Types:**
- `venue` - Conference centers, hotels
- `room` - Standard meeting rooms
- `hall` - Large auditoriums
- `virtual` - Online meeting spaces
- `outdoor` - Garden, terrace, plaza

When creating a location, the Type dropdown shows only active types. The slug value is stored in the database, so renaming a type's display name won't break existing locations.

![Screenshot placeholder: Location type settings with active types]

### Creating Locations

**Two Creation Methods:**

#### A. Link Existing Location
For locations used across multiple conferences:

1. Click Link existing... dropdown
2. Select from unlinked tenant locations
3. Location appears in list immediately

Use case: Organization has permanent venues used by multiple conferences.

#### B. Create New Location

1. Click Create New button
2. Fill required fields:
   - Name* (required): "Grand Ballroom", "Zoom Room A"
   - Code: Short identifier (e.g., "GB-01")
   - Type*: Select from dropdown
   - Parent Location: Optional - select venue for child locations
   - Capacity: Maximum attendees

![Screenshot placeholder: Create location form with all fields]

**Physical vs. Virtual Fields:**

The form adapts based on location type:

**For Physical Locations (type !== "virtual"):**
- Address Line 1 & 2
- City, State, Postal Code, Country (dropdown)
- Building, Floor
- Phone (validates format: `+491234545` or `00491234566`)
- Website (auto-normalizes: `example.com` → `https://example.com`)
- VAT Number

**For Virtual Locations (type === "virtual"):**
- Platform dropdown: Zoom, Microsoft Teams, Google Meet, Webex, Other
- URL (auto-normalizes URLs on blur)

**Common Fields (Both Types):**
- Description (rich text editor)
- Contact Persons
- Active checkbox

3. Click Create Location
4. Location is automatically linked to current conference
5. Detail panel opens for the new location

### Capacity Settings

**Purpose:**
- Define maximum attendees for each location
- Used for session scheduling and conflict detection
- Shown in location list next to location name

**Setting Capacity:**
1. Open location detail panel
2. Enter number in Capacity field (minimum: 0)
3. Leave blank if capacity is unlimited/unknown
4. Click Save

**Capacity Display:**
- Appears in location list table
- Shows in session assignment views
- Used by program scheduling tools

![Screenshot placeholder: Location capacity in detail panel and list view]

### Assigning Locations to Sessions

Locations are assigned to sessions in the Program module. The assignment happens in two ways:

**A. Session Detail Panel:**
1. Open session in Program tab
2. Select Location dropdown
3. Choose from conference-linked locations
4. Only active locations appear in dropdown

**B. Drag-and-Drop (Program Grid):**
1. Navigate to Program > Visual Editor
2. Drag sessions to location rows
3. Grid shows time conflicts and capacity warnings

**Location Filtering:**
- Only locations linked to current conference appear
- Inactive locations hidden from dropdowns
- Capacity warnings shown when exceeded

### Location Maps & Directions

**Description Field (Rich Text):**

Use the Description field to provide:
- Walking directions from main entrance
- Floor maps or embedded images (via rich text editor)
- Accessibility information
- Parking instructions

**Example Description Template:**
```
**How to Get Here:**
- Enter via Main Lobby (Building A)
- Take elevators to Floor 3
- Turn right, room is at end of corridor

**Accessibility:**
- Wheelchair accessible
- Elevator available
- Accessible restroom on floor 2

**Parking:**
- Visitor parking in Lot B
- 2-hour validation available at registration desk
```

![Screenshot placeholder: Location description with rich text formatting]

**Website Field:**
Use for:
- Google Maps links
- Interactive floor plan PDFs
- Venue-specific web pages

### Location Documents

Each location has a Documents tab for:
- Floor plans (PDF, PNG, JPG)
- Fire evacuation maps
- Setup diagrams
- Equipment manuals

**Uploading Documents:**
1. Open location detail panel
2. Click Documents tab
3. Click Upload or drag files
4. Files are stored with conference ID for isolation

**File Types Allowed:**
- PDF, DOCX, XLSX, TXT
- Images: JPEG, PNG, WebP, GIF
- Max size: 10 MB per file

![Screenshot placeholder: Documents tab with uploaded files]

### Contact Persons

Assign facility managers, AV technicians, or venue coordinators to locations.

**Adding Contacts:**
1. Open location detail panel
2. Click Contacts tab
3. Fill fields:
   - First Name*, Last Name* (required)
   - Email, Phone (validated)
   - Comment (e.g., "Available after 2pm")
4. Click Add Contact

**Editing Contacts:**
- Click contact row to expand inline editor
- Update fields and save
- Delete with trash icon

**Use Cases:**
- Venue manager contact for last-minute changes
- AV technician for equipment issues
- Building security for after-hours access

Contact count appears in tab label: "Contacts (3)"

![Screenshot placeholder: Contact persons list with add form]

### Location Visibility & Status

**Active Toggle:**
- Active = true: Location appears in session dropdowns
- Active = false: Location hidden but data preserved

**When to Deactivate:**
- Venue no longer available
- Room undergoing renovation
- Virtual space URL expired

**Visual Indicators:**
- Active locations: Green status dot
- Inactive locations: Red status dot
- Inactive locations grayed out in list

**Unlinking vs. Deleting:**
- Unlink: Removes from current conference only (preserves for other conferences)
- Delete: Permanently removes location (only if not linked to sessions)

---

## Sponsors Module

The Sponsors module manages conference sponsors, packages, contracts, and invoices.

### Sponsor Management

#### Sponsors List View

**Overview Screen:**
- Table view with sortable columns
- Click any row to open detail panel
- Sponsor count badge in header

**Table Columns:**
- Company Name
- Package (from settings)
- Price + Currency
- City
- Visible (Yes/No badge)
- Actions (Delete/Deactivate)

![Screenshot placeholder: Sponsors list table with multiple sponsors]

**Visibility Badge:**
- Green "Yes": Sponsor visible on public website
- Gray "No": Sponsor hidden from public

#### Adding Sponsors

**Create New Sponsor:**
1. Click + Add Sponsor button
2. Fill form fields:

**Required Field:**
- Company Name*

**Package & Pricing:**
- Sponsor Package (dropdown from settings)
- Price (auto-fills from package but can override)
- Currency (auto-set from package, read-only display)
- Visible checkbox (show on website)

**Contact Information:**
- Phone (validates international format)
- Website (auto-normalizes URLs)

**Address Fields:**
- Address Line 1, Line 2
- City, State, Postal Code
- Country (dropdown with ISO codes)

**Tax Information:**
- VAT Number (with validation)

**Additional:**
- Comments (rich text)
- Contact Persons (add multiple)

3. Click Create
4. Detail panel opens for new sponsor

![Screenshot placeholder: Add sponsor form with all fields filled]

**Package Selection Behavior:**

When you select a package:
- Price auto-fills from package default (can override)
- Currency locks to package currency (or conference default)
- Changing package updates currency but preserves custom price

When you select "No Package":
- Currency reverts to conference default
- Price field remains editable

#### Sponsor Packages

**What are Sponsor Packages?**

Pre-defined sponsorship tiers with:
- Name (e.g., "Gold Sponsor", "Platinum Partner")
- Price & Currency
- Benefits description (rich text)

**Accessing Package Settings:**
1. Navigate to Conference > Settings
2. Scroll to Sponsor Packages
3. Click + Add Package

![Screenshot placeholder: Sponsor packages settings list]

**Package Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| Name* | Package display name | "Gold Sponsor" |
| Description | Benefits list (rich text) | "Logo on website, 2 booth spaces..." |
| Price* | Default package price | 5000.00 |
| Currency | Package currency (from conference currencies) | EUR |
| Active | Show/hide in dropdowns | ✓ |

**Benefits Description Template:**
```
**Included Benefits:**
• Logo on conference website (large size)
• Two 3x3m booth spaces
• 5 complimentary conference passes
• Recognition in opening keynote
• Dedicated social media mentions (3 posts)
• Option to provide swag in attendee bags
```

#### Sponsor Tiers

**Common Tier Structure:**

Most conferences use hierarchical tiers:

| Tier | Typical Price Range | Benefits |
|------|---------------------|----------|
| Platinum | €15,000 - €25,000 | Keynote slot, largest booth, maximum visibility |
| Gold | €8,000 - €15,000 | Large booth, multiple passes, prominent logo |
| Silver | €4,000 - €8,000 | Standard booth, 3-4 passes, standard logo |
| Bronze | €1,500 - €4,000 | Small booth or table, 2 passes, logo in list |
| Community | In-kind or €500 | Logo in footer, recognition in program |

**Creating Tiered Packages:**

1. Create package for each tier
2. Name clearly: "Platinum Sponsor", "Gold Sponsor"
3. Set price appropriately
4. Use description to differentiate benefits
5. Order by price (highest first) for consistency

![Screenshot placeholder: Sponsor packages with tiered structure]

#### Logo Upload

**Uploading Sponsor Logos:**

1. Open sponsor detail panel
2. Under Logo section (top of Details tab)
3. Click Upload Logo or drag image
4. Image appears immediately with cache-busting URL

**Logo Specifications:**
- Formats: JPEG, PNG, WebP, GIF (no SVG - XSS risk)
- Max size: 5 MB
- Recommended: PNG with transparent background
- Dimensions: 400x400px minimum, maintain aspect ratio

![Screenshot placeholder: Logo upload section with preview]

**Deleting Logos:**
- Click X or trash icon next to logo
- Confirmation dialog appears
- Logo removed immediately

#### Sponsor Information Management

**Detail Panel Tabs:**

| Tab | Contents |
|-----|----------|
| Details | Company info, address, VAT, logo, comments |
| Contacts | Contact persons list |
| Documents | File attachments (PDFs, images, etc.) |

**Save Status Indicator:**
- Idle: No indicator
- Saving: "Saving..." spinner
- Saved: Green checkmark "Saved"
- Error: Red X "Save failed"

**Editing Workflow:**
1. Click sponsor in list to open detail panel
2. Modify fields in active tab
3. Click Save button (top right)
4. Changes persist, save status appears

![Screenshot placeholder: Sponsor detail panel with tabs]

#### Contact Persons

Assign sponsor representatives, booth coordinators, or billing contacts.

**Adding Sponsor Contacts:**
1. Open sponsor detail panel
2. Click Contacts tab
3. Fill inline form:
   - First Name*, Last Name*
   - Email (validated)
   - Phone (validated international format)
   - Comment (e.g., "Booth coordinator")
4. Click Add

**Contact List Features:**
- Expandable rows for inline editing
- Delete button (trash icon)
- Count in tab label: "Contacts (2)"

**Use Cases:**
- Primary contact
- Invoice recipient
- Booth setup coordinator
- Marketing contact for social media

![Screenshot placeholder: Sponsor contacts tab with multiple contacts]

### Sponsor Settings

#### Creating Sponsor Packages

**Step-by-Step:**

1. Navigate to Conference > Settings > Sponsor Packages
2. Click + Add Package
3. Fill form:

**Basic Information:**
- Name*: Package tier name (e.g., "Platinum Sponsor")
- Description: Benefits list (rich text editor)

**Pricing:**
- Price*: Default package amount (Decimal, 2 places)
- Currency: Select from conference currencies

**Visibility:**
- Active: Toggle to show/hide in sponsor creation dropdown

4. Click Save
5. Package appears in sponsor creation dropdown

![Screenshot placeholder: Create sponsor package form]

#### Package Pricing

**Price Inheritance:**

When assigning a package to a sponsor:
1. Price field auto-fills from package default
2. User can override (e.g., negotiated discount)
3. Currency locks to package currency
4. Changing sponsor's package updates currency but preserves custom price

**Multi-Currency Support:**

If you have sponsors in different regions:
1. Create conference currencies: EUR, USD, GBP
2. Create separate packages per currency:
   - "Gold Sponsor (EUR)" - €8,000
   - "Gold Sponsor (USD)" - $9,000
   - "Gold Sponsor (GBP)" - £7,000
3. Assign appropriate package to each sponsor

**Currency Display:**
- Shows in sponsor list: "8,000.00 EUR"
- Detail panel displays full name: "EUR - Euro"

#### Package Benefits

**Writing Effective Benefits Descriptions:**

Use the rich text editor to format benefits clearly:

**Example Gold Package Description:**
```
**Premium Visibility**
• Prominent logo placement on conference website and all marketing materials
• Company logo on event app home screen
• Recognition in opening and closing sessions

**Exhibition Space**
• Premium 4x3m booth location in main hall
• Two 6-foot tables, four chairs, power outlets
• WiFi access and booth signage

**Conference Access**
• Five (5) complimentary full-conference passes
• Access to sponsor-only networking reception
• Invitation to speaker dinner (2 representatives)

**Marketing Opportunities**
• 5-minute presentation slot during lunch break
• Insert in attendee swag bags (you provide)
• Three dedicated social media posts (Twitter, LinkedIn)
• One email blast to attendee list (post-conference)

**Additional Benefits**
• Access to attendee list (with consent) for follow-up
• Option to co-host evening social event
• Discount on future conference sponsorship (10%)
```

**Formatting Tips:**
- Use bullet points for scannability
- Bold section headers
- Include quantities (5 passes, not "several passes")
- Specify sizes/dimensions for booths
- Clarify timing ("post-conference email")

![Screenshot placeholder: Benefits description in rich text editor]

#### Package Visibility

**Active Toggle:**
- Active = true: Package appears in sponsor creation dropdown
- Active = false: Package hidden but existing sponsors unchanged

**When to Deactivate:**
- Package no longer offered (e.g., 2024 tiers)
- Sold out (e.g., "Title Sponsor" - limit 1)
- Replaced by new package structure

**Effect on Existing Sponsors:**
- Sponsors with inactive packages keep their package assignment
- Package name still displays in sponsor list
- Cannot assign inactive package to new sponsors

**Reactivating Packages:**
Toggle Active back to true to make available again.

---

End of Part 2 (Filtered Content)

*This document contains user-focused content from sections covering Attendee Management (continued), News Module, Volunteers Module, Locations Module, and Sponsors Module. All technical/developer content has been removed per requirements.*
# SaaSConf Tenant UI Handbook - Sections 51-75 (Filtered)

## Summary of Content Created

### 12.6 Review Process
- Review score scales (numeric range, custom, binary)
- Review criteria and questions configuration
- Review form settings (speaker feedback, internal comments, must-have)
- Manual review assignment with conflict-of-interest checks
- Auto-assignment algorithm (topic matching, COI detection, load balancing)
- Reviewer dashboard and assigned papers view
- Review submission workflow with validation
- Blind review settings (CFP-level and per-assignment)
- Review status tracking and score calculations
- Review deadline management
- Review export/reporting options
- Conflict-of-interest handling (automatic and manual)

### 12.7 Decision Making
- Paper evaluation workflow (status transitions)
- Accept/reject decisions (quick buttons and edit form)
- Conditional acceptance workarounds
- Waitlist management strategies
- Bulk decision actions (current limitations)
- Decision criteria and rubrics (quantitative + qualitative)
- Committee consensus tools
- Decision notification timing and workflow

### 12.8 Notifications
- Notification date configuration
- Acceptance email templates with variables
- Rejection email templates with tone guidance
- Conditional acceptance email approaches
- Bulk notification sending
- Notification tracking and delivery logs
- Resend functionality
- Custom messages per paper

### 12.9 CFP Portal (Applicant View)
- Portal access and authentication
- Applicant dashboard overview
- Submission form with dynamic fields
- Draft saving functionality
- Co-speaker invitation process
- Submission confirmation and email
- Paper status checking
- Withdrawal process
- Post-acceptance actions and speaker feedback
- Responsive design for mobile/tablet/desktop

### Appendices
- Paper status lifecycle diagram
- Review score calculation examples (5 scenarios)
- Email notification best practices
- Conflict-of-interest policy template
- Glossary of CFP terms

## Key Features Documented

Based on Codebase Analysis:
- Complete review configuration system (scales, criteria, questions)
- Weighted score calculations with snapshot fields
- Auto-assignment algorithm with topic exclusions and COI
- Anonymous/blind review support
- Portal paper submission with custom fields
- Co-speaker invitation workflow
- Review form with conditional comments
- Must-have flagging system
- Speaker feedback vs internal comments
- Status-based decision visibility (CFP completion gates acceptance/rejection)

## Total Content

- ~1,280 lines of comprehensive documentation
- 36+ screenshot placeholders for visual guidance
- Step-by-step instructions for admins and applicants
- Validation rules and error messages
- Cross-references to CFP Part 1 (Sections 12.1-12.5)
- Examples and templates throughout

---

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
- Who: People categories, roles, and pronouns
- What: Session types, location types, booking options
- How Much: Currencies, VAT rates, pricing matrices
- How: Email templates, messaging, payment methods
- When: Booking periods, deadlines (configured separately)

### Settings vs. Data

Settings define the *structure and rules* for your conference:
- Session types (e.g., "Keynote", "Workshop", "Tutorial")
- Booking options (e.g., "2-Day Pass", "Virtual Access")
- Email templates (e.g., "Registration Confirmation")

Data uses those settings to create *actual conference content*:
- Actual sessions (e.g., "Opening Keynote by Dr. Smith")
- Actual registrations (e.g., "John Doe with 2-Day Pass")
- Actual emails sent (e.g., confirmation to john@example.com)

Rule: Configure settings *before* creating data that depends on them.

---

## Accessing Settings

### Navigation Path

1. Navigate to your conference in the dashboard
2. Click the Settings tab in the conference navigation
3. Use the collapsible sidebar to browse settings categories

### Settings Sidebar

The settings sidebar is organized into 5 groups:
- People & Roles (3 settings)
- Conference Setup (3 settings)
- CFP & Reviews (3 settings)
- Communication (6 settings)
- Finance (7 settings)

Tip: Click the collapse button (`<<`) to minimize the sidebar for more content space.

### Permission Requirements

| Permission Level | Access |
|-----------------|--------|
| Conference Admin | All settings except restricted items |
| Tenant Admin | All settings including Stripe Setup and Invoice Numbering |
| Super Admin | All settings including system-level configurations |
| Committee Member | No settings access (read-only on some areas) |

Restricted Settings (Tenant Admin / Super Admin only):
- Invoice Numbering (Finance)
- Stripe Setup (Finance)

---

## Settings Categories

### Quick Reference Map

| Category | Settings Included | Purpose |
|----------|------------------|---------|
| People & Roles | Volunteer Tasks, Committee Roles, Pronoun Options | Define people categories and identity options |
| Conference Setup | Location Types, Session Types, Sponsor Packages | Structure program and sponsorship |
| CFP & Reviews | Paper Form, Score Scales, Review Criteria | Configure call for papers and review process |
| Communication | Email Settings, Email Templates, Messaging, Message Templates, Recipient Lists, Screen Overlays | Manage all conference communications |
| Finance | Currency & Tax, Numbering, Company Data, Bank Accounts, Invoice Templates, ZUGFeRD, Stripe Setup | Financial configuration and invoicing |

### Settings Not in Settings Tab

Some configurations are managed elsewhere:
- Booking Options/Packages/Periods: Booking tab (pricing configuration)
- Discount Codes: Booking tab (promotional pricing)
- VAT Rates: Finance > Currency & Tax (see VAT Settings section in handbook)
- General Details: Details tab (conference name, dates, country, timezone)
- Conference Logo: Details tab (branding)
- Modules: Controlled by tenant admins (enables/disables major features)

---

## People & Roles Settings

Define how people are categorized and identified throughout your conference.

### Volunteer Tasks

Path: Settings > People & Roles > Volunteer Tasks

What It Is: Task definitions that volunteers can be assigned to during the conference.

Use Cases:
- Registration desk coverage
- Session room assistance
- Speaker support
- Audio/visual setup
- Catering coordination

Configuration:
- Name: Task name (e.g., "Registration Desk", "Room Monitor")
- Description: Detailed task description
- Color: Hex color for visual identification in schedules
- Active Status: Enable/disable tasks

Dependencies:
- Requires Volunteers module to be enabled
- Used in: Volunteer Task Assignment, Volunteer Assignment, Volunteer Schedule

---

### Committee Roles

Path: Settings > People & Roles > Committee Roles

What It Is: Roles for program committee members who review CFP submissions.

Use Cases:
- Program Chair
- Track Chair
- Reviewer
- External Reviewer
- Advisory Board

Configuration:
- Name: Role name (e.g., "Track Chair")
- Description: Role responsibilities
- Active Status: Enable/disable roles

Dependencies:
- Used in: CFP Committee management
- Affects: Review assignment, committee member permissions

Best Practice: Define roles before inviting committee members.

---

### Pronoun Options

Path: Settings > People & Roles > Pronoun Options

What It Is: Pronoun choices offered to attendees, speakers, and volunteers.

Common Options:
- he/him
- she/her
- they/them
- prefer not to say

Configuration:
- Value: Pronoun text (e.g., "they/them")
- Active Status: Enable/disable options

Dependencies:
- CRITICAL: Must be configured before registration opens
- Used in: Registration forms, Replace Attendee modal, CFP applications, volunteer registration
- Dropdown will be empty if not configured

Best Practice: Add at minimum 4 options including "prefer not to say" for inclusivity.

---

## Conference Setup Settings

Structure your conference program and sponsorship offerings.

### Location Types

Path: Settings > Conference Setup > Location Types

What It Is: Categories of locations where sessions can take place.

Use Cases:
- Conference Room (with capacity numbers)
- Workshop Space
- Exhibit Hall
- Virtual Room
- Outdoor Space

Configuration:
- Name: Location type (e.g., "Main Hall")
- Description: Location details
- Active Status: Enable/disable types

Dependencies:
- Used in: Location management, session assignment
- Affects: Program grid layout, attendee navigation

Best Practice: Create location types that match your venue structure before building program.

---

### Session Types

Path: Settings > Conference Setup > Session Types

What It Is: Categories of program sessions with duration and properties.

Use Cases:
- Keynote (90 min)
- Regular Talk (30 min)
- Tutorial (4 hours)
- Panel (60 min)
- Lightning Talk (10 min)

Configuration:
- Name: Session type name
- Duration: Default length in minutes
- Color: Hex color for visual identification
- Is Tutorial: Boolean flag for tutorial sessions
- Active Status: Enable/disable types

Special Properties:
- Is Tutorial: Affects booking behavior (attendees can only book one tutorial)
- Duration: Used for automatic program grid layout

Dependencies:
- Used in: Session creation, program design, registration session selection
- Affects: Booking logic, program grid

Best Practice: Define all session types before creating actual sessions.

---

### Sponsor Packages

Path: Settings > Conference Setup > Sponsor Packages

What It Is: Sponsorship tiers with associated benefits and pricing.

Use Cases:
- Platinum Sponsor (€10,000)
- Gold Sponsor (€5,000)
- Silver Sponsor (€2,500)
- Bronze Sponsor (€1,000)
- Community Sponsor (€500)

Configuration:
- Name: Package name (e.g., "Gold Sponsor")
- Price: Package cost
- Currency: Currency code (EUR, USD, etc.)
- Benefits: Rich-text description of benefits
- Display Order: Sort order for public display
- Active Status: Enable/disable packages

Dependencies:
- Used in: Sponsor management, sponsor contracts
- Affects: Invoice creation for sponsors, public sponsor listings

Best Practice: Include detailed benefits in description for transparency.

---

## CFP & Reviews Settings

Configure your call for papers and review process.

### Paper Form Builder

Path: Settings > CFP & Reviews > Paper Form

What It Is: Custom form builder for CFP submission forms.

Use Cases:
- Add custom fields to CFP submissions
- Require additional metadata
- Collect speaker bio, abstract, keywords
- Request travel support information

Configuration:
- Field Types: Text, textarea, select, checkbox, radio
- Validation: Required fields, character limits
- Order: Drag-and-drop field ordering

Dependencies:
- Used in: CFP portal submission form
- Affects: Submission data structure, review information

---

### Score Scales

Path: Settings > CFP & Reviews > Score Scales

What It Is: Rating scales used by reviewers to score submissions.

Use Cases:
- 1-5 scale
- 1-10 scale
- Accept/Maybe/Reject scale
- Strong Accept/Accept/Borderline/Reject/Strong Reject

Configuration:
- Name: Scale name (e.g., "5-Point Scale")
- Min Value: Lowest score
- Max Value: Highest score
- Active Status: Enable/disable scales

Dependencies:
- Used in: Review criteria configuration
- Affects: Review score calculations, acceptance decisions

Best Practice: Use consistent scales across all review criteria for easier comparison.

---

### Review Criteria

Path: Settings > CFP & Reviews > Review Criteria

What It Is: Specific aspects reviewers evaluate in submissions.

Use Cases:
- Relevance to conference
- Technical quality
- Originality
- Presentation clarity
- Impact potential

Configuration:
- Name: Criterion name (e.g., "Technical Quality")
- Description: What reviewers should evaluate
- Score Scale: Linked score scale
- Weight: Relative importance (for weighted scoring)
- Active Status: Enable/disable criteria

Dependencies:
- Requires: Score scales to be defined first
- Used in: Review forms, score aggregation
- Affects: Acceptance decisions, ranking

Best Practice: Provide clear descriptions so reviewers score consistently.

---

## Communication Settings

Manage all conference communication channels and templates.

### Email Settings

Path: Settings > Communication > Email Settings

What It Is: SMTP server configuration for sending conference emails.

Configuration:
- SMTP Host: Mail server hostname (e.g., smtp.gmail.com)
- SMTP Port: Port number (465 for SSL, 587 for TLS)
- Username: SMTP authentication username
- Password: SMTP authentication password (encrypted)
- From Email: Sender email address
- From Name: Sender display name
- Use SSL/TLS: Encryption settings

Dependencies:
- CRITICAL: Must be configured for ANY email functionality
- Affects: All automated emails (registration, invoices, CFP, messaging)

Security Note: Passwords are encrypted at rest. Use app-specific passwords for Gmail.

Best Practice: Test email settings before conference launch using a test recipient.

---

### Email Templates

Path: Settings > Communication > Email Templates

What It Is: Customizable HTML email templates for automated communications.

Available Templates:
- Registration: Confirmation, cancellation, replacement
- Invoices: Send invoice, credit note, payment confirmation
- CFP: Submission confirmation, acceptance, rejection
- Volunteers: Assignment confirmation, schedule updates
- Sponsor Contracts: Contract send, signature reminder
- Deadlines: 7-day reminder, 1-day reminder, due reminder

Template Features:
- Rich-text editor: WYSIWYG HTML editing
- Variable placeholders: Dynamic content insertion
- Preview mode: See rendered output before saving
- Default templates: System-provided starting points

Common Placeholders:
- `[Recipient Name]`: Recipient's full name
- `[Conference Name]`: Conference title
- `[Invoice Number]`: Invoice reference
- `[Payment Link]`: Stripe payment URL (credit card invoices)
- `[Custom Message]`: Admin-provided custom text

Dependencies:
- Requires: Email Settings configured
- Used in: All automated email sending
- Affects: Professional appearance, attendee experience

Best Practice: Customize templates with conference branding before launch.

---

### Messaging Settings

Path: Settings > Communication > Messaging

What It Is: Internal messaging system configuration for communicating with attendees, speakers, sponsors.

Configuration:
- Enable Messaging: Turn messaging on/off
- Reply-To Email: Email for message replies
- Sender Name: Display name for messages

Dependencies:
- Used in: Messaging tab, bulk communications
- Affects: Message delivery, reply handling

Best Practice: Set reply-to email to a monitored inbox for attendee responses.

---

### Message Templates

Path: Settings > Communication > Msg Templates

What It Is: Pre-written message templates for bulk communications.

Use Cases:
- "Welcome to the conference"
- "Program update notification"
- "Last-minute venue change"
- "Post-conference survey"

Configuration:
- Name: Template name (internal)
- Subject: Email subject line
- Body: Rich-text message content
- Active Status: Enable/disable templates

Dependencies:
- Used in: Messaging tab when sending bulk messages
- Affects: Speed of communication, consistency

Best Practice: Create templates for recurring messages to save time.

---

### Recipient Lists

Path: Settings > Communication > Recipient Lists

What It Is: Named groups of people for targeted bulk messaging.

Use Cases:
- "All Keynote Speakers"
- "Gold Sponsors"
- "Tutorial Attendees"
- "Dietary Restrictions Group"

Configuration:
- Name: List name (e.g., "Gold Sponsors")
- Description: List purpose
- Members: Manual or query-based selection

Dependencies:
- Used in: Messaging tab, discount code bulk generation
- Affects: Targeting for communications and promotions

Best Practice: Update lists regularly as registrations change.

---

### Screen Overlays

Path: Settings > Communication > Screen Overlays

What It Is: Full-screen modal messages shown to portal users on login or schedule.

Use Cases:
- Welcome message for first-time portal visitors
- Important announcement (venue change, COVID policy)
- Scheduled reminder (CFP deadline approaching)
- Promotional message (early bird ending)

Configuration:
- Title: Overlay heading
- Body: Rich-text content
- Image: Optional image upload (JPEG, PNG, WebP, GIF)
- Trigger Type: first_registration, scheduled, always
- Schedule Date: When to show (for scheduled type)
- Animation: Fade, slide, zoom effects

Trigger Behaviors:
- first_registration: Shown once per user (localStorage tracking)
- scheduled: Shown on/after schedule date
- always: Shown every portal login

Image Handling:
- Max file size: 5MB
- Allowed types: JPEG, PNG, WebP, GIF (no SVG for security)
- Auto-strips EXIF metadata
- Cache-busted URLs for updates

Dependencies:
- Used in: CFP Portal, Registration Portal
- Affects: User experience, announcement visibility

Security Note: SVG files blocked to prevent XSS attacks.

---

## Finance Settings

Configure all financial and invoicing settings.

### Currency & Tax

Path: Settings > Finance > Currency & Tax

What It Is: Primary financial settings including currency, tax rates, and number formatting.

Configuration:

Currency Settings:
- Default Currency: Conference currency (EUR, USD, GBP, etc.)
- Invoice Currency: Optional separate currency for invoices
- Number Format: Decimal separator, thousands separator, currency symbol position

VAT Settings:
- Conference Country: Determines domestic VAT rules
- VAT Rates by Country: Override global VAT rates for specific countries
- VAT Decision Table: 24 rules for VAT calculation (view-only)

Number Format Presets:
- European (1.234,56 €): Dot thousands, comma decimal, symbol after
- US (€1,234.56): Comma thousands, dot decimal, symbol before
- Custom: Define your own separators and symbol position

Dependencies:
- CRITICAL: Must be set before creating any invoices
- Affects: All invoice calculations, VAT compliance, PDF generation
- Used in: Invoice creation, booking pricing, registration

VAT Decision Factors:
1. Attendance type (in_person, virtual, hybrid_onsite, hybrid_online)
2. Customer type (B2B with VAT number, B2C without)
3. Customer location (domestic, EU, non-EU)

VAT Outcomes:
- Charge VAT (yes/no)
- VAT rate source (conference country, customer country, none)
- Reverse charge (yes/no)
- OSS applicable (yes/no)

Best Practice:
- Set conference country based on physical event location (or organizer location for virtual events)
- Review VAT decision table to understand tax treatment
- Consult tax advisor for special arrangements

---

### Invoice Numbering

Path: Settings > Finance > Numbering

Restriction: Tenant Admin / Super Admin only

What It Is: Invoice number generation settings and sequence management.

Configuration:
- Prefix: Text before number (e.g., "INV-", "2024-")
- Number Sequence: Starting number, current number
- Padding: Zero-padding (e.g., 001 vs 1)
- Suffix: Text after number (optional)
- Credit Note Prefix: Separate prefix for credit notes (e.g., "CN-")

Number Format Examples:
- `INV-2024-001`
- `CONF24-00001`
- `2024/001`

Sequence Management:
- Automatically increments on invoice send
- Cannot decrement (audit trail protection)
- Separate sequences for invoices and credit notes

Dependencies:
- Affects: All sent invoices, credit notes
- Used in: PDF generation, legal compliance

Best Practice:
- Use year in prefix for easy annual tracking
- Use 3-4 digit padding for professional appearance
- Never manually edit sequence after production use

---

### Invoice Company Data

Path: Settings > Finance > Company Data

What It Is: Your organization's legal information printed on invoices.

Configuration:
- Company Name: Legal entity name
- Street Address: Company address
- Postal Code: ZIP/postal code
- City: Company city
- Country: Company country (dropdown)
- VAT Number: Your company VAT registration number
- Tax Number: Additional tax ID if required
- Registration Number: Company registration number
- Email: Company contact email
- Phone: Company phone number
- Website: Company website URL

Dependencies:
- CRITICAL: Required for legally valid invoices
- Used in: Invoice PDF generation, credit notes
- Affects: Legal compliance, professional appearance

Validation:
- VAT number validated using same 3-stage validation as customer VAT
- Country must be selected from dropdown (ISO codes stored)

Best Practice:
- Use exact legal entity name as registered
- Verify VAT number is correct (green checkmark)
- Include all legally required information for your jurisdiction

---

### Bank Accounts

Path: Settings > Finance > Bank Accounts

What It Is: Bank account details for bank transfer invoices.

Configuration:
- Bank Name: Financial institution name
- Account Holder: Account holder name
- IBAN: International Bank Account Number
- SWIFT/BIC: Bank identifier code
- Account Number: Local account number (if not using IBAN)
- Sort Code: Bank sort code (UK)
- Routing Number: Routing number (US)
- Currency: Account currency
- Default Account: Mark as default for new invoices

Multiple Accounts:
- Add multiple accounts for different currencies
- Select account when creating bank transfer invoice

Dependencies:
- Used in: Bank transfer invoice PDF generation
- Affects: Payment instructions on invoices

Validation:
- IBAN format validation (checksum verification)
- SWIFT/BIC format validation

Best Practice:
- Verify IBAN and SWIFT codes are correct before sending invoices
- Add separate accounts for each currency you invoice in
- Mark most-used account as default

Security Note: Bank details are visible on invoices sent to customers.

---

### Invoice Templates

Path: Settings > Finance > Invoice Templates

What It Is: PDF template configuration and customization for invoices.

Configuration:
- Template Type: bank_transfer, credit_card, credit_note
- Header Text: Custom header text
- Footer Text: Custom footer text (legal notices, payment terms)
- Logo: Conference logo (configured in Details tab)
- Colors: Primary color for accents
- Notes: Default notes added to invoices

Template Types:
- bank_transfer: Shows bank account details for wire transfer
- credit_card: Shows Stripe payment link with QR code
- credit_note: Negative invoice for cancellations

PDF Features:
- Conference branding (logo, colors)
- Line item table with VAT breakdown
- Reverse charge notice (if applicable)
- Payment instructions (bank details or payment link)
- QR code for online payment (credit card only)

Dependencies:
- Requires: Company Data configured
- Requires: Bank Accounts configured (for bank transfer)
- Used in: PDF generation for all invoices
- Affects: Invoice appearance, payment instructions

Best Practice:
- Add payment terms to footer (e.g., "Payment due within 30 days")
- Include legal notices required in your jurisdiction
- Test PDF generation before sending to customers

---

### ZUGFeRD Settings

Path: Settings > Finance > ZUGFeRD

What It Is: ZUGFeRD/Factur-X electronic invoice format configuration (German/French standard).

What ZUGFeRD Is:
- Hybrid PDF/XML invoice format
- PDF readable by humans + embedded XML for automated processing
- Required by many German and French public sector organizations

Configuration:
- Enable ZUGFeRD: Turn on/off XML embedding
- Profile: BASIC, COMFORT, EXTENDED
- Format: ZUGFeRD (German) or Factur-X (French)

Dependencies:
- Used in: Invoice PDF generation (embeds XML)
- Affects: Invoice file size, e-invoicing compliance

Best Practice:
- Only enable if required by customers
- Use BASIC profile unless customer specifies otherwise
- Test with customer's accounting system before widespread use

---

### Stripe Setup

Path: Settings > Finance > Stripe Setup

Restriction: Tenant Admin / Super Admin only

What It Is: Stripe payment integration for credit card invoices.

Configuration:
- Enable Stripe: Turn on/off credit card payments
- Secret Key: Stripe API secret key (encrypted)
- Publishable Key: Stripe public key (for future client-side use)
- Webhook Secret: Webhook signature verification secret

Setup Process:
1. Create Stripe account at stripe.com
2. Get API keys from Stripe Dashboard > Developers > API keys
3. Configure webhook:
   - URL: `https://your-domain.com/api/v1/stripe/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`
   - Copy webhook secret
4. Enter keys in SaaSConf Settings > Stripe Setup

Payment Flow:
1. Create invoice with template_type = "credit_card"
2. Send invoice → System creates Stripe Payment Link
3. Customer receives email with "Pay Online" button
4. Customer clicks → Redirects to Stripe checkout
5. Customer pays → Stripe creates PaymentIntent
6. Webhook notifies SaaSConf → Invoice status changes to "paid"

Dependencies:
- Requires: Valid Stripe account
- Requires: Webhook configured and verified
- Used in: Credit card invoice creation, payment processing, refunds
- Affects: Online payment availability

Security:
- Secret key encrypted at rest
- Webhook signature verification prevents spoofing
- PCI compliance handled by Stripe (no card data stored in SaaSConf)

Best Practice:
- Use live keys for production, test keys for testing
- Monitor Stripe dashboard for payment issues
- Test full payment flow before announcing credit card option

---

## General Conference Details

Path: Details Tab (not in Settings Tab)

What It Is: Core conference information and branding.

Configuration:
- Name: Conference title
- Slug: URL-friendly identifier (used in portal URLs)
- Description: Rich-text conference description
- Start Date: Conference start date
- End Date: Conference end date
- Country: Conference country (affects VAT, timezone defaults)
- Timezone: Conference timezone (for all date/time display)
- City: Conference city
- Venue: Venue name and address
- Website: Conference website URL
- Contact Email: Public contact email
- Conference Logo: Branding image (PNG, JPEG, WebP)

Portal URLs (auto-generated from slug):
- CFP Portal: `https://your-domain.com/{tenant}/portal/{slug}/cfp`
- Registration Portal: `https://your-domain.com/{tenant}/portal/{slug}/register`

Dependencies:
- CRITICAL: Country and timezone affect all date/time display and VAT calculation
- Affects: Portal access, invoice generation, email timestamps

Best Practice:
- Set country based on physical event location (or organizer location for virtual)
- Verify timezone before creating sessions (changes affect all existing times)
- Upload high-resolution logo (min 400px width for invoice PDFs)

---

## Booking & Registration Settings

Path: Booking Tab (not in Settings Tab)

Settings related to attendee registration pricing and packages.

### Booking Options

What It Is: Individual registration items attendees can purchase.

Use Cases:
- "2-Day Conference Pass"
- "1-Day Pass (Day 1)"
- "Virtual Access Only"
- "Student Ticket"
- "Networking Dinner Add-on"

Configuration:
- Name: Option name
- Description: Rich-text details
- Is Active: Enable/disable option
- Linked to Program Day: Optional program day association

Dependencies:
- Used in: Booking packages, pricing matrix, discount codes
- Affects: Registration form, invoice line items

Program Day Linking:
- If linked to a day with separately_bookable sessions, attendee selects sessions during registration
- Used for tutorial days, workshop selection

---

### Booking Packages

What It Is: Bundles of booking options sold together.

Use Cases:
- "Full Conference Pass" = 2-Day Pass + Networking Dinner
- "Speaker Package" = Conference Pass + Hotel Voucher
- "Premium Experience" = Conference + Tutorial + Dinner + T-shirt

Configuration:
- Name: Package name
- Description: Rich-text details
- Included Options: Which booking options are bundled
- Is Active: Enable/disable package

Dependencies:
- Requires: Booking options defined first
- Used in: Registration form package selection
- Affects: Pricing calculation, invoice itemization

---

### Booking Periods

What It Is: Time-based pricing periods (e.g., early bird, regular, late).

Use Cases:
- "Early Bird" (until Feb 1)
- "Regular" (Feb 2 - Apr 30)
- "Late Registration" (May 1 - Conference Start)
- "On-Site Registration" (during conference)

Configuration:
- Name: Period name
- Start Date: Period begins
- End Date: Period ends
- Is Active: Enable/disable period

Dependencies:
- Used in: Pricing matrix (period × option = price)
- Affects: Registration form pricing display

---

### Pricing Matrix

What It Is: Grid of prices for each booking option in each booking period.

Example:
| Option | Early Bird | Regular | Late |
|--------|-----------|---------|------|
| 2-Day Pass | €200 | €250 | €300 |
| 1-Day Pass | €120 | €150 | €180 |
| Virtual | €50 | €75 | €100 |

Configuration:
- Period (row): Booking period
- Option (column): Booking option
- Price (cell): Cost in conference currency

Dependencies:
- Requires: Booking options and periods defined
- Used in: Registration form pricing, invoice calculation
- Affects: Revenue, registration conversion

Best Practice:
- Create significant early bird discount to encourage early registration
- Set regular period longest to capture most registrations
- Late period should discourage last-minute registration (higher price)

---

### Discount Codes

What It Is: Promotional codes for reduced pricing.

Use Cases:
- Speaker discount code (50% off)
- Sponsor attendee codes (free passes)
- Student discount codes (30% off)
- Referral program codes (€20 off)

Configuration:
- Code: Text code attendees enter (e.g., "SPEAKER2024")
- Description: Internal description
- Discount Type: Percentage or fixed amount
- Discount Value: Percentage (25%) or amount (€50)
- Currency: For fixed discounts
- Start/End Date: Validity period
- Max Uses: Usage limit (0 = unlimited)
- Is Active: Enable/disable code
- Is Combinable: Can be used with other discounts

Applicability:
- Scoped to Booking Options: Only applies to specific options (or all if empty)
- Scoped to Booking Periods: Only valid in specific periods (or all if empty)

Bulk Generation:
- Generate codes for multiple people at once
- Sources: Sponsors, Speakers, Committee, Recipient Lists
- Template variables: `[FirstName]`, `[LastName]`, `[Email]`, `[Counter]`
- Example: `SPEAKER-[LastName]-[Counter]` → `SPEAKER-Smith-001`

Dependencies:
- Used in: Registration form checkout
- Affects: Invoice totals, revenue tracking

---

## Settings Configuration Checklist

Use this checklist when setting up a new conference. Items are ordered by dependencies.

### Phase 1: Foundation (Before Any Content Creation)

General Details (Details Tab):
- [ ] Set conference name, slug, dates
- [ ] Set conference country (affects VAT and timezone)
- [ ] Set timezone (affects all date/time display)
- [ ] Upload conference logo
- [ ] Add venue details, website, contact email

Finance - Company Data (Settings > Finance):
- [ ] Enter legal company name
- [ ] Add complete company address
- [ ] Add company VAT number (verify with green checkmark)
- [ ] Add tax number, registration number if required
- [ ] Add company contact email, phone, website

Finance - Currency & Tax (Settings > Finance):
- [ ] Set default conference currency
- [ ] Configure number format (EU vs US style)
- [ ] Review VAT decision table
- [ ] Override VAT rates if needed (consult tax advisor)

Email Settings (Settings > Communication):
- [ ] Configure SMTP server (host, port, username, password)
- [ ] Set "From Email" and "From Name"
- [ ] Test email sending with test recipient

### Phase 2: Structure (Before Building Program)

People & Roles (Settings > People & Roles):
- [ ] Add pronoun options (minimum: he/him, she/her, they/them, prefer not to say)
- [ ] Create committee roles if using CFP
- [ ] Create volunteer tasks if using volunteers module

Conference Setup (Settings > Conference Setup):
- [ ] Create location types matching venue structure
- [ ] Create session types with durations and colors
- [ ] Create sponsor packages with pricing and benefits

CFP & Reviews (Settings > CFP & Reviews) — If using CFP:
- [ ] Design paper form (add custom fields)
- [ ] Create score scales (e.g., 1-5)
- [ ] Create review criteria linked to score scales

### Phase 3: Finance & Invoicing (Before Sending First Invoice)

Finance - Numbering (Settings > Finance):
- [ ] Set invoice number prefix (e.g., "INV-2024-")
- [ ] Set credit note prefix (e.g., "CN-2024-")
- [ ] Configure zero-padding (e.g., 001 vs 1)
- [ ] Set starting sequence number

Finance - Bank Accounts (Settings > Finance):
- [ ] Add bank account details (IBAN, SWIFT, account holder)
- [ ] Verify IBAN and SWIFT codes (validation checks)
- [ ] Mark default account
- [ ] Add additional accounts for other currencies if needed

Finance - Invoice Templates (Settings > Finance):
- [ ] Customize invoice header and footer text
- [ ] Add payment terms to footer
- [ ] Add legal notices required in your jurisdiction
- [ ] Test PDF generation

Finance - Stripe Setup (Settings > Finance) — If using credit card payments:
- [ ] Create Stripe account
- [ ] Get API keys (secret, publishable)
- [ ] Configure webhook in Stripe dashboard
- [ ] Enter keys in SaaSConf
- [ ] Test full payment flow

Finance - ZUGFeRD (Settings > Finance) — Only if required:
- [ ] Enable ZUGFeRD if customers require it
- [ ] Select profile (BASIC recommended)
- [ ] Test with customer's accounting system

### Phase 4: Communication (Before Launch)

Communication - Email Templates (Settings > Communication):
- [ ] Customize registration confirmation template
- [ ] Customize invoice send template
- [ ] Customize credit note template
- [ ] Customize CFP submission confirmation (if using CFP)
- [ ] Customize CFP acceptance/rejection templates (if using CFP)
- [ ] Test all templates with sample data

Communication - Messaging (Settings > Communication):
- [ ] Enable messaging if using bulk communications
- [ ] Set reply-to email to monitored inbox
- [ ] Set sender name

Communication - Message Templates (Settings > Communication):
- [ ] Create welcome message template
- [ ] Create program update template
- [ ] Create post-conference survey template

Communication - Screen Overlays (Settings > Communication):
- [ ] Create welcome overlay for first portal visit
- [ ] Create CFP deadline reminder overlay (if using CFP)
- [ ] Upload images and test animations

### Phase 5: Booking & Registration (Before Registration Opens)

Booking Options (Booking Tab):
- [ ] Create all ticket types (2-day, 1-day, virtual, etc.)
- [ ] Add rich-text descriptions
- [ ] Link to program days if using session selection
- [ ] Activate all options

Booking Periods (Booking Tab):
- [ ] Create early bird period with dates
- [ ] Create regular period with dates
- [ ] Create late period with dates (optional)
- [ ] Verify dates don't overlap

Pricing Matrix (Booking Tab):
- [ ] Set price for each option in each period
- [ ] Verify early bird discounts are significant (20-30%)
- [ ] Test pricing display on registration form

Discount Codes (Booking Tab):
- [ ] Create speaker discount codes
- [ ] Create sponsor discount codes
- [ ] Generate bulk codes if needed
- [ ] Test code redemption

### Phase 6: Final Testing (Before Public Launch)

End-to-End Testing:
- [ ] Complete full registration as attendee
- [ ] Receive and verify registration confirmation email
- [ ] Verify invoice generated correctly with all company data
- [ ] Test payment flow (bank transfer and/or credit card)
- [ ] Test CFP submission (if using CFP)
- [ ] Test portal login and screen overlay display
- [ ] Test messaging to attendees

Launch Checklist:
- [ ] All settings reviewed and saved
- [ ] All templates tested with real data
- [ ] All integrations working (email, Stripe)
- [ ] Portal URLs tested and shared with team
- [ ] Support email monitored

---

## Settings Templates by Conference Type

Pre-configured settings recommendations for common conference types.

### Academic Conference

Recommended Settings:

Session Types:
- Keynote (90 min)
- Full Paper (30 min)
- Short Paper (15 min)
- Poster Session (2 hours)
- Doctoral Consortium (4 hours)
- Panel Discussion (60 min)

Booking Options:
- Full Conference Pass (3 days)
- Single Day Pass
- Student Pass (50% discount)
- Virtual Access Only

Booking Periods:
- Early Bird (6 months before): 30% discount
- Regular (3 months before): Standard price
- Late (1 month before): 15% surcharge

CFP Settings:
- Score Scale: 1-5 (Strong Accept to Strong Reject)
- Review Criteria:
  - Technical Quality (weight: 30%)
  - Relevance (weight: 25%)
  - Originality (weight: 25%)
  - Presentation Clarity (weight: 20%)

Pronouns: Include academic titles option

Volunteer Tasks:
- Session Chair
- Registration Desk
- Poster Setup
- Audio/Visual Support

---

### Tech/Professional Conference

Recommended Settings:

Session Types:
- Keynote (60 min)
- Talk (45 min)
- Workshop (3 hours)
- Lightning Talk (10 min)
- Panel (60 min)
- Networking Session (90 min)

Booking Options:
- 2-Day Conference Pass
- 1-Day Pass (specify day)
- Workshop Add-on
- Virtual Ticket
- Networking Dinner Add-on

Booking Packages:
- Premium Experience = Conference + Workshop + Dinner
- Virtual Plus = Virtual + Workshop Recording Access

Booking Periods:
- Super Early Bird (8 months before): 40% discount
- Early Bird (4 months before): 25% discount
- Regular (1 month before): Standard price
- Last Minute (1 week before): 20% surcharge

Discount Codes:
- Speaker code (100% off conference, 50% off dinner)
- Sponsor attendee codes (free passes based on package tier)
- Referral code (€50 off for referrer and referee)

Sponsor Packages:
- Platinum (€15,000): 10 free passes, booth, keynote slot
- Gold (€10,000): 5 free passes, booth
- Silver (€5,000): 2 free passes, logo on website
- Bronze (€2,500): Logo on website

Volunteer Tasks:
- Registration
- Speaker Support
- Booth Setup
- Social Media Coverage

---

### Virtual Conference

Recommended Settings:

Session Types:
- Keynote (60 min)
- Talk (30 min)
- Virtual Workshop (90 min)
- Q&A Session (20 min)
- Virtual Networking (30 min)

Booking Options:
- All-Access Pass
- Single-Day Access
- On-Demand Only (recordings)

Booking Periods:
- Early Bird (3 months before): 30% discount
- Regular (1 month before): Standard price
- Late (1 week before): 10% surcharge

Location Types:
- Zoom Room A, B, C
- YouTube Live
- Discord Channel

VAT Configuration:
- CRITICAL: Virtual conferences trigger different VAT rules
- Attendance type: "virtual"
- B2B customers in EU: Reverse charge (require VAT number)
- B2C customers in EU: OSS rate (customer country VAT)

Email Templates:
- Add platform links (Zoom, Discord, etc.) to all confirmations
- Include tech support contact for platform issues

---

### Hybrid Conference

Recommended Settings:

Session Types:
- Keynote (90 min) [hybrid]
- In-Person Talk (30 min)
- Virtual Talk (30 min)
- Hybrid Panel (60 min)
- In-Person Workshop (4 hours)

Booking Options:
- In-Person Pass (2 days)
- Virtual Pass (2 days)
- Hybrid Pass (in-person + virtual)
- In-Person + Workshop
- Virtual + Workshop Recording

Location Types:
- Main Hall (300 capacity) [hybrid setup]
- Room A (50 capacity)
- Room B (50 capacity)
- Zoom Room 1 (virtual only)
- Zoom Room 2 (virtual only)

Booking Periods:
- Early Bird (5 months before): 35% discount
- Regular (2 months before): Standard price
- Late (2 weeks before): 15% surcharge

VAT Configuration:
- Attendance type:
  - "hybrid_onsite" for in-person bookings
  - "hybrid_online" for virtual bookings
- B2B virtual attendees in EU: Require VAT number (reverse charge)

Special Considerations:
- Separate pricing for in-person vs virtual (virtual 40-50% of in-person)
- Include technology fee in in-person price (cameras, streaming)
- Workshop pricing higher for in-person (venue, catering costs)

---

## Settings Best Practices

### Configuration Order

Always configure in this order:

1. General Details (country, timezone, currency) — Affects everything
2. Company Data (legal info, VAT number) — Required for invoices
3. Email Settings (SMTP) — Required for communications
4. People & Roles (pronouns, roles) — Required before user data
5. Structure (session types, locations) — Required before program
6. Finance (numbering, bank accounts, templates) — Required before first invoice
7. Communication (templates, overlays) — Required before launch
8. Booking (options, periods, pricing) — Required before registration

Why: Later settings depend on earlier ones. Setting currency after creating invoices causes inconsistency.

---

### Settings That Affect Other Features

Country (Details Tab):
- Affects: VAT calculation, timezone defaults, number format presets
- Impact: Changing after invoices exist invalidates VAT calculations
- Rule: Set once and don't change

Timezone (Details Tab):
- Affects: All date/time display, session schedules, deadline reminders
- Impact: Changing after sessions exist shifts all times visually
- Rule: Set once based on venue location, don't change

Currency (Finance Settings):
- Affects: Invoice calculations, pricing display, Stripe integration
- Impact: Changing after invoices exist creates inconsistency
- Rule: Set once and don't change

Pronoun Options (People & Roles):
- Affects: Registration forms, Replace Attendee modal, CFP applications
- Impact: Adding options is safe, deleting options breaks existing data
- Rule: Add early, rarely delete

Session Types (Conference Setup):
- Affects: Program grid layout, booking logic (tutorials)
- Impact: Changing "Is Tutorial" flag after registrations breaks booking rules
- Rule: Define completely before sessions, don't change flags

Score Scales (CFP & Reviews):
- Affects: Review score calculations, acceptance decisions
- Impact: Changing scale after reviews exist invalidates comparisons
- Rule: Define before reviews start, don't change

---

### Settings Validation

Before Launch, Verify:

Finance Settings:
- [ ] Company VAT number shows green checkmark (valid)
- [ ] Bank IBAN shows green checkmark (valid format)
- [ ] Invoice number sequence starts at correct number
- [ ] Test invoice PDF renders correctly with all company data
- [ ] Stripe test payment completes successfully

Email Settings:
- [ ] Test email sends successfully
- [ ] Email arrives in inbox (not spam)
- [ ] From name and email appear correctly
- [ ] Reply-to email is monitored inbox

Communication Settings:
- [ ] All email templates render correctly with placeholders
- [ ] Screen overlays display properly in portal
- [ ] Message templates have correct formatting

Booking Settings:
- [ ] Pricing matrix has no empty cells
- [ ] Early bird period ends before regular starts
- [ ] Discount codes validate correctly in checkout
- [ ] Session selection works for tutorial days

CFP Settings (if using):
- [ ] Paper form includes all required fields
- [ ] Review criteria total to 100% weight
- [ ] Score scales match expected range

---

## Common Configuration Mistakes

### Mistake 1: Setting Currency After Creating Invoices

Problem: Invoices created before currency setting use system default, creating mixed-currency invoice list.

Symptom: Some invoices show EUR, others show USD.

Fix:
- Set currency in Finance Settings before creating first invoice
- If already happened: Manually update currency on draft invoices, recreate sent invoices

Prevention: Follow configuration checklist order (currency in Phase 1).

---

### Mistake 2: Changing Country After Program Built

Problem: VAT calculations depend on conference country. Changing invalidates all existing invoice VAT.

Symptom: Old invoices have wrong VAT rate, new invoices have different rate.

Fix:
- Recalculate VAT on all draft invoices
- Sent invoices cannot be updated (cancel and recreate if needed)

Prevention: Never change country after creating invoices or registrations.

---

### Mistake 3: Not Configuring Pronouns Before Registration

Problem: Replace Attendee modal has empty pronoun dropdown if not configured.

Symptom: Cannot complete Replace Attendee action, admin sees empty dropdown.

Fix:
- Go to Settings > People & Roles > Pronoun Options
- Add options (he/him, she/her, they/them, prefer not to say)
- Retry Replace Attendee

Prevention: Add pronouns in Phase 1 (before any registrations).

---

### Mistake 4: Using Weak Early Bird Discounts

Problem: Early bird discount too small (5-10%) doesn't incentivize early registration.

Symptom: Most registrations happen in regular period, cash flow issues.

Fix:
- Increase early bird discount to 25-35%
- Extend early bird period to capture more registrations
- Communicate early bird deadline prominently

Prevention: Use 30% discount as starting point, A/B test if needed.

---

### Mistake 5: Not Testing Email Before Launch

Problem: SMTP settings incorrect, no emails sent after registration opens.

Symptom: Attendees don't receive confirmation emails, complaints increase.

Fix:
- Verify SMTP settings (host, port, username, password)
- Test sending to multiple email providers (Gmail, Outlook, Yahoo)
- Check spam folder
- Review email server logs for errors

Prevention: Send test emails during Phase 1 (Email Settings configuration).

---

### Mistake 6: Missing Company Data Fields

Problem: Required legal fields (VAT number, registration number) not filled.

Symptom: Invoices legally invalid, customers cannot process for payment.

Fix:
- Complete all company data fields in Finance > Company Data
- Verify VAT number with green checkmark
- Regenerate PDFs for sent invoices (if possible)

Prevention: Complete company data in Phase 1, verify all required fields for jurisdiction.

---

### Mistake 7: Forgetting to Configure Webhook for Stripe

Problem: Stripe payments succeed but invoice status stays "sent" instead of "paid".

Symptom: Manual reconciliation required, payment tracking broken.

Fix:
- Configure webhook in Stripe dashboard
- URL: `https://your-domain.com/api/v1/stripe/webhook`
- Events: payment_intent.succeeded, payment_intent.payment_failed, charge.succeeded
- Enter webhook secret in SaaSConf

Prevention: Follow Stripe Setup checklist in Phase 3 completely.

---

### Mistake 8: Overlapping Booking Periods

Problem: Early bird and regular periods overlap (early bird ends Mar 1, regular starts Feb 28).

Symptom: System doesn't know which price to show on Feb 28-Mar 1.

Fix:
- Adjust period dates so they don't overlap
- Early bird ends: Feb 28 23:59
- Regular starts: Mar 1 00:00

Prevention: Configure periods sequentially with no gaps or overlaps.

---

### Mistake 9: Empty Pricing Matrix Cells

Problem: Created booking option but forgot to set price for some periods.

Symptom: Registration form shows "Price not set" or blank, cannot complete checkout.

Fix:
- Go to Booking Tab > Pricing Matrix
- Fill in all cells (every option × every period)
- Verify no empty cells remain

Prevention: Complete entire pricing matrix immediately after creating options/periods.

---

### Mistake 10: Changing Session Type "Is Tutorial" After Registrations

Problem: Session type flagged as tutorial after attendees already registered for multiple "tutorial" sessions.

Symptom: Booking validation breaks, system prevents new registrations.

Fix:
- Revert "Is Tutorial" flag to original value
- If tutorial limit needed, create new session type for future sessions

Prevention: Define all session types with correct flags before building program.

---

## Cross-Reference Guide

Settings documentation is distributed across multiple resources. Use this guide to find detailed information.

### Where to Find Detailed Documentation

Invoice Settings:
- Numbering, Company Data, Bank Accounts, Templates, ZUGFeRD: See invoices documentation
- PDF Generation: See invoices documentation
- VAT Configuration: See "VAT Settings" section in handbook

Stripe Integration:
- Setup, Payment Flow, Webhooks, Refunds: See invoices documentation

Email System:
- Templates, Placeholders, Email Sending: See invoices documentation
- SMTP Configuration: See devops documentation

Booking Settings:
- Discount Codes, Bulk Generation: See modules documentation
- Session Selection in Registration: See modules documentation

Communication Settings:
- Screen Overlays, Image Upload, Trigger Types: See modules documentation

Volunteer Settings:
- Volunteer Tasks (Roles), Task Assignment, Scheduling: See modules documentation

CFP Settings:
- Paper Form Builder, Score Scales, Review Criteria: See modules documentation

Security & Validation:
- VAT Number Validation, Country Fields, Field Validation: See security documentation

---

## Summary

The Settings section provides comprehensive control over your conference configuration. By following the configuration checklist, avoiding common mistakes, and consulting the detailed documentation for specific areas, you can set up a professional, compliant conference platform.

Key Takeaways:

1. Order Matters: Configure general settings (country, currency, timezone) first, structure settings second, finance third.

2. Test Everything: Verify email sending, payment processing, VAT calculations before launch.

3. Don't Change Core Settings: Country, timezone, currency should be set once and never changed.

4. Use Templates: Start with a conference type template (academic, tech, virtual, hybrid) and customize.

5. Consult Documentation: Settings interact with many features — read detailed docs for critical areas (invoices, VAT, Stripe).

6. Plan Ahead: Configure pronouns, templates, and structures before data creation (registrations, sessions, reviews).

---

Next Steps: After completing settings configuration, proceed to building your conference content (program, sessions, sponsors, CFP) using the structures you've defined.


---


# SaaSConf Best Practices Guide

Comprehensive operational guidance for conference organizers

This guide synthesizes best practices from all SaaSConf modules to help you run successful conferences. Use this as your operational playbook.

---

## Table of Contents

1. [Pre-Conference Planning](#pre-conference-planning)
2. [Financial Management](#financial-management)
3. [Registration Management](#registration-management)
4. [CFP Best Practices](#cfp-best-practices)
5. [Program Management](#program-management)
6. [Communication Strategy](#communication-strategy)
7. [Sponsor Management](#sponsor-management)
8. [Team Collaboration](#team-collaboration)
9. [Data Quality & Maintenance](#data-quality--maintenance)
10. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)
11. [Conference Type-Specific Guidance](#conference-type-specific-guidance)

---

## Pre-Conference Planning

### Timeline: 6 Months Out

Conference Setup
- [ ] Create conference in system with basic details (name, dates, location, attendance type)
- [ ] Configure conference country for VAT calculations
- [ ] Set conference currency (EUR, USD, GBP, etc.)
- [ ] Upload conference logo and branding assets
- [ ] Set timezone for all date/time displays

Financial Configuration
- [ ] Create booking periods (Early Bird, Regular, Late Registration)
  - Early Bird: 6-4 months before event
  - Regular: 4-1 months before event
  - Late: 1 month to event date
- [ ] Define booking options (tickets):
  - Full Conference Pass
  - Single Day Passes
  - Virtual-Only Access (if hybrid)
  - Student/Academic rates
  - Industry rates
- [ ] Create booking packages (if bundling options)
- [ ] Configure VAT rates by country (review tenant overrides vs global defaults)
- [ ] Set up invoice templates and numbering format
- [ ] Configure payment methods (bank transfer, credit card via Stripe)

CFP Setup
- [ ] Create CFP form schema with required fields:
  - Talk title, abstract, description
  - Track/topic selection
  - Speaker bio, photo, social links
  - Session type (keynote, talk, panel, workshop, tutorial)
- [ ] Define submission topics/tracks
- [ ] Set CFP open/close dates
- [ ] Configure review criteria and scoring system
- [ ] Create review committee (if using peer review)

Content Planning
- [ ] Define program days and time slots
- [ ] Create tracks (if multi-track conference)
- [ ] Define session types (keynote, talk, lightning talk, panel, workshop, tutorial, social)
- [ ] Create locations/rooms for sessions
- [ ] Plan special events (keynotes, networking, dinners)

Team Setup
- [ ] Add tenant admins with appropriate permissions
- [ ] Create team member accounts for specific roles:
  - Finance team (invoice management)
  - Program committee (CFP review)
  - Volunteer coordinators
  - Communication managers
- [ ] Document internal workflows and responsibilities

### Timeline: 3 Months Out

Registration Launch
- [ ] Test registration flow end-to-end (create test registrations)
- [ ] Verify email templates for registration confirmation
- [ ] Set up discount codes:
  - Speaker discount codes (100% or partial)
  - Sponsor discount codes
  - Partner organization codes
  - Group registration incentives
- [ ] Configure pronouns options in settings (he/him, she/her, they/them, prefer not to say)
- [ ] Enable self-registration portal
- [ ] Announce registration opening

CFP Launch
- [ ] Announce CFP opening via email and social media
- [ ] Create screen overlay for CFP announcement (trigger: first login)
- [ ] Set up automated CFP status emails:
  - Submission confirmation
  - Review period notification
  - Acceptance/rejection notifications
- [ ] Recruit reviewers and assign to committee

Sponsor Outreach
- [ ] Create sponsor packages (Gold, Silver, Bronze, etc.)
- [ ] Generate sponsor contract templates
- [ ] Begin sponsor outreach campaign
- [ ] Create recipient lists for sponsor communications

### Timeline: 1 Month Out

CFP Closure & Program Building
- [ ] Close CFP submissions
- [ ] Complete all reviews (assign reviewers if needed)
- [ ] Make acceptance/rejection decisions
- [ ] Send acceptance/rejection emails with personal messages
- [ ] Request accepted speakers confirm attendance
- [ ] Begin building program schedule
- [ ] Assign sessions to time slots and tracks
- [ ] Mark sessions as separately bookable (if attendees choose sessions)

Registration Management
- [ ] Review registration numbers by ticket type
- [ ] Send reminder emails to incomplete registrations
- [ ] Follow up on unpaid invoices (overdue status)
- [ ] Close Early Bird period, activate Regular pricing
- [ ] Process group registrations and special requests

Sponsor Management
- [ ] Finalize sponsor contracts (send for signature)
- [ ] Send sponsor invoices
- [ ] Track sponsor payments
- [ ] Coordinate sponsor logistics (booth setup, materials)

Communication Prep
- [ ] Create email templates for:
  - Pre-event reminders (1 week, 3 days, 1 day)
  - Daily schedules
  - Session reminders
  - Post-event thank you
- [ ] Schedule screen overlays:
  - Event schedule highlights
  - Important announcements
  - Sponsor acknowledgments
- [ ] Prepare messaging templates for common questions

### Timeline: 1 Week Out

Final Preparations
- [ ] Publish final program (make visible to attendees)
- [ ] Send pre-event email with:
  - Schedule overview
  - Location/venue details
  - Check-in instructions
  - WiFi credentials
  - Emergency contacts
  - Session recommendations
  - Mobile app download (if available)
- [ ] Close late registration (or set cutoff)
- [ ] Generate attendee lists for check-in
- [ ] Export registration data for badge printing
- [ ] Assign volunteers to tasks (if using volunteer module)
- [ ] Create volunteer schedules

Data Quality Check
- [ ] Review registration data for duplicates
- [ ] Verify all paid registrations are linked to invoices
- [ ] Check for missing contact information
- [ ] Validate VAT numbers on B2B invoices (avoid audit issues)
- [ ] Export backup of all data (registrations, CFP, invoices)

Team Coordination
- [ ] Hold team briefing meeting
- [ ] Distribute volunteer schedules
- [ ] Assign on-site responsibilities
- [ ] Set up communication channels (Slack, WhatsApp group)
- [ ] Review contingency plans

---

## Financial Management

### Pricing Strategy

Use Time-Based Pricing Periods
- Early Bird (6-4 months out): 20-30% discount to drive early registrations
- Regular (4-1 months out): Standard pricing for majority of attendees
- Late (1 month to event): 10-20% premium to encourage early registration

Package vs Individual Options
- Packages: Bundle related items (Full Conference + Dinner + Workshop)
  - Pros: Simplifies pricing, encourages upsells, reduces decision fatigue
  - Cons: Less flexibility, may include items attendees don't want
- Individual Options: À la carte selection
  - Pros: Maximum flexibility, attendees pay only for what they want
  - Cons: More complex pricing, requires more decision-making

Best Practice: Offer both packages (for simplicity) and individual options (for flexibility)

Example Structure:
- Full Conference Package: All days + networking dinner (15% savings)
- 2-Day Pass: Access to main conference days only
- 1-Day Pass: Single day access
- Add-ons: Tutorials, workshops, special dinners (separately bookable)

### Discount Code Strategy

Types of Discount Codes
1. Speaker Codes: 100% discount for accepted speakers
2. Sponsor Codes: Complimentary or discounted tickets per sponsorship tier
3. Partner Codes: Academic institutions, user groups (10-20% discount)
4. Group Codes: 5+ registrations from same organization (15% discount)
5. Promotional Codes: Limited-time offers for marketing campaigns

Best Practices
- Use descriptive code names: `SPEAKER2026`, `EARLYBIRD25`, `ACMEGROUP15`
- Set expiration dates to create urgency
- Limit max uses for promotional codes (prevent abuse)
- Make codes non-combinable unless specifically designed to stack
- Apply codes to specific booking options/periods (scope appropriately)

Bulk Generation for People Groups
- Generate codes for: Sponsors, Speakers, Program Committee, Custom Recipient Lists
- Use template variables: `[ConferenceSlug]-[LastName]-[Counter]`
- Example: `PYCON2026-SMITH-001`, `PYCON2026-SMITH-002`
- Review duplicate preview before confirming generation

### VAT Compliance

Critical VAT Rules
1. Virtual/Hybrid-Online + EU B2B = Reverse Charge Required
   - VAT number is legally required (Article 196, EU VAT Directive)
   - System shows red asterisk and error warning
   - Cannot proceed without VAT number (or admin override)

2. In-Person + EU B2B = VAT Recommended
   - VAT number is best practice but not mandatory
   - System shows yellow "(Recommended for B2B)" label
   - Helps customer reclaim input VAT

3. Always validate VAT numbers before sending invoices
   - Green checkmark = verified against VIES registry
   - Yellow warning = format OK but VIES unavailable (safe to send)
   - Red X = invalid format (ask customer to verify)

4. Document VAT decisions
   - Review VAT warning banners before sending
   - Check rule references (e.g., "Article 196")
   - Add internal comments explaining admin overrides

VAT Decision Table Quick Reference

| Attendance Type | Customer Type | Location | VAT Treatment |
|----------------|---------------|----------|---------------|
| Virtual | B2B | EU (different) | Reverse charge (0%) - VAT # required |
| Virtual | B2C | EU (different) | OSS rate (customer country) |
| Virtual | Any | Non-EU | No VAT |
| In-Person | B2B | Same country | Conference country VAT |
| In-Person | B2B | EU (different) | Conference country VAT |
| In-Person | B2C | Any | Conference country VAT |
| Hybrid-Online | B2B | EU (different) | Reverse charge (0%) - VAT # required |
| Hybrid-Onsite | B2B | Any | Conference country VAT |

VAT Rate Overrides
- Global defaults maintained for all EU countries
- Tenant overrides available for:
  - Reduced rates (books, publications, education)
  - Special economic zones
  - Industry-specific exemptions
- Configure in: Conference Settings > VAT Settings > Country Rates

### Invoice Management Workflow

1. Create Drafts Early
- Lock in pricing before event
- Easy to update while in draft status
- No audit trail concerns with draft edits

2. Invoice Types
- Bank Transfer: Traditional invoicing with wire transfer details
  - Best for: Large corporate sponsors, government entities
  - Payment tracking: Manual (mark as paid when received)
- Credit Card: Stripe-integrated with payment link
  - Best for: Individual registrations, fast payment needed
  - Payment tracking: Automatic via webhook

3. Recipient Search
- Search across: Sponsors, Speakers, Committee, Volunteers, Registrations
- Auto-fills: Company name, address, email, VAT number
- Reduces data entry errors

4. Review Before Sending
- Check VAT warnings (red = compliance risk, yellow = best practice)
- Verify recipient address is complete and accurate
- Confirm line items, quantities, prices
- Add internal comments for team coordination
- Review due date (typically 30 days from issue date)

5. Correction Workflows

For Billing Corrections (wrong name, address, VAT, PO number):
- Use Replace Invoice feature
- System automatically:
  - Cancels old invoice (creates credit note)
  - Creates new invoice with corrected billing
  - Keeps registrations active (no disruption)
  - Inherits payment status (paid invoices stay paid)
  - Handles Stripe payment links (deactivates old, creates new if needed)

For Amount/Line Item Changes:
- Cancel existing invoice (creates credit note)
- Create new invoice with correct details
- Send new invoice to customer

For True Cancellations (event cancelled, refund needed):
- Use Cancel Invoice with "Cancel all registrations" checked
- System automatically:
  - Creates credit note
  - Cancels all linked registrations
  - Removes conference access
  - Issues Stripe refund (credit card invoices)
  - Sends cancellation emails to attendees

Decision Tree:
Is billing info wrong (name, address, VAT, PO)?
- YES → Use "Replace Invoice" (fast, no disruption)
- NO → Is the invoice amount/items wrong?
    - YES → Cancel + Create New Invoice
    - NO → True cancellation (refund)?
        - YES → Cancel Invoice + Cancel Registrations
        - NO → Leave as-is

6. Payment Tracking
- Credit card: Automatic via Stripe webhooks (instant status update)
- Bank transfer: Manual marking required
  - Click "Mark as Paid"
  - Enter payment date and bank reference
  - Add internal comment with transaction details

7. Follow-Up on Overdue Invoices
- System automatically flags invoices past due date
- Review overdue invoices weekly
- Send reminder emails (use messaging templates)
- For sponsors: Coordinate with account manager
- For registrations: May need to cancel access if payment not received

### Refund Policies

Define Refund Policy Early
- Document in conference settings and website
- Typical structure:
  - More than 30 days before: 100% refund
  - 15-30 days before: 50% refund
  - Less than 15 days: No refund (or credit to next year)

Processing Refunds
1. Cancel the invoice (creates credit note)
2. For credit card payments: System auto-refunds via Stripe
3. For bank transfers: Process manual refund, document in comments
4. Cancel registration if appropriate
5. Update internal tracking (spreadsheet, CRM)

Attendee Replacement as Alternative
- Offer replacement instead of refund when possible
- Use Replace Attendee feature:
  - Keeps invoice valid (no refund needed)
  - Transfers registration to new person
  - Maintains revenue
  - Better for organizer and attendee

---

## Registration Management

### Self-Registration vs Manual Entry

Self-Registration (Recommended for Most Cases)
- Pros:
  - Reduces admin workload
  - Attendees provide accurate information
  - Immediate confirmation and payment
  - Scales to hundreds/thousands of registrations
- Cons:
  - Requires functioning portal and email delivery
  - Attendees may enter incorrect data
  - No pre-screening of registrations

When to Use: Public conferences, open registration, large events

Manual Entry (Admin-Created Registrations)
- Pros:
  - Full control over data quality
  - Can pre-register VIPs, speakers, sponsors
  - Useful for complementary tickets
  - No portal access needed for attendee
- Cons:
  - Labor-intensive for large numbers
  - Admin errors possible
  - Slower process

When to Use: VIP registrations, comp tickets, speaker registrations, small exclusive events

Best Practice: Use both
- Enable self-registration for general attendees
- Manually create registrations for speakers, sponsors, committee members
- Use discount codes to control access (speaker codes, invitation-only codes)

### Registration Workflow

1. Configure Settings First
- Add pronouns options (he/him, she/her, they/them, prefer not to say, other)
- Enable/disable fields (phone, job title, department, dietary restrictions)
- Set required vs optional fields
- Configure session selection (if separately bookable sessions)

2. Session Selection Strategy

Separately Bookable Sessions
- Mark program sessions as `separately_bookable: true`
- Attendees choose sessions during registration (for workshops, tutorials)
- System groups by session type (Tutorial, Workshop, Hackathon)
- Parallel sessions: Choose one via dropdown
- Non-parallel sessions: Choose from each independently

When to Use:
- Limited capacity sessions (workshops, tutorials)
- Parallel tracks where attendee must pick one
- Special activities requiring advance selection

When Not to Use:
- Open sessions anyone can attend
- Keynotes and plenaries (everyone attends)
- Sessions with unlimited capacity

3. Group Registrations

Group Registration Flow:
- Single billing profile for entire group
- Multiple attendee records (each with own data)
- One invoice for all attendees

Best Practices:
- Require one contact person for group (receives all communications)
- Collect individual attendee emails (for personal communications)
- Offer group discounts (5+ attendees = 15% off, 10+ = 20% off)
- Send confirmation to both group contact and individual attendees

4. Data Quality Maintenance

Email Validation
- System validates format on blur (real-time)
- Red border indicates invalid email
- Common mistakes: Missing @, invalid domain, typos (.con instead of .com)

Phone Validation
- Accepts international formats with country code (+1, +44, +49)
- Allows spaces, dashes, parentheses for readability
- Format: +1-555-123-4567 or +44 20 1234 5678

VAT Number Validation
- Green checkmark = verified via VIES
- Yellow warning = format OK but VIES unavailable
- Red X = invalid format
- Always validate B2B registrations

5. Handling Special Cases

Speaker Registrations
- Create manually with 100% discount code
- Link to CFP paper/session
- Mark as "Speaker" in registration type (if field exists)
- Send special welcome email with speaker info

Sponsor Registrations
- Use sponsor-specific discount codes
- May be complimentary or discounted per package
- Track against sponsor package allocation (Gold = 5 tickets, Silver = 3, etc.)
- Link to sponsor record for reporting

Group Registrations from Companies
- Collect single billing profile
- Individual attendee details for each person
- One invoice for entire group
- Bulk discount if applicable

Academic/Student Registrations
- Require proof of enrollment (upload or email verification)
- Separate ticket type with reduced pricing
- May require manual approval

### Attendee Replacement

When to Replace an Attendee
- Original attendee can't attend (illness, conflict, job change)
- Employee left company, replacement attending
- Wrong person registered initially
- Department transfer within organization

Replacement Process
1. Navigate to registration in admin panel
2. Click Replace Attendee
3. Enter new attendee information:
   - First Name, Last Name (required)
   - Email (required, validated)
   - Phone (validated if provided)
   - Pronouns (from conference settings)
   - Job Title, Department (optional)
4. Enter Replacement Reason (required for audit trail)
5. Add Cancellation Message (sent to original attendee)
6. Optionally add additional booking items for new attendee:
   - Booking options (meals, workshops)
   - Tutorials (max one)
   - System prevents duplicates automatically
7. Review summary and click Replace

What Happens Automatically:
- Original registration: Status → CANCELLED, access removed
- New registration: Created with replacement link, access granted
- Original attendee: Receives cancellation email
- New attendee: Receives welcome email
- Additional items (if added): New invoice created (delta invoicing)
- Billing profile: Inherited from original registration
- Audit trail: Full replacement record with reason, timestamp, admin

Validation Rules:
- Cannot replace already-replaced registrations (follow chain instead)
- Cannot replace cancelled registrations
- Cannot add duplicate booking items
- Cannot add multiple tutorials (one at a time)
- Email and phone must be valid formats
- Pronouns must be from conference settings (no custom text)

Additional Items Best Practices:
- Only add items new attendee actually needs
- Remember: Creates a new invoice (sent to billing contact)
- Check billing profile is correct before adding paid items
- System filters out items attendee already has
- Tutorial option disabled if attendee already has one

Use Cases:
- Simple Transfer: Employee A leaves, Employee B attends → Straight replacement, no additional items
- Replacement with Upgrades: New attendee wants tutorial → Add tutorial as additional item
- Cross-Department Transfer: Different department, different needs → Replace + add department-specific items

---

## CFP Best Practices

### Timeline Planning

6 Months Before Conference
- Open CFP submissions
- Announce widely (mailing lists, social media, partner organizations)
- Create submission guidelines and FAQ

3-4 Months Before Conference
- Close CFP submissions
- Allow 1-2 week grace period for technical issues only

2-3 Months Before Conference
- Complete all reviews
- Make acceptance/rejection decisions
- Send notifications with personal messages

2 Months Before Conference
- Confirm speaker attendance
- Request speaker bio/photo updates
- Collect session materials (slides, handouts)

1 Month Before Conference
- Finalize program schedule
- Publish program to attendees
- Send speaker logistics (AV requirements, room locations, rehearsal times)

### Review Process Setup

Single-Blind vs Double-Blind Review
- Single-Blind: Reviewers see submitter names (most common)
  - Pros: Context about speaker experience, easier logistics
  - Cons: Potential bias based on reputation
- Double-Blind: Reviewers don't see submitter names
  - Pros: Reduces bias, focuses on content quality
  - Cons: Harder to implement, submitters may reveal identity in proposal

Review Criteria
- Relevance to conference theme/tracks (1-5 points)
- Technical quality/depth (1-5 points)
- Clarity of presentation/abstract (1-5 points)
- Novelty/originality (1-5 points)
- Speaker experience (1-5 points, only for single-blind)

Scoring System
- Use weighted average across criteria
- Set minimum score threshold for acceptance (e.g., 3.5/5.0)
- Allow written comments in addition to scores
- Flag conflicts of interest (reviewer works with submitter)

### Reviewer Assignment Strategies

Random Assignment
- System assigns papers randomly to reviewers
- Ensures even distribution of workload
- May result in poor topic matching

Topic-Based Assignment
- Assign papers to reviewers based on expertise tags
- Better quality reviews (reviewers understand content)
- Requires manual configuration or smart matching

Round-Robin Assignment
- Papers assigned in rotation to reviewers
- Ensures equal workload
- Combines with topic matching for best results

Best Practice:
1. Assign 3 reviewers per paper (odd number prevents ties)
2. Each reviewer gets 10-15 papers (manageable workload)
3. Match papers to reviewer expertise when possible
4. Allow reviewer self-assignment from pool (opt-in for interest)

### Decision Communication

Acceptance Notifications
- Send personal congratulations message
- Include:
  - Session details (date, time, room if known)
  - AV/technical requirements form
  - Speaker agreement (slides due date, code of conduct)
  - Complimentary registration code (if offered)
  - Next steps (confirm attendance, bio/photo, travel info)
- Set deadline for confirmation (2 weeks typical)

Rejection Notifications
- Be respectful and constructive
- Include:
  - Thank you for submission
  - Explanation of competitive process (# submissions vs slots)
  - General feedback (optional: "scores were slightly below threshold")
  - Invitation to attend conference anyway
  - Encouragement to submit to future events
- DO NOT include:
  - Reviewer names or individual scores
  - Harsh criticism or detailed negative feedback
  - Comparison to accepted papers

Waitlist Strategy
- Accept top 80% of needed talks initially
- Waitlist next 20% (backups in case speakers drop out)
- Notify waitlisted submitters:
  - Status is "waitlist" not rejection
  - May be promoted if slots open
  - Deadline for final decision (1 month before event)
  - Invitation to attend conference

### Managing Difficult Situations

Late Submissions
- Set hard deadline (system enforces)
- Allow 24-hour grace period for technical issues only
- Document policy clearly on CFP page
- Don't make exceptions (unfair to on-time submitters)

Conflict of Interest
- Reviewer works with submitter or at same company
- Reviewer previously collaborated with submitter
- Personal relationship between reviewer and submitter

Resolution: Reassign paper to different reviewer, flag in system

Low-Quality Submissions
- Incomplete proposals (missing abstract, description)
- Off-topic submissions (not relevant to conference)
- Sales pitches or product demos (not educational)

Resolution: Reject early with explanation, don't waste reviewer time

Speaker Withdrawals After Acceptance
- Speaker can no longer attend (conflict, emergency)
- Company won't approve travel
- Talk content no longer relevant

Resolution:
1. Check waitlist for suitable replacement
2. Invite co-speaker to present alone (if applicable)
3. Last resort: Cancel session, adjust program schedule

Duplicate Submissions
- Same talk submitted to multiple tracks
- Same submitter with multiple similar talks

Resolution: Ask submitter to choose one, or choose best fit for program

Plagiarism or Misconduct
- Submission contains plagiarized content
- Violates code of conduct

Resolution: Immediate rejection, potential ban from future submissions, document incident

---

## Program Management

### Session Scheduling Tips

1. Define Time Structure First
- Create program days (Day 1, Day 2, Day 3)
- Create time slots (09:00-09:45, 10:00-10:45, etc.)
- Standard slot lengths:
  - Keynotes: 45-60 minutes
  - Talks: 30-45 minutes
  - Lightning talks: 5-10 minutes
  - Workshops/Tutorials: 90-180 minutes (multi-slot)
  - Breaks: 15-30 minutes
  - Lunch: 60-90 minutes

2. Create Tracks
- Theme-based: AI/ML, Web Development, DevOps, Data Science
- Level-based: Beginner, Intermediate, Advanced
- Format-based: Talks, Panels, Workshops
- Usually 2-4 parallel tracks maximum (avoid overwhelming attendees)

3. Session Assignment Workflow
- Start with fixed sessions: Keynotes, breaks, meals, social events
- Place high-demand talks in larger rooms
- Place tutorials/workshops in hands-on rooms (if separate)
- Fill remaining slots with accepted talks
- Balance topics across tracks (don't cluster all AI talks together)
- Balance levels (mix beginner and advanced in each track)

4. Visual Program Builder
- Use grid view to see entire program at once
- Drag-and-drop sessions to time slots
- Color-code by track or session type
- Check for:
  - Empty slots (fill or remove)
  - Overbooked slots (multiple sessions same time/room)
  - Speaker conflicts (same speaker in two places)

### Avoiding Conflicts

Speaker Conflicts
- Never schedule same speaker in multiple sessions at same time
- Leave buffer time between sessions for same speaker (30+ min)
- Check co-speakers (don't conflict their other sessions)
- System should warn about double-booking

Topic Conflicts
- Don't schedule similar topics in parallel (attendees want both)
- Example: Don't run "Intro to Python" and "Advanced Python" simultaneously
- Spread popular topics throughout day/conference

Attendee Conflicts
- Survey attendees about session interest (pre-conference)
- Avoid conflicts for most popular combinations
- Example: If many want both "Security" and "DevOps", schedule in different time slots

Room Capacity
- Assign large rooms to popular topics (keynotes, hot topics)
- Assign small rooms to niche topics
- Allow 10-20% buffer (don't pack rooms to capacity)
- Monitor registrations if sessions are separately bookable

### Speaker Management

Before Conference
- Send speaker welcome packet:
  - Session details (date, time, room, duration)
  - AV requirements form
  - Slide template (optional but recommended)
  - Code of conduct acknowledgment
  - Speaker dinner invitation (if hosting)
  - Contact for questions

2 Weeks Before
- Request final slides (for backup and accessibility)
- Confirm AV needs (projector, mic, clicker, demo setup)
- Share room layout and capacity
- Provide speaker rehearsal time slot (optional)

1 Week Before
- Send final schedule with room locations
- Provide speaker check-in instructions
- Share emergency contact info
- Remind about slide deadline

During Conference
- Speaker check-in desk on arrival
- Provide speaker lounge (if budget allows)
- AV tech available in each room
- Session timers/signals (5 min warning, time's up)
- Collect feedback forms from attendees

After Conference
- Send thank-you email
- Share attendee feedback/ratings
- Request post-conference survey
- Provide video/recording link (if sessions recorded)
- Invite to speak at next year's event

### Location/Room Assignment

Room Metadata
- Name: Grand Ballroom, Room A, Workshop Lab 1
- Capacity: 500, 200, 50, etc.
- Features: Projector, Microphone, Whiteboard, Hands-on computers
- Layout: Theater, Classroom, Roundtable, U-shape

Assignment Strategy
1. Keynotes → Largest room (main hall)
2. Popular talks → Large rooms (200-300 capacity)
3. Standard talks → Medium rooms (50-100 capacity)
4. Workshops/Tutorials → Labs or classroom-style rooms
5. Panels/Discussions → Roundtable or U-shape setup
6. Lightning talks → Medium room (rotate quickly)

Special Considerations
- Accessibility: Wheelchair access, hearing loops, closed captioning
- Recording: Rooms with camera/recording setup
- Hands-on: Computers, WiFi, power outlets for laptops
- Catering: Rooms near food service for breaks

### Publishing the Program

Draft Mode (Internal Only)
- Build schedule
- Assign sessions to slots
- Reviewers can see
- Not visible to attendees

Published Mode (Public)
- Click "Publish Program"
- Visible to all registered attendees
- Appears in portal and public schedule
- Can still make edits (updates reflected in real-time)

What to Publish
- Session title, description, speakers
- Time, date, room/location
- Track/topic
- Session type (talk, panel, workshop)
- Links to speaker bios

What NOT to Publish (Keep Internal)
- Reviewer scores or comments
- Speaker contact information (email/phone)
- Internal notes or logistics
- Unconfirmed or cancelled sessions

Best Practice:
- Publish 2-4 weeks before event (gives attendees time to plan)
- Update regularly if changes occur
- Send email notification when program published
- Create downloadable PDF schedule for attendees

---

## Communication Strategy

### Email Timing and Frequency

Pre-Conference Communications

6 Months Before
- CFP announcement
- Early bird registration opening
- Save the date reminder

3 Months Before
- CFP closing soon reminder (1 week before deadline)
- Registration reminder (early bird ends soon)
- Sponsor opportunities

2 Months Before
- Speaker acceptance/rejection notifications
- Regular registration period opens
- Program preview (if available)

1 Month Before
- Final program published
- Late registration period begins
- Hotel/travel information
- Optional: Social event details

1 Week Before
- Pre-event checklist email:
  - Event dates and times
  - Venue address and directions
  - Check-in process
  - WiFi credentials
  - Emergency contacts
  - Session recommendations
  - Mobile app download (if available)

3 Days Before
- Final reminder
- Weather forecast and packing tips
- Last-minute updates

Day Before
- Welcome message
- Day 1 schedule highlights
- Parking/transportation reminders

During Conference
- Daily morning email with schedule
- Evening email with next day preview
- Real-time updates via messaging system for urgent changes

Post-Conference
- Thank you email (within 2 days)
- Feedback survey (within 1 week)
- Session recordings/slides (within 2 weeks)
- Save the date for next year (within 1 month)

Best Practices
- Don't over-email: Max 1 email per week until final week
- Segment emails: Speakers get different emails than general attendees
- Use clear subject lines: "[PyConf 2026] Program Published" not "Update"
- Include unsubscribe link (but keep critical emails mandatory)
- Test emails before sending to full list

### Message Templates

Template Categories
1. Registration: Confirmation, payment received, cancellation
2. CFP: Submission received, acceptance, rejection, reminder
3. Invoice: Invoice sent, payment reminder, receipt
4. Program: Schedule update, session reminder, speaker info
5. General: Welcome, daily schedule, thank you, feedback request

Template Variables
- `[First Name]`, `[Last Name]`, `[Full Name]`
- `[Email]`, `[Company Name]`
- `[Conference Name]`, `[Conference Dates]`
- `[Session Title]`, `[Session Time]`, `[Session Room]`
- `[Invoice Number]`, `[Amount Due]`, `[Due Date]`
- `[Custom Message]` (for personalization)

Template Best Practices
- Write clear, scannable content (use bullet points)
- Put most important info first (inverted pyramid)
- Include clear call-to-action (Register Now, Confirm Attendance, Pay Invoice)
- Use friendly, professional tone
- Proofread carefully (errors look unprofessional)
- Test with sample data before using

### Notification Sequences

Registration Sequence
1. Immediate: Registration confirmation (within seconds)
   - Confirms registration received
   - Includes invoice if payment required
   - Next steps (payment, schedule selection)
2. 1 Day Later: Welcome email (if self-registration)
   - Conference overview
   - What to expect
   - Links to program, venue, FAQs
3. 1 Week Before: Pre-event reminder
   - Detailed logistics
   - Schedule highlights
   - Check-in instructions

CFP Submission Sequence
1. Immediate: Submission confirmation
   - Confirms proposal received
   - Provides submission ID
   - Expected timeline for decision
2. After Review Period: Decision notification
   - Acceptance or rejection
   - Next steps for accepted speakers
   - Thank you and encouragement for rejected
3. 1 Month Before (Accepted): Speaker logistics
   - Session details
   - AV requirements
   - Slide submission deadline

Invoice Sequence
1. Immediate: Invoice sent
   - Invoice PDF attached
   - Payment instructions
   - Due date highlighted
2. 7 Days Before Due: Friendly reminder
   - Payment due soon
   - Payment link (credit card)
   - Contact if issues
3. On Due Date: Due today reminder
   - Payment requested today
   - Consequences if not paid (access removal?)
4. 7 Days After Due: Overdue notice
   - Payment overdue
   - Final reminder before action
   - Contact to discuss

### Crisis Communication

Types of Crises
- Weather emergency (storm, flooding)
- Venue issue (power outage, evacuation)
- Health emergency (outbreak, injury)
- Security threat
- Major schedule disruption (speaker no-show, equipment failure)

Communication Protocol
1. Assess Situation: Gather facts, confirm details, consult team
2. Decide on Action: Cancel, delay, modify, continue with changes
3. Draft Message: Clear, concise, action-oriented
4. Send Immediately:
   - Email to all attendees
   - Screen overlay in portal (trigger: always)
   - Social media posts
   - On-site announcements (PA system, signage)
5. Follow Up: Updates as situation evolves, final resolution message

Best Practices for Crisis Communication
- Act quickly (delay causes panic and rumors)
- Be transparent (honesty builds trust)
- Provide clear instructions (reduce confusion)
- Update frequently (even if "no new information")
- Show empathy (acknowledge inconvenience/concern)
- Follow up after crisis resolved (lessons learned, thank you)

---

## Sponsor Management

### Sponsor Package Design

Package Tiers
- Platinum/Diamond ($25,000+): Top tier, limited slots (1-2)
- Gold ($10,000-$25,000): Premium tier (3-5 slots)
- Silver ($5,000-$10,000): Standard tier (5-10 slots)
- Bronze ($2,000-$5,000): Entry tier (10-15 slots)
- Community ($500-$1,000): Non-profit/community tier

Package Benefits Matrix

| Benefit | Platinum | Gold | Silver | Bronze | Community |
|---------|----------|------|--------|--------|-----------|
| Logo on website | Yes (large) | Yes (medium) | Yes (small) | Yes (tiny) | Yes (list) |
| Booth space | 6m x 6m | 3m x 3m | 2m x 2m | Table | None |
| Free tickets | 10 | 5 | 3 | 2 | 1 |
| Speaking slot | Keynote | Talk | Lightning | None | None |
| Logo in program | Full page | Half page | Quarter | Logo only | Logo only |
| Social media shoutouts | 5 | 3 | 2 | 1 | 1 |
| Email to attendees | 1 dedicated | 1 shared | None | None | None |
| Recruiting booth | Yes | Yes | Yes | Table | None |

Best Practices
- Create clear package tiers (don't over-complicate)
- Limit top tiers (scarcity increases value)
- Offer à la carte add-ons (extra tickets, banner ads, workshops)
- Early bird discount for sponsors too (10-20% if signed 6+ months out)
- Include digital benefits (virtual events need virtual sponsorships)

### Contract Management Workflow

1. Generate Contract from Template
- Use sponsor contract template (pre-configured)
- Or upload DOCX/RTF contract document
- System converts to editable HTML

2. Customize Contract Content
- Edit rich-text content in-browser
- Include:
  - Package name and tier
  - Price and payment terms
  - Benefits included
  - Deliverable deadlines (logo due date, booth setup time)
  - Cancellation policy
  - Signatures section
- Use placeholders: `[Recipient Name]`, `[Package Name]`, `[Custom Message]`

3. Version Control
- System auto-saves versions on each edit
- View version history
- Restore previous version if needed
- Compare versions (manual review)

4. Send Contract
- Click "Send Contract"
- Enter recipient email
- Add custom message
- System emails:
  - Contract PDF attachment
  - Download link
  - Next steps (sign and return)

5. Track Status
- Draft: Contract created but not sent
- Sent: Contract emailed to sponsor
- Signed: Sponsor signed and returned (mark manually)

6. Generate Invoice
- After contract signed, create invoice
- Use sponsor search to pre-fill billing info
- Match invoice amount to contract price
- Send invoice for payment

7. Download/Export
- PDF export for printing
- DOCX export for editing in Word
- Attach to emails or print for wet signature

Best Practices
- Use consistent contract template across sponsors (fairness, efficiency)
- Version all changes (audit trail for disputes)
- Send contract well in advance (3-6 months before event)
- Follow up on unsigned contracts weekly
- Don't deliver benefits until payment received

### Sponsor Invoicing

Invoice Creation
- Use recipient search → Select sponsor
- Auto-fills company name, address, VAT number
- Line item: Sponsorship package name (e.g., "Gold Sponsorship - PyConf 2026")
- Amount: Match contract price
- Due date: Typically 30 days from contract signing

VAT Considerations
- B2B transaction (sponsor is a company)
- VAT number required for EU reverse charge (if virtual/hybrid-online)
- VAT number recommended for all B2B invoices
- Validate VAT number before sending (avoid audit issues)

Payment Tracking
- Bank transfer: Most common for large amounts (sponsors prefer wire transfer)
- Credit card: Option for smaller sponsorships (faster payment)
- Mark as paid manually when bank transfer received
- Add internal comment with bank reference/transaction ID

Follow-Up
- Send invoice immediately after contract signed
- Reminder at 7 days before due date
- Reminder on due date
- Overdue notice at 7 days after due
- Personal follow-up (call or email) if overdue beyond 14 days
- Coordinate with account manager or executive contact

### Sponsor Benefits Fulfillment

Tracking Deliverables
- Create checklist for each sponsor (manual or spreadsheet)
- Items to track:
  - Logo received (for website, program, signage)
  - Booth setup confirmed (space, power, WiFi)
  - Free tickets distributed (send discount codes)
  - Speaking slot scheduled (if included)
  - Social media content provided (posts, images)
  - Recruiting materials (job postings, swag)

Timeline
- 3 months before: Request logos and marketing materials
- 2 months before: Confirm booth requirements
- 1 month before: Distribute sponsor ticket codes
- 2 weeks before: Final sponsor logistics email
- During event: Check in with sponsors daily
- After event: Thank you email, feedback survey, next year invitation

Sponsor Portal (If Available)
- Sponsor login for self-service
- View contract and invoice
- Download logo files
- Manage free tickets (assign to employees)
- Upload booth materials
- Access attendee list (if permitted by privacy policy)

---

## Team Collaboration

### Role Assignment

Core Roles
1. Tenant Admin: Full access to all conference settings
2. Conference Admin: Admin access to specific conference(s)
3. Finance Team: Invoice management, payment tracking
4. Program Committee: CFP review, session scheduling
5. Volunteer Coordinator: Volunteer task assignment and scheduling
6. Communication Manager: Email templates, messaging, screen overlays

Permission Levels
- Super Admin: Platform-level access (SaaSConf staff only)
- Tenant Admin: All conferences in tenant, all modules
- Conference Admin: Specific conference(s), all modules
- Module-Specific: Access to specific features (CFP, Volunteers, etc.)
- Read-Only: View data but cannot edit

Best Practices
- Follow principle of least privilege (give minimum access needed)
- Use conference-specific admins (not tenant-wide) when possible
- Separate finance access from program access (segregation of duties)
- Rotate credentials periodically (every 6-12 months)
- Remove access immediately when team member leaves

### Workflow Coordination

Pre-Event Workflow
1. Setup Phase (6 months out):
   - Lead: Conference Admin
   - Creates conference, configures settings
   - Adds team members with appropriate roles
   - Sets up booking options, CFP, program structure

2. CFP Phase (6-3 months out):
   - Lead: Program Committee Chair
   - Opens CFP, announces widely
   - Assigns reviewers to submissions
   - Coordinates review process
   - Makes acceptance decisions

3. Registration Phase (6-1 months out):
   - Lead: Registration Coordinator
   - Opens registration, monitors numbers
   - Processes group registrations
   - Handles special requests (accessibility, dietary)

4. Sponsor Phase (6-1 months out):
   - Lead: Sponsorship Coordinator
   - Sends sponsor contracts
   - Tracks contract signatures and payments
   - Coordinates sponsor benefits fulfillment

5. Program Building (2-1 months out):
   - Lead: Program Committee Chair
   - Assigns sessions to time slots
   - Assigns rooms/locations
   - Publishes program

6. Communication Phase (1 month to event):
   - Lead: Communication Manager
   - Sends pre-event emails (schedule, logistics)
   - Creates screen overlays for announcements
   - Prepares on-site signage

During-Event Workflow
1. Check-In Team: Registration desk, badge printing
2. Program Team: Session monitoring, AV support, speaker coordination
3. Volunteer Team: Task coordination, break coverage
4. Communication Team: Real-time updates, crisis management
5. Sponsor Team: Sponsor booth support, networking facilitation

Post-Event Workflow
1. Communication Team: Thank you emails, survey distribution
2. Finance Team: Final invoicing, payment reconciliation
3. Program Team: Session recording upload, speaker feedback sharing
4. Admin Team: Data export, backup, lessons learned documentation

Coordination Tools
- Daily standup meetings (in-person or video)
- Shared Slack/Teams channel for real-time communication
- Shared task management (Trello, Asana, or built-in deadlines module)
- Weekly status reports (email or document)
- Post-mortem meeting after event

### Permission Management

Granting Access
1. Add user account (if doesn't exist)
2. Add to tenant (if tenant admin)
3. Add to conference (if conference admin)
4. Assign specific role/permissions
5. Enable module access (CFP, Volunteers, etc. if module-gated)

Reviewing Access
- Quarterly access review (who has access to what?)
- Remove inactive users (haven't logged in 6+ months)
- Update permissions as roles change
- Audit log review (check for suspicious activity)

Offboarding
- Remove all access immediately when team member leaves
- Document what they had access to (for handoff)
- Transfer ownership of drafts/content to another admin
- Change shared passwords if used (discouraged but common)

### Audit Trail Importance

What Gets Logged
- All invoice actions (create, send, cancel, replace, mark paid)
- All registration changes (create, update, replace, cancel)
- All CFP actions (submit, review, accept/reject)
- All program changes (session create, update, publish)
- All setting changes (booking options, VAT rates, templates)
- User logins and permission changes

Why Audit Trail Matters
- Accountability: Know who did what and when
- Compliance: Required for financial audits (invoicing)
- Troubleshooting: Diagnose issues ("invoice disappeared" → check who deleted it)
- Dispute resolution: "I never received that email" → check sent log
- Security: Detect unauthorized access or suspicious activity

Using Audit Trail
- Review invoice events for payment tracking
- Check registration events for replacement history
- Monitor CFP review activity (ensure all papers reviewed)
- Track settings changes (who changed VAT rate?)
- Export logs for compliance/reporting

Best Practices
- Review audit logs weekly during active periods
- Set up alerts for critical actions (invoice cancellation, mass deletion)
- Export logs monthly for long-term storage
- Train team on audit importance (everything is logged, act accordingly)

---

## Data Quality & Maintenance

### Regular Data Cleanup

Weekly Tasks (During Active Registration)
- Review new registrations for data quality issues
- Check for duplicate emails (same person registered twice)
- Validate VAT numbers on B2B invoices
- Follow up on incomplete registrations
- Archive test registrations (delete or mark as test)

Monthly Tasks
- Export registration data backup
- Export invoice data backup
- Export CFP submissions backup
- Review alumni records for updates
- Clean up draft invoices (delete or complete)

Pre-Event Tasks (1 Week Before)
- Final duplicate check (merge or cancel duplicates)
- Validate all contact information (email, phone)
- Export attendee list for badge printing
- Export dietary restrictions for catering
- Export accessibility needs for venue coordination

Post-Event Tasks
- Update alumni records from paid registrations (auto-create alumni)
- Archive conference data (export all data)
- Clean up draft/cancelled content
- Document lessons learned
- Update templates based on feedback

### Duplicate Prevention

Common Causes of Duplicates
- Attendee registers twice (forgot they registered)
- Attendee uses different email addresses
- Group registration + individual registration
- Admin creates registration that attendee already created

Prevention Strategies
1. Email-Based Duplicate Detection
   - System checks for existing email on registration
   - Warns admin if email already exists
   - Attendee portal prevents duplicate self-registration

2. Name-Based Duplicate Detection
   - Search for similar names before creating manual registration
   - Check: First Name + Last Name + Company
   - Ask attendee to confirm before creating

3. Communication
   - Confirmation email immediately after registration
   - "Already registered? Login here" message on registration page
   - Clear instructions on group vs individual registration

Duplicate Resolution
- Identify true duplicates (same person, different records)
- Keep the registration with more complete data
- Cancel/merge the duplicate
- Refund if double-charged
- Update attendee on resolution

### CSV Import/Export Hygiene

Import Best Practices
1. Use Templates
   - Download CSV template from system
   - Fill in data matching exact column names
   - Don't rename columns or change order

2. Data Validation Before Import
   - Check email format (user@domain.com)
   - Check country codes (ISO 2-letter: DE, US, GB)
   - Check dates (YYYY-MM-DD format)
   - Remove duplicate rows

3. Encoding
   - Use UTF-8 encoding (supports international characters)
   - System exports with UTF-8 BOM for Excel compatibility
   - Don't use ANSI/Latin-1 (breaks accented characters)

4. Test First
   - Import small sample (10 rows) to verify format
   - Check for errors
   - Import full dataset after successful test

5. Review After Import
   - Check imported records for accuracy
   - Verify counts (imported 500 rows = 500 records?)
   - Spot-check random records

Export Best Practices
1. Regular Backups
   - Export all critical data monthly
   - Store backups in secure location (encrypted cloud storage)
   - Keep historical exports (for point-in-time recovery)

2. Data Filtering
   - Export only what you need (don't export everything)
   - Filter by status (active registrations only)
   - Filter by date range (current conference only)

3. Privacy & Security
   - Don't email exports (contains PII)
   - Use secure file sharing (password-protected)
   - Delete local copies after use
   - Restrict access to authorized personnel only

4. Excel Compatibility
   - System exports with UTF-8 BOM (Excel recognizes encoding)
   - CSV format opens directly in Excel
   - Preserve leading zeros (e.g., postal codes) with proper formatting

Common Import/Export Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Accented characters broken | Wrong encoding | Use UTF-8 |
| Dates imported as text | Wrong format | Use YYYY-MM-DD |
| Leading zeros removed | Excel auto-formatting | Format column as text before import |
| Country not recognized | Full name instead of code | Use ISO codes (DE not Germany) |
| Duplicate imports | Importing same file twice | Check for existing data first |
| Missing rows | Rows exceed limit | Import in batches (max 50k rows) |

### Backup Strategies

What to Backup
- Registration data (all fields, including billing profiles)
- Invoice data (all invoices, line items, events)
- CFP submissions (proposals, reviews, decisions)
- Program data (sessions, schedule, speakers)
- Alumni records
- Configuration data (settings, booking options, templates)

Backup Frequency
- Daily: During active registration period
- Weekly: During CFP review period
- Monthly: During planning phase
- Immediately After: Major imports, bulk operations, critical changes

Backup Storage
- Primary: Encrypted cloud storage (Google Drive, Dropbox, OneDrive)
- Secondary: Local encrypted drive (offline backup)
- Tertiary: System-level database backups (managed by SaaSConf platform)

Backup Testing
- Test restore quarterly (verify backups are valid)
- Practice recovery procedure (document steps)
- Train team on backup location and access

Retention Policy
- Keep current conference data: 2 years minimum
- Keep financial data: 7 years (tax/audit requirements)
- Keep historical data: Forever (archival, trend analysis)
- Delete test/temp data: Immediately after use

---

## Common Pitfalls to Avoid

### 1. Not Configuring Pronouns Before Registration Opens
Problem: Replace Attendee modal fails because pronouns dropdown is empty.
Solution: Add pronouns in Conference Settings > General before opening registration.
How to Fix: Add pronouns now, inform attendees they can update profiles.

### 2. Using "Cancel Invoice + Cancel Registrations" for Billing Corrections
Problem: Attendees lose conference access when you just needed to fix a billing address.
Solution: Use "Replace Invoice" for billing corrections (keeps registrations active).
How to Fix: Cannot undo cancellation. Manually reactivate registrations, apologize to attendees.

### 3. Not Validating VAT Numbers Before Sending Invoices
Problem: Invalid VAT numbers cause tax audit issues, rejected invoices, payment delays.
Solution: Always verify VAT validation status (green checkmark) before sending.
How to Fix: Resend invoice with corrected VAT number using Replace Invoice feature.

### 4. Forgetting to Publish the Program
Problem: Attendees can't see schedule, leads to confusion and complaints.
Solution: Click "Publish Program" 2-4 weeks before event.
How to Fix: Publish immediately, send announcement email.

### 5. Over-Emailing Attendees
Problem: Email fatigue leads to unsubscribes and missed important messages.
Solution: Limit to 1 email per week until final week, segment by audience.
How to Fix: Apologize, reduce frequency, consolidate info into digest emails.

### 6. Not Setting Max Uses on Promotional Discount Codes
Problem: Discount code shared publicly, hundreds use it, massive revenue loss.
Solution: Set max_uses limit on all promotional codes (e.g., 50 uses).
How to Fix: Deactivate code immediately, honor existing uses, tighten for future.

### 7. Scheduling Similar Topics in Parallel
Problem: Attendees want both "Intro to Python" and "Advanced Python" but can only attend one.
Solution: Survey attendee interest, avoid conflicts for popular topic combinations.
How to Fix: Move sessions if time allows, or offer recordings for conflicted sessions.

### 8. Not Testing Registration Flow Before Launch
Problem: Broken payment links, missing email confirmations, form errors.
Solution: Complete test registration end-to-end before public launch.
How to Fix: Fix issues immediately, notify affected registrants, offer support.

### 9. Importing CSV with Wrong Encoding
Problem: Names with accents become garbled (Müller → M��ller).
Solution: Always use UTF-8 encoding for CSV files.
How to Fix: Delete bad import, re-import with correct encoding, fix manually if needed.

### 10. Not Following Up on Overdue Sponsor Invoices
Problem: Sponsors don't pay, but you've already delivered benefits (logo on site, booth space).
Solution: Invoice immediately after contract signed, follow up weekly if unpaid.
How to Fix: Personal outreach, escalate to executive contact, withhold future benefits.

### 11. Leaving Draft Invoices Unsent
Problem: Attendee thinks they paid but invoice was never actually sent.
Solution: Send invoices immediately after registration, don't let drafts pile up.
How to Fix: Send invoice now, apologize for delay, extend due date if needed.

### 12. Not Backing Up Data Regularly
Problem: Accidental deletion, system issue, or corruption causes data loss.
Solution: Export data backups weekly during active periods.
How to Fix: If recent backup exists, restore. Otherwise, manual data re-entry required.

### 13. Granting Too Many People Tenant Admin Access
Problem: Too many people can change critical settings, hard to track who did what.
Solution: Use conference-level admins, grant tenant admin sparingly.
How to Fix: Audit current access, remove unnecessary tenant admin permissions.

### 14. Not Setting Clear CFP Deadlines
Problem: Late submissions, extended deadlines, rushed reviews.
Solution: Set hard deadline in system, communicate clearly, don't extend.
How to Fix: Close CFP on deadline, review late submissions only if exceptional circumstances.

### 15. Forgetting to Create Credit Note When Cancelling Invoice
Problem: Manual cancellation without proper accounting trail.
Solution: Use "Cancel Invoice" feature (auto-creates credit note).
How to Fix: Manually create credit note for proper accounting, document in invoice events.

---

## Conference Type-Specific Guidance

### Academic Conferences

Unique Characteristics
- Peer-review emphasis (double-blind often required)
- Proceedings publication (ISBN, DOI assignment)
- Poster sessions and demos (different submission types)
- PhD symposium or student research track
- Grant-funded travel (reimbursement needed)

CFP Adaptations
- Submission Types: Full papers (8-10 pages), short papers (4 pages), posters, demos
- Review Process: Double-blind review (hide author names)
- Review Criteria: Academic rigor, methodology, novelty, reproducibility
- Acceptance Rates: Lower (20-30% for competitive conferences)
- Proceedings: Coordinate with publisher (ACM, IEEE, Springer)

Registration Adaptations
- Student Rates: Heavily discounted (50-70% off)
- Proof of Enrollment: Require student ID upload or .edu email
- Travel Grants: Track separately (not in SaaSConf, use external system)
- Institutional Invoicing: Many universities require PO numbers

Program Considerations
- Session Types: Paper presentations, posters, panels, tutorials, workshops
- Parallel Tracks: Research areas (AI, HCI, Systems, Theory)
- Poster Sessions: Dedicated time slots with no parallel sessions
- Social Events: Conference banquet, student dinner, informal gatherings

Best Practices
- Start CFP 9-12 months before event (academic timelines longer)
- Allow 2-3 months for review (thorough peer review takes time)
- Coordinate with academic calendar (avoid exam periods)
- Publish proceedings before or during conference
- Provide camera-ready templates early

### Tech/Industry Conferences

Unique Characteristics
- Sponsor-driven revenue model
- Product demos and vendor booths
- Networking focus (hallway track)
- Workshops and hands-on tutorials
- Fast-paced, trend-focused content

CFP Adaptations
- Submission Types: Talks, panels, lightning talks, workshops
- Review Process: Single-blind, committee-based
- Review Criteria: Practical value, relevance, speaker experience
- Acceptance Rates: Higher (40-60%)
- Diversity: Actively recruit underrepresented speakers

Registration Adaptations
- Corporate Pricing: Higher rates (companies pay)
- Group Discounts: Common (teams from same company)
- Add-Ons: Workshops, training, certification exams
- Package Deals: Conference + hotel + training

Sponsor Integration
- Sponsor Talks: Some slots reserved for sponsors
- Booth Space: Large expo hall
- Recruiting: Job board, resume drop, company meetups
- Product Demos: Demo area separate from talks

Program Considerations
- Tracks: Technology areas (Frontend, Backend, DevOps, AI/ML)
- Levels: Beginner, Intermediate, Advanced (clearly labeled)
- Lightning Talks: 5-10 min rapid-fire sessions
- Keynotes: Industry leaders, provocative topics
- Social Events: Happy hours, game nights, unconference sessions

Best Practices
- Prioritize networking time (long breaks, evening events)
- Offer workshop/tutorial day (hands-on learning)
- Record sessions and publish online (extend reach)
- Create mobile app for schedule/networking
- Emphasize diversity in speaker lineup

### Virtual Events

Unique Characteristics
- No physical venue (streaming platform required)
- Global audience (timezone challenges)
- Lower costs (no venue, catering, AV)
- Higher no-show rates (easier to skip)
- Recording/replay expected

Platform Requirements
- Streaming: Zoom, Hopin, Airmeet, or custom
- Interaction: Q&A, polls, chat, breakout rooms
- Networking: Virtual lounges, 1-on-1 matching
- Sponsor Booths: Virtual booths with chat/video

CFP Adaptations
- Global Speakers: Easier to recruit (no travel required)
- Pre-Recorded Options: Allow pre-recording for timezone flexibility
- Session Length: Shorter (30-45 min max, attention span lower)

Registration Adaptations
- Lower Pricing: No venue costs, should reflect in price
- Global Timezones: Offer replay access for all sessions
- Free Tier: Consider free access to keynotes (marketing)

VAT Compliance
- CRITICAL: Virtual conferences trigger different VAT rules
- B2B customers in EU: Reverse charge (require VAT number)
- B2C customers in EU: OSS rate (customer country VAT)
- Non-EU: No VAT
### 14.10. Article Metadata and Authorship

Each news article automatically captures metadata for audit and attribution purposes.

Automatically Captured Fields:

Author Information:
- Display format: "By [First Name] [Last Name]"
- If no name is available: "By Unknown"

Timestamps:
- created_at: Date and time the article was first created (UTC)
- updated_at: Date and time of the last edit (updates automatically)
- published_at: Date and time the article was first published (null for drafts)
  - Cleared when unpublished
  - Updated when re-published

Screenshot Placeholder:

Display Behavior:
- Admin View: Shows author name, creation date for drafts, published date for published articles
- Portal View: Shows only publication date (author name NOT displayed to portal users in current implementation)

Format Examples:
- Admin (draft): "By Sarah Johnson • Created January 14, 2026, 2:30 PM"
- Admin (published): "By Sarah Johnson • Published January 15, 2026, 3:45 PM"
- Portal: "January 15, 2026, 3:45 PM"

---

### 14.11. Access Control and Permissions

Admin Interface:

Required Permissions:
- Must be a conference admin or organizer for the conference
- Conference must be accessible to your user account

Capabilities:
- Create articles (drafts only)
- Edit any article (own or others)
- Publish/unpublish any article
- Delete any article
- Send articles via email

Cross-Tenant Isolation:
- Articles are scoped to `tenant_id` and `conference_id`

Portal Interface:

Required Permissions:
- Must be authenticated as a CFP applicant
- Must have access to at least one conference (via paper submission or committee membership)

Capabilities:
- Cannot view draft articles
- Cannot create, edit, or delete articles
- Cannot send emails

Isolation:
- Draft articles are never visible to portal users

---

### 14.12. Best Practices

Content Strategy:

1. Use Descriptive Titles:
   - Keep titles under 60 characters for readability
   - Use action words ("Announcing", "Reminder", "Update")
   - Include date/context when relevant: "CFP Extended to March 31"

2. Structure Your Content:
   - Start with the most important information (inverted pyramid)
   - Use headings (H2, H3) to break up long articles
   - Add bulleted lists for key points
   - Include a call-to-action (CTA) at the end

3. Visual Enhancements:
   - Add hero images for major announcements
   - Embed YouTube videos for richer media
   - Apply text highlighting for critical deadlines

Publication Workflow:

1. Draft First:
   - Always create articles as drafts initially
   - Review content for accuracy, spelling, grammar
   - Preview formatting in the portal (publish temporarily if needed)

2. Internal Review:
   - Share draft link with co-organizers (via edit modal)
   - Gather feedback before publishing
   - Unpublish during review periods if needed

3. Publish with Purpose:
   - Time publications strategically (e.g., Monday mornings for higher engagement)
   - Link screen overlays for high-priority announcements
   - Send targeted emails to relevant groups only

Email Targeting:

1. Segment Your Audience:
   - Use paper status filters to send acceptance letters only to accepted authors
   - Avoid "All Applicants" for role-specific information

2. Test Before Sending:
   - Send to a test recipient list first (use "applicant_ids" filter with your own test accounts)
   - Verify email rendering and links
   - Check for typos and formatting issues

3. Avoid Spam:
   - Don't send the same article multiple times to the same group
   - Limit email frequency (no more than 2-3 per week)
   - Provide clear subject lines (article title becomes subject)

Archive Management:

1. Unpublish Outdated Content:
   - Unpublish articles after events have passed (e.g., "CFP Closing Tomorrow")
   - Keep historical articles published if they remain relevant (e.g., "Keynote Speaker Biography")

2. Delete Sparingly:
   - Delete only truly obsolete or incorrect content
   - Unpublish instead of delete to preserve historical record
   - Consider keeping drafts for future reference

---

### 14.14. Troubleshooting

Problem: "News tab is not visible"

Problem: "Cannot create or edit articles"
- Cause: You do not have admin permissions for the conference

Problem: "Published article not visible in portal"
- Cause 1: Applicant does not have access to the conference (no papers or committee membership)
- Solution: Verify the applicant has submitted a paper or is a committee member
- Cause 2: Article was unpublished after initial publication

Problem: "Email send returns 'No recipients found'"
- Cause: Filters are too restrictive (no applicants match the criteria)
- Solution: 
  - Check paper status filter (ensure applicants have papers with that status)
  - Verify committee role spelling (case-sensitive exact match)
  - Use "All Applicants" to confirm at least some applicants exist

Problem: "Rich text editor not loading or frozen"
- Cause: JavaScript error or browser compatibility issue
- Solution: 
  - Refresh the page (Cmd+R / Ctrl+R)
  - Clear browser cache and reload
  - Try a different browser (Chrome, Firefox, Safari, Edge supported)

Problem: "Images not displaying in email"
- Cause: Email clients may block base64-encoded images
- Solution: Host images externally (e.g., conference website) and use URL method instead of paste/drag-drop

Problem: "Article formatting looks different in portal vs admin"
- Cause: CSS differences between admin and portal views
- Solution: Use standard formatting (headings, lists, paragraphs) instead of custom font sizes/colors for best cross-environment consistency

Problem: "Cannot delete article"
- Cause: 404 error suggests article was already deleted or belongs to a different conference/tenant
- Solution: Refresh the page to sync the articles list, verify you're in the correct conference

---

### 14.15. Related Modules

Screen Overlays:
- Link news articles to screen overlays for prominent portal display
- See Screen Overlays documentation (Section 13) for configuration details

Messaging:
- Messaging supports replies and threads; News is one-way broadcast only

Call for Papers (CFP):
- News articles can target applicants by paper status
- Use news to announce CFP deadlines, acceptance decisions, submission guidelines

Email Templates:
- Custom email templates for system-generated messages (not applicable to news emails)
- News emails use a fixed "direct message" template with article content

---


Total lines: ~680


---



---

# Section 15: Volunteers Module
## 15.1 Volunteers Tab
The Volunteers tab is the central hub for managing conference volunteers. It provides a complete interface for creating, linking, and managing volunteer information for your event.

### Accessing Volunteers
Navigate to Conference Detail → Volunteers to access volunteer management features.

### Volunteer Information
Each volunteer record contains:

- Basic Information
  - First Name (required)
  - Last Name (required)
  - Email (required, validated)
  - Phone (optional, validated for international format)
  
- Additional Details
  - Status (pending, approved, active, inactive, rejected)
  - T-Shirt Size (XS, S, M, L, XL, XXL)
  - Notes (rich text editor for internal comments)

- Emergency Contact
  - Emergency Contact Name
  - Emergency Contact Phone (validated)

- Conference Association
  - Volunteers are linked to specific conferences
  - Same volunteer can be associated with multiple conferences across your tenant

### Creating New Volunteers
Screenshot placeholder: `volunteers-create-form.png`  
*Shows the inline volunteer creation form with all fields*

1. Click Create New in the upper right
2. The creation form appears inline above the volunteer list
3. Fill in required fields:
   - First Name
   - Last Name
   - Email (validated on blur)
4. Optionally add:
   - Phone number (validates international formats like `+491234567` or `00491234567`)
   - T-Shirt Size
   - Comments (rich text)
5. Click Create Volunteer
6. The new volunteer is automatically linked to this conference

- Email addresses are validated for correct format
- Phone numbers must be in international format (with + or 00 prefix)

### Linking Existing Volunteers
Screenshot placeholder: `volunteers-link-dropdown.png`  
*Shows the "Link existing..." dropdown with available volunteers*


1. Click the Link existing... dropdown
3. The dropdown shows volunteers by name and email
4. Only volunteers not already linked to this conference appear
5. The volunteer is immediately linked to the conference

This is useful for:
- Multi-conference events (same volunteer staff across events)
- Recurring annual conferences
- Volunteers who work across multiple events in your organization

### Editing Volunteer Details
Screenshot placeholder: `volunteers-edit-modal.png`  
*Shows the edit modal with all volunteer fields and the attachment section*

1. Click the edit icon (pencil) next to any volunteer
2. A modal opens with all volunteer fields
3. Modify any field:
   - Basic information (name, email, phone)
   - Status (change approval status)
   - T-Shirt Size
   - Notes
   - Emergency contact information
4. Upload attachments (photos, documents) using the attachment section at the bottom
5. Click Save Changes

Save Status Indicator:
- Blue "Save Changes" button → ready to save
- Spinning indicator → saving in progress
- Green "Saved!" with checkmark → successfully saved
- Red "Error" → save failed

### Volunteer Status Badges
Screenshot placeholder: `volunteers-status-badges.png`  
*Shows volunteers with different status badges (active, approved, pending, inactive, rejected)*

Status badges appear color-coded in the volunteer list:

- Active (green) — Volunteer is actively working at the event
- Approved (blue) — Application approved but not yet active
- Pending (yellow) — Application under review
- Inactive (gray) — Volunteer no longer active
- Rejected (gray) — Application declined

### Volunteer Color Coding
Each volunteer can be assigned a unique color for visual identification in the program grid. This color is conference-specific and helps distinguish volunteers when viewing assignments and schedules.

Setting Colors:
- Colors are assigned in the Volunteer Assignment tab (see Section 15.3)
- Click the color dot next to a volunteer's name to cycle through preset colors
- 10 preset colors available: Blue, Green, Amber, Red, Purple, Pink, Cyan, Lime, Orange, Indigo

### Removing Volunteers
Screenshot placeholder: `volunteers-delete-confirm.png`  
*Shows the confirmation dialog when removing a volunteer*

1. Click the delete icon (trash) next to a volunteer
2. A confirmation dialog appears explaining the action
3. Click Remove to confirm

Important:
- The volunteer record remains in your tenant for other conferences
- If assigned to tasks, those assignments are removed
- Attachment records are preserved

### Volunteer Communications
Volunteers can be contacted through:

1. Direct Email — Click the email address in the volunteer list to open your mail client
2. Bulk Communications — Use the Communications tab to send emails to all volunteers
3. Schedule Distribution — Export and send volunteer schedules (see Section 15.4)

---

## 15.2 Task Assignment
The Task Assignment tab uses a visual program grid to assign volunteer tasks to specific sessions. Tasks define what volunteers will do (e.g., "Registration Desk," "AV Support," "Session Chair").

### Accessing Task Assignment
Navigate to Conference Detail → Volunteers → Task Assignment

Screenshot placeholder: `task-assignment-overview.png`  
*Shows the full task assignment interface with sidebar and program grid*

### Understanding Volunteer Tasks

Common Task Examples:
- Registration Desk
- AV Support
- Session Chair
- Room Monitor
- Information Booth
- Photography
- Social Media
- Setup/Teardown

Creating Tasks:
Tasks are created in Settings → Volunteer Tasks (see Section 15.5)

### Program Grid View
Screenshot placeholder: `task-assignment-grid.png`  
*Shows the program grid with sessions displaying assigned tasks*

The program grid displays:

- Horizontal Axis: Program tracks
- Vertical Axis: Time slots
- Session Cards: Color-coded by session type or track
- Task Badges: Small badges on sessions showing assigned tasks and volunteer counts

Grid Features:
- Day Tabs — Switch between program days at the top
- Time Labels — Left column shows slot times
- Break Indicators — Session-free slots highlighted in amber with diagonal stripes
- Track Headers — Color-coded track names with colored dots

### Dragging Tasks onto Sessions
Screenshot placeholder: `task-assignment-drag.png`  

The fastest way to assign tasks:

1. Sidebar — Shows all active volunteer tasks with a count of how many sessions each is assigned to
2. Drag — Click and hold a task in the sidebar
3. Drop — Drag onto a session card in the grid
4. Release — Drop to assign the task with a default required count of 1

Visual Feedback:
- Task card becomes semi-transparent while dragging
- Session cards highlight when you hover over them
- A floating badge follows your cursor showing the task name

### Clicking Sessions to Manage Tasks
Screenshot placeholder: `task-assignment-modal.png`  
*Shows the session task management modal with assigned tasks and add task form*

Click any session card to open the task management modal:

Assigned Tasks Section:
- Lists all tasks currently assigned to this session
- Shows format: `[Task Name] - X/Y assigned`
  - X = number of volunteers currently assigned
  - Y = required volunteer count

Add Task Section:
- "Volunteers needed" field (1-50)
- Add button to assign the task

Workflow:
1. Click a session card
2. Modal shows current task assignments
3. Adjust required counts using the input fields
4. Add new tasks using the dropdown
5. Remove tasks using the "Remove" button
6. Changes save automatically

### Task Count Badges
Screenshot placeholder: `task-count-badges.png`  
*Close-up of session cards showing task badges with assignment counts*

Session cards display task badges:

- Badge Color:
  - White/semi-transparent background
  - White text
- Badge Content: `[Task Name] (X/Y)`
  - X = assigned volunteers
  - Y = required volunteers
- Multiple Tasks: Multiple badges stack vertically
- No Tasks: Session shows "No tasks assigned" in italics

Visual Indicators:
- Helps quickly identify:
  - Which sessions need volunteer coverage
  - Which tasks are understaffed
  - Session task distribution across the program

### Managing Required Counts
Screenshot placeholder: `task-assignment-count-edit.png`  
*Shows the "Need" input field being edited*

Each session-task assignment has a required count (how many volunteers are needed):

- Default: 1 volunteer when first assigned
- Range: 1-50 volunteers
- Updates Live: Changes save automatically and update the grid

Example:
- "Registration Desk" at 08:00-09:00 might need 3 volunteers
- "Session Chair" typically needs 1 volunteer
- "Setup/Teardown" might need 5-10 volunteers

### Removing Task Assignments

1. Click the session card
2. Click Remove next to the task
3. The task is immediately unassigned
4. Any volunteer assignments to that task are also removed

Warning:
Removing a task deletes all volunteer assignments for that task-session combination. This action cannot be undone.

---

## 15.3 Volunteer Assignment
The Volunteer Assignment tab uses the same program grid layout to assign specific volunteers to session tasks. This is where you allocate your volunteer team to their scheduled duties.

### Accessing Volunteer Assignment
Navigate to Conference Detail → Volunteers → Volunteer Assignment

Screenshot placeholder: `volunteer-assignment-overview.png`  
*Shows the full volunteer assignment interface with volunteer sidebar and program grid*

### Volunteer Sidebar
Screenshot placeholder: `volunteer-assignment-sidebar.png`  
*Shows the volunteer sidebar with color dots and assignment counts*

The left sidebar lists all volunteers linked to this conference:

Volunteer Cards Display:
- Color Dot — Click to cycle through preset colors (for visual identification)
- Full Name — Volunteer's name
- Assignment Count Badge — Blue circle showing how many sessions they're assigned to

Search Feature:
- Search box at the top filters volunteers by name
- Real-time filtering as you type
- Useful for conferences with many volunteers

### Assigning Volunteers via Drag-and-Drop
Screenshot placeholder: `volunteer-assignment-drag.png`  
*Shows a volunteer being dragged onto a session card*

The primary assignment method:

1. Drag — Click and hold a volunteer card in the sidebar
2. Drop — Drag onto a session card in the grid
3. Release — Drop to assign

What Happens:

- Single Task: If the session has only one task, the volunteer is immediately assigned to it
- Multiple Tasks: If the session has multiple tasks, a modal appears asking which task to assign the volunteer to
- Already Assigned: If the volunteer is already assigned to that task, the drop is ignored (no duplicates)

Visual Feedback:
- Volunteer card becomes semi-transparent while dragging
- Session cards highlight when hovering (blue ring)
- Floating badge follows cursor showing volunteer name

### Task Picker Modal (Multi-Task Sessions)
Screenshot placeholder: `volunteer-assignment-task-picker.png`  
*Shows the task picker modal when dropping a volunteer on a multi-task session*

When dropping a volunteer on a session with multiple tasks:

1. Modal opens with title: "Assign [Volunteer Name] to task"
2. Lists all tasks for that session as clickable buttons
3. Each button shows:
   - Task name
   - Current assignment count (X/Y format)
   - Green indicator if fully staffed, amber if understaffed
   - "Already assigned" message if volunteer is already on that task (grayed out)
4. Click a task button to complete the assignment

Example:
Session "Keynote Hall" has three tasks:
- AV Support (1/2) — Amber, understaffed
- Session Chair (1/1) — Green, fully staffed
- Room Monitor (0/1) — Amber, empty

### Session Detail Modal (Click to Manage)
Screenshot placeholder: `volunteer-assignment-detail-modal.png`  
*Shows the session detail modal with task sections and volunteer lists*

Click any session card to open the detailed assignment modal:

For Each Task:

- Task Header
  - Task name
  - Badge showing assignment status (X/Y format)
  - Green badge if fully staffed, amber if understaffed

- Assigned Volunteers List
  - Shows all volunteers currently assigned to this task
  - Each entry displays:
    - Color dot (volunteer's assigned color)
    - Volunteer full name
    - Remove button (X icon) — click to unassign

- Add Volunteer Dropdown (if not fully staffed)
  - Shows volunteers not yet assigned to this task
  - Select a volunteer to add them
  - Dropdown disappears once task is fully staffed

Workflow:
1. Click a session to see all tasks
2. Review current assignments for each task
3. Add volunteers using the dropdown
4. Remove volunteers using the X icon
5. Changes save instantly

### Program Grid Session Cards
Screenshot placeholder: `volunteer-assignment-session-cards.png`  
*Close-up of session cards showing task fill status and assigned volunteer names*

Session cards in the grid display:

Task Badges (for each assigned task):
- Badge background:
  - Green — All volunteer slots filled
  - Amber — Understaffed (some slots empty)
- Badge content: `[Task Name] (X/Y)`
- Below each badge: tiny colored dots and first names of assigned volunteers

Example Badge:
Shows:
- Task name: "AV Support"
- 2 of 3 volunteer slots filled
- John and Sarah are assigned (with their color dots)

No Tasks Indicator:
- Sessions without tasks show "No tasks" in italics
- These sessions are not droppable (can't assign volunteers)

### Volunteer Color Assignment
Screenshot placeholder: `volunteer-assignment-colors.png`  
*Shows clicking a color dot to cycle through preset colors*

Each volunteer has a conference-specific color for visual identification:

Setting Colors:
1. Find the volunteer in the sidebar
2. Click their color dot (left of their name)
3. The color cycles to the next preset color
4. Color updates immediately throughout the interface

Preset Colors (10 total):
- Blue (#3B82F6)
- Green (#10B981)
- Amber (#F59E0B)
- Red (#EF4444)
- Purple (#8B5CF6)
- Pink (#EC4899)
- Cyan (#06B6D4)
- Lime (#84CC16)
- Orange (#F97316)
- Indigo (#6366F1)

Color Purpose:
- Helps visually distinguish volunteers in the grid
- Makes it easy to see workload distribution at a glance
- Appears in schedules and PDF exports

### Workload Balancing
Screenshot placeholder: `volunteer-assignment-workload.png`  
*Shows the sidebar with volunteers having different assignment count badges*

The assignment count badge on each volunteer card helps you balance workload:

- Blue circle with a number shows total session-task assignments
- No badge means the volunteer has zero assignments
- Higher numbers indicate volunteers with more responsibilities

Best Practices:
- Aim for even distribution across volunteers
- Some tasks require specialized skills (assign accordingly)
- Consider volunteer availability when scheduling
- Review the Volunteer Schedule tab (Section 15.4) to check for conflicts

### Conflict Detection
The system helps prevent scheduling conflicts:

Time Conflicts:
- Volunteers cannot be assigned to multiple tasks in overlapping time slots
- The system doesn't automatically prevent this (manual checking required)
- Use the Volunteer Schedule tab to review each volunteer's timeline

Duplicate Prevention:
- A volunteer cannot be assigned to the same task twice
- Drag-and-drop to an already-assigned task is ignored
- Modal task picker grays out already-assigned tasks

### Removing Assignments
Screenshot placeholder: `volunteer-assignment-remove.png`  
*Shows the remove button next to an assigned volunteer in the detail modal*

To unassign a volunteer:

1. Click the session card to open the detail modal
2. Find the volunteer in the assigned list
3. Click the X icon next to their name
4. The volunteer is immediately unassigned

Bulk Removal:

---

## 15.4 Volunteer Schedule
The Volunteer Schedule tab provides a read-only view of each volunteer's complete schedule with PDF export capabilities for distribution.

### Accessing Volunteer Schedule
Navigate to Conference Detail → Volunteers → Volunteer Schedule

Screenshot placeholder: `volunteer-schedule-overview.png`  
*Shows the volunteer schedule interface with expandable volunteer cards*

### Schedule List View
The schedule displays all volunteers with assigned tasks in an expandable list format:

Screenshot placeholder: `volunteer-schedule-collapsed.png`  

Collapsed View:
- Volunteer header bar showing:
  - Expand/collapse arrow icon
  - Color dot (volunteer's assigned color)
  - Full name
  - Session count (e.g., "3 sessions")
  - PDF download button

Expanded View:
- Click the header bar or arrow to expand
- Shows complete schedule grouped by day

### Schedule Details
Screenshot placeholder: `volunteer-schedule-expanded.png`  

For each volunteer, the schedule displays:

Day Groupings:
- Sessions organized by program day (e.g., "Day 1," "Conference Day")
- Day name appears as a section header in uppercase

1. Time — Start and end time (e.g., "09:00–10:30")
2. Session — Full session title
3. Track — Track name (or "–" if no track)
4. Task — Task name in a blue badge


If a volunteer has no assignments, the expanded view shows:
> *"No assignments yet."*

### PDF Export (Individual)
Screenshot placeholder: `volunteer-schedule-pdf-button.png`  
*Shows the PDF button on an individual volunteer card*

Each volunteer has a PDF download button on their header bar:

1. Click PDF button
2. Browser downloads `volunteer_schedule.pdf`
3. File contains:
   - Volunteer name at the top
   - Conference name
   - Formatted for printing

PDF Contents:
- Clear typography and spacing
- Day-grouped layout
- All session details included

Use Cases:
- Email to individual volunteers
- Print for volunteer check-in packets
- Provide to volunteers during orientation

### PDF Export (All Volunteers)
Screenshot placeholder: `volunteer-schedule-export-all.png`  
*Shows the "Export All PDFs" button in the upper right*

The Export All PDFs button in the upper right corner downloads all schedules:

1. Click Export All PDFs
2. System generates a PDF for each volunteer with assignments
3. Browser downloads `volunteer_schedules.zip`
4. ZIP file contains individual PDFs named by volunteer

Screenshot placeholder: `volunteer-schedule-zip-contents.png`  
*Shows the contents of the extracted ZIP file with multiple PDFs*

ZIP File Structure:

Use Cases:
- Bulk distribution via email
- Print all schedules for volunteer coordinator
- Archive for event records

- Button shows "Downloading..." while generating
- For large volunteer teams, this may take a few seconds

### Unassigned Sessions Warning
Screenshot placeholder: `volunteer-schedule-unassigned.png`  

Below the volunteer list, a warning section appears if any session-tasks are understaffed:

Header:
> ⚠️ Unassigned Sessions (X)

Where X is the count of understaffed session-task combinations.

1. Session — Session title
2. Day — Program day name
3. Time — Start and end time
4. Track — Track name (or "–")
5. Task — Task name in blue badge
6. Volunteers — Assignment status in amber (e.g., "1/3")

Purpose:
- Quickly identify gaps in volunteer coverage
- Shows how many more volunteers are needed per task
- Helps ensure all critical tasks are fully staffed

### Schedule Distribution
Recommended Workflow:

1. Finalize Assignments — Complete all volunteer assignments in the Volunteer Assignment tab
2. Review Schedules — Check each volunteer's schedule for conflicts or overload
3. Export PDFs — Download all schedules as a ZIP file
4. Distribute — Email individual PDFs to volunteers or print for packets
5. Update as Needed — If assignments change, re-export and redistribute

Email Template Example:

### Empty State
Screenshot placeholder: `volunteer-schedule-empty.png`  

If no volunteers have been assigned to any tasks, the page displays:

> No volunteer schedules available  
> *Assign volunteers to tasks in the Volunteer Assignment tab first.*

---

## 15.5 Volunteer Settings
Volunteer Settings is where you define the reusable task types that volunteers can perform. These tasks are then assigned to sessions in the Task Assignment tab.

### Accessing Volunteer Settings
Navigate to Conference Detail → Settings → Volunteer Tasks

Screenshot placeholder: `volunteer-settings-overview.png`  

### Understanding Volunteer Tasks
Important Terminology:
- UI labels: "Volunteer Tasks" in settings, "Tasks" in assignment interface
- Purpose: Define reusable task definitions for volunteers

What is a Task?
A task represents a type of work volunteers perform. Tasks are conference-specific and reusable across multiple sessions.

Examples:
- Registration Desk
- AV/Tech Support
- Session Chair
- Room Monitor
- Information Booth
- Photography
- Social Media Coverage
- Setup/Teardown
- Check-in Assistance
- Crowd Control

### Task List Table


Columns:
1. Name — Short task name (appears in dropdowns and badges)
3. Active — Green "Active" or gray "Inactive" badge

Actions Column:
- Edit icon (pencil) — Edit task details
- Delete icon (trash) — Delete the task

Screenshot placeholder: `volunteer-settings-actions.png`  
*Close-up of the action buttons*

### Creating a New Task
Screenshot placeholder: `volunteer-settings-create-modal.png`  
*Shows the create task modal with all fields*

1. Click Create Task button (upper right)
2. Modal opens with form fields
3. Fill in:
   - Name (required) — Short, descriptive name (e.g., "Registration Desk")
   - Description (optional) — Rich text description of responsibilities
   - Active checkbox — Checked by default
4. Click Save

Screenshot placeholder: `volunteer-settings-description-editor.png`  
*Shows the rich text editor for task description*

Name Guidelines:
- Keep concise (appears in small badges)
- Use title case (e.g., "Session Chair," not "session chair")
- Be specific (e.g., "AV Support" instead of just "Tech")
- Avoid abbreviations unless universally understood

Description Best Practices:
- Describe the task responsibilities clearly
- Include any required skills or qualifications
- Mention tools or equipment needed
- Note reporting structure (e.g., "Reports to Event Coordinator")
- Add time expectations (e.g., "Must arrive 30 minutes early")

Example Task:

Name: Registration Desk

Description:

### Editing Task Details
Screenshot placeholder: `volunteer-settings-edit-modal.png`  
*Shows the edit task modal*

1. Click the edit icon (pencil) next to a task
2. Modal opens with current task data
3. Modify any field:
   - Name
   - Description (rich text editor)
   - Active status
4. Click Save Changes

Screenshot placeholder: `volunteer-settings-save-status.png`  

Save Status:
- Blue "Save Changes" → Ready to save
- Spinning + "Saving..." → In progress
- Green checkmark + "Saved!" → Success
- Red "Error" → Failed (error message appears)

Editing Active Tasks:
- Tasks currently assigned to sessions can be edited
- Name changes propagate to all assignments immediately
- Description changes don't affect existing assignments (informational only)

### Task Active Status
The Active checkbox controls whether a task appears in assignment interfaces:

Active (checked):
- Task appears in the Task Assignment sidebar
- Task appears in session task dropdown menus
- Existing assignments remain visible

Inactive (unchecked):
- Cannot be assigned to new sessions
- Existing assignments remain intact and visible
- Useful for phasing out deprecated tasks

Use Cases for Inactive:
- Seasonal tasks (only needed for some conferences)
- Deprecated tasks (replaced by better-defined tasks)
- Experimental tasks (testing before making widely available)

### Deleting Tasks
Screenshot placeholder: `volunteer-settings-delete-confirm.png`  
*Shows the delete confirmation dialog*

1. Click the delete icon (trash) next to a task
2. Confirmation dialog appears
3. Click Delete to confirm

Warning Messages:
- If task is assigned to sessions, the dialog warns:
  > "This task is currently assigned to X sessions. Deleting it will remove all session-task assignments and volunteer assignments. This cannot be undone."

What Happens on Delete:
- Task definition is permanently deleted
- All session-task assignments for this task are deleted
- All volunteer assignments to this task are deleted
- This action cannot be undone

Best Practice:
Instead of deleting, consider marking the task as Inactive to preserve historical data.

### Task Requirements and Descriptions
Tasks can include detailed requirements and descriptions to help volunteers understand expectations.

Screenshot placeholder: `volunteer-settings-description-display.png`  
*Shows a task description with formatted text, lists, and sections*

Rich Text Formatting:
- Bold, italic, underline
- Bulleted and numbered lists
- Headings for sections
- Links to external resources

Common Description Sections:
1. Responsibilities — What the volunteer will do
2. Requirements — Skills, qualifications, or certifications needed
3. Equipment — Tools or materials provided or required
4. Reports To — Who supervises this task
5. Time Expectations — Shift length, arrival time, break policy
6. Training — Any training provided or required

Example: AV Support Task

Name: AV Support

Description:

### Task Planning Best Practices
Before Creating Tasks:

1. Identify Needs — Review your program and identify which sessions need volunteer support
2. Define Scope — Clearly define what each task entails
3. Estimate Counts — Determine how many volunteers are needed per task per session
4. Consider Skills — Note any special skills or training required
5. Plan Training — Schedule training for complex tasks

Common Task Categories:

Registration & Check-In:
- Registration Desk
- Badge Distribution
- Check-in Assistance

Session Support:
- Session Chair
- Room Monitor
- AV/Tech Support
- Timekeeper

Information & Hospitality:
- Information Booth
- Greeter
- Hospitality Suite

Operations:
- Setup/Teardown
- Signage
- Equipment Transport

Communications:
- Photography
- Social Media
- Live Tweeting

Accessibility:
- Accessibility Assistance

### Task Reusability
Tasks are conference-specific but can be used across all sessions within that conference:

Single Conference:
- Each conference has its own set of tasks
- Tasks are not shared between conferences
- This allows for conference-specific customization

Within Conference:
- One task can be assigned to unlimited sessions
- Same task can have different required counts per session
- Example: "Session Chair" used for all talk sessions but with varying counts

Cross-Conference:
- To reuse tasks across conferences, you must recreate them
- Consider creating a standard set of tasks for your organization

### Empty State
Screenshot placeholder: `volunteer-settings-empty.png`  

If no volunteer tasks have been created yet:

> No volunteer tasks yet  
> *Create your first task to get started.*

Click Create Task to define your first volunteer role.

---


---

## Summary


1. Volunteers Tab — Create and manage volunteer records, link volunteers to conferences
2. Task Assignment — Define what needs to be done by assigning tasks to program sessions
3. Volunteer Assignment — Assign specific volunteers to specific session tasks using drag-and-drop
4. Volunteer Schedule — View and export individual and bulk volunteer schedules as PDFs
5. Volunteer Settings — Define reusable task types with detailed descriptions and requirements


---

I'll create comprehensive documentation for Sections 16-17 of the tenant UI handbook. Let me first examine the relevant codebase files to ensure accuracy.

Perfect! Now I have all the information I need. Let me create comprehensive documentation for Sections 16-17.

# Sections 16-17: Locations & Sponsors Module Documentation

## 16. Locations Module


### 16.1 Location Hierarchy

Parent-Child Relationships

Locations support two-level hierarchy:
- Top-level venues (no parent): Conference centers, hotels, university campuses
- Child locations (with parent): Rooms, halls, breakout spaces within a venue

![Screenshot placeholder: Location hierarchy sidebar showing indented structure]

Hierarchy Rules:
- Only top-level locations can be parents (single level nesting)
- Parent selection dropdown shows only top-level venues
- Child locations appear indented in the sidebar list with arrow icons
- Orphan children (parent not in current conference) display at top level

Visual Indicators:
- Top-level venues with children: Building icon
- Child locations: Right arrow icon (→)
- Green dot: Active location
- Red dot: Inactive location

---

### 16.2 Location Types

Location types are conference-scoped settings that define categories like "Room", "Hall", "Virtual", "Outdoor Space".

Accessing Location Types:
1. Navigate to Conference > Settings
2. Under Location Types, create custom types
3. Each type has:
   - Name: Display name (e.g., "Conference Room")
   - Slug: Internal identifier (e.g., "room")
   - Description: Optional notes
   - Active toggle: Show/hide in dropdowns

Common Location Types:
- `venue` - Conference centers, hotels
- `room` - Standard meeting rooms
- `hall` - Large auditoriums
- `virtual` - Online meeting spaces
- `outdoor` - Garden, terrace, plaza


![Screenshot placeholder: Location type settings with active types]

---

### 16.3 Creating Locations

Two Creation Methods:

#### A. Link Existing Location
For locations used across multiple conferences:

1. Click Link existing... dropdown
3. Location appears in list immediately

Use case: Organization has permanent venues used by multiple conferences.

#### B. Create New Location

1. Click Create New button
2. Fill required fields:
   - Name* (required): "Grand Ballroom", "Zoom Room A"
   - Code: Short identifier (e.g., "GB-01")
   - Parent Location: Optional - select venue for child locations
   - Capacity: Maximum attendees

![Screenshot placeholder: Create location form with all fields]

Physical vs. Virtual Fields:

The form adapts based on location type:

For Physical Locations (`type !== "virtual"`):
- Address Line 1 & 2
- Building, Floor
- Phone (validates format: `+491234545` or `00491234566`)
- Website (auto-normalizes: `example.com` → `https://example.com`)
- VAT Number

For Virtual Locations (`type === "virtual"`):
- Platform dropdown: Zoom, Microsoft Teams, Google Meet, Webex, Other

Common Fields (Both Types):
- Description (rich text editor)
- Contact Persons (see section 16.5)
- Active checkbox

3. Click Create Location
4. Location is automatically linked to current conference
5. Detail panel opens for the new location

---

### 16.4 Capacity Settings

Purpose:
- Define maximum attendees for each location
- Used for session scheduling and conflict detection
- Shown in location list next to location name

Setting Capacity:
1. Open location detail panel
2. Enter number in Capacity field (minimum: 0)
3. Leave blank if capacity is unlimited/unknown
4. Click Save

Capacity Display:
- Shows in session assignment views
- Used by program scheduling tools

![Screenshot placeholder: Location capacity in detail panel and list view]

---

### 16.5 Assigning Locations to Sessions


A. Session Detail Panel:
1. Open session in Program tab
2. Select Location dropdown
4. Only active locations appear in dropdown

B. Drag-and-Drop (Program Grid):
1. Navigate to Program > Visual Editor
2. Drag sessions to location rows
3. Grid shows time conflicts and capacity warnings

Location Filtering:
- Only locations linked to current conference appear
- Capacity warnings shown when exceeded

---

### 16.6 Location Maps & Directions

Description Field (Rich Text):

Use the Description field to provide:
- Floor maps or embedded images (via rich text editor)
- Accessibility information
- Parking instructions

Example Description Template:

![Screenshot placeholder: Location description with rich text formatting]

Website Field:
Use for:
- Google Maps links
- Interactive floor plan PDFs
- Venue-specific web pages

---

### 16.7 Location Documents

Each location has a Documents tab for:
- Floor plans (PDF, PNG, JPG)
- Fire evacuation maps
- Setup diagrams
- Equipment manuals

Uploading Documents:
1. Open location detail panel
2. Click Documents tab
3. Click Upload or drag files
4. Files are stored with conference ID for isolation

File Types Allowed:
- PDF, DOCX, XLSX, TXT
- Images: JPEG, PNG, WebP, GIF
- Max size: 10 MB per file

![Screenshot placeholder: Documents tab with uploaded files]

---

### 16.8 Contact Persons

Assign facility managers, AV technicians, or venue coordinators to locations.

Adding Contacts:
1. Open location detail panel
2. Click Contacts tab
3. Fill fields:
   - First Name*, Last Name* (required)
   - Email, Phone (validated)
   - Comment (e.g., "Available after 2pm")
4. Click Add Contact

Editing Contacts:
- Click contact row to expand inline editor
- Update fields and save
- Delete with trash icon

Use Cases:
- Venue manager contact for last-minute changes
- AV technician for equipment issues
- Building security for after-hours access

Contact count appears in tab label: "Contacts (3)"

![Screenshot placeholder: Contact persons list with add form]

---

### 16.9 Location Visibility & Status

Active Toggle:
- Active = true: Location appears in session dropdowns
- Active = false: Location hidden but data preserved

When to Deactivate:
- Venue no longer available
- Room undergoing renovation
- Virtual space URL expired

Visual Indicators:
- Active locations: Green status dot
- Inactive locations: Red status dot
- Inactive locations grayed out in list

Unlinking vs. Deleting:
- Delete: Permanently removes location (only if not linked to sessions)

---

