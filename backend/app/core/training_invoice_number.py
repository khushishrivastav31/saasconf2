"""Training invoice number generation.

Generates invoice numbers from tenant training_finance settings.
Uses row-level locking on the tenant to prevent race conditions.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.tenant import Tenant


async def generate_training_invoice_number(
    db: AsyncSession,
    tenant_id: UUID,
) -> str:
    """Generate next training invoice number from tenant finance template.

    Template variables: [YYYY], [MM], [DD], [Count]
    Default template: TR-[YYYY]-[Count]
    """
    # Lock tenant row to prevent race conditions
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id).with_for_update())
    tenant = result.scalar_one()
    settings = tenant.settings or {}
    finance = settings.get("training_finance", {})

    template = finance.get("invoice_number_template", "TR-[YYYY]-[Count]")
    reset_mode = finance.get("invoice_counter_reset", "yearly")
    counter = finance.get("invoice_counter_value", 1)
    last_reset = finance.get("invoice_counter_last_reset")

    # Check if counter needs reset
    now = datetime.now(UTC)
    should_reset = False

    if last_reset is None:
        should_reset = True
    else:
        last_reset_dt = datetime.fromisoformat(last_reset)
        if reset_mode == "yearly":
            if now.year > last_reset_dt.year:
                should_reset = True
        elif reset_mode == "daily":
            days_since_monday = now.weekday()
            last_monday = now - timedelta(days=days_since_monday)
            if last_monday.date() > last_reset_dt.date():
                should_reset = True

    if should_reset:
        counter = 1

    # Replace template variables
    number = template
    number = number.replace("[YYYY]", str(now.year))
    number = number.replace("[MM]", str(now.month).zfill(2))
    number = number.replace("[DD]", str(now.day).zfill(2))
    number = number.replace("[Count]", str(counter).zfill(5))

    # Update counter
    finance["invoice_counter_value"] = counter + 1
    if should_reset:
        finance["invoice_counter_last_reset"] = now.isoformat()
    settings["training_finance"] = finance
    tenant.settings = settings
    flag_modified(tenant, "settings")

    return number
