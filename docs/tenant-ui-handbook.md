# Tenant UI Handbook

User guide for conference organizers and administrators using the SaaSConf platform.

---

## Invoice Management

### Creating Invoices

SaaSConf provides a comprehensive invoicing system for managing conference payments from sponsors, speakers, and registrations.

#### Invoice Types

- **Bank Transfer**: Traditional invoice with bank details for wire transfer payment
- **Credit Card**: Stripe-integrated invoice with online payment link
- **Credit Note**: Negative invoice issued when cancelling a paid invoice

#### VAT Validation & Requirements

The system automatically determines VAT number requirements based on EU tax regulations and the VAT Decision Table.

##### When is a VAT Number Required?

**Required (Legally Mandatory)**:
- Virtual or hybrid-online conferences
- Customer in a different EU country than conference country
- B2B transaction (company name provided)

**Why**: Virtual/online services to EU businesses are subject to **reverse charge** under Article 196 of the VAT Directive 2006/112/EC. The buyer must have a valid VAT registration number to self-account for VAT in their country.

**Visual Indicator**: Red asterisk (*) next to VAT Number field

**Recommended (Best Practice)**:
- In-person or hybrid-onsite conferences
- Customer in the same country or different EU country
- B2B transaction (company name provided)

**Why**: Providing a VAT number helps with tax compliance and enables the customer to reclaim input VAT on the purchase.

**Visual Indicator**: Yellow "(Recommended for B2B)" label

**Optional**:
- B2C transactions (no company name)
- Non-EU customers
- Any scenario not covered above

##### VAT Number Validation

When you enter a VAT number, the system performs a 3-stage validation cascade:

1. **Format & Checksum** (python-stdnum): Validates the format and mathematical checksum
2. **Regex Fallback**: More lenient pattern matching if strict validation fails
3. **VIES Registry** (EU): Online verification against the official EU VAT registry

**Validation States**:
- ✅ **Valid** (Green checkmark): VAT number verified
- ❌ **Invalid** (Red X): VAT number format or checksum failed
- ⚠️ **Unverified** (Yellow warning): Format is correct but VIES registry unavailable
- 🔄 **Checking** (Spinner): Validation in progress

##### Warning Messages

When creating an invoice with VAT issues, you'll see warning banners:

**Error Warnings (Red)**:
- Displayed when VAT is legally required but missing or invalid
- Contains explanation of the legal requirement (Article 196 reference)
- Can be overridden by tenant admins or super admins

**Recommended Warnings (Yellow)**:
- Displayed when VAT is recommended but missing or invalid
- Contains best practice explanation
- Can be acknowledged by any user

**Info Messages (Blue)**:
- Displayed when VAT requirement rules are applied
- Documents the decision made by the system
- Shows the VAT rule reference for transparency

#### Creating an Invoice

1. Navigate to the **Invoices** tab in your conference
2. Click **Create Invoice**
3. Fill in required fields:
   - **Recipient Information**:
     - Company Name (optional, but triggers B2B VAT rules if provided)
     - Street Address *
     - Postal Code *
     - City *
     - Country *
     - VAT Number (may be required based on scenario - see above)
   - **Invoice Details**:
     - Template Type (bank_transfer, credit_card, or credit_note)
     - Issue Date
     - Due Date
     - Currency
   - **Line Items**:
     - Description
     - Quantity
     - Unit Price
     - Discount (optional)
4. Review VAT warnings if any appear
5. Click **Save** to create the draft invoice

**Note**: VAT is automatically calculated based on:
- Conference country
- Customer country
- Attendance type (in-person, virtual, hybrid)
- Customer type (B2B if VAT number provided, B2C otherwise)
- VAT Decision Table (24 rules covering all scenarios)

#### Sending an Invoice

1. Open the draft invoice
2. Review all details and VAT warnings
3. Click **Send**
4. If VAT warnings exist:
   - System will prompt for acknowledgment
   - Admins can choose to send anyway after reviewing the warnings
5. System generates an invoice number automatically
6. Invoice status changes to "Sent"
7. Customer receives invoice via email (if email provided)

**For Credit Card Invoices**:
- System creates a Stripe payment link
- Link is included in the invoice email
- Customer can pay online securely

#### Invoice Statuses

- **Draft**: Invoice created but not sent
- **Sent**: Invoice sent to customer
- **Paid**: Payment received (manual marking or Stripe webhook)
- **Overdue**: Payment not received by due date
- **Cancelled**: Invoice cancelled (credit note issued)

### Invoice Actions

#### Editing Invoices
- Only **draft** invoices can be fully edited
- **Sent** invoices are read-only to maintain audit trail
- To modify a sent invoice, you must cancel it and create a new one

#### Replacing an Invoice (Billing Correction)

Use **Replace Invoice** when the buyer provided incorrect billing information (wrong company name, address, PO number, or VAT number) but the invoice should remain valid.

**When to Use**:
- Company name was entered incorrectly
- Wrong VAT number provided
- Address needs correction
- PO/procurement code missing or wrong

**How It Works**:
1. Open a sent, overdue, or paid invoice
2. Click **Replace Invoice**
3. Enter:
   - Reason for replacement (required)
   - Corrected billing fields (only change what's wrong)
   - Custom email message (optional)
4. System automatically:
   - Cancels the old invoice (creates credit note)
   - Creates new invoice with corrected billing information
   - Keeps all active registrations linked
   - Sends both credit note and new invoice emails using templates from settings

**Status Inheritance**:
- **Paid invoices**: New invoice inherits "paid" status (customer already paid)
- **Sent invoices**: New invoice gets "sent" status (customer still needs to pay)

**Stripe Handling** (Credit Card Invoices Only):
- **Paid invoices**: No new payment link needed (already paid)
- **Sent invoices**: Old payment link deactivated, new payment link created automatically

**Important Notes**:
- ✅ Registrations stay active and linked (no disruption to attendees)
- ✅ At least one billing field must be different from the original
- ✅ Email templates from settings are used for all communications
- ❌ Cannot replace draft, credit note, or already-replaced invoices
- ❌ Bank transfer invoices don't use Stripe (handled manually)

**Use Case Example**:
> Customer enters "Acme Corp" but their legal entity is "Acme Corporation GmbH". Replace the invoice with the corrected name without affecting their confirmed conference registrations.

#### Cancelling an Invoice

Use **Cancel Invoice** when you need to truly cancel an invoice (not just correct billing details).

**Standard Cancellation** (No Registrations):
1. Open a sent, overdue, or paid invoice
2. Click **Cancel Invoice**
3. Enter cancellation reason
4. System automatically:
   - Creates **credit note** (negative invoice)
   - Changes invoice status to **Cancelled**
   - Links credit note to original invoice
   - Sends credit note email using template from settings

**Enhanced Cancellation** (With Registrations):

For invoices linked to attendee registrations, you can optionally cancel the registrations when cancelling the invoice.

**Steps**:
1. Open the invoice (must be sent, overdue, or paid)
2. Click **Cancel Invoice**
3. Enter cancellation reason
4. **Check "Cancel all registrations"** (if applicable)
5. Enter cancellation message for attendees (optional)
6. System automatically:
   - Cancels the invoice + creates credit note
   - Cancels all linked registrations (status → CANCELLED)
   - Removes conference access for those attendees
   - Keeps user accounts active (they can still access portal for other events)
   - Sends cancellation email to each attendee using template from settings

**Stripe Refund Handling** (Credit Card Invoices Only):
- **Paid invoices**: System automatically issues full Stripe refund
- **Sent invoices**: System deactivates the payment link (prevents payment)
- **Bank transfer**: Manual refund handling required (outside system)

**Important Notes**:
- ✅ Attendees lose access to THIS conference only
- ✅ User accounts remain active for future events
- ✅ All actions are logged in audit trail
- ✅ Email templates from settings are used
- ❌ This action cannot be undone
- ❌ Leave "Cancel all registrations" unchecked if you only need to cancel the invoice (billing correction should use "Replace" instead)

**Decision Guide**:
- **Billing correction only?** → Use **Replace Invoice** (keeps registrations active)
- **True cancellation (event cancelled, refund needed)?** → Use **Cancel Invoice** with "Cancel all registrations" checked
- **Wrong invoice sent?** → Use **Cancel Invoice** without checking "Cancel all registrations", then create correct invoice

#### Marking as Paid (Bank Transfer)

For bank transfer invoices paid outside the system:
1. Open the sent invoice
2. Click **Mark as Paid**
3. Enter:
   - Payment date
   - Comment (e.g., bank reference number)
4. Invoice status changes to **Paid**

#### Converting to Credit Card

Convert a bank transfer invoice to credit card payment:
1. Open the draft or sent invoice
2. Click **Convert to Credit Card**
3. System creates Stripe payment link
4. Send updated invoice to customer

### Recipient Search

When creating an invoice, you can search for recipients from:
- **Sponsors**: Company name, email, address auto-filled
- **Speakers**: Name and contact details from CFP system
- **Committee Members**: Contact information from committee
- **Volunteers**: Registered volunteer details
- **Registrations**: Attendee registration data

The search returns up to 10 results per category for fast lookup.

### Invoice PDF Generation

PDFs are generated automatically when you:
- Send an invoice
- Download an invoice
- Include invoice as email attachment

**PDF Features**:
- Conference branding (logo, colors from settings)
- All invoice details (recipient, line items, totals)
- VAT calculation breakdown
- Reverse charge notice (if applicable)
- Bank details or payment link
- QR code for online payment (credit card invoices)

### Contact Persons

You can add multiple contact persons to an invoice for coordination:
- First Name / Last Name
- Email
- Phone
- Comment/Role

**Use Case**: Multiple stakeholders at a sponsor company (finance contact, marketing manager, etc.)

### Invoice Events (Audit Trail)

All invoice actions are logged:
- Creation
- Updates
- Status changes
- VAT calculations
- Stripe payments/refunds
- Email sends

View the full audit trail in the **Events** tab of each invoice.

---

## VAT Settings

### Configuring VAT Rates

Navigate to **Conference Settings > VAT Settings** to configure country-specific VAT rates.

**Global Defaults**:
- System includes standard VAT rates for all EU countries
- Rates are kept up-to-date with EU regulations

**Tenant Overrides**:
- You can override global rates for specific countries
- Useful for reduced rates or special tax arrangements
- Overrides apply only to your conferences

### VAT Decision Table

The system uses a 24-rule decision table to determine VAT treatment:

**Factors**:
1. **Attendance Type**: in_person, virtual, hybrid_onsite, hybrid_online
2. **Customer Type**: b2b (has VAT number), b2c (no VAT number)
3. **Customer Location**: domestic (same country), eu (different EU country), non_eu

**Outcomes**:
- `charge_vat`: Whether to charge VAT
- `vat_rate_source`: Which country's rate to use (conference, customer, or none)
- `reverse_charge`: Whether reverse charge applies (VAT number required)
- `oss_applicable`: Whether One-Stop Shop scheme applies

**Examples**:
- Virtual + EU B2B → Reverse charge (0% VAT, buyer pays in their country)
- In-person + Domestic → Conference country VAT rate
- Virtual + EU B2C → OSS rate (customer country rate)

You can customize the VAT rules in conference settings if you have special tax arrangements.

---

## Best Practices

### VAT Compliance

1. **Always collect VAT numbers for B2B EU transactions**
   - Required by law for reverse charge scenarios
   - Recommended for all B2B invoices

2. **Verify VAT numbers before sending**
   - Use the built-in validation (green checkmark)
   - Invalid VAT numbers can cause tax audit issues

3. **Document VAT decisions**
   - Review the VAT requirement banners
   - Check the rule reference (e.g., "Article 196")
   - Keep records of admin overrides

4. **Check reverse charge notes**
   - System automatically adds legal text to invoice notes
   - Ensure customers understand they must self-account for VAT

### Invoice Workflow

1. **Create drafts early**
   - Lock in pricing and terms before event
   - Easy to update before sending

2. **Review VAT warnings carefully**
   - Red (error) warnings indicate compliance risks
   - Yellow (warning) warnings are best practice reminders

3. **Use recipient search**
   - Pre-populate address fields accurately
   - Reduces data entry errors

4. **Add internal comments**
   - Use the "Internal Comment" field for notes
   - Not visible to customers
   - Useful for team coordination

5. **Track payment status**
   - Check invoice events for payment confirmations
   - Follow up on overdue invoices
   - Use credit card option for faster payment

6. **Choose the right correction method**
   - **Billing info wrong?** → Use "Replace Invoice" (fast, keeps registrations active)
   - **Amount or items wrong?** → Cancel and create new invoice
   - **True cancellation needed?** → Use "Cancel Invoice" with registration options

7. **Handle registrations carefully**
   - Review before checking "Cancel all registrations"
   - Only use for true cancellations (event cancelled, full refund)
   - Use "Replace Invoice" for billing corrections to avoid disruption

8. **Communicate with attendees**
   - System sends automatic emails using your templates from settings
   - Add custom messages for clarity (optional field in Replace/Cancel dialogs)
   - Follow up personally for sensitive situations (full event cancellation)

---

## Troubleshooting

### VAT Number Won't Validate

**Yellow "Unverified" warning**:
- VAT format is correct, but VIES registry is temporarily down
- Safe to send invoice
- Recommend customer double-check their VAT number

**Red "Invalid" error**:
- VAT format or checksum failed
- Ask customer to verify their VAT number
- Check country code matches (e.g., DE for Germany)
- Admins can override if certain the number is correct

### VAT Rate is Wrong

1. Check conference country setting
2. Check customer country setting
3. Review attendance type (in-person vs virtual)
4. Verify VAT Decision Table rules in settings
5. Check for tenant-specific rate overrides

### Invoice Stuck in Draft

Ensure all required fields are filled:
- Recipient name
- Complete address (street, city, postal code, country)
- At least one line item with description
- Currency selected

### Can't Edit Sent Invoice

This is by design to maintain audit compliance. To modify a sent invoice:

**For Billing Corrections** (wrong name, address, VAT, PO number):
1. Use **Replace Invoice** feature
2. Enter the corrected billing information
3. System automatically handles cancellation and reissuance
4. Registrations stay active

**For Other Changes** (amounts, line items, dates):
1. Cancel the sent invoice (creates credit note)
2. Create a new invoice with correct details
3. Send the new invoice

**Tip**: Always use "Replace Invoice" for simple billing corrections to avoid disrupting attendee registrations.

### Credit Card Payment Failed

Check invoice events for error details:
- Customer's card may have been declined
- Customer may have closed the payment window
- Payment link may have expired

**Resolution**:
1. Customer can retry using the same payment link
2. Or create a new invoice if needed
3. Contact customer to resolve payment issue

### Replace Invoice Says "No Fields Changed"

The system requires at least one billing field to be different from the original invoice.

**Check**:
- Are you actually changing a value?
- Did you type the exact same information?
- Try changing company name, VAT number, or address

**Tip**: If you need to change amounts or line items (not billing info), cancel and create a new invoice instead.

### Registrations Cancelled by Mistake

If you cancelled an invoice with "Cancel all registrations" checked by mistake:

**Unfortunately, this cannot be automatically undone**, but you can:
1. Manually reactivate registrations in the Registrations tab
2. Manually restore conference access for affected users
3. Contact affected attendees to explain the error

**Prevention**:
- Only check "Cancel all registrations" for true cancellations (event cancelled, refund issued)
- For billing corrections, always use "Replace Invoice" instead

### Invoice Replacement Not Appearing

After replacing an invoice, you should see:
- Old invoice: Status = "Cancelled"
- Credit note: Linked to old invoice
- New invoice: With corrected billing information

**If missing**:
1. Check the invoice list - all three should be visible
2. Refresh the page
3. Check invoice events for errors
4. Contact support if issue persists

---

## Support & Resources

### Getting Help

- **Technical Support**: support@saasconf.com
- **VAT Questions**: Consult your tax advisor for legal advice
- **Feature Requests**: Submit via platform feedback form

### Legal Disclaimer

SaaSConf provides VAT calculation tools based on EU regulations, but:
- Always consult a qualified tax advisor for legal compliance
- The platform does not provide tax advice
- You are responsible for correct tax reporting
- Rules may change based on your jurisdiction

### External Resources

- [EU VAT Directive 2006/112/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006L0112-20200101)
- [VIES VAT Number Validation](https://ec.europa.eu/taxation_customs/vies/)
- [EU One-Stop Shop (OSS) Guide](https://taxation-customs.ec.europa.eu/one-stop-shop_en)
