"""Offline city geocoding using geonamescache.

Provides ~32,000 city lookups with lat/lng coordinates without any external
API calls. Used by the analytics module to place attendee cities on a map.
"""

from __future__ import annotations

import geonamescache  # type: ignore[import-untyped]

_gc = geonamescache.GeonamesCache()
_cities = _gc.get_cities()
_countries = _gc.get_countries()

# Index: (lowercase_city, country_code) → (lat, lng)
_city_country_index: dict[tuple[str, str], tuple[float, float]] = {}

# Index: lowercase_city → [(lat, lng, country_code, population)]
_city_index: dict[str, list[tuple[float, float, str, int]]] = {}


def _add_to_indexes(name_lower: str, cc: str, lat: float, lng: float, pop: int) -> None:
    if (name_lower, cc) not in _city_country_index:
        _city_country_index[(name_lower, cc)] = (lat, lng)
    _city_index.setdefault(name_lower, []).append((lat, lng, cc, pop))


# Build indexes from primary names + alternate names
for _cd in _cities.values():
    _name = _cd["name"].lower()
    _cc = _cd["countrycode"]
    _lat = _cd["latitude"]
    _lng = _cd["longitude"]
    _pop = _cd.get("population", 0)
    _add_to_indexes(_name, _cc, _lat, _lng, _pop)

    for _alt in _cd.get("alternatenames", []):
        _alt_lower = _alt.lower()
        # Skip very short alternate names (likely codes)
        if len(_alt_lower) >= 3:
            _add_to_indexes(_alt_lower, _cc, _lat, _lng, _pop)

# Country centroids: use capital city coordinates
_country_centroids: dict[str, tuple[float, float]] = {}
for _code, _info in _countries.items():
    _cap = (_info.get("capital") or "").lower()
    if _cap and _cap in _city_index:
        _best = max(_city_index[_cap], key=lambda x: x[3])
        _country_centroids[_code] = (_best[0], _best[1])


def geocode_city(city: str, country_code: str | None = None) -> tuple[float, float] | None:
    """Resolve a city name to (lat, lng).

    Fallback chain:
    1. Exact match with country code
    2. Exact match by name (highest population)
    3. Country centroid (capital city coords)
    """
    city_lower = city.strip().lower()
    if not city_lower:
        return None

    # 1. Exact match with country
    if country_code:
        cc = country_code.upper()
        coords = _city_country_index.get((city_lower, cc))
        if coords:
            return coords

    # 2. Exact match without country — pick highest population
    matches = _city_index.get(city_lower)
    if matches:
        if country_code:
            cc_matches = [m for m in matches if m[2] == country_code.upper()]
            if cc_matches:
                best = max(cc_matches, key=lambda x: x[3])
                return (best[0], best[1])
        best = max(matches, key=lambda x: x[3])
        return (best[0], best[1])

    # 3. Country centroid fallback
    if country_code and country_code.upper() in _country_centroids:
        return _country_centroids[country_code.upper()]

    return None


def get_country_name(code: str) -> str | None:
    """Get the full country name for an ISO-2 code."""
    info = _countries.get(code.upper())
    return info["name"] if info else None
