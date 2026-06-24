"""Utilities for normalizing review scores."""


def normalize_to_5(raw: float, min_val: float, max_val: float) -> float:
    """Map a score from any numeric scale onto the standard 1-5 range."""
    if max_val == min_val:
        return 3.0
    return (raw - min_val) / (max_val - min_val) * 4.0 + 1.0
