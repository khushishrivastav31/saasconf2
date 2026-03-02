"""VAT number validation using stdnum, regex, and VIES API.

Three-stage validation cascade:
1. python-stdnum (offline, fast) - validates format + checksum
2. Regex fallback - basic format check per country if stdnum fails
3. VIES API (ec.europa.eu) - online verification against EU registry
"""

from __future__ import annotations

import re
from typing import Any

EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI",
    "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
    "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
}

# Country code → VAT prefix mapping
COUNTRY_VAT_PREFIX: dict[str, str] = {
    "AT": "AT", "BE": "BE", "BG": "BG", "HR": "HR", "CY": "CY",
    "CZ": "CZ", "DK": "DK", "EE": "EE", "FI": "FI", "FR": "FR",
    "DE": "DE", "GR": "EL", "HU": "HU", "IE": "IE", "IT": "IT",
    "LV": "LV", "LT": "LT", "LU": "LU", "MT": "MT", "NL": "NL",
    "PL": "PL", "PT": "PT", "RO": "RO", "SK": "SK", "SI": "SI",
    "ES": "ES", "SE": "SE",
}

# Basic regex patterns per country prefix
VAT_REGEX: dict[str, str] = {
    "AT": r"^ATU\d{8}$",
    "BE": r"^BE[01]\d{9}$",
    "BG": r"^BG\d{9,10}$",
    "HR": r"^HR\d{11}$",
    "CY": r"^CY\d{8}[A-Z]$",
    "CZ": r"^CZ\d{8,10}$",
    "DK": r"^DK\d{8}$",
    "EE": r"^EE\d{9}$",
    "FI": r"^FI\d{8}$",
    "FR": r"^FR[A-Z0-9]{2}\d{9}$",
    "DE": r"^DE\d{9}$",
    "EL": r"^EL\d{9}$",
    "HU": r"^HU\d{8}$",
    "IE": r"^IE\d{7}[A-Z]{1,2}$|^IE\d[A-Z]\d{5}[A-Z]$",
    "IT": r"^IT\d{11}$",
    "LV": r"^LV\d{11}$",
    "LT": r"^LT\d{9,12}$",
    "LU": r"^LU\d{8}$",
    "MT": r"^MT\d{8}$",
    "NL": r"^NL\d{9}B\d{2}$",
    "PL": r"^PL\d{10}$",
    "PT": r"^PT\d{9}$",
    "RO": r"^RO\d{2,10}$",
    "SK": r"^SK\d{10}$",
    "SI": r"^SI\d{8}$",
    "ES": r"^ES[A-Z0-9]\d{7}[A-Z0-9]$",
    "SE": r"^SE\d{12}$",
}

# Full country name → ISO code mapping (common names)
COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "AUSTRIA": "AT", "BELGIUM": "BE", "BULGARIA": "BG", "CROATIA": "HR",
    "CYPRUS": "CY", "CZECH REPUBLIC": "CZ", "CZECHIA": "CZ",
    "DENMARK": "DK", "ESTONIA": "EE", "FINLAND": "FI", "FRANCE": "FR",
    "GERMANY": "DE", "GREECE": "GR", "HUNGARY": "HU", "IRELAND": "IE",
    "ITALY": "IT", "LATVIA": "LV", "LITHUANIA": "LT", "LUXEMBOURG": "LU",
    "MALTA": "MT", "NETHERLANDS": "NL", "THE NETHERLANDS": "NL",
    "POLAND": "PL", "PORTUGAL": "PT", "ROMANIA": "RO",
    "SLOVAKIA": "SK", "SLOVENIA": "SI", "SPAIN": "ES", "SWEDEN": "SE",
}


def normalize_country(country: str) -> str | None:
    """Convert a country name or code to a 2-letter ISO code. Returns None if unrecognized."""
    upper = country.strip().upper()
    if upper in EU_COUNTRIES:
        return upper
    return COUNTRY_NAME_TO_CODE.get(upper)


def normalize_vat(vat: str) -> str:
    """Strip whitespace, dots, dashes and uppercase."""
    return vat.replace(" ", "").replace(".", "").replace("-", "").upper()


def validate_stdnum(vat: str) -> bool | None:
    """Validate with python-stdnum. Returns True/False or None if not applicable."""
    try:
        from stdnum.eu import vat as eu_vat

        return eu_vat.is_valid(vat)  # type: ignore[no-any-return]
    except Exception:
        return None


def validate_regex(vat: str, country: str) -> bool:
    """Validate VAT format with regex for the given country."""
    prefix = COUNTRY_VAT_PREFIX.get(country)
    if not prefix:
        return False
    pattern = VAT_REGEX.get(prefix)
    if not pattern:
        return False
    return bool(re.match(pattern, vat))


async def validate_vies(vat: str) -> bool | None:
    """Check VAT number against the EU VIES service. Returns True/False or None on error."""
    import httpx

    country_code = vat[:2]
    number = vat[2:]

    url = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number"
    payload = {"countryCode": country_code, "vatNumber": number}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code == 200:
                data = response.json()
                return data.get("valid", False)  # type: ignore[no-any-return]
    except Exception:
        pass
    return None


async def validate_vat_number(vat_number: str, country: str) -> dict[str, Any]:
    """Run the full 3-stage VAT validation cascade.

    Args:
        vat_number: Raw VAT number string.
        country: 2-letter ISO country code OR full country name.

    Returns:
        Dict with keys: valid (True/False/None), method, vat_normalized, message (optional).
    """
    # Resolve country
    country_code = normalize_country(country)
    if not country_code:
        return {"valid": None, "method": None, "message": f"Country \"{country}\" is not a recognized EU country"}

    if country_code not in EU_COUNTRIES:
        return {"valid": None, "method": None, "message": "Country is not in the EU"}

    vat = normalize_vat(vat_number)
    # Ensure country prefix is present
    expected_prefix = COUNTRY_VAT_PREFIX.get(country_code, country_code)
    if not vat.startswith(expected_prefix):
        vat = expected_prefix + vat

    # Stage 1: python-stdnum (format + checksum)
    stdnum_result = validate_stdnum(vat)
    if stdnum_result is True:
        return {"valid": True, "method": "stdnum", "vat_normalized": vat}
    if stdnum_result is False:
        # Stage 2: regex fallback (more lenient)
        if validate_regex(vat, country_code):
            # Stage 3: VIES API for definitive answer
            vies_result = await validate_vies(vat)
            if vies_result is True:
                return {"valid": True, "method": "vies", "vat_normalized": vat}
            if vies_result is False:
                return {"valid": False, "method": "vies", "vat_normalized": vat}
            return {
                "valid": None,
                "method": "regex",
                "vat_normalized": vat,
                "message": "Format OK but could not verify online",
            }
        return {"valid": False, "method": "stdnum", "vat_normalized": vat}

    # stdnum returned None (error/not applicable) — fall through to regex + VIES
    if validate_regex(vat, country_code):
        vies_result = await validate_vies(vat)
        if vies_result is True:
            return {"valid": True, "method": "vies", "vat_normalized": vat}
        if vies_result is False:
            return {"valid": False, "method": "vies", "vat_normalized": vat}
        return {
            "valid": None,
            "method": "regex",
            "vat_normalized": vat,
            "message": "Format OK but could not verify online",
        }

    return {"valid": False, "method": "regex", "vat_normalized": vat}
