"""Unit tests for score_utils.normalize_to_5."""

import pytest

from app.core.score_utils import normalize_to_5


def test_normalize_1_to_5_scale_is_noop() -> None:
    """Standard 1-5 scale maps to itself."""
    assert normalize_to_5(1.0, 1.0, 5.0) == pytest.approx(1.0)
    assert normalize_to_5(3.0, 1.0, 5.0) == pytest.approx(3.0)
    assert normalize_to_5(5.0, 1.0, 5.0) == pytest.approx(5.0)


def test_normalize_negative_recommendation_scale() -> None:
    """-2 to +2 recommendation scale maps evenly to 1-5."""
    assert normalize_to_5(-2.0, -2.0, 2.0) == pytest.approx(1.0)
    assert normalize_to_5(-1.0, -2.0, 2.0) == pytest.approx(2.0)
    assert normalize_to_5(0.0, -2.0, 2.0) == pytest.approx(3.0)
    assert normalize_to_5(1.0, -2.0, 2.0) == pytest.approx(4.0)
    assert normalize_to_5(2.0, -2.0, 2.0) == pytest.approx(5.0)


def test_normalize_degenerate_single_option_returns_midpoint() -> None:
    """When min == max the scale is degenerate; return the 1-5 midpoint."""
    assert normalize_to_5(4.0, 4.0, 4.0) == pytest.approx(3.0)
    assert normalize_to_5(0.0, 0.0, 0.0) == pytest.approx(3.0)


def test_normalize_0_to_10_scale() -> None:
    """0-10 scale maps correctly to 1-5."""
    assert normalize_to_5(0.0, 0.0, 10.0) == pytest.approx(1.0)
    assert normalize_to_5(5.0, 0.0, 10.0) == pytest.approx(3.0)
    assert normalize_to_5(10.0, 0.0, 10.0) == pytest.approx(5.0)
