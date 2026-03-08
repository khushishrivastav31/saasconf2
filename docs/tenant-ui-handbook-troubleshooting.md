# Troubleshooting & Resources

## General Troubleshooting Approach

When encountering issues in SaaSConf, follow this systematic approach to identify and resolve problems:

### 1. Identify the Problem Area

First, determine which module or feature is affected:

- **Invoice/Billing**: VAT calculation, PDF generation, payment processing
- **Registration**: Attendee management, booking options, replacements
- **Email**: Delivery failures, template rendering
- **Portal Access**: Login issues, permissions
- **Integration**: Stripe, VIES, external services

### 2. Check Browser Console for Errors

Open your browser's developer tools (F12 or right-click → Inspect):

**Chrome/Edge/Safari**:
1. Press F12 to open Developer Tools
2. Click the **Console** tab
3. Look for red error messages
4. Screenshot or copy error text for support

**Common Console Errors**:
- `401 Unauthorized` → Session expired, log out and log back in
- `403 Forbidden` → Insufficient permissions, verify your role
- `500 Internal Server Error` → Backend issue, contact support
- `Network Error` → Connectivity problem, check internet connection

### 3. Verify Permissions

Check your user role and module access:

1. Navigate to **Settings > Team**
2. Find your user account
3. Verify your role:
   - **Tenant Admin**: Full access to all features
   - **Conference Admin**: Access to assigned conferences
   - **Viewer**: Read-only access
4. Check enabled modules in **Settings > Modules**
5. If missing access, contact your tenant administrator

### 4. Network Connectivity Issues

**Symptoms**:
- Pages loading slowly or timing out
- "Connection failed" messages
- Data not saving

**Resolution**:
1. Check internet connection
2. Try refreshing the page (Ctrl+R or Cmd+R)
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try in incognito/private browsing mode
5. Check if firewall is blocking saasconf.com domain

### 5. Cache and Session Issues

**Symptoms**:
- Seeing outdated data
- Changes not appearing
- Interface looks broken or missing styles

**Clear Cache (Chrome)**:
1. Press Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
2. Select "Cached images and files"
3. Choose "All time"
4. Click "Clear data"
5. Refresh the page (Ctrl+R)

**Clear Session**:
1. Log out completely
2. Clear browser cache
3. Close all browser tabs
4. Log back in

**Hard Refresh** (force reload):
- Windows: Ctrl+Shift+R
- Mac: Cmd+Shift+R

---

## Module-Specific Troubleshooting Quick Reference

Use this table to quickly find solutions based on symptoms:

| Symptom | Check This Section |
|---------|-------------------|
| Invoice VAT calculation incorrect | [VAT Calculation Issues](#vat-calculation-issues) |
| Invoice PDF not generating | [PDF Generation Issues](#pdf-generation-issues) |
| Stripe payment not working | [Payment Processing Issues](#payment-processing-issues) |
| Email not delivered | [Email Delivery Issues](#email-delivery-issues) |
| VAT number validation failing | [VAT Number Validation](#vat-number-validation-issues) |
| Registration replacement not working | [Registration Replacement](#registration-replacement-issues) |
| Attendee data missing | [Data Not Appearing](#data-not-appearing-in-ui) |
| Can't edit sent invoice | [Invoice Editing Restrictions](#cant-edit-sent-invoice) |
| Credit card payment link expired | [Payment Link Issues](#payment-link-issues) |
| Portal user can't log in | [Portal Login Issues](#portal-login-failures) |
| Slow page loads | [Performance Issues](#slow-page-loads) |
| ZUGFeRD validation failing | [ZUGFeRD Issues](#zugferd-e-invoicing-issues) |
| Discount code not applying | [Discount Code Issues](#discount-code-issues) |
| File upload failing | [File Upload Issues](#file-upload-issues) |

---

## Data Issues

### Missing Data / Empty Fields

**Symptoms**:
- Fields showing blank when they should have data
- Dropdowns empty
- Lists showing no results

**Common Causes & Solutions**:

**1. Filters Applied**:
- Check if status filters are active (e.g., showing only "Draft" invoices)
- Clear search boxes
- Reset date range filters
- Look for "Active Filters" indicator in UI

**2. Wrong Conference Selected**:
- Verify correct conference in top navigation
- Data is isolated per conference
- Switch to the correct conference context

**3. Module Not Enabled**:
- Go to **Settings > Modules**
- Check if required module is enabled
- Contact admin to enable if needed

**4. Data Not Yet Created**:
- Check if records actually exist in other views
- Verify creation process completed successfully
- Check audit logs for creation events

**5. Permission Issues**:
- Verify your role has read access to this data
- Conference admins only see assigned conferences
- Contact tenant admin to adjust permissions

### Duplicate Records

**Symptoms**:
- Same invoice/registration appearing multiple times
- Duplicate discount codes
- Multiple similar entries

**Prevention**:
- System enforces uniqueness constraints on key fields
- Invoice numbers are auto-generated and unique
- Email addresses unique per conference for alumni/registrations

**Resolution**:
1. Identify the correct/primary record
2. Delete duplicates (if you have permission)
3. If unable to delete, contact support
4. Check audit logs to see how duplicates were created

### Data Not Saving

**Symptoms**:
- Click "Save" but changes revert
- No success message appears
- Form stays in edit mode

**Troubleshooting Steps**:

**1. Check for Validation Errors**:
- Look for red-bordered fields
- Read error messages below fields
- All required fields (marked with *) must be filled
- Email/phone fields must be valid format

**2. Check Browser Console**:
- Open Developer Tools (F12)
- Look for red error messages
- Common errors:
  - "Required field missing"
  - "Invalid format"
  - "Permission denied"

**3. Check Network Tab**:
- Open Developer Tools (F12) → Network tab
- Click Save again
- Look for failed requests (red)
- Click on failed request to see error details

**4. Session Timeout**:
- If session expired, log out and back in
- Re-enter your changes
- Consider working faster or refresh session periodically

**5. Field-Specific Issues**:
- **Country fields**: Must select from dropdown (not free text)
- **VAT numbers**: Must match country format
- **Dates**: Must be valid and in range
- **Amounts**: Must be positive numbers

### Data Not Appearing in UI

**Symptoms**:
- Created data doesn't show in lists
- Search returns no results
- Recent changes missing

**Immediate Actions**:

**1. Refresh the Page**:
- Press F5 or Ctrl+R (Cmd+R on Mac)
- Or click browser refresh button
- Check if data appears after refresh

**2. Check Cache**:
- Data may be cached temporarily
- Wait 30 seconds and refresh
- For persistent issues, clear browser cache
- Try in incognito/private mode

**3. Verify Creation**:
- Navigate back to creation form
- Check if record actually saved
- Look for success message after creation
- Check audit logs in Settings

**4. Database Sync**:
- In rare cases, data may take a few seconds to propagate
- Refresh after 5-10 seconds
- If still missing after 1 minute, contact support

**5. Filter/Search Issues**:
- Clear all active filters
- Try searching by different field (name vs email)
- Check date range filters aren't excluding your data
- Reset view to default settings

### Import/Export Problems

**CSV Import Issues**:

**Error: "Invalid CSV format"**:
- Ensure file is UTF-8 encoded
- Use comma (,) as delimiter
- Include header row with exact column names
- Save as .csv (not .xlsx or other formats)

**Error: "Missing required column"**:
- Check CSV has all required headers
- Column names are case-sensitive
- Remove extra spaces from column names
- Example required columns: email, first_name, last_name

**Error: "Row X: Invalid email format"**:
- Check email addresses in CSV are valid
- Format: user@domain.com
- No spaces, special characters
- One email per cell

**Error: "Maximum rows exceeded"**:
- Import limit is 50,000 rows per file
- Split large files into multiple smaller files
- Import in batches

**Error: "Duplicate email in row X"**:
- CSV contains duplicate email addresses
- Remove duplicates before importing
- Or use "Skip duplicates" option if available

**CSV Export Issues**:

**Excel shows garbled characters**:
- File is UTF-8 encoded with BOM for Excel compatibility
- If issues persist: Open in Excel > Data > From Text/CSV
- Select "UTF-8" encoding
- Click Load

**Missing columns in export**:
- Check your user role has permission to see those columns
- Some fields hidden based on module access
- Contact admin for full data access

**Export times out**:
- Large datasets (50k+ rows) may take time
- Wait up to 60 seconds
- If timeout persists, contact support to run manual export
- Consider filtering data before export

---

## Payment & Billing Issues

### VAT Calculation Issues

**Symptom**: VAT rate is incorrect or unexpected

**Troubleshooting Steps**:

**1. Verify Conference Country**:
- Go to **Settings > General**
- Check "Conference Country" setting
- This determines the "home country" for VAT
- Must be ISO code (e.g., DE, FR, US)

**2. Verify Customer Country**:
- Open the invoice
- Check "Recipient Country" field
- Must be ISO code (e.g., DE, FR, US)
- Not full name (Germany → DE)

**3. Check Attendance Type**:
- VAT rules differ for in-person vs virtual events
- Go to **Settings > General**
- Check "Attendance Type" setting:
  - `in_person`: Physical event location
  - `virtual`: Online-only event
  - `hybrid_onsite`: Hybrid with in-person default
  - `hybrid_online`: Hybrid with virtual default

**4. Review VAT Decision Table**:
- 24 rules determine VAT treatment
- Go to **Settings > Finance > VAT Settings**
- Find your scenario in the decision table
- Example: Virtual + EU B2B → Reverse charge (0% VAT)

**5. Check Customer Type**:
- **B2B** (has VAT number): Different rules apply
- **B2C** (no VAT number): Consumer rates apply
- Verify VAT number presence triggers correct logic

**6. Verify VAT Rate Overrides**:
- Go to **Settings > Finance > VAT Settings**
- Check "Country VAT Rates" section
- Tenant-specific overrides take precedence
- Ensure override rate is correct if present

**7. Check for Edge Cases**:
- **Reverse charge**: EU B2B virtual services → 0% VAT, buyer pays
- **OSS (One-Stop Shop)**: EU B2C virtual services → customer country rate
- **Non-EU customers**: Usually 0% VAT
- **Same country**: Conference country VAT rate applies

**When to Contact Support**:
- If all settings appear correct but VAT still wrong
- Provide: Conference country, customer country, attendance type, has VAT number
- Include invoice ID for investigation

### VAT Number Validation Issues

**Yellow "Unverified" Warning**:

**Meaning**:
- VAT format is correct
- VIES registry temporarily unavailable
- Safe to proceed

**Actions**:
1. This is normal when VIES API is down (EU system)
2. Invoice can still be sent
3. Recommend customer double-check their VAT number
4. Document in invoice notes that VIES was unavailable
5. Re-validate later when VIES is back up

**Red "Invalid" Error**:

**Meaning**:
- VAT number format or checksum failed
- Number may be incorrect

**Troubleshooting**:
1. Ask customer to verify their VAT number
2. Check country code matches:
   - DE for Germany
   - FR for France
   - NL for Netherlands
   - etc.
3. Remove spaces and special characters
4. Try entering again carefully
5. Verify on EU VIES website: https://ec.europa.eu/taxation_customs/vies/

**Common VAT Format Issues**:
- **Missing country code**: VAT must start with 2-letter country code
- **Wrong country code**: Must match recipient country
- **Extra spaces**: Remove all spaces
- **Wrong length**: Each country has specific length requirements
- **Invalid checksum**: Number doesn't pass mathematical validation

**Admin Override**:
- Tenant admins and super admins can override validation
- Use only when certain the number is correct
- Document reason in invoice notes
- Customer responsible for providing correct VAT number

**Validation Not Triggering**:
- Validation happens on blur (click outside field)
- Wait 1-2 seconds for API call
- Check browser console for errors
- Ensure country field is filled first

### Invoice Number Generation Issues

**Duplicate Invoice Numbers**:

**Cause**: Extremely rare due to database-level counters

**If It Happens**:
1. Contact support immediately
2. Do not send duplicate invoice
3. Support will manually assign unique number
4. Root cause will be investigated

**Invoice Number Not Assigned**:

**Symptom**: Invoice sent but shows blank invoice number

**Troubleshooting**:
1. Refresh the page
2. Check invoice status (should be "Sent")
3. Open invoice details
4. If still blank after refresh, contact support
5. Do not send invoice again (creates duplicate)

**Wrong Number Format**:

**Cause**: Settings misconfigured

**Resolution**:
1. Go to **Settings > Finance > Invoice Settings**
2. Check "Invoice Number Template"
3. Available placeholders:
   - `{YYYY}` - Year (4 digits)
   - `{YY}` - Year (2 digits)
   - `{MM}` - Month (2 digits)
   - `{COUNTER}` - Sequential number
   - `{COUNTER:5}` - 5-digit padded counter
4. Example: `INV-{YYYY}-{COUNTER:5}` → `INV-2024-00042`
5. Changes apply to new invoices only (existing unchanged)

### Payment Processing Issues

**Stripe Payment Failed**:

**Common Reasons**:

**1. Card Declined**:
- Customer's bank declined transaction
- Customer should contact their bank
- Or try different card
- Payment link remains active for retry

**2. Insufficient Funds**:
- Customer's card has insufficient balance
- Customer should add funds or use different card

**3. Payment Link Expired**:
- Stripe payment links typically don't expire
- But can be manually deactivated
- Check invoice events for "payment_link_deactivated"
- If deactivated, create new invoice or convert to credit card again

**4. Customer Closed Payment Window**:
- Customer may have closed checkout before completing
- Payment link still active
- Customer can click link again
- Or resend invoice with payment link

**Viewing Payment Error Details**:
1. Open invoice
2. Go to **Events** tab
3. Look for "Payment Failed" event
4. Read error_message field for details
5. Common messages:
   - "card_declined" → Contact bank
   - "insufficient_funds" → Add funds
   - "expired_card" → Use valid card
   - "incorrect_cvc" → Check security code

**Resolution Steps**:
1. View error details in invoice events
2. Contact customer with specific error
3. Customer resolves issue
4. Customer retries payment using same link
5. Or create new invoice if needed

### Payment Status Not Updating

**Symptom**: Customer paid but invoice still shows "Sent" or "Overdue"

**Automatic Update (Webhook)**:

**Troubleshooting**:
1. Wait 5 minutes for webhook to process
2. Refresh the invoice page
3. Check invoice events for "Payment Succeeded"
4. If still not updated, proceed to manual sync

**Manual Sync**:

**Single Invoice**:
1. Open the invoice
2. Click **Actions** dropdown
3. Click **Sync Stripe Payment**
4. System queries Stripe API
5. Updates status if payment found

**Bulk Sync**:
1. Go to **Invoices** tab
2. Click **Sync Stripe Payments** button (top right)
3. System checks all pending credit card invoices
4. Updates any that were paid
5. Shows summary: "3 invoices updated to paid"

**If Still Not Updated**:
1. Verify payment in Stripe Dashboard
2. Find payment intent ID in Stripe
3. Check invoice events for that payment intent ID
4. If mismatch, contact support with:
   - Invoice ID
   - Stripe payment intent ID
   - Customer email

**Webhook Configuration Issues**:

**How to Verify Webhook**:
1. Go to **Settings > Integrations > Stripe**
2. Check "Webhook Status" indicator
3. Should show green "Connected"
4. If red, webhook needs reconfiguration

**Reconfigure Webhook** (Admin):
1. Log into Stripe Dashboard
2. Go to Developers > Webhooks
3. Add endpoint: `https://yourdomain.com/api/v1/stripe/webhook`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.succeeded`
5. Copy webhook secret
6. Paste in SaaSConf Settings > Stripe > Webhook Secret
7. Save settings

### Invoice PDF Not Generating

**Symptoms**:
- Download PDF button shows error
- Email sent without attachment
- Preview shows blank

**Troubleshooting Steps**:

**1. Check Template Configuration**:
- Go to **Settings > Finance > Invoice Templates**
- Verify template is not blank
- Must contain body HTML
- Header and footer optional

**2. Check Required Placeholders**:
- Template must include:
  - `[ITEMS_TABLE]` - Line items
  - `[TOTAL]` - Total amount
  - `[INVOICE_NUMBER]` - Invoice number
- Missing placeholders may cause errors

**3. Check for HTML Errors**:
- Templates use TipTap WYSIWYG editor
- Avoid manual HTML editing
- Malformed HTML can break PDF generation
- Test with default template first

**4. Check Company Logo**:
- If template includes `[COMPANY_LOGO]`
- Verify logo uploaded in **Settings > Finance > Company Info**
- Supported formats: JPEG, PNG, WebP
- Max size: 5MB
- If logo missing/corrupt, PDF may fail

**5. Check Browser Console**:
- Open Developer Tools (F12)
- Check console for errors
- Common errors:
  - "Template rendering failed"
  - "WeasyPrint error"
  - "Missing attachment"

**6. Test with Minimal Invoice**:
- Create new draft invoice
- Minimal data (recipient name, one line item)
- Try generating PDF
- If works, issue is with specific invoice data
- If fails, issue is with template or configuration

**7. Check Backend Logs** (Admin):
- Access server logs
- Look for WeasyPrint errors
- Common issues:
  - Missing fonts
  - Invalid CSS
  - Image encoding errors

**When to Contact Support**:
- Attach error message from console
- Mention if issue affects all invoices or specific one
- Indicate recent changes to templates or settings

### Refund Issues

**Refund Request Failed**:

**Stripe Refund Errors**:

**"Payment not found"**:
- Invoice may not have `stripe_payment_intent_id`
- Check invoice events for payment success
- Verify payment was via Stripe (not bank transfer)
- Only credit card invoices can be auto-refunded

**"Refund already issued"**:
- Payment was already refunded
- Check invoice events for "Refund Succeeded"
- Check Stripe Dashboard for refund history
- Cannot refund twice

**"Insufficient funds in Stripe account"**:
- Stripe account balance too low for refund
- Add funds to Stripe account
- Or wait for balance to increase
- Refund will process once funds available

**Bank Transfer Refunds**:
- System cannot auto-refund bank transfers
- Must process manually outside SaaSConf
- Steps:
  1. Note customer bank details
  2. Process refund via your bank
  3. Mark invoice as cancelled in SaaSConf
  4. Add comment with refund date and reference

**Partial Refund Not Available**:
- System currently supports full refunds only
- For partial refunds:
  1. Process in Stripe Dashboard manually
  2. Add note to invoice documenting partial refund
  3. Keep invoice status as "Paid" with note

**Refund Processing Time**:
- Stripe processes refunds immediately
- Customer's bank may take 5-10 business days
- Customer should check bank statement
- Not controlled by SaaSConf

### Payment Link Issues

**Payment Link Expired**:
- Stripe payment links generally don't expire automatically
- May be deactivated if invoice cancelled
- Create new invoice or use "Convert to Credit Card" feature

**Payment Link Not Working**:

**Symptoms**:
- Link leads to error page
- Customer sees "Payment link invalid"

**Troubleshooting**:
1. Check if invoice was cancelled
2. Check invoice events for "payment_link_deactivated"
3. If cancelled, invoice cannot be paid
4. If still active, verify Stripe configuration:
   - Go to **Settings > Integrations > Stripe**
   - Check "Enabled" toggle is on
   - Verify API keys are correct
5. Test with new invoice to isolate issue

**Payment Link Missing**:

**Symptom**: Invoice sent but no payment link in email

**Troubleshooting**:
1. Verify invoice template_type is "credit_card"
2. Bank transfer invoices don't get payment links
3. Check invoice details for `stripe_payment_link_url` field
4. If blank, payment link wasn't created
5. Use "Convert to Credit Card" to generate link
6. Or create new credit card invoice

**Wrong Amount in Payment Link**:
- Payment link created at time of sending
- If invoice amount changed after sending, link has old amount
- Solution: Cancel invoice and create new one with correct amount
- Or use "Replace Invoice" feature for billing corrections only

---

## Email & Communication Issues

### Email Not Sending

**Symptoms**:
- Customer reports not receiving invoice/notification
- No confirmation message after sending
- Email shows in "Events" but customer didn't receive

**Step-by-Step Troubleshooting**:

**1. Verify Email Address**:
- Check invoice/registration for recipient email
- Look for typos (gmail.co vs gmail.com)
- Ensure no extra spaces
- Test by sending yourself an invoice first

**2. Check Spam/Junk Folder**:
- Ask customer to check spam folder
- Look for sender: noreply@yourdomain.com
- Mark as "Not Spam" to whitelist
- Add sender to contacts

**3. Verify Email Sending Enabled**:
- Go to **Settings > General**
- Check "Email Sending Enabled" toggle
- If off, emails are logged but not sent
- Enable for production use

**4. Check Email Configuration** (Admin):
- Verify SMTP/Resend API configured
- Test email configuration:
  - Send test invoice to yourself
  - Check backend logs for send confirmation
- If using Resend: Check API key is valid
- If using SMTP: Verify server credentials

**5. Check Recipient Email Provider**:
- Some email providers block bulk senders
- Corporate email may have strict filters
- Ask IT department to whitelist sender domain
- Test with personal email (Gmail, Yahoo)

**6. Review Email Template**:
- Go to **Settings > Communication > Email Templates**
- Verify template for invoice/registration is configured
- Must have subject and body
- Placeholders must be valid

**7. Check Email Events**:
- Open invoice/registration
- Go to Events tab
- Look for email send event
- Check status:
  - "sent" → Successfully sent
  - "failed" → Check error_message
  - Missing → Email send wasn't triggered

**Common Error Messages**:
- "Invalid recipient email" → Fix email address format
- "SMTP authentication failed" → Check SMTP credentials
- "Rate limit exceeded" → Wait and retry
- "API key invalid" → Reconfigure email service

**8. Verify Tenant Email Domain** (Multi-tenant):
- If using custom email domain
- Check **Settings > Tenant > Email Domain**
- Domain must have SPF/DKIM records
- Verify DNS configuration
- Test with default sender first

**9. Email Deliverability**:
- Check sender reputation (not marked as spam)
- Ensure SPF, DKIM, DMARC configured
- Use reputable email service (Resend, SendGrid)
- Avoid sending from personal Gmail/Yahoo in production

**When to Contact Support**:
- Provide invoice/registration ID
- Include recipient email (redacted if sensitive)
- Attach error message from events
- Mention steps already tried

### Email Templates Not Rendering

**Symptoms**:
- Email shows placeholders instead of actual data
- Missing sections (logo, company info)
- Formatting broken

**Placeholder Issues**:

**Placeholders Not Replaced**:
- Check template uses exact placeholder format: `[INVOICE_NUMBER]`
- Case-sensitive: `[invoice_number]` won't work
- No extra spaces: `[ INVOICE_NUMBER ]` won't work
- Valid placeholders listed in template editor help text

**Missing Data**:
- If placeholder shows blank (not `[PLACEHOLDER]` text)
- Data field is empty in invoice/registration
- Fill in missing data:
  - Company name in Settings > Company Info
  - Customer details in invoice
  - Registration fields

**Company Logo Not Showing**:
- Upload logo in **Settings > Finance > Company Info**
- Supported formats: JPEG, PNG, WebP
- Max size: 5MB
- Use `[COMPANY_LOGO]` placeholder in template
- Logo embeds as base64 in email

**Formatting Broken**:
- Email clients have limited HTML/CSS support
- Avoid complex layouts
- Use tables for structure
- Test in multiple email clients:
  - Gmail (web and app)
  - Outlook
  - Apple Mail
  - Mobile clients

**Testing Templates**:
1. Go to **Settings > Communication > Email Templates**
2. Edit template
3. Click **Send Test Email**
4. Enter your email
5. Verify rendering
6. Check in spam folder too
7. Test in different email clients

**Best Practices**:
- Keep templates simple
- Use inline CSS (external stylesheets don't work)
- Avoid background images
- Use web-safe fonts
- Test before going live

### Email Attachments Missing

**Invoice PDF Not Attached**:

**Troubleshooting**:
1. Verify PDF generation works (download from UI)
2. Check email size limits (some servers limit to 10MB)
3. Large PDFs may be stripped by email server
4. Check email events for "attachment_failed" error
5. Try minimal invoice to test

**Resolution**:
- Reduce PDF size:
  - Remove high-resolution logo
  - Simplify template (less images)
  - Use compressed logo image
- Or send payment link instead (customer downloads from Stripe)

**Contract Documents Not Attached**:
- Similar to invoice PDF issues
- Check document size
- Test with smaller document
- Verify document generation successful

### Email Deliverability Tools

**Test Email Deliverability**:

**Mail-Tester** (https://www.mail-tester.com/):
1. Send test email to address provided
2. Get deliverability score out of 10
3. See specific issues (SPF, DKIM, spam triggers)
4. Fix issues listed
5. Retest until score is 8+

**MXToolbox** (https://mxtoolbox.com/):
- Check domain reputation
- Verify SPF records
- Check if blacklisted
- Test DKIM signature

**Google Postmaster Tools**:
- Monitor Gmail delivery
- Check spam rate
- View domain reputation
- Requires domain verification

**Litmus** (https://www.litmus.com/):
- Test email rendering across clients
- Paid service
- Shows how email looks in Gmail, Outlook, etc.

---

## Portal Access Issues

### Portal Login Failures

**"Invalid email or password"**:

**Troubleshooting**:
1. Verify email is correct (no typos)
2. Check CAPS LOCK is off
3. Try password reset if forgotten
4. Ensure using correct portal (not admin login)
5. Check email for activation link (new accounts)

**Account Created via Registration**:
- Portal accounts auto-created on registration
- Initial password set by user during registration
- If forgot password, use "Forgot Password" link
- Link sends reset email

**Account Created by Admin**:
- Check email for invite/welcome message
- Use "Set up my password" link in email
- Link valid for 7 days
- Request new invite if expired

**"Account not found"**:
- Email not registered in system
- Check spelling of email
- Register for conference first
- Contact conference organizer

**"Account disabled"**:
- Admin may have disabled account
- Contact conference organizer
- May be due to policy violation

### Permission Denied Errors

**"You don't have permission to access this"**:

**Common Causes**:

**1. Wrong User Type**:
- Admin portal (/admin) vs Public portal (/)
- Use correct URL for your account type
- Admins and portal users are separate

**2. Module Not Enabled**:
- Feature requires module subscription
- Contact conference organizer
- Admin enables in Settings > Modules

**3. Role Restrictions**:
- Your user role lacks permission
- Conference Admin: Only assigned conferences
- Viewer: Read-only access
- Contact Tenant Admin for role change

**4. Registration Required**:
- Portal features require active registration
- Register for conference first
- Or registration may be cancelled

**5. Session Expired**:
- Log out and back in
- Sessions expire after inactivity
- May need to re-authenticate

**Checking Your Permissions**:
1. Log in to portal
2. View available menu items
3. Missing menu items = no access
4. Contact organizer to grant access

### Registration Form Not Loading

**Symptoms**:
- Portal shows blank page
- Form loads forever (spinner)
- "Failed to load" error

**Troubleshooting**:

**1. Clear Browser Cache**:
- Hard refresh: Ctrl+Shift+R (Cmd+Shift+R)
- Or clear cache completely
- Try incognito/private mode

**2. Check Registration Status**:
- Registration may be closed
- Check conference dates
- Confirm early-bird/regular period

**3. Verify Conference Published**:
- Conference must be published by admin
- If unpublished, portal won't load
- Contact conference organizer

**4. Check Browser Compatibility**:
- Use modern browser (Chrome, Firefox, Safari, Edge)
- Update browser to latest version
- Disable browser extensions (ad blockers)
- Try different browser

**5. Network Issues**:
- Check internet connection
- Try different network (mobile hotspot)
- Check if corporate firewall blocking

**6. JavaScript Disabled**:
- Portal requires JavaScript
- Check browser settings
- Enable JavaScript
- Refresh page

### Session Expired Messages

**"Your session has expired, please log in again"**:

**Why This Happens**:
- Inactive for extended period (typically 30-60 minutes)
- Security feature to protect your account
- Multiple tabs/windows can interfere

**Resolution**:
1. Click "OK" or "Log In"
2. Enter credentials again
3. Return to what you were doing
4. Unsaved data may be lost

**Preventing Session Expiry**:
- Save work frequently
- Don't leave forms open for long periods
- Complete tasks in one session
- Close other tabs using same account

**Persistent Session Issues**:
- Clear browser cookies
- Log out completely
- Close all browser tabs
- Log back in fresh

---

## Performance Issues

### Slow Page Loads

**Symptoms**:
- Pages take 10+ seconds to load
- Menus slow to open
- Clicking buttons delayed

**Immediate Actions**:

**1. Check Internet Speed**:
- Run speed test (fast.com or speedtest.net)
- Minimum recommended: 5 Mbps download
- If slow, contact ISP or try different network

**2. Clear Browser Cache**:
- Old cached data can slow things down
- Ctrl+Shift+Delete → Clear cache
- Restart browser

**3. Close Unnecessary Tabs**:
- Browser memory limit can cause slowdown
- Close unused tabs
- Restart browser if many tabs open

**4. Check Browser Extensions**:
- Ad blockers, privacy tools can slow pages
- Disable extensions temporarily
- Test in incognito mode (extensions disabled)
- Re-enable one by one to identify culprit

**5. Check Device Resources**:
- High CPU/memory usage slows browser
- Close other applications
- Restart computer if running for days
- Check task manager for resource hogs

**Specific Page Slowness**:

**Invoice List Slow**:
- Reduce page size (show 50 instead of 100)
- Use search/filters to narrow results
- Export to CSV for large datasets

**Registration List Slow**:
- Similar to invoices
- Filter by status
- Paginate through results

**PDF Generation Slow**:
- Complex templates take longer
- Large logos slow rendering
- Wait 10-20 seconds for complex PDFs
- Simplify template if consistently slow

**Network Latency Issues**:
- Distance from server affects speed
- VPN can add latency
- Try without VPN
- Peak hours may be slower

**When to Contact Support**:
- Slowness persists after troubleshooting
- Only affects specific pages
- Started suddenly (performance regression)
- Provide browser, OS, internet speed info

### Timeout Errors

**"Request timed out"**:

**Causes**:
- Large data export (50k+ rows)
- Complex PDF generation
- Network interruption
- Server overload

**Resolution**:

**For Exports**:
1. Reduce export size
2. Apply filters before exporting
3. Export in multiple batches
4. Contact support for manual export

**For PDFs**:
1. Simplify template
2. Reduce image sizes
3. Wait longer (up to 60 seconds)
4. Try different invoice

**For Bulk Operations**:
1. Process in smaller batches
2. Wait between batches
3. Avoid peak hours

**Network Timeouts**:
1. Check internet stability
2. Try wired connection vs WiFi
3. Restart router
4. Try different network

### Large Dataset Handling

**50,000+ Records**:

**Performance Tips**:

**Use Filters**:
- Don't load all records at once
- Filter by date range
- Filter by status
- Search for specific records

**Pagination**:
- Load 50-100 records per page
- Use Next/Previous buttons
- Jump to specific page

**Search Instead of Browse**:
- If you know what you're looking for
- Use search box
- Faster than scrolling

**Export for Analysis**:
- Download CSV for large datasets
- Analyze in Excel/Google Sheets
- Faster than browser UI

**Archive Old Data**:
- Delete old draft invoices
- Archive past conferences
- Reduces database size

### Browser Compatibility

**Supported Browsers**:
- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

**Not Supported**:
- Internet Explorer (any version) ❌
- Opera Mini ❌
- Old browsers (2+ years old) ❌

**Mobile Browsers**:
- iOS Safari 14+ ✅
- Chrome Mobile 90+ ✅
- Firefox Mobile 88+ ✅

**Check Your Browser Version**:

**Chrome**:
1. Click three dots (top right)
2. Help > About Google Chrome
3. Shows version number
4. Auto-updates to latest

**Firefox**:
1. Click hamburger menu
2. Help > About Firefox
3. Shows version
4. Auto-updates

**Safari** (Mac):
1. Safari menu > About Safari
2. Shows version
3. Update via System Preferences

**If Using Old Browser**:
1. Update to latest version
2. Or switch to supported browser
3. SaaSConf may not work correctly on old browsers

**Browser-Specific Issues**:

**Safari**:
- Some date pickers may look different
- File uploads work differently
- Generally well-supported

**Firefox**:
- Excellent compatibility
- Privacy settings may block some features
- Check "Enhanced Tracking Protection" settings

**Edge**:
- Chromium-based (same as Chrome)
- Full compatibility
- Recommended for Windows users

---

## Integration Issues

### Stripe Webhook Failures

**Symptoms**:
- Payments not auto-updating
- Manual sync required repeatedly
- Invoice events show payment errors

**Troubleshooting Webhook Connection**:

**1. Verify Webhook Configured**:
- Log into Stripe Dashboard
- Go to Developers > Webhooks
- Look for your SaaSConf endpoint
- Should be: `https://yourdomain.com/api/v1/stripe/webhook`

**2. Check Webhook Status**:
- In Stripe Dashboard, webhook should show "Enabled"
- Look for "Signing secret" (starts with `whsec_`)
- Copy signing secret

**3. Verify Webhook Secret in SaaSConf**:
- Go to **Settings > Integrations > Stripe**
- Check "Webhook Secret" field
- Must match Stripe signing secret exactly
- No extra spaces or characters

**4. Test Webhook Delivery**:
- In Stripe Dashboard > Webhooks
- Click on your webhook endpoint
- Click "Send test webhook"
- Select `payment_intent.succeeded` event
- Should receive 200 OK response

**5. Check Recent Webhook Deliveries**:
- In Stripe Dashboard > Webhooks
- Click your endpoint
- View recent deliveries
- Look for failed deliveries (red)
- Click failed delivery to see error

**Common Webhook Errors**:

**"Invalid signature"**:
- Webhook secret mismatch
- Update webhook secret in SaaSConf settings
- Must match exactly from Stripe

**"404 Not Found"**:
- Wrong webhook URL
- Should be: `https://yourdomain.com/api/v1/stripe/webhook`
- Not: `https://yourdomain.com/webhook` (wrong path)
- Update in Stripe Dashboard

**"401 Unauthorized"**:
- This shouldn't happen (webhooks are public)
- Check firewall not blocking Stripe IPs
- Check reverse proxy configuration

**"500 Internal Server Error"**:
- Backend application error
- Check backend logs
- Contact support with webhook delivery ID

**Webhook Events Not Configured**:
- Must listen to these events:
  - `payment_intent.succeeded` ✅
  - `payment_intent.payment_failed` ✅
  - `charge.succeeded` ✅
- Edit webhook in Stripe to add missing events

**Resolution**:
1. Fix issues found above
2. Resend failed webhooks from Stripe Dashboard
3. Or use manual sync for past payments
4. Future payments should auto-update

### VIES VAT Validation Unavailable

**"VAT validation service temporarily unavailable"**:

**About VIES**:
- VIES = VAT Information Exchange System
- EU-operated service
- Validates VAT numbers against official registry
- Sometimes experiences downtime

**When VIES is Down**:
- SaaSConf shows "Unverified" status (yellow warning)
- Format validation still works (checksum)
- Safe to proceed with invoice
- Document in invoice notes

**User Actions**:
1. Proceed with invoice creation
2. Add note: "VAT number unverified - VIES unavailable"
3. Verify VAT number on EU VIES website later: https://ec.europa.eu/taxation_customs/vies/
4. Or ask customer to confirm their VAT number
5. Update invoice notes with verification results

**Alternative Validation**:
- Use EU VIES website directly
- Check customer's VAT registration certificate
- Request official company documents
- Verify on country-specific tax authority website

**VIES Availability**:
- Usually available 24/7
- Maintenance windows occasionally
- Country-specific systems may be down
- Retry in a few hours

**If VIES Always Unavailable**:
- Check server internet connectivity
- Verify firewall allows outbound HTTPS to ec.europa.eu
- Check DNS resolution working
- Contact support to investigate

### ZUGFeRD Generation Errors

**"Invoice doesn't meet ZUGFeRD requirements"**:

**Common Missing Fields**:

**1. Seller VAT ID Missing**:
- Go to **Settings > Finance > Company Info**
- Fill in "Tax ID / VAT Number" field
- Or in **Settings > Finance > ZUGFeRD Settings**
- Set "Seller VAT ID"
- Must be valid EU VAT format (e.g., DE123456789)

**2. Buyer Country Missing**:
- Open invoice
- Fill in "Recipient Country" field
- Must be ISO code (DE, FR, not Germany, France)
- Required for e-invoicing

**3. Buyer Country Not ISO Code**:
- Country stored as full name ("Germany")
- Change to 2-letter ISO code ("DE")
- Use country dropdown (don't type manually)

**4. Missing Issue Date**:
- Invoice must have issue_date
- Automatically set when sending
- Draft invoices don't have issue_date yet
- Send invoice to assign date

**5. Missing Due Date**:
- Fill in due_date field
- Required for payment terms in XML
- Recommended: 30 days from issue date

**6. Missing Line Items**:
- Invoice must have at least 1 line item
- Each item needs:
  - Description
  - Quantity
  - Unit Price
  - Total

**Validation Workflow**:
1. Open invoice
2. Look for ZUGFeRD validation indicator
3. If yellow/red, click to see missing fields
4. Fill in missing fields
5. Save invoice
6. Validation re-runs automatically
7. Green checkmark = compliant

**Generated PDF Fails External Validation**:

**Use Official Validator**:
- URL: https://www.zugferd-rechnung.de/validator/
- Upload generated PDF
- Should show "Valid ZUGFeRD PDF/A-3" in green
- If errors listed, note specific issues

**Common Validation Errors**:

**"Not a valid PDF/A-3 file"**:
- PDF generation issue
- Contact support
- May be WeasyPrint version issue

**"ZUGFeRD XML not found"**:
- XML embedding failed
- Check ZUGFeRD enabled in settings
- Try generating again
- Contact support if persists

**"XML validation errors"**:
- Data format issue
- Check buyer/seller country codes
- Verify amounts are valid
- Ensure VAT IDs formatted correctly

**Testing ZUGFeRD PDFs**:

**Extract XML**:
```bash
# If you have factur-x CLI installed
facturx-pdfextractxml invoice.pdf
# Opens extracted XML for inspection
```

**Import Test**:
- Import into accounting software
- DATEV (Germany)
- Lexware (Germany)
- sevDesk (Germany)
- Verify data imports correctly

**When to Contact Support**:
- Validation consistently fails
- Missing fields not clear
- PDF generation errors
- Provide invoice ID and validation error message

### CSV Encoding Problems

**Excel Shows Garbled Characters**:

**Cause**: Excel misinterpreting UTF-8 encoding

**Solution 1 - Open Correctly in Excel**:
1. Open Excel (blank workbook)
2. Go to **Data > From Text/CSV**
3. Select your CSV file
4. In preview window, select **File Origin: UTF-8**
5. Click **Load**
6. Characters should display correctly

**Solution 2 - Use Google Sheets**:
1. Open Google Sheets
2. File > Import
3. Upload CSV
4. Google Sheets handles UTF-8 correctly
5. Download as Excel if needed

**Solution 3 - Change Excel Default Encoding**:
1. This varies by Excel version
2. Generally: Excel Options > Advanced > Encoding
3. Set to UTF-8
4. May not be available in all versions

**Characters Affected**:
- Accented letters (é, ü, ñ)
- Symbols (€, £, ©)
- Non-Latin scripts (中文, العربية)

**Why This Happens**:
- SaaSConf exports UTF-8 with BOM (Byte Order Mark)
- Should work automatically in Excel
- Some Excel versions ignore BOM
- Older Excel (pre-2016) worse at UTF-8

**Prevention**:
- Use Google Sheets for CSV imports
- Or LibreOffice Calc (handles UTF-8 perfectly)
- Or import using Data > From Text/CSV method

---

## Getting Help

### Support Contact Information

**Email Support**:
- Email: support@saasconf.com
- Response time: 24-48 hours
- For urgent issues, mark as "Urgent" in subject

**Include in Support Requests**:
1. **Your tenant name** (organization name)
2. **Conference name** (if applicable)
3. **Your user email**
4. **Issue description**:
   - What you were trying to do
   - What happened instead
   - Error messages (exact text or screenshot)
5. **Steps to reproduce**:
   - Step 1: ...
   - Step 2: ...
   - Step 3: Error occurred
6. **Browser and OS**:
   - Chrome 120 on Windows 11
   - Safari 17 on macOS Sonoma
7. **Screenshots** (if applicable):
   - Include error messages
   - Redact sensitive data
8. **Invoice/Registration IDs** (if applicable)

**What NOT to Include**:
- Passwords or API keys
- Full credit card numbers
- Personal data of customers (unless necessary)

### Bug Reporting Process

**Before Reporting a Bug**:
1. Check this troubleshooting guide first
2. Try in incognito/private mode
3. Clear browser cache
4. Try different browser
5. Check if issue is known (status page)

**Bug Report Template**:
```
Subject: [BUG] Brief description

Tenant: Your Organization Name
Conference: Conference Name (if applicable)
User: your.email@example.com

Description:
What went wrong? Be specific.

Expected Behavior:
What should have happened?

Actual Behavior:
What actually happened? Include error messages.

Steps to Reproduce:
1. Go to [page]
2. Click [button]
3. Error appears

Environment:
- Browser: Chrome 120
- OS: Windows 11
- Date/Time: 2024-03-15 14:30 UTC

Screenshots:
[Attach screenshots]

Additional Context:
Any other relevant information.
```

**Bug Priority Levels**:

**Critical** (Report immediately):
- System completely down
- Data loss occurring
- Security vulnerability
- Payment processing broken

**High** (Report within 1 day):
- Feature completely broken
- Workaround not available
- Affects many users
- Blocking important workflow

**Medium** (Report within 1 week):
- Feature partially broken
- Workaround available
- Affects some users
- Inconvenient but not blocking

**Low** (Report when convenient):
- Minor UI glitches
- Cosmetic issues
- Nice-to-have improvements
- Rare edge cases

### Feature Request Process

**How to Submit Feature Requests**:
1. Check if feature already exists (read handbook)
2. Email: features@saasconf.com
3. Or use in-app feedback form (if available)
4. Describe use case (not just feature)

**Feature Request Template**:
```
Subject: [FEATURE] Brief description

Use Case:
What problem are you trying to solve?
What workflow would this improve?

Proposed Solution:
How would this feature work?
What would the UI look like?

Current Workaround:
How do you handle this now?

Impact:
How often would you use this?
How many users affected?

Example:
Provide a specific example scenario.
```

**Feature Request Evaluation**:
- Reviewed by product team
- Considered for roadmap
- No guaranteed timeline
- Popular requests prioritized

**Voting on Features**:
- Check roadmap/feedback board (if available)
- Upvote existing requests
- Add comments with your use case
- Increases priority

### Community Forums

**Discussion Forums** (if available):
- URL: community.saasconf.com
- Search before posting
- Tag appropriately
- Help other users

**Forum Categories**:
- General Discussion
- Feature Requests
- How-To Questions
- Bug Reports
- Announcements

**Forum Guidelines**:
- Be respectful and professional
- Search before posting duplicates
- Provide context and details
- Mark solutions as accepted
- Don't share sensitive data publicly

---

## Resources & External Links

### EU VAT Regulations

**Official EU Documentation**:

**VAT Directive 2006/112/EC**:
- URL: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006L0112-20200101
- The primary EU VAT legislation
- Article 196: Reverse charge for B2B services
- Article 44: Place of supply for virtual services

**VIES VAT Number Validation**:
- URL: https://ec.europa.eu/taxation_customs/vies/
- Official EU VAT number validator
- Check customer VAT numbers
- Confirm registration status
- Country-specific search

**EU One-Stop Shop (OSS)**:
- URL: https://taxation-customs.ec.europa.eu/one-stop-shop_en
- VAT on B2C digital services
- Register in one country, report all EU sales
- Quarterly returns

**VAT Rates by Country**:
- URL: https://ec.europa.eu/taxation_customs/tedb/splSearchForm.html
- Official VAT rate database
- Standard, reduced, super-reduced rates
- Updated regularly

**Your National Tax Authority**:
- Contact for country-specific guidance
- VAT registration
- Filing requirements
- Legal interpretation

**Disclaimer**:
SaaSConf provides tools, not tax advice. Always consult a qualified tax advisor for legal compliance.

### Stripe Documentation

**Official Stripe Docs**:
- URL: https://stripe.com/docs
- Comprehensive API documentation
- Integration guides
- Testing tools

**Specific Relevant Sections**:

**Payment Links**:
- URL: https://stripe.com/docs/payment-links
- How payment links work
- Customization options
- Testing payment links

**Payment Intents**:
- URL: https://stripe.com/docs/payments/payment-intents
- Payment flow overview
- Metadata usage
- Status meanings

**Webhooks**:
- URL: https://stripe.com/docs/webhooks
- Webhook setup guide
- Event types
- Signature verification
- Testing webhooks locally

**Refunds**:
- URL: https://stripe.com/docs/refunds
- Refund process
- Partial vs full refunds
- Refund timeline

**Testing**:
- URL: https://stripe.com/docs/testing
- Test card numbers
- Test scenarios (success, failure, etc.)
- Test mode vs live mode

**Stripe Dashboard**:
- URL: https://dashboard.stripe.com/
- View payments
- Manage customers
- Monitor webhooks
- Download reports

### Email Deliverability Tools

**Mail-Tester**:
- URL: https://www.mail-tester.com/
- Test email deliverability score
- Identifies spam triggers
- Checks SPF, DKIM, DMARC
- Free, instant results

**MXToolbox**:
- URL: https://mxtoolbox.com/
- Email blacklist check
- DNS record lookup
- SMTP diagnostics
- Domain health monitoring

**Google Postmaster Tools**:
- URL: https://postmaster.google.com/
- Gmail-specific deliverability
- Spam rate monitoring
- Domain reputation
- Requires domain verification

**SPF Record Check**:
- URL: https://mxtoolbox.com/spf.aspx
- Verify SPF record
- Check syntax
- Troubleshoot SPF issues

**DKIM Validator**:
- URL: https://mxtoolbox.com/dkim.aspx
- Verify DKIM signature
- Test email authentication
- Troubleshoot DKIM issues

**DMARC Check**:
- URL: https://mxtoolbox.com/dmarc.aspx
- Verify DMARC policy
- Check alignment
- Monitor reports

### PDF & E-Invoicing Validators

**ZUGFeRD Validator** (Germany):
- URL: https://www.zugferd-rechnung.de/validator/
- Official German e-invoice validator
- Upload PDF to check compliance
- Shows validation errors
- Tests PDF/A-3 compliance

**Factur-X Validator** (France):
- URL: https://www.factur-x.org/
- French e-invoicing standard (same as ZUGFeRD)
- Compliance information
- Sample invoices

**PDF/A Validator**:
- URL: https://www.pdf-online.com/osa/validate.aspx
- Check PDF/A compliance
- Identifies issues
- Free validation

**factur-x Python Library** (for developers):
- URL: https://github.com/invoice-x/factur-x
- Open source
- CLI tools for extraction/validation
- Install: `pip install factur-x`

### IBAN Validators

**IBAN Checker**:
- URL: https://www.iban.com/iban-checker
- Validate IBAN format
- Check country code
- Verify checksum
- Free, instant

**IBAN Calculator**:
- URL: https://www.iban.com/calculate-iban
- Generate IBAN from account details
- Country-specific formats
- Useful for customers

**Official IBAN Registry**:
- URL: https://www.swift.com/standards/data-standards/iban
- IBAN format by country
- Structure documentation
- Swift official source

### Browser Compatibility Checkers

**Can I Use**:
- URL: https://caniuse.com/
- Check feature support across browsers
- Version-specific compatibility
- Usage statistics

**BrowserStack**:
- URL: https://www.browserstack.com/
- Test on real devices/browsers
- Paid service
- Screenshots and interactive testing

**Update Your Browser**:
- URL: https://browsehappy.com/
- Check if browser is outdated
- Download links for modern browsers
- Browser feature comparison

---

## Glossary of Terms

### A

**Alumni**
Former conference attendees tracked for marketing and historical purposes. Can be manually added, imported via CSV, or auto-created from paid registrations.

**Applicant**
A person who has submitted a proposal to the Call for Papers (CFP) system. Uses separate authentication from regular portal users.

**Attachment**
Files uploaded to the system (logos, contract documents, screen overlay images). Stored using polymorphic model with entity_type and entity_id.

**Attendance Type**
Conference format affecting VAT calculation. Options: in_person (physical venue), virtual (online only), hybrid_onsite (physical with online option), hybrid_online (online with physical option).

**Audit Log**
Record of significant system actions (user creation, invoice sending, data changes) with timestamp, user, and details. Used for compliance and troubleshooting.

### B

**Bank Transfer Invoice**
Invoice type requiring manual payment reconciliation. Customer pays via wire transfer, admin marks as paid manually in system.

**Billing Profile**
Shared billing information for group registrations. One billing profile can be linked to multiple attendees to reduce data entry and enable batch invoicing.

**Booking Option**
Conference attendance package (e.g., 2-Day Pass, Virtual Access, Tutorial). Can have multiple booking periods (early-bird, regular, late) with different pricing.

**B2B (Business-to-Business)**
Transaction where customer is a business entity. Identified by presence of VAT number. Subject to different VAT rules than B2C.

**B2C (Business-to-Consumer)**
Transaction where customer is individual consumer. No VAT number provided. Subject to consumer VAT rates.

### C

**Conference Admin**
User role with full access to assigned conferences but not other conferences in the tenant. Can manage registrations, invoices, program, etc.

**Credit Card Invoice**
Invoice type integrated with Stripe for online payment. System automatically creates payment link and processes payments via webhook.

**Credit Note**
Negative invoice issued when cancelling a paid invoice. Immutable document with status always "sent". Links to original invoice via related_invoice_id.

**CFP (Call for Papers)**
System for collecting and reviewing conference presentation proposals. Separate authentication for applicants. Includes submission, review, and notification workflows.

**CSV (Comma-Separated Values)**
Text file format for data import/export. All exports include UTF-8 BOM for Excel compatibility. Import limited to 50,000 rows.

### D

**Deadline**
Conference task with due date, reminders, and completion tracking. Core feature (no module required). Sends color-coded reminder emails at 7 days, 1 day, and on due date.

**Discount Code**
Promotional code offering percentage or fixed amount discount on booking options. Can be scoped to specific options, periods, and people. Supports bulk generation with templates.

**Draft Invoice**
Invoice in creation state. Fully editable, can be deleted, no invoice number assigned yet. Status changes to "sent" when first sent to customer.

### E

**E-Invoicing**
Electronic invoicing standard combining human-readable PDF with machine-readable XML. See ZUGFeRD/Factur-X. Required for B2B in many EU countries.

**Event (Invoice Event)**
Audit trail record for invoice actions. Tracks payments, refunds, status changes, emails, Stripe interactions. Immutable log with timestamps and user context.

### F

**Factur-X**
French name for ZUGFeRD e-invoicing standard. Identical specification, different name. SaaSConf supports both via unified implementation.

**Fiscal Representative**
Third-party entity representing foreign companies for VAT compliance. Can be configured per conference with separate billing information.

### I

**IBAN (International Bank Account Number)**
Standardized international bank account identifier. Used in bank transfer invoices. Validated by format and checksum. Country-specific structure.

**Invoice Number**
Unique identifier for sent invoices. Auto-generated using configurable template. Supports placeholders: {YYYY}, {YY}, {MM}, {COUNTER}. Draft invoices have no number.

**Invoice Template**
HTML template for PDF generation. Supports 40+ placeholders for dynamic content. Edited via TipTap WYSIWYG editor. Separate header, body, footer sections.

**ISO Code**
Two-letter country code standard (ISO 3166-1 alpha-2). Examples: DE (Germany), FR (France), US (United States). Required for ZUGFeRD compliance.

### L

**Line Item**
Individual row in invoice listing description, quantity, unit price, and total. Invoice must have at least one line item. Used in PDF and ZUGFeRD XML generation.

### M

**Multi-Tenancy**
Architecture pattern isolating data between organizations (tenants). Shared database with tenant_id on every table. Row-Level Security (RLS) enforces isolation.

**Module**
Optional feature requiring subscription/enablement. Examples: Registration, Volunteers, Alumni, Booking. Enabled per tenant in Settings > Modules.

### O

**OSS (One-Stop Shop)**
EU VAT scheme for B2C digital services. Allows companies to register VAT in one country and report all EU B2C sales. Alternative to registering in every customer country.

### P

**Payment Intent**
Stripe object representing a payment. Created automatically when customer pays via Payment Link. Stores amount, status, customer info, metadata.

**Payment Link**
Stripe-hosted checkout page URL. Reusable link for customers to pay invoices. Includes invoice metadata for automatic reconciliation.

**PDF/A-3**
Archival PDF standard (ISO 19005-3) allowing embedded files. Required for ZUGFeRD. Ensures long-term document accessibility and allows XML attachment.

**Placeholder**
Variable in invoice templates replaced with actual data. Format: [INVOICE_NUMBER], [COMPANY_NAME], etc. Case-sensitive, exact spelling required.

**Portal**
Public-facing website for conference attendees. Separate from admin interface. Features: registration, schedule viewing, profile management. Mobile-responsive design.

### R

**Recipient Search**
Feature for pre-populating invoice recipient data. Searches sponsors, speakers, committee members, volunteers, registrations. Returns up to 10 results per category.

**Refresh Token**
Long-lived authentication token for obtaining new access tokens. Stored as SHA256 hash. Revoked on password change or logout.

**Registration**
Attendee enrollment for conference. Includes booking option, personal info, billing profile. Can be individual or bulk (group). Linked to user account for portal access.

**Registration Replacement**
Transferring a registration from one person to another. Original attendee cancelled, new attendee inherits booking option. Optionally add additional items with delta invoicing.

**Replace Invoice**
Correction workflow for billing information errors. Cancels original (creates credit note) and creates new invoice with corrected billing. Status and registrations preserved.

**Reverse Charge**
VAT mechanism where customer (not supplier) accounts for VAT. Applies to cross-border B2B services in EU. Requires valid VAT number. Invoice shows 0% VAT with notice.

**RLS (Row-Level Security)**
PostgreSQL feature restricting query results based on user context. Used in SaaSConf for tenant isolation. Queries automatically filtered by tenant_id.

### S

**Screen Overlay**
Full-screen modal shown to portal users on login events. Supports text, animation, and image. Trigger types: first_registration, scheduled, always.

**Session**
Program schedule item representing a presentation, tutorial, or event. Can be marked separately_bookable for registration integration. Supports multi-slot sessions.

**SPF (Sender Policy Framework)**
Email authentication method specifying which servers can send email for a domain. Required for good deliverability. DNS TXT record.

**Stripe**
Payment processor integration for credit card invoices. Provides payment links, webhooks, refunds. Requires API keys and webhook configuration.

**Super Admin**
System-level admin with access to all tenants and conferences. Can create tenants, manage global settings, access ops endpoints.

### T

**Tenant**
Top-level organization in multi-tenant system. Contains users, conferences, invoices. Data isolated from other tenants. Examples: conference organizing companies, universities.

**Tenant Admin**
User role with full access to all data within their tenant. Can manage users, conferences, settings, billing.

**Template Type**
Invoice document type. Options: bank_transfer (manual payment), credit_card (Stripe payment), credit_note (cancellation). Determines workflow and payment handling.

**TipTap**
WYSIWYG rich text editor used for invoice templates, email templates, contract editing. Supports tables, images, formatting. Outputs HTML.

### U

**User**
Admin system account with email, password, role. Separate from portal users. Roles: super_admin, tenant_admin, conference_admin, viewer.

### V

**VAT (Value-Added Tax)**
Consumption tax collected on goods and services in EU and other regions. Rate varies by country and product type. Complex cross-border rules.

**VAT Decision Table**
24-rule matrix determining VAT treatment. Inputs: attendance type, customer type (B2B/B2C), customer location (domestic/EU/non-EU). Outputs: charge VAT, rate source, reverse charge.

**VAT Number**
Business tax registration identifier. Format varies by country (e.g., DE123456789). Validated via python-stdnum library and VIES API. Required for reverse charge.

**VIES (VAT Information Exchange System)**
EU-operated online database for VAT number validation. Accessed via ec.europa.eu API. May experience downtime. Used in 3-stage validation cascade.

**Volunteer Assignment**
Linking a conference volunteer to a session task. Used in task scheduling system. Supports drag-and-drop interface and PDF export.

**Volunteer Role (Task)**
Defined volunteer responsibility (e.g., Registration Desk, Session Chair). Created in Settings, assigned to sessions. Table name is volunteer_roles but UI says "Tasks".

### W

**Webhook**
HTTP callback for real-time event notifications. Stripe sends webhooks for payment events. Requires signature verification for security. Public endpoint (no auth).

**WeasyPrint**
Python library converting HTML+CSS to PDF. Used for invoice PDF generation. Supports PDF/A-3 for ZUGFeRD. Handles complex layouts with headers/footers.

### Z

**ZUGFeRD**
German/EU e-invoicing standard. Combines PDF/A-3 with embedded CII XML. Profile levels: MINIMUM, BASIC, EN16931 (recommended), EXTENDED. Required for B2B in Germany from 2025.

---

## FAQ (Frequently Asked Questions)

### Invoices

**Q: Can I edit an invoice after sending it?**
A: No, sent invoices are read-only to maintain audit compliance. To correct billing information (name, address, VAT, PO number), use **Replace Invoice**. For other changes (amounts, line items), cancel the invoice and create a new one.

**Q: How do I fix a typo in a customer's company name on a sent invoice?**
A: Use the **Replace Invoice** feature. This cancels the original invoice (creates credit note) and creates a new invoice with corrected billing information while preserving the paid status and any linked registrations.

**Q: What's the difference between Replace Invoice and Cancel Invoice?**
A: **Replace Invoice** is for billing corrections (wrong name, address, VAT number). It keeps registrations active and preserves payment status. **Cancel Invoice** is for true cancellations (event cancelled, refund needed). It can optionally cancel all linked registrations.

**Q: Why is the VAT number field marked as required?**
A: The system determines if a VAT number is legally required based on EU regulations. Red asterisk (*) = legally mandatory (virtual cross-border B2B). Yellow "Recommended" = best practice. You can proceed without it, but admin override may be required.

**Q: Can I send an invoice without a VAT number?**
A: Yes, but you'll see a warning banner. If VAT is legally required (red warning), admins can override. If just recommended (yellow warning), anyone can acknowledge and proceed.

**Q: How long do Stripe payment links last?**
A: Stripe payment links generally don't expire. They remain active until the invoice is cancelled or payment is completed. If an invoice is cancelled, the payment link is automatically deactivated.

**Q: Can I offer discounts or early-bird pricing on invoices?**
A: Invoices are created with final pricing. For promotional pricing, configure booking options with different booking periods (early-bird, regular, late) in Settings > Booking. Each period can have different prices.

**Q: What happens when I cancel a paid invoice?**
A: For credit card invoices, the system automatically issues a full Stripe refund and creates a credit note. For bank transfer invoices, a credit note is created but refund must be processed manually outside the system.

**Q: Can I issue partial refunds?**
A: The system currently supports full refunds only. For partial refunds, process manually in the Stripe Dashboard and document in the invoice's internal comment field.

**Q: Why isn't my invoice PDF generating?**
A: Common causes: blank template, malformed HTML in template, missing company logo, or template using invalid placeholders. Test with the default template first, then check Settings > Finance > Invoice Templates for issues.

### Registration

**Q: Can I replace an attendee who can't attend anymore?**
A: Yes, use **Replace Attendee** feature. This cancels the original registration, creates a new one for the replacement, sends notifications to both, and optionally allows adding additional booking items for the new attendee.

**Q: What happens to the original attendee when I replace them?**
A: Their registration status changes to CANCELLED, they receive a cancellation email with your custom message, and they lose access to this conference. Their user account stays active for future events.

**Q: Can I add extra items when replacing an attendee?**
A: Yes, the Replace Attendee modal allows adding additional booking options or tutorials. A new invoice will be created for only the additional items (delta invoicing), using the original registration's billing profile.

**Q: Why can't I select custom pronouns in Replace Attendee?**
A: Pronouns must be pre-configured in Conference Settings > General > Pronouns. The dropdown shows only configured options for consistency. Add pronouns in settings first, then use Replace Attendee.

**Q: Why is the Tutorial option disabled when adding items?**
A: An attendee can only be in one tutorial at a time. If the registration already includes a tutorial, the Tutorial type is disabled in the additional items dropdown.

**Q: Can I replace an attendee who was already replaced?**
A: No, the system prevents replacing already-replaced registrations to maintain a clean audit trail. Always work with the current active registration.

### VAT & Compliance

**Q: What's reverse charge and when does it apply?**
A: Reverse charge is an EU VAT mechanism where the buyer (not supplier) accounts for VAT. It applies to cross-border B2B services (virtual conferences to EU business customers). Invoice shows 0% VAT with a legal notice, and the customer must self-account for VAT in their country.

**Q: Do I need a VAT number for virtual events?**
A: If you're selling virtual attendance to an EU business customer in a different country than yours, yes, VAT number is legally required for reverse charge. The system will show a red error warning if you try to proceed without it.

**Q: What if the VIES validation service is down?**
A: The system will show "Unverified" status (yellow warning) but still allow you to proceed. The VAT number format and checksum are still validated offline. Document in invoice notes that VIES was unavailable.

**Q: What's ZUGFeRD and do I need it?**
A: ZUGFeRD (also called Factur-X) is a European e-invoicing standard combining PDF with embedded XML data. It will be mandatory for B2B transactions in Germany starting 2025, with similar requirements rolling out across Europe. Enable in Settings > Finance > ZUGFeRD Settings.

**Q: Why does my invoice fail ZUGFeRD validation?**
A: Common reasons: missing seller VAT ID, buyer country not in ISO code format (use "DE" not "Germany"), missing issue date or due date, or missing line items. Check the ZUGFeRD validation indicator in invoice details for specific missing fields.

**Q: Can I disable ZUGFeRD for certain invoices?**
A: ZUGFeRD is enabled/disabled at the conference level in Settings. If enabled, all invoices meeting requirements will include ZUGFeRD XML. If an invoice doesn't meet requirements, it gracefully falls back to standard PDF.

### Email & Communication

**Q: Why aren't my invoices sending via email?**
A: Check: (1) Email address is valid and no typos, (2) Email Sending Enabled toggle is on in Settings > General, (3) SMTP/Resend API is configured by admin, (4) Check spam folder. Also verify in invoice Events tab if email send was attempted.

**Q: Can I customize the email sent with invoices?**
A: Yes, go to Settings > Communication > Email Templates. Edit the invoice email template. Use placeholders like [INVOICE_NUMBER], [COMPANY_NAME], etc. Test with "Send Test Email" before going live.

**Q: How do I add my company logo to emails?**
A: Upload logo in Settings > Finance > Company Info. In email template, use the [COMPANY_LOGO] placeholder. Logo is embedded as base64 in emails.

**Q: What if customers report emails are going to spam?**
A: Ask them to mark as "Not Spam" and add sender to contacts. For widespread issues, check SPF/DKIM/DMARC DNS records are configured, verify sender reputation with Mail-Tester.com, and ensure content doesn't trigger spam filters (avoid ALL CAPS, excessive punctuation).

**Q: Can I resend an invoice if the customer didn't receive it?**
A: Yes, open the invoice and click Send again. The system will resend using the same invoice number and payment link. Check invoice Events tab to confirm email was sent.

### Payments

**Q: How do I know if a customer paid?**
A: For credit card invoices, status automatically updates to "Paid" via Stripe webhook (usually within seconds). For bank transfer invoices, you must manually mark as paid after verifying receipt in your bank account.

**Q: What if invoice status doesn't update after customer pays?**
A: Wait 5 minutes, then refresh. If still not updated, use **Sync Stripe Payment** action on the invoice. If webhooks aren't configured, use the bulk **Sync Stripe Payments** button to check all pending invoices.

**Q: Can customers pay with PayPal or other methods?**
A: Currently only Stripe (credit card) and bank transfer are supported. Stripe supports credit/debit cards, Apple Pay, Google Pay (depending on your Stripe configuration).

**Q: How do refunds work?**
A: For paid credit card invoices, cancel the invoice and the system automatically issues a Stripe refund (5-10 business days to customer's bank). For bank transfer invoices, cancel creates a credit note but you must process the refund manually.

**Q: Can I offer payment plans or installments?**
A: Not currently supported in the invoice system. You would need to create separate invoices for each installment manually.

### Portal Access

**Q: How do attendees access the portal?**
A: Attendees receive a registration confirmation email with portal login details. They use the email address from their registration and set their own password during first login.

**Q: What if an attendee forgets their portal password?**
A: They can use "Forgot Password" link on portal login page. System sends password reset email with token valid for 1 hour.

**Q: Can multiple attendees use the same email for portal access?**
A: No, email addresses must be unique per conference. Each attendee needs their own email address for portal login and receiving conference communications.

**Q: What can attendees see/do in the portal?**
A: View conference program/schedule, manage their profile, view/update their registration details, and access any enabled portal modules (depends on conference configuration).

### Data Management

**Q: Can I export all my invoice data?**
A: Yes, use the Export button on the Invoices tab. Exports to CSV with UTF-8 encoding. Limited to 50,000 invoices per export. Open in Excel using Data > From Text/CSV > UTF-8.

**Q: Can I import registrations in bulk?**
A: Yes, use CSV import in Registrations tab. Format: one row per attendee with columns for email, first_name, last_name, etc. Maximum 50,000 rows per file.

**Q: How do I backup my data?**
A: Export each data type (invoices, registrations, alumni, etc.) to CSV. For complete backup, contact support to request full database export.

**Q: Can I delete old conferences to free up space?**
A: Contact support for conference archival. Deleting conferences permanently removes all associated data (registrations, invoices, program). Export data first if needed for records.

**Q: How long is data retained?**
A: Data is retained indefinitely unless you delete it or request archival. Audit logs and invoice events are never deleted for compliance purposes.

### Performance

**Q: Why is the system slow?**
A: Common causes: slow internet connection, too many browser tabs open, large dataset (try filtering/pagination), browser cache full (clear cache), or temporary server load. Try incognito mode to rule out extensions.

**Q: Can I use the system on mobile devices?**
A: The portal is mobile-responsive and works well on phones/tablets. The admin interface is desktop-first but usable on tablets. Phone screens may be cramped for admin tasks.

**Q: Which browsers are supported?**
A: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+. Internet Explorer is not supported. Mobile browsers also supported. Always use latest browser version for best performance.

### Account & Access

**Q: How do I add team members to my tenant?**
A: Tenant Admins can add users in Settings > Team. Provide email, name, and role. New users receive an invite email to set their password.

**Q: What's the difference between user roles?**
A: **Super Admin** (all tenants), **Tenant Admin** (all conferences in your org), **Conference Admin** (assigned conferences only), **Viewer** (read-only).

**Q: Can I limit a user to specific conferences only?**
A: Yes, create user with Conference Admin role, then assign specific conferences in their user settings.

**Q: How do I change my password?**
A: Go to user menu (top right) > Profile > Change Password. Must provide current password for security.

**Q: What if I forget my admin password?**
A: Use "Forgot Password" link on login page. System sends reset email with token valid for 1 hour. Link allows setting new password without knowing old one.

---

**End of Troubleshooting & Resources**

For issues not covered in this guide, contact support@saasconf.com with detailed information about your problem.
