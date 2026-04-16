# SaaSConf Best Practices Guide

**Comprehensive operational guidance for conference organizers**

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

**Conference Setup**
- [ ] Create conference in system with basic details (name, dates, location, attendance type)
- [ ] Configure conference country for VAT calculations
- [ ] Set conference currency (EUR, USD, GBP, etc.)
- [ ] Upload conference logo and branding assets
- [ ] Set timezone for all date/time displays

**Financial Configuration**
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

**CFP Setup**
- [ ] Create CFP form schema with required fields:
  - Talk title, abstract, description
  - Track/topic selection
  - Speaker bio, photo, social links
  - Session type (keynote, talk, panel, workshop, tutorial)
- [ ] Define submission topics/tracks
- [ ] Set CFP open/close dates
- [ ] Configure review criteria and scoring system
- [ ] Create review committee (if using peer review)

**Content Planning**
- [ ] Define program days and time slots
- [ ] Create tracks (if multi-track conference)
- [ ] Define session types (keynote, talk, lightning talk, panel, workshop, tutorial, social)
- [ ] Create locations/rooms for sessions
- [ ] Plan special events (keynotes, networking, dinners)

**Team Setup**
- [ ] Add tenant admins with appropriate permissions
- [ ] Create team member accounts for specific roles:
  - Finance team (invoice management)
  - Program committee (CFP review)
  - Volunteer coordinators
  - Communication managers
- [ ] Document internal workflows and responsibilities

### Timeline: 3 Months Out

**Registration Launch**
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

**CFP Launch**
- [ ] Announce CFP opening via email and social media
- [ ] Create screen overlay for CFP announcement (trigger: first login)
- [ ] Set up automated CFP status emails:
  - Submission confirmation
  - Review period notification
  - Acceptance/rejection notifications
- [ ] Recruit reviewers and assign to committee

**Sponsor Outreach**
- [ ] Create sponsor packages (Gold, Silver, Bronze, etc.)
- [ ] Generate sponsor contract templates
- [ ] Begin sponsor outreach campaign
- [ ] Create recipient lists for sponsor communications

### Timeline: 1 Month Out

**CFP Closure & Program Building**
- [ ] Close CFP submissions
- [ ] Complete all reviews (assign reviewers if needed)
- [ ] Make acceptance/rejection decisions
- [ ] Send acceptance/rejection emails with personal messages
- [ ] Request accepted speakers confirm attendance
- [ ] Begin building program schedule
- [ ] Assign sessions to time slots and tracks
- [ ] Mark sessions as separately bookable (if attendees choose sessions)

**Registration Management**
- [ ] Review registration numbers by ticket type
- [ ] Send reminder emails to incomplete registrations
- [ ] Follow up on unpaid invoices (overdue status)
- [ ] Close Early Bird period, activate Regular pricing
- [ ] Process group registrations and special requests

**Sponsor Management**
- [ ] Finalize sponsor contracts (send for signature)
- [ ] Send sponsor invoices
- [ ] Track sponsor payments
- [ ] Coordinate sponsor logistics (booth setup, materials)

**Communication Prep**
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

**Final Preparations**
- [ ] Publish final program (make visible to attendees)
- [ ] Send pre-event email with:
  - Schedule overview
  - Location/venue details
  - Check-in instructions
  - WiFi credentials
  - Emergency contacts
- [ ] Close late registration (or set cutoff)
- [ ] Generate attendee lists for check-in
- [ ] Export registration data for badge printing
- [ ] Assign volunteers to tasks (if using volunteer module)
- [ ] Create volunteer schedules

**Data Quality Check**
- [ ] Review registration data for duplicates
- [ ] Verify all paid registrations are linked to invoices
- [ ] Check for missing contact information
- [ ] Validate VAT numbers on B2B invoices (avoid audit issues)
- [ ] Export backup of all data (registrations, CFP, invoices)

**Team Coordination**
- [ ] Hold team briefing meeting
- [ ] Distribute volunteer schedules
- [ ] Assign on-site responsibilities
- [ ] Set up communication channels (Slack, WhatsApp group)
- [ ] Review contingency plans

---

## Financial Management

### Pricing Strategy

**Use Time-Based Pricing Periods**
- **Early Bird** (6-4 months out): 20-30% discount to drive early registrations
- **Regular** (4-1 months out): Standard pricing for majority of attendees
- **Late** (1 month to event): 10-20% premium to encourage early registration

**Package vs Individual Options**
- **Packages**: Bundle related items (Full Conference + Dinner + Workshop)
  - Pros: Simplifies pricing, encourages upsells, reduces decision fatigue
  - Cons: Less flexibility, may include items attendees don't want
- **Individual Options**: À la carte selection
  - Pros: Maximum flexibility, attendees pay only for what they want
  - Cons: More complex pricing, requires more decision-making

**Best Practice**: Offer both packages (for simplicity) and individual options (for flexibility)

**Example Structure**:
- **Full Conference Package**: All days + networking dinner (15% savings)
- **2-Day Pass**: Access to main conference days only
- **1-Day Pass**: Single day access
- **Add-ons**: Tutorials, workshops, special dinners (separately bookable)

### Discount Code Strategy

**Types of Discount Codes**
1. **Speaker Codes**: 100% discount for accepted speakers
2. **Sponsor Codes**: Complimentary or discounted tickets per sponsorship tier
3. **Partner Codes**: Academic institutions, user groups (10-20% discount)
4. **Group Codes**: 5+ registrations from same organization (15% discount)
5. **Promotional Codes**: Limited-time offers for marketing campaigns

**Best Practices**
- Use descriptive code names: `SPEAKER2026`, `EARLYBIRD25`, `ACMEGROUP15`
- Set expiration dates to create urgency
- Limit max uses for promotional codes (prevent abuse)
- Make codes non-combinable unless specifically designed to stack
- Apply codes to specific booking options/periods (scope appropriately)

**Bulk Generation for People Groups**
- Generate codes for: Sponsors, Speakers, Program Committee, Custom Recipient Lists
- Use template variables: `[ConferenceSlug]-[LastName]-[Counter]`
- Example: `PYCON2026-SMITH-001`, `PYCON2026-SMITH-002`
- Review duplicate preview before confirming generation

### VAT Compliance

**Critical VAT Rules**
1. **Virtual/Hybrid-Online + EU B2B = Reverse Charge Required**
   - VAT number is **legally required** (Article 196, EU VAT Directive)
   - System shows red asterisk and error warning
   - Cannot proceed without VAT number (or admin override)

2. **In-Person + EU B2B = VAT Recommended**
   - VAT number is **best practice** but not mandatory
   - System shows yellow "(Recommended for B2B)" label
   - Helps customer reclaim input VAT

3. **Always validate VAT numbers before sending invoices**
   - Green checkmark = verified against VIES registry
   - Yellow warning = format OK but VIES unavailable (safe to send)
   - Red X = invalid format (ask customer to verify)

4. **Document VAT decisions**
   - Review VAT warning banners before sending
   - Check rule references (e.g., "Article 196")
   - Add internal comments explaining admin overrides

**VAT Decision Table Quick Reference**

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

**VAT Rate Overrides**
- Global defaults maintained for all EU countries
- Tenant overrides available for:
  - Reduced rates (books, publications, education)
  - Special economic zones
  - Industry-specific exemptions
- Configure in: Conference Settings > VAT Settings > Country Rates

### Invoice Management Workflow

**1. Create Drafts Early**
- Lock in pricing before event
- Easy to update while in draft status
- No audit trail concerns with draft edits

**2. Invoice Types**
- **Bank Transfer**: Traditional invoicing with wire transfer details
  - Best for: Large corporate sponsors, government entities
  - Payment tracking: Manual (mark as paid when received)
- **Credit Card**: Stripe-integrated with payment link
  - Best for: Individual registrations, fast payment needed
  - Payment tracking: Automatic via webhook

**3. Recipient Search**
- Search across: Sponsors, Speakers, Committee, Volunteers, Registrations
- Auto-fills: Company name, address, email, VAT number
- Reduces data entry errors

**4. Review Before Sending**
- Check VAT warnings (red = compliance risk, yellow = best practice)
- Verify recipient address is complete and accurate
- Confirm line items, quantities, prices
- Add internal comments for team coordination
- Review due date (typically 30 days from issue date)

**5. Correction Workflows**

**For Billing Corrections** (wrong name, address, VAT, PO number):
- Use **Replace Invoice** feature
- System automatically:
  - Cancels old invoice (creates credit note)
  - Creates new invoice with corrected billing
  - Keeps registrations active (no disruption)
  - Inherits payment status (paid invoices stay paid)
  - Handles Stripe payment links (deactivates old, creates new if needed)

**For Amount/Line Item Changes**:
- Cancel existing invoice (creates credit note)
- Create new invoice with correct details
- Send new invoice to customer

**For True Cancellations** (event cancelled, refund needed):
- Use **Cancel Invoice** with "Cancel all registrations" checked
- System automatically:
  - Creates credit note
  - Cancels all linked registrations
  - Removes conference access
  - Issues Stripe refund (credit card invoices)
  - Sends cancellation emails to attendees

**Decision Tree**:
```
Is billing info wrong (name, address, VAT, PO)?
├─ YES → Use "Replace Invoice" (fast, no disruption)
└─ NO → Is the invoice amount/items wrong?
    ├─ YES → Cancel + Create New Invoice
    └─ NO → True cancellation (refund)?
        ├─ YES → Cancel Invoice + Cancel Registrations
        └─ NO → Leave as-is
```

**6. Payment Tracking**
- Credit card: Automatic via Stripe webhooks (instant status update)
- Bank transfer: Manual marking required
  - Click "Mark as Paid"
  - Enter payment date and bank reference
  - Add internal comment with transaction details

**7. Follow-Up on Overdue Invoices**
- System automatically flags invoices past due date
- Review overdue invoices weekly
- Send reminder emails (use messaging templates)
- For sponsors: Coordinate with account manager
- For registrations: May need to cancel access if payment not received

### Refund Policies

**Define Refund Policy Early**
- Document in conference settings and website
- Typical structure:
  - More than 30 days before: 100% refund
  - 15-30 days before: 50% refund
  - Less than 15 days: No refund (or credit to next year)

**Processing Refunds**
1. Cancel the invoice (creates credit note)
2. For credit card payments: System auto-refunds via Stripe
3. For bank transfers: Process manual refund, document in comments
4. Cancel registration if appropriate
5. Update internal tracking (spreadsheet, CRM)

**Attendee Replacement as Alternative**
- Offer replacement instead of refund when possible
- Use **Replace Attendee** feature:
  - Keeps invoice valid (no refund needed)
  - Transfers registration to new person
  - Maintains revenue
  - Better for organizer and attendee

---

## Registration Management

### Self-Registration vs Manual Entry

**Self-Registration** (Recommended for Most Cases)
- **Pros**:
  - Reduces admin workload
  - Attendees provide accurate information
  - Immediate confirmation and payment
  - Scales to hundreds/thousands of registrations
- **Cons**:
  - Requires functioning portal and email delivery
  - Attendees may enter incorrect data
  - No pre-screening of registrations

**When to Use**: Public conferences, open registration, large events

**Manual Entry** (Admin-Created Registrations)
- **Pros**:
  - Full control over data quality
  - Can pre-register VIPs, speakers, sponsors
  - Useful for complementary tickets
  - No portal access needed for attendee
- **Cons**:
  - Labor-intensive for large numbers
  - Admin errors possible
  - Slower process

**When to Use**: VIP registrations, comp tickets, speaker registrations, small exclusive events

**Best Practice**: Use both
- Enable self-registration for general attendees
- Manually create registrations for speakers, sponsors, committee members
- Use discount codes to control access (speaker codes, invitation-only codes)

### Registration Workflow

**1. Configure Settings First**
- Add pronouns options (he/him, she/her, they/them, prefer not to say, other)
- Enable/disable fields (phone, job title, department, dietary restrictions)
- Set required vs optional fields
- Configure session selection (if separately bookable sessions)

**2. Session Selection Strategy**

**Separately Bookable Sessions**
- Mark program sessions as `separately_bookable: true`
- Attendees choose sessions during registration (for workshops, tutorials)
- System groups by session type (Tutorial, Workshop, Hackathon)
- Parallel sessions: Choose one via dropdown
- Non-parallel sessions: Choose from each independently

**When to Use**:
- Limited capacity sessions (workshops, tutorials)
- Parallel tracks where attendee must pick one
- Special activities requiring advance selection

**When Not to Use**:
- Open sessions anyone can attend
- Keynotes and plenaries (everyone attends)
- Sessions with unlimited capacity

**3. Group Registrations**

**Group Registration Flow**:
- Single billing profile for entire group
- Multiple attendee records (each with own data)
- One invoice for all attendees
- Use unified endpoint: `POST /registrations` (with multiple attendees)

**Best Practices**:
- Require one contact person for group (receives all communications)
- Collect individual attendee emails (for personal communications)
- Offer group discounts (5+ attendees = 15% off, 10+ = 20% off)
- Send confirmation to both group contact and individual attendees

**4. Data Quality Maintenance**

**Email Validation**
- System validates format on blur (real-time)
- Red border indicates invalid email
- Common mistakes: Missing @, invalid domain, typos (.con instead of .com)

**Phone Validation**
- Accepts international formats with country code (+1, +44, +49)
- Allows spaces, dashes, parentheses for readability
- Format: +1-555-123-4567 or +44 20 1234 5678

**VAT Number Validation**
- Green checkmark = verified via VIES
- Yellow warning = format OK but VIES unavailable
- Red X = invalid format
- Always validate B2B registrations

**5. Handling Special Cases**

**Speaker Registrations**
- Create manually with 100% discount code
- Link to CFP paper/session
- Mark as "Speaker" in registration type (if field exists)
- Send special welcome email with speaker info

**Sponsor Registrations**
- Use sponsor-specific discount codes
- May be complimentary or discounted per package
- Track against sponsor package allocation (Gold = 5 tickets, Silver = 3, etc.)
- Link to sponsor record for reporting

**Group Registrations from Companies**
- Collect single billing profile
- Individual attendee details for each person
- One invoice for entire group
- Bulk discount if applicable

**Academic/Student Registrations**
- Require proof of enrollment (upload or email verification)
- Separate ticket type with reduced pricing
- May require manual approval

### Attendee Replacement

**When to Replace an Attendee**
- Original attendee can't attend (illness, conflict, job change)
- Employee left company, replacement attending
- Wrong person registered initially
- Department transfer within organization

**Replacement Process**
1. Navigate to registration in admin panel
2. Click **Replace Attendee**
3. Enter new attendee information:
   - First Name, Last Name (required)
   - Email (required, validated)
   - Phone (validated if provided)
   - Pronouns (from conference settings)
   - Job Title, Department (optional)
4. Enter **Replacement Reason** (required for audit trail)
5. Add **Cancellation Message** (sent to original attendee)
6. Optionally add additional booking items for new attendee:
   - Booking options (meals, workshops)
   - Tutorials (max one)
   - System prevents duplicates automatically
7. Review summary and click **Replace**

**What Happens Automatically**:
- Original registration: Status → CANCELLED, access removed
- New registration: Created with replacement link, access granted
- Original attendee: Receives cancellation email
- New attendee: Receives welcome email
- Additional items (if added): New invoice created (delta invoicing)
- Billing profile: Inherited from original registration
- Audit trail: Full replacement record with reason, timestamp, admin

**Validation Rules**:
- Cannot replace already-replaced registrations (follow chain instead)
- Cannot replace cancelled registrations
- Cannot add duplicate booking items
- Cannot add multiple tutorials (one at a time)
- Email and phone must be valid formats
- Pronouns must be from conference settings (no custom text)

**Additional Items Best Practices**:
- Only add items new attendee actually needs
- Remember: Creates a new invoice (sent to billing contact)
- Check billing profile is correct before adding paid items
- System filters out items attendee already has
- Tutorial option disabled if attendee already has one

**Use Cases**:
- **Simple Transfer**: Employee A leaves, Employee B attends → Straight replacement, no additional items
- **Replacement with Upgrades**: New attendee wants tutorial → Add tutorial as additional item
- **Cross-Department Transfer**: Different department, different needs → Replace + add department-specific items

---

## CFP Best Practices

### Timeline Planning

**6 Months Before Conference**
- Open CFP submissions
- Announce widely (mailing lists, social media, partner organizations)
- Create submission guidelines and FAQ

**3-4 Months Before Conference**
- Close CFP submissions
- Allow 1-2 week grace period for technical issues only

**2-3 Months Before Conference**
- Complete all reviews
- Make acceptance/rejection decisions
- Send notifications with personal messages

**2 Months Before Conference**
- Confirm speaker attendance
- Request speaker bio/photo updates
- Collect session materials (slides, handouts)

**1 Month Before Conference**
- Finalize program schedule
- Publish program to attendees
- Send speaker logistics (AV requirements, room locations, rehearsal times)

### Review Process Setup

**Single-Blind vs Double-Blind Review**
- **Single-Blind**: Reviewers see submitter names (most common)
  - Pros: Context about speaker experience, easier logistics
  - Cons: Potential bias based on reputation
- **Double-Blind**: Reviewers don't see submitter names
  - Pros: Reduces bias, focuses on content quality
  - Cons: Harder to implement, submitters may reveal identity in proposal

**Review Criteria**
- Relevance to conference theme/tracks (1-5 points)
- Technical quality/depth (1-5 points)
- Clarity of presentation/abstract (1-5 points)
- Novelty/originality (1-5 points)
- Speaker experience (1-5 points, only for single-blind)

**Scoring System**
- Use weighted average across criteria
- Set minimum score threshold for acceptance (e.g., 3.5/5.0)
- Allow written comments in addition to scores
- Flag conflicts of interest (reviewer works with submitter)

### Reviewer Assignment Strategies

**Random Assignment**
- System assigns papers randomly to reviewers
- Ensures even distribution of workload
- May result in poor topic matching

**Topic-Based Assignment**
- Assign papers to reviewers based on expertise tags
- Better quality reviews (reviewers understand content)
- Requires manual configuration or smart matching

**Round-Robin Assignment**
- Papers assigned in rotation to reviewers
- Ensures equal workload
- Combines with topic matching for best results

**Best Practice**:
1. Assign 3 reviewers per paper (odd number prevents ties)
2. Each reviewer gets 10-15 papers (manageable workload)
3. Match papers to reviewer expertise when possible
4. Allow reviewer self-assignment from pool (opt-in for interest)

### Decision Communication

**Acceptance Notifications**
- Send personal congratulations message
- Include:
  - Session details (date, time, room if known)
  - AV/technical requirements form
  - Speaker agreement (slides due date, code of conduct)
  - Complimentary registration code (if offered)
  - Next steps (confirm attendance, bio/photo, travel info)
- Set deadline for confirmation (2 weeks typical)

**Rejection Notifications**
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

**Waitlist Strategy**
- Accept top 80% of needed talks initially
- Waitlist next 20% (backups in case speakers drop out)
- Notify waitlisted submitters:
  - Status is "waitlist" not rejection
  - May be promoted if slots open
  - Deadline for final decision (1 month before event)
  - Invitation to attend conference

### Managing Difficult Situations

**Late Submissions**
- Set hard deadline (system enforces)
- Allow 24-hour grace period for technical issues only
- Document policy clearly on CFP page
- Don't make exceptions (unfair to on-time submitters)

**Conflict of Interest**
- Reviewer works with submitter or at same company
- Reviewer previously collaborated with submitter
- Personal relationship between reviewer and submitter

**Resolution**: Reassign paper to different reviewer, flag in system

**Low-Quality Submissions**
- Incomplete proposals (missing abstract, description)
- Off-topic submissions (not relevant to conference)
- Sales pitches or product demos (not educational)

**Resolution**: Reject early with explanation, don't waste reviewer time

**Speaker Withdrawals After Acceptance**
- Speaker can no longer attend (conflict, emergency)
- Company won't approve travel
- Talk content no longer relevant

**Resolution**:
1. Check waitlist for suitable replacement
2. Invite co-speaker to present alone (if applicable)
3. Last resort: Cancel session, adjust program schedule

**Duplicate Submissions**
- Same talk submitted to multiple tracks
- Same submitter with multiple similar talks

**Resolution**: Ask submitter to choose one, or choose best fit for program

**Plagiarism or Misconduct**
- Submission contains plagiarized content
- Violates code of conduct

**Resolution**: Immediate rejection, potential ban from future submissions, document incident

---

## Program Management

### Session Scheduling Tips

**1. Define Time Structure First**
- Create program days (Day 1, Day 2, Day 3)
- Create time slots (09:00-09:45, 10:00-10:45, etc.)
- Standard slot lengths:
  - Keynotes: 45-60 minutes
  - Talks: 30-45 minutes
  - Lightning talks: 5-10 minutes
  - Workshops/Tutorials: 90-180 minutes (multi-slot)
  - Breaks: 15-30 minutes
  - Lunch: 60-90 minutes

**2. Create Tracks**
- Theme-based: AI/ML, Web Development, DevOps, Data Science
- Level-based: Beginner, Intermediate, Advanced
- Format-based: Talks, Panels, Workshops
- Usually 2-4 parallel tracks maximum (avoid overwhelming attendees)

**3. Session Assignment Workflow**
- Start with fixed sessions: Keynotes, breaks, meals, social events
- Place high-demand talks in larger rooms
- Place tutorials/workshops in hands-on rooms (if separate)
- Fill remaining slots with accepted talks
- Balance topics across tracks (don't cluster all AI talks together)
- Balance levels (mix beginner and advanced in each track)

**4. Visual Program Builder**
- Use grid view to see entire program at once
- Drag-and-drop sessions to time slots
- Color-code by track or session type
- Check for:
  - Empty slots (fill or remove)
  - Overbooked slots (multiple sessions same time/room)
  - Speaker conflicts (same speaker in two places)

### Avoiding Conflicts

**Speaker Conflicts**
- Never schedule same speaker in multiple sessions at same time
- Leave buffer time between sessions for same speaker (30+ min)
- Check co-speakers (don't conflict their other sessions)
- System should warn about double-booking

**Topic Conflicts**
- Don't schedule similar topics in parallel (attendees want both)
- Example: Don't run "Intro to Python" and "Advanced Python" simultaneously
- Spread popular topics throughout day/conference

**Attendee Conflicts**
- Survey attendees about session interest (pre-conference)
- Avoid conflicts for most popular combinations
- Example: If many want both "Security" and "DevOps", schedule in different time slots

**Room Capacity**
- Assign large rooms to popular topics (keynotes, hot topics)
- Assign small rooms to niche topics
- Allow 10-20% buffer (don't pack rooms to capacity)
- Monitor registrations if sessions are separately bookable

### Speaker Management

**Before Conference**
- Send speaker welcome packet:
  - Session details (date, time, room, duration)
  - AV requirements form
  - Slide template (optional but recommended)
  - Code of conduct acknowledgment
  - Speaker dinner invitation (if hosting)
  - Contact for questions

**2 Weeks Before**
- Request final slides (for backup and accessibility)
- Confirm AV needs (projector, mic, clicker, demo setup)
- Share room layout and capacity
- Provide speaker rehearsal time slot (optional)

**1 Week Before**
- Send final schedule with room locations
- Provide speaker check-in instructions
- Share emergency contact info
- Remind about slide deadline

**During Conference**
- Speaker check-in desk on arrival
- Provide speaker lounge (if budget allows)
- AV tech available in each room
- Session timers/signals (5 min warning, time's up)
- Collect feedback forms from attendees

**After Conference**
- Send thank-you email
- Share attendee feedback/ratings
- Request post-conference survey
- Provide video/recording link (if sessions recorded)
- Invite to speak at next year's event

### Location/Room Assignment

**Room Metadata**
- Name: Grand Ballroom, Room A, Workshop Lab 1
- Capacity: 500, 200, 50, etc.
- Features: Projector, Microphone, Whiteboard, Hands-on computers
- Layout: Theater, Classroom, Roundtable, U-shape

**Assignment Strategy**
1. Keynotes → Largest room (main hall)
2. Popular talks → Large rooms (200-300 capacity)
3. Standard talks → Medium rooms (50-100 capacity)
4. Workshops/Tutorials → Labs or classroom-style rooms
5. Panels/Discussions → Roundtable or U-shape setup
6. Lightning talks → Medium room (rotate quickly)

**Special Considerations**
- Accessibility: Wheelchair access, hearing loops, closed captioning
- Recording: Rooms with camera/recording setup
- Hands-on: Computers, WiFi, power outlets for laptops
- Catering: Rooms near food service for breaks

### Publishing the Program

**Draft Mode** (Internal Only)
- Build schedule
- Assign sessions to slots
- Reviewers can see
- Not visible to attendees

**Published Mode** (Public)
- Click "Publish Program"
- Visible to all registered attendees
- Appears in portal and public schedule
- Can still make edits (updates reflected in real-time)

**What to Publish**
- Session title, description, speakers
- Time, date, room/location
- Track/topic
- Session type (talk, panel, workshop)
- Links to speaker bios

**What NOT to Publish (Keep Internal)**
- Reviewer scores or comments
- Speaker contact information (email/phone)
- Internal notes or logistics
- Unconfirmed or cancelled sessions

**Best Practice**:
- Publish 2-4 weeks before event (gives attendees time to plan)
- Update regularly if changes occur
- Send email notification when program published
- Create downloadable PDF schedule for attendees

---

## Communication Strategy

### Email Timing and Frequency

**Pre-Conference Communications**

**6 Months Before**
- CFP announcement
- Early bird registration opening
- Save the date reminder

**3 Months Before**
- CFP closing soon reminder (1 week before deadline)
- Registration reminder (early bird ends soon)
- Sponsor opportunities

**2 Months Before**
- Speaker acceptance/rejection notifications
- Regular registration period opens
- Program preview (if available)

**1 Month Before**
- Final program published
- Late registration period begins
- Hotel/travel information
- Optional: Social event details

**1 Week Before**
- Pre-event checklist email:
  - Event dates and times
  - Venue address and directions
  - Check-in process
  - WiFi credentials
  - Emergency contacts
  - Session recommendations
  - Mobile app download (if available)

**3 Days Before**
- Final reminder
- Weather forecast and packing tips
- Last-minute updates

**Day Before**
- Welcome message
- Day 1 schedule highlights
- Parking/transportation reminders

**During Conference**
- Daily morning email with schedule
- Evening email with next day preview
- Real-time updates via messaging system for urgent changes

**Post-Conference**
- Thank you email (within 2 days)
- Feedback survey (within 1 week)
- Session recordings/slides (within 2 weeks)
- Save the date for next year (within 1 month)

**Best Practices**
- Don't over-email: Max 1 email per week until final week
- Segment emails: Speakers get different emails than general attendees
- Use clear subject lines: "[PyConf 2026] Program Published" not "Update"
- Include unsubscribe link (but keep critical emails mandatory)
- Test emails before sending to full list

### Message Templates

**Template Categories**
1. **Registration**: Confirmation, payment received, cancellation
2. **CFP**: Submission received, acceptance, rejection, reminder
3. **Invoice**: Invoice sent, payment reminder, receipt
4. **Program**: Schedule update, session reminder, speaker info
5. **General**: Welcome, daily schedule, thank you, feedback request

**Template Variables**
- `[First Name]`, `[Last Name]`, `[Full Name]`
- `[Email]`, `[Company Name]`
- `[Conference Name]`, `[Conference Dates]`
- `[Session Title]`, `[Session Time]`, `[Session Room]`
- `[Invoice Number]`, `[Amount Due]`, `[Due Date]`
- `[Custom Message]` (for personalization)

**Template Best Practices**
- Write clear, scannable content (use bullet points)
- Put most important info first (inverted pyramid)
- Include clear call-to-action (Register Now, Confirm Attendance, Pay Invoice)
- Use friendly, professional tone
- Proofread carefully (errors look unprofessional)
- Test with sample data before using

**Example Template Structure**:
```
Subject: [Conference Name] - [Purpose]

Hi [First Name],

[Opening paragraph - 1-2 sentences about why you're writing]

[Key information - bullet points]
- Point 1
- Point 2
- Point 3

[Call to action - clear next step]

[Closing - contact info if questions]

Best regards,
[Conference Team Name]
```

### Notification Sequences

**Registration Sequence**
1. **Immediate**: Registration confirmation (within seconds)
   - Confirms registration received
   - Includes invoice if payment required
   - Next steps (payment, schedule selection)
2. **1 Day Later**: Welcome email (if self-registration)
   - Conference overview
   - What to expect
   - Links to program, venue, FAQs
3. **1 Week Before**: Pre-event reminder
   - Detailed logistics
   - Schedule highlights
   - Check-in instructions

**CFP Submission Sequence**
1. **Immediate**: Submission confirmation
   - Confirms proposal received
   - Provides submission ID
   - Expected timeline for decision
2. **After Review Period**: Decision notification
   - Acceptance or rejection
   - Next steps for accepted speakers
   - Thank you and encouragement for rejected
3. **1 Month Before (Accepted)**: Speaker logistics
   - Session details
   - AV requirements
   - Slide submission deadline

**Invoice Sequence**
1. **Immediate**: Invoice sent
   - Invoice PDF attached
   - Payment instructions
   - Due date highlighted
2. **7 Days Before Due**: Friendly reminder
   - Payment due soon
   - Payment link (credit card)
   - Contact if issues
3. **On Due Date**: Due today reminder
   - Payment requested today
   - Consequences if not paid (access removal?)
4. **7 Days After Due**: Overdue notice
   - Payment overdue
   - Final reminder before action
   - Contact to discuss

### Crisis Communication

**Types of Crises**
- Weather emergency (storm, flooding)
- Venue issue (power outage, evacuation)
- Health emergency (outbreak, injury)
- Security threat
- Major schedule disruption (speaker no-show, equipment failure)

**Communication Protocol**
1. **Assess Situation**: Gather facts, confirm details, consult team
2. **Decide on Action**: Cancel, delay, modify, continue with changes
3. **Draft Message**: Clear, concise, action-oriented
4. **Send Immediately**:
   - Email to all attendees
   - Screen overlay in portal (trigger: always)
   - Social media posts
   - On-site announcements (PA system, signage)
5. **Follow Up**: Updates as situation evolves, final resolution message

**Crisis Message Template**:
```
Subject: [URGENT] [Conference Name] - [Nature of Issue]

Dear Attendees,

We are writing to inform you of [specific issue].

Current Status:
- [Fact 1]
- [Fact 2]
- [Fact 3]

Immediate Actions:
- [What attendees should do now]
- [Safety instructions if applicable]
- [Alternative arrangements]

Next Steps:
- [What organizers are doing]
- [When to expect next update]

Contact:
[Emergency contact info]

[Conference Team]
```

**Best Practices for Crisis Communication**
- Act quickly (delay causes panic and rumors)
- Be transparent (honesty builds trust)
- Provide clear instructions (reduce confusion)
- Update frequently (even if "no new information")
- Show empathy (acknowledge inconvenience/concern)
- Follow up after crisis resolved (lessons learned, thank you)

---

## Sponsor Management

### Sponsor Package Design

**Package Tiers**
- **Platinum/Diamond** ($25,000+): Top tier, limited slots (1-2)
- **Gold** ($10,000-$25,000): Premium tier (3-5 slots)
- **Silver** ($5,000-$10,000): Standard tier (5-10 slots)
- **Bronze** ($2,000-$5,000): Entry tier (10-15 slots)
- **Community** ($500-$1,000): Non-profit/community tier

**Package Benefits Matrix**

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

**Best Practices**
- Create clear package tiers (don't over-complicate)
- Limit top tiers (scarcity increases value)
- Offer à la carte add-ons (extra tickets, banner ads, workshops)
- Early bird discount for sponsors too (10-20% if signed 6+ months out)
- Include digital benefits (virtual events need virtual sponsorships)

### Contract Management Workflow

**1. Generate Contract from Template**
- Use sponsor contract template (pre-configured)
- Or upload DOCX/RTF contract document
- System converts to editable HTML

**2. Customize Contract Content**
- Edit rich-text content in-browser
- Include:
  - Package name and tier
  - Price and payment terms
  - Benefits included
  - Deliverable deadlines (logo due date, booth setup time)
  - Cancellation policy
  - Signatures section
- Use placeholders: `[Recipient Name]`, `[Package Name]`, `[Custom Message]`

**3. Version Control**
- System auto-saves versions on each edit
- View version history
- Restore previous version if needed
- Compare versions (manual review)

**4. Send Contract**
- Click "Send Contract"
- Enter recipient email
- Add custom message
- System emails:
  - Contract PDF attachment
  - Download link
  - Next steps (sign and return)

**5. Track Status**
- **Draft**: Contract created but not sent
- **Sent**: Contract emailed to sponsor
- **Signed**: Sponsor signed and returned (mark manually)

**6. Generate Invoice**
- After contract signed, create invoice
- Use sponsor search to pre-fill billing info
- Match invoice amount to contract price
- Send invoice for payment

**7. Download/Export**
- PDF export for printing
- DOCX export for editing in Word
- Attach to emails or print for wet signature

**Best Practices**
- Use consistent contract template across sponsors (fairness, efficiency)
- Version all changes (audit trail for disputes)
- Send contract well in advance (3-6 months before event)
- Follow up on unsigned contracts weekly
- Don't deliver benefits until payment received

### Sponsor Invoicing

**Invoice Creation**
- Use recipient search → Select sponsor
- Auto-fills company name, address, VAT number
- Line item: Sponsorship package name (e.g., "Gold Sponsorship - PyConf 2026")
- Amount: Match contract price
- Due date: Typically 30 days from contract signing

**VAT Considerations**
- B2B transaction (sponsor is a company)
- VAT number required for EU reverse charge (if virtual/hybrid-online)
- VAT number recommended for all B2B invoices
- Validate VAT number before sending (avoid audit issues)

**Payment Tracking**
- Bank transfer: Most common for large amounts (sponsors prefer wire transfer)
- Credit card: Option for smaller sponsorships (faster payment)
- Mark as paid manually when bank transfer received
- Add internal comment with bank reference/transaction ID

**Follow-Up**
- Send invoice immediately after contract signed
- Reminder at 7 days before due date
- Reminder on due date
- Overdue notice at 7 days after due
- Personal follow-up (call or email) if overdue beyond 14 days
- Coordinate with account manager or executive contact

### Sponsor Benefits Fulfillment

**Tracking Deliverables**
- Create checklist for each sponsor (manual or spreadsheet)
- Items to track:
  - Logo received (for website, program, signage)
  - Booth setup confirmed (space, power, WiFi)
  - Free tickets distributed (send discount codes)
  - Speaking slot scheduled (if included)
  - Social media content provided (posts, images)
  - Recruiting materials (job postings, swag)

**Timeline**
- 3 months before: Request logos and marketing materials
- 2 months before: Confirm booth requirements
- 1 month before: Distribute sponsor ticket codes
- 2 weeks before: Final sponsor logistics email
- During event: Check in with sponsors daily
- After event: Thank you email, feedback survey, next year invitation

**Sponsor Portal** (If Available)
- Sponsor login for self-service
- View contract and invoice
- Download logo files
- Manage free tickets (assign to employees)
- Upload booth materials
- Access attendee list (if permitted by privacy policy)

---

## Team Collaboration

### Role Assignment

**Core Roles**
1. **Tenant Admin**: Full access to all conference settings
2. **Conference Admin**: Admin access to specific conference(s)
3. **Finance Team**: Invoice management, payment tracking
4. **Program Committee**: CFP review, session scheduling
5. **Volunteer Coordinator**: Volunteer task assignment and scheduling
6. **Communication Manager**: Email templates, messaging, screen overlays

**Permission Levels**
- **Super Admin**: Platform-level access (SaaSConf staff only)
- **Tenant Admin**: All conferences in tenant, all modules
- **Conference Admin**: Specific conference(s), all modules
- **Module-Specific**: Access to specific features (CFP, Volunteers, etc.)
- **Read-Only**: View data but cannot edit

**Best Practices**
- Follow principle of least privilege (give minimum access needed)
- Use conference-specific admins (not tenant-wide) when possible
- Separate finance access from program access (segregation of duties)
- Rotate credentials periodically (every 6-12 months)
- Remove access immediately when team member leaves

### Workflow Coordination

**Pre-Event Workflow**
1. **Setup Phase** (6 months out):
   - Lead: Conference Admin
   - Creates conference, configures settings
   - Adds team members with appropriate roles
   - Sets up booking options, CFP, program structure

2. **CFP Phase** (6-3 months out):
   - Lead: Program Committee Chair
   - Opens CFP, announces widely
   - Assigns reviewers to submissions
   - Coordinates review process
   - Makes acceptance decisions

3. **Registration Phase** (6-1 months out):
   - Lead: Registration Coordinator
   - Opens registration, monitors numbers
   - Processes group registrations
   - Handles special requests (accessibility, dietary)

4. **Sponsor Phase** (6-1 months out):
   - Lead: Sponsorship Coordinator
   - Sends sponsor contracts
   - Tracks contract signatures and payments
   - Coordinates sponsor benefits fulfillment

5. **Program Building** (2-1 months out):
   - Lead: Program Committee Chair
   - Assigns sessions to time slots
   - Assigns rooms/locations
   - Publishes program

6. **Communication Phase** (1 month to event):
   - Lead: Communication Manager
   - Sends pre-event emails (schedule, logistics)
   - Creates screen overlays for announcements
   - Prepares on-site signage

**During-Event Workflow**
1. **Check-In Team**: Registration desk, badge printing
2. **Program Team**: Session monitoring, AV support, speaker coordination
3. **Volunteer Team**: Task coordination, break coverage
4. **Communication Team**: Real-time updates, crisis management
5. **Sponsor Team**: Sponsor booth support, networking facilitation

**Post-Event Workflow**
1. **Communication Team**: Thank you emails, survey distribution
2. **Finance Team**: Final invoicing, payment reconciliation
3. **Program Team**: Session recording upload, speaker feedback sharing
4. **Admin Team**: Data export, backup, lessons learned documentation

**Coordination Tools**
- Daily standup meetings (in-person or video)
- Shared Slack/Teams channel for real-time communication
- Shared task management (Trello, Asana, or built-in deadlines module)
- Weekly status reports (email or document)
- Post-mortem meeting after event

### Permission Management

**Granting Access**
1. Add user account (if doesn't exist)
2. Add to tenant (if tenant admin)
3. Add to conference (if conference admin)
4. Assign specific role/permissions
5. Enable module access (CFP, Volunteers, etc. if module-gated)

**Reviewing Access**
- Quarterly access review (who has access to what?)
- Remove inactive users (haven't logged in 6+ months)
- Update permissions as roles change
- Audit log review (check for suspicious activity)

**Offboarding**
- Remove all access immediately when team member leaves
- Document what they had access to (for handoff)
- Transfer ownership of drafts/content to another admin
- Change shared passwords if used (discouraged but common)

### Audit Trail Importance

**What Gets Logged**
- All invoice actions (create, send, cancel, replace, mark paid)
- All registration changes (create, update, replace, cancel)
- All CFP actions (submit, review, accept/reject)
- All program changes (session create, update, publish)
- All setting changes (booking options, VAT rates, templates)
- User logins and permission changes

**Why Audit Trail Matters**
- **Accountability**: Know who did what and when
- **Compliance**: Required for financial audits (invoicing)
- **Troubleshooting**: Diagnose issues ("invoice disappeared" → check who deleted it)
- **Dispute resolution**: "I never received that email" → check sent log
- **Security**: Detect unauthorized access or suspicious activity

**Using Audit Trail**
- Review invoice events for payment tracking
- Check registration events for replacement history
- Monitor CFP review activity (ensure all papers reviewed)
- Track settings changes (who changed VAT rate?)
- Export logs for compliance/reporting

**Best Practices**
- Review audit logs weekly during active periods
- Set up alerts for critical actions (invoice cancellation, mass deletion)
- Export logs monthly for long-term storage
- Train team on audit importance (everything is logged, act accordingly)

---

## Data Quality & Maintenance

### Regular Data Cleanup

**Weekly Tasks** (During Active Registration)
- Review new registrations for data quality issues
- Check for duplicate emails (same person registered twice)
- Validate VAT numbers on B2B invoices
- Follow up on incomplete registrations
- Archive test registrations (delete or mark as test)

**Monthly Tasks**
- Export registration data backup
- Export invoice data backup
- Export CFP submissions backup
- Review alumni records for updates
- Clean up draft invoices (delete or complete)

**Pre-Event Tasks** (1 Week Before)
- Final duplicate check (merge or cancel duplicates)
- Validate all contact information (email, phone)
- Export attendee list for badge printing
- Export dietary restrictions for catering
- Export accessibility needs for venue coordination

**Post-Event Tasks**
- Update alumni records from paid registrations (auto-create alumni)
- Archive conference data (export all data)
- Clean up draft/cancelled content
- Document lessons learned
- Update templates based on feedback

### Duplicate Prevention

**Common Causes of Duplicates**
- Attendee registers twice (forgot they registered)
- Attendee uses different email addresses
- Group registration + individual registration
- Admin creates registration that attendee already created

**Prevention Strategies**
1. **Email-Based Duplicate Detection**
   - System checks for existing email on registration
   - Warns admin if email already exists
   - Attendee portal prevents duplicate self-registration

2. **Name-Based Duplicate Detection**
   - Search for similar names before creating manual registration
   - Check: First Name + Last Name + Company
   - Ask attendee to confirm before creating

3. **Communication**
   - Confirmation email immediately after registration
   - "Already registered? Login here" message on registration page
   - Clear instructions on group vs individual registration

**Duplicate Resolution**
- Identify true duplicates (same person, different records)
- Keep the registration with more complete data
- Cancel/merge the duplicate
- Refund if double-charged
- Update attendee on resolution

### CSV Import/Export Hygiene

**Import Best Practices**
1. **Use Templates**
   - Download CSV template from system
   - Fill in data matching exact column names
   - Don't rename columns or change order

2. **Data Validation Before Import**
   - Check email format (user@domain.com)
   - Check country codes (ISO 2-letter: DE, US, GB)
   - Check dates (YYYY-MM-DD format)
   - Remove duplicate rows

3. **Encoding**
   - Use UTF-8 encoding (supports international characters)
   - System exports with UTF-8 BOM for Excel compatibility
   - Don't use ANSI/Latin-1 (breaks accented characters)

4. **Test First**
   - Import small sample (10 rows) to verify format
   - Check for errors
   - Import full dataset after successful test

5. **Review After Import**
   - Check imported records for accuracy
   - Verify counts (imported 500 rows = 500 records?)
   - Spot-check random records

**Export Best Practices**
1. **Regular Backups**
   - Export all critical data monthly
   - Store backups in secure location (encrypted cloud storage)
   - Keep historical exports (for point-in-time recovery)

2. **Data Filtering**
   - Export only what you need (don't export everything)
   - Filter by status (active registrations only)
   - Filter by date range (current conference only)

3. **Privacy & Security**
   - Don't email exports (contains PII)
   - Use secure file sharing (password-protected)
   - Delete local copies after use
   - Restrict access to authorized personnel only

4. **Excel Compatibility**
   - System exports with UTF-8 BOM (Excel recognizes encoding)
   - CSV format opens directly in Excel
   - Preserve leading zeros (e.g., postal codes) with proper formatting

**Common Import/Export Issues**

| Issue | Cause | Solution |
|-------|-------|----------|
| Accented characters broken | Wrong encoding | Use UTF-8 |
| Dates imported as text | Wrong format | Use YYYY-MM-DD |
| Leading zeros removed | Excel auto-formatting | Format column as text before import |
| Country not recognized | Full name instead of code | Use ISO codes (DE not Germany) |
| Duplicate imports | Importing same file twice | Check for existing data first |
| Missing rows | Rows exceed limit | Import in batches (max 50k rows) |

### Backup Strategies

**What to Backup**
- Registration data (all fields, including billing profiles)
- Invoice data (all invoices, line items, events)
- CFP submissions (proposals, reviews, decisions)
- Program data (sessions, schedule, speakers)
- Alumni records
- Configuration data (settings, booking options, templates)

**Backup Frequency**
- **Daily**: During active registration period
- **Weekly**: During CFP review period
- **Monthly**: During planning phase
- **Immediately After**: Major imports, bulk operations, critical changes

**Backup Storage**
- **Primary**: Encrypted cloud storage (Google Drive, Dropbox, OneDrive)
- **Secondary**: Local encrypted drive (offline backup)
- **Tertiary**: System-level database backups (managed by SaaSConf platform)

**Backup Testing**
- Test restore quarterly (verify backups are valid)
- Practice recovery procedure (document steps)
- Train team on backup location and access

**Retention Policy**
- Keep current conference data: 2 years minimum
- Keep financial data: 7 years (tax/audit requirements)
- Keep historical data: Forever (archival, trend analysis)
- Delete test/temp data: Immediately after use

---

## Common Pitfalls to Avoid

### 1. Not Configuring Pronouns Before Registration Opens
**Problem**: Replace Attendee modal fails because pronouns dropdown is empty.
**Solution**: Add pronouns in Conference Settings > General before opening registration.
**How to Fix**: Add pronouns now, inform attendees they can update profiles.

### 2. Using "Cancel Invoice + Cancel Registrations" for Billing Corrections
**Problem**: Attendees lose conference access when you just needed to fix a billing address.
**Solution**: Use "Replace Invoice" for billing corrections (keeps registrations active).
**How to Fix**: Cannot undo cancellation. Manually reactivate registrations, apologize to attendees.

### 3. Not Validating VAT Numbers Before Sending Invoices
**Problem**: Invalid VAT numbers cause tax audit issues, rejected invoices, payment delays.
**Solution**: Always verify VAT validation status (green checkmark) before sending.
**How to Fix**: Resend invoice with corrected VAT number using Replace Invoice feature.

### 4. Forgetting to Publish the Program
**Problem**: Attendees can't see schedule, leads to confusion and complaints.
**Solution**: Click "Publish Program" 2-4 weeks before event.
**How to Fix**: Publish immediately, send announcement email.

### 5. Over-Emailing Attendees
**Problem**: Email fatigue leads to unsubscribes and missed important messages.
**Solution**: Limit to 1 email per week until final week, segment by audience.
**How to Fix**: Apologize, reduce frequency, consolidate info into digest emails.

### 6. Not Setting Max Uses on Promotional Discount Codes
**Problem**: Discount code shared publicly, hundreds use it, massive revenue loss.
**Solution**: Set max_uses limit on all promotional codes (e.g., 50 uses).
**How to Fix**: Deactivate code immediately, honor existing uses, tighten for future.

### 7. Scheduling Similar Topics in Parallel
**Problem**: Attendees want both "Intro to Python" and "Advanced Python" but can only attend one.
**Solution**: Survey attendee interest, avoid conflicts for popular topic combinations.
**How to Fix**: Move sessions if time allows, or offer recordings for conflicted sessions.

### 8. Not Testing Registration Flow Before Launch
**Problem**: Broken payment links, missing email confirmations, form errors.
**Solution**: Complete test registration end-to-end before public launch.
**How to Fix**: Fix issues immediately, notify affected registrants, offer support.

### 9. Importing CSV with Wrong Encoding
**Problem**: Names with accents become garbled (Müller → M��ller).
**Solution**: Always use UTF-8 encoding for CSV files.
**How to Fix**: Delete bad import, re-import with correct encoding, fix manually if needed.

### 10. Not Following Up on Overdue Sponsor Invoices
**Problem**: Sponsors don't pay, but you've already delivered benefits (logo on site, booth space).
**Solution**: Invoice immediately after contract signed, follow up weekly if unpaid.
**How to Fix**: Personal outreach, escalate to executive contact, withhold future benefits.

### 11. Leaving Draft Invoices Unsent
**Problem**: Attendee thinks they paid but invoice was never actually sent.
**Solution**: Send invoices immediately after registration, don't let drafts pile up.
**How to Fix**: Send invoice now, apologize for delay, extend due date if needed.

### 12. Not Backing Up Data Regularly
**Problem**: Accidental deletion, system issue, or corruption causes data loss.
**Solution**: Export data backups weekly during active periods.
**How to Fix**: If recent backup exists, restore. Otherwise, manual data re-entry required.

### 13. Granting Too Many People Tenant Admin Access
**Problem**: Too many people can change critical settings, hard to track who did what.
**Solution**: Use conference-level admins, grant tenant admin sparingly.
**How to Fix**: Audit current access, remove unnecessary tenant admin permissions.

### 14. Not Setting Clear CFP Deadlines
**Problem**: Late submissions, extended deadlines, rushed reviews.
**Solution**: Set hard deadline in system, communicate clearly, don't extend.
**How to Fix**: Close CFP on deadline, review late submissions only if exceptional circumstances.

### 15. Forgetting to Create Credit Note When Cancelling Invoice
**Problem**: Manual cancellation without proper accounting trail.
**Solution**: Use "Cancel Invoice" feature (auto-creates credit note).
**How to Fix**: Manually create credit note for proper accounting, document in invoice events.

---

## Conference Type-Specific Guidance

### Academic Conferences

**Unique Characteristics**
- Peer-review emphasis (double-blind often required)
- Proceedings publication (ISBN, DOI assignment)
- Poster sessions and demos (different submission types)
- PhD symposium or student research track
- Grant-funded travel (reimbursement needed)

**CFP Adaptations**
- **Submission Types**: Full papers (8-10 pages), short papers (4 pages), posters, demos
- **Review Process**: Double-blind review (hide author names)
- **Review Criteria**: Academic rigor, methodology, novelty, reproducibility
- **Acceptance Rates**: Lower (20-30% for competitive conferences)
- **Proceedings**: Coordinate with publisher (ACM, IEEE, Springer)

**Registration Adaptations**
- **Student Rates**: Heavily discounted (50-70% off)
- **Proof of Enrollment**: Require student ID upload or .edu email
- **Travel Grants**: Track separately (not in SaaSConf, use external system)
- **Institutional Invoicing**: Many universities require PO numbers

**Program Considerations**
- **Session Types**: Paper presentations, posters, panels, tutorials, workshops
- **Parallel Tracks**: Research areas (AI, HCI, Systems, Theory)
- **Poster Sessions**: Dedicated time slots with no parallel sessions
- **Social Events**: Conference banquet, student dinner, informal gatherings

**Best Practices**
- Start CFP 9-12 months before event (academic timelines longer)
- Allow 2-3 months for review (thorough peer review takes time)
- Coordinate with academic calendar (avoid exam periods)
- Publish proceedings before or during conference
- Provide camera-ready templates early

### Tech/Industry Conferences

**Unique Characteristics**
- Sponsor-driven revenue model
- Product demos and vendor booths
- Networking focus (hallway track)
- Workshops and hands-on tutorials
- Fast-paced, trend-focused content

**CFP Adaptations**
- **Submission Types**: Talks, panels, lightning talks, workshops
- **Review Process**: Single-blind, committee-based
- **Review Criteria**: Practical value, relevance, speaker experience
- **Acceptance Rates**: Higher (40-60%)
- **Diversity**: Actively recruit underrepresented speakers

**Registration Adaptations**
- **Corporate Pricing**: Higher rates (companies pay)
- **Group Discounts**: Common (teams from same company)
- **Add-Ons**: Workshops, training, certification exams
- **Package Deals**: Conference + hotel + training

**Sponsor Integration**
- **Sponsor Talks**: Some slots reserved for sponsors
- **Booth Space**: Large expo hall
- **Recruiting**: Job board, resume drop, company meetups
- **Product Demos**: Demo area separate from talks

**Program Considerations**
- **Tracks**: Technology areas (Frontend, Backend, DevOps, AI/ML)
- **Levels**: Beginner, Intermediate, Advanced (clearly labeled)
- **Lightning Talks**: 5-10 min rapid-fire sessions
- **Keynotes**: Industry leaders, provocative topics
- **Social Events**: Happy hours, game nights, unconference sessions

**Best Practices**
- Prioritize networking time (long breaks, evening events)
- Offer workshop/tutorial day (hands-on learning)
- Record sessions and publish online (extend reach)
- Create mobile app for schedule/networking
- Emphasize diversity in speaker lineup

### Virtual Events

**Unique Characteristics**
- No physical venue (streaming platform required)
- Global audience (timezone challenges)
- Lower costs (no venue, catering, AV)
- Higher no-show rates (easier to skip)
- Recording/replay expected

**Platform Requirements**
- **Streaming**: Zoom, Hopin, Airmeet, or custom
- **Interaction**: Q&A, polls, chat, breakout rooms
- **Networking**: Virtual lounges, 1-on-1 matching
- **Sponsor Booths**: Virtual booths with chat/video

**CFP Adaptations**
- **Global Speakers**: Easier to recruit (no travel required)
- **Pre-Recorded Options**: Allow pre-recording for timezone flexibility
- **Session Length**: Shorter (30-45 min max, attention span lower)

**Registration Adaptations**
- **Lower Pricing**: No venue costs, should reflect in price
- **Global Timezones**: Offer replay access for all sessions
- **Free Tier**: Consider free access to keynotes (marketing)

**VAT Compliance**
- **Virtual services = OSS rules apply**
- **B2B EU customers must provide VAT number** (reverse charge)
- **B2C EU customers pay customer country rate** (OSS)
- Critical: System auto-applies reverse charge, verify before sending invoices

**Program Considerations**
- **Timezone-Friendly Schedule**: Repeat sessions or offer replays
- **Shorter Sessions**: 30-45 min talks (not 60 min)
- **More Breaks**: Every 90 min (screen fatigue)
- **Interaction**: Polls, Q&A, chat moderation

**Best Practices**
- Test platform thoroughly (tech rehearsal with speakers)
- Provide speaker training (mute/unmute, screen sharing)
- Record everything (replay value)
- Moderate chat actively (keep discussions on-topic)
- Send calendar invites (reduce no-shows)
- Email replays within 24 hours (while interest high)

### Hybrid Events

**Unique Characteristics**
- Both in-person and virtual attendance options
- Complex AV setup (stream to virtual attendees)
- Two-tier pricing (virtual cheaper than in-person)
- Networking challenges (connecting virtual and in-person)

**Attendance Type Configuration**
- Set conference attendance type to `hybrid_onsite` or `hybrid_online`
- **Hybrid-Onsite**: Primarily in-person with virtual option
- **Hybrid-Online**: Primarily virtual with small in-person component

**CFP Adaptations**
- **Speaker Attendance**: Allow speakers to present remotely
- **Mark Speaker Location**: In-person or virtual (affects AV setup)
- **Interaction Design**: How virtual attendees ask questions?

**Registration Adaptations**
- **Separate Tickets**: In-Person Pass, Virtual Pass
- **Pricing Difference**: Virtual typically 30-50% of in-person price
- **Upgrades**: Allow virtual attendees to upgrade to in-person

**VAT Complexity**
- **In-Person Tickets**: Conference country VAT (local service)
- **Virtual Tickets**: OSS rules apply (customer country VAT or reverse charge)
- **System handles automatically based on attendance type field**

**Program Considerations**
- **Hybrid Sessions**: Streamed live to virtual attendees
- **In-Person Only**: Networking events, meals, parties
- **Virtual Only**: Timezone-friendly sessions, async content
- **AV Setup**: Cameras, mics, streaming equipment for every room

**Best Practices**
- Clearly label which sessions are hybrid vs in-person only
- Provide virtual networking opportunities (don't ignore virtual attendees)
- Test AV in every room before event
- Assign moderator to relay virtual questions to in-person speakers
- Record all hybrid sessions (equity between in-person and virtual)
- Create virtual lounge for virtual attendee networking

### Multi-Track Conferences

**Unique Characteristics**
- Parallel sessions (2-5 tracks simultaneously)
- Attendee choice (can't attend everything)
- Scheduling complexity (avoid conflicts)
- Larger venue (multiple rooms needed)

**Track Design**
- **Theme-Based**: AI/ML, Web Dev, DevOps, Data Science
- **Level-Based**: Beginner, Intermediate, Advanced
- **Format-Based**: Talks, Workshops, Panels
- **Audience-Based**: Technical, Business, Design

**Scheduling Strategy**
1. **Create Time Grid**: Slots across tracks
2. **Place Keynotes**: All-hands sessions (no parallel sessions)
3. **Balance Topics**: Don't cluster all popular topics in one track
4. **Balance Levels**: Mix beginner/advanced across tracks
5. **Avoid Speaker Conflicts**: Same speaker in parallel sessions

**Attendee Guidance**
- **Track Recommendations**: Suggest tracks by role or interest
- **Session Selection**: Allow pre-registration for workshops (capacity limits)
- **Personalized Schedule**: Let attendees build custom schedule
- **Mobile App**: Essential for multi-track navigation

**Separately Bookable Sessions**
- Mark sessions as `separately_bookable: true` (workshops, tutorials)
- Attendees choose during registration
- Prevents overcrowding
- System tracks capacity

**Best Practices**
- Use color-coding for tracks (visual clarity)
- Provide printed schedule grid (attendees annotate)
- Allow session switching (don't over-enforce pre-registration)
- Record sessions in all tracks (attendees can catch up)
- Survey attendees pre-event (interest in topics)
- Balance room sizes (popular tracks in larger rooms)

---

## Quick Reference Checklists

### New Conference Setup Checklist
- [ ] Conference name, dates, location
- [ ] Conference country (for VAT)
- [ ] Currency
- [ ] Attendance type (in-person, virtual, hybrid)
- [ ] Logo upload
- [ ] Timezone
- [ ] Pronouns options
- [ ] Email templates (registration, invoice, CFP)
- [ ] Booking periods (Early Bird, Regular, Late)
- [ ] Booking options (tickets)
- [ ] VAT rate overrides (if needed)
- [ ] Invoice template and numbering

### Pre-Event Week Checklist
- [ ] Program published
- [ ] All invoices sent or marked paid
- [ ] Pre-event email sent (logistics, WiFi, check-in)
- [ ] Volunteer schedules distributed
- [ ] Badge printing data exported
- [ ] Dietary restrictions exported
- [ ] Accessibility needs confirmed
- [ ] AV tested in all rooms
- [ ] Signage prepared
- [ ] Team briefing held

### Post-Event Checklist
- [ ] Thank you email sent
- [ ] Feedback survey sent
- [ ] Session recordings uploaded
- [ ] Speaker feedback shared
- [ ] Alumni records updated
- [ ] Final invoices sent
- [ ] Data exported and backed up
- [ ] Post-mortem meeting held
- [ ] Lessons learned documented
- [ ] Save-the-date for next year

---

## Conclusion

This best practices guide synthesizes operational wisdom from all SaaSConf modules. Use it as your playbook for successful conference management.

**Key Principles**:
1. **Plan early**: 6-month timeline prevents last-minute chaos
2. **Automate workflows**: Use system features (templates, auto-emails, validation)
3. **Validate data**: Bad data causes downstream problems
4. **Communicate clearly**: Frequent, concise, targeted emails
5. **Back up everything**: Data loss is preventable
6. **Learn continuously**: Post-mortems improve future events

**Next Steps**:
- Bookmark this guide for reference
- Share with your team
- Customize for your conference type
- Document your own lessons learned
- Contribute improvements back

**Need Help?**
- Technical Support: support@saasconf.com
- VAT/Legal Questions: Consult your tax advisor
- Feature Requests: Submit via feedback form

---

*Last Updated: 2026-03-08*
*Version: 1.0*
