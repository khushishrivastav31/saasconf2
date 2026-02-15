"""Country-specific address formatting."""

# ISO 3166-1 alpha-2 country code → address format template
# Placeholders: {street}, {line2}, {postal_code}, {city}, {state}, {country}
# Lines are joined with newlines; empty lines are stripped.
_FORMATS: dict[str, str] = {
    # DACH: street, PLZ city, country
    "DE": "{street}\n{line2}\n{postal_code} {city}\n{country}",
    "AT": "{street}\n{line2}\n{postal_code} {city}\n{country}",
    "CH": "{street}\n{line2}\n{postal_code} {city}\n{country}",
    # North America: street, city, state ZIP, country
    "US": "{street}\n{line2}\n{city}, {state} {postal_code}\n{country}",
    "CA": "{street}\n{line2}\n{city}, {state} {postal_code}\n{country}",
    # UK: street, city, postcode, country
    "GB": "{street}\n{line2}\n{city}\n{postal_code}\n{country}",
    # France/Belgium: street, PLZ city, country
    "FR": "{street}\n{line2}\n{postal_code} {city}\n{country}",
    "BE": "{street}\n{line2}\n{postal_code} {city}\n{country}",
    "NL": "{street}\n{line2}\n{postal_code} {city}\n{country}",
    # Japan: postal, state, city, street, country
    "JP": "{postal_code}\n{state}{city}\n{street}\n{line2}\n{country}",
}

# Common country name → ISO code mapping (case-insensitive)
_COUNTRY_CODES: dict[str, str] = {
    "germany": "DE",
    "deutschland": "DE",
    "austria": "AT",
    "österreich": "AT",
    "switzerland": "CH",
    "schweiz": "CH",
    "united states": "US",
    "usa": "US",
    "united states of america": "US",
    "canada": "CA",
    "united kingdom": "GB",
    "uk": "GB",
    "great britain": "GB",
    "france": "FR",
    "belgium": "BE",
    "netherlands": "NL",
    "japan": "JP",
}


def _resolve_country_code(country: str | None, country_code: str | None = None) -> str | None:
    """Resolve a country name or code to ISO 3166-1 alpha-2."""
    if country_code and country_code.upper() in _FORMATS:
        return country_code.upper()
    if country:
        # Try exact 2-letter code
        if len(country) == 2 and country.upper() in _FORMATS:
            return country.upper()
        # Try name lookup
        return _COUNTRY_CODES.get(country.lower())
    return None


def format_address(
    *,
    address_line1: str | None = None,
    address_line2: str | None = None,
    city: str | None = None,
    state: str | None = None,
    postal_code: str | None = None,
    country: str | None = None,
    country_code: str | None = None,
) -> str | None:
    """Format an address according to the country's conventions.

    Falls back to comma-separated format if the country is unknown.
    """
    parts_any = [address_line1, address_line2, city, state, postal_code, country]
    if not any(p for p in parts_any):
        return None

    code = _resolve_country_code(country, country_code)

    if code and code in _FORMATS:
        template = _FORMATS[code]
        formatted = template.format(
            street=address_line1 or "",
            line2=address_line2 or "",
            postal_code=postal_code or "",
            city=city or "",
            state=state or "",
            country=country or "",
        )
        # Clean up: strip each line, remove blank lines, strip trailing commas
        lines = [line.strip().rstrip(",") for line in formatted.split("\n")]
        lines = [line for line in lines if line]
        return "\n".join(lines) if lines else None

    # Fallback: comma-separated (original behavior)
    parts = [p for p in parts_any if p]
    return ", ".join(parts) if parts else None
