"""Utility script to identify and fix invoices with double-invoicing bug.

This script finds invoices created before the fix that have duplicate line items
(e.g., both "Tutorial Day" and "Tutorial Day - Back to Testing Basics") and
provides options to cancel and regenerate them correctly.

Usage:
    python scripts/fix_double_invoiced_registrations.py --dry-run
    python scripts/fix_double_invoiced_registrations.py --fix
"""

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models.invoice import Invoice
from app.models.registration import BillingProfile, Registration


async def find_double_invoiced_invoices(db: AsyncSession) -> list[Invoice]:
    """Find invoices with duplicate line items indicating double-invoicing bug.

    Returns invoices where line items contain both a base item (e.g., "Tutorial Day")
    and an enhanced version (e.g., "Tutorial Day - <session name>").
    """
    stmt = select(Invoice).where(
        Invoice.recipient_source_type == "registration",
        Invoice.is_active == True,
    )
    result = await db.execute(stmt)
    invoices = result.scalars().all()

    affected_invoices = []

    for invoice in invoices:
        if not invoice.line_items:
            continue

        # Extract item descriptions
        descriptions = [item["description"] for item in invoice.line_items]

        # Check for duplicates: base description + enhanced version with " - "
        seen_base = set()
        has_duplicate = False

        for desc in descriptions:
            # Check if this is an enhanced version (contains " - ")
            if " - " in desc:
                base = desc.split(" - ")[0]
                # Check if base version also exists
                if base in descriptions:
                    has_duplicate = True
                    break
            else:
                seen_base.add(desc)

        if has_duplicate:
            affected_invoices.append(invoice)

    return affected_invoices


async def print_invoice_details(db: AsyncSession, invoice: Invoice) -> None:
    """Print details about an affected invoice."""
    # Get registrations
    stmt = select(Registration).where(
        Registration.billing_profile_id == invoice.recipient_source_id
    )
    result = await db.execute(stmt)
    registrations = result.scalars().all()

    print(f"\n  Invoice: {invoice.invoice_number}")
    print(f"  Status: {invoice.status}")
    print(f"  Date: {invoice.issue_date}")
    print(f"  Recipient: {invoice.recipient_name}")
    print(f"  Total: {invoice.currency} {invoice.total:.2f}")
    print(f"  Registrations: {len(registrations)}")
    print(f"  Line items:")

    total = Decimal("0")
    for item in invoice.line_items:
        item_total = Decimal(str(item["total"]))
        total += item_total
        print(f"    - {item['description']}: {item['quantity']} x {invoice.currency} {item['unit_price']:.2f} = {invoice.currency} {item_total:.2f}")

    print(f"  Calculated total: {invoice.currency} {total:.2f}")

    # Calculate correct subtotal by removing duplicate base items
    # Strategy: Keep enhanced versions (with " - "), remove plain base items that have enhanced versions
    base_items_to_remove = set()
    enhanced_bases = set()

    # First pass: find all enhanced versions
    for item in invoice.line_items:
        desc = item["description"]
        if " - " in desc:
            base = desc.split(" - ")[0]
            enhanced_bases.add(base)

    # Second pass: identify base items to remove (those that have enhanced versions)
    for item in invoice.line_items:
        desc = item["description"]
        if " - " not in desc and desc in enhanced_bases:
            base_items_to_remove.add(desc)

    # Calculate correct subtotal
    correct_subtotal = Decimal("0")
    for item in invoice.line_items:
        desc = item["description"]
        if desc not in base_items_to_remove:
            correct_subtotal += Decimal(str(item["total"]))

    # Calculate correct total with tax
    if invoice.tax_rate and invoice.tax_rate > 0:
        tax_rate_decimal = Decimal(str(invoice.tax_rate))
        correct_tax = correct_subtotal * (tax_rate_decimal / Decimal("100"))
        correct_total_with_tax = correct_subtotal + correct_tax
    else:
        correct_total_with_tax = correct_subtotal

    overcharge_subtotal = total - correct_subtotal
    overcharge_total = Decimal(str(invoice.total)) - correct_total_with_tax if invoice.total else Decimal("0")

    print(f"  Correct subtotal (without duplicates): {invoice.currency} {correct_subtotal:.2f}")
    print(f"  Correct total with tax: {invoice.currency} {correct_total_with_tax:.2f}")
    print(f"  Overcharge (subtotal): {invoice.currency} {overcharge_subtotal:.2f}")
    print(f"  Overcharge (total with tax): {invoice.currency} {overcharge_total:.2f}")


async def main(dry_run: bool = True) -> None:
    """Main function to identify and optionally fix affected invoices."""
    async with async_session_maker() as db:
        print("Searching for invoices with double-invoicing bug...")
        affected = await find_double_invoiced_invoices(db)

        if not affected:
            print("\n✓ No affected invoices found!")
            return

        print(f"\nFound {len(affected)} affected invoice(s):")

        for invoice in affected:
            await print_invoice_details(db, invoice)

        if dry_run:
            print("\n" + "="*80)
            print("DRY RUN MODE - No changes made")
            print("="*80)
            print("\nTo fix these invoices:")
            print("1. Cancel the affected invoices manually via the admin UI")
            print("2. Regenerate invoices for the affected registrations")
            print("\nOr run this script with --fix flag to automate the process.")
            print("Note: This will cancel the old invoices and create credit notes.")
        else:
            print("\n" + "="*80)
            print("FIX MODE")
            print("="*80)
            print("\nTo fix these invoices, you'll need to:")
            print("1. Use the invoice cancellation feature in the admin UI")
            print("2. This will create credit notes for the overcharged amounts")
            print("3. Then regenerate correct invoices for the registrations")
            print("\nAutomatic fix not implemented yet - please use the admin UI.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Find and fix double-invoiced registrations")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Show what would be fixed without making changes (default)",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Actually fix the invoices (requires manual steps)",
    )

    args = parser.parse_args()

    # If --fix is specified, dry_run is False
    dry_run = not args.fix

    asyncio.run(main(dry_run=dry_run))
