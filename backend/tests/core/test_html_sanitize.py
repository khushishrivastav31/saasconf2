"""Tests for HTML sanitization (app/core/html_sanitize.py).

Pure unit tests — no database or async required.
"""

from app.core.html_sanitize import sanitize_html


class TestStripsDangerousTags:
    """Verify that dangerous HTML tags/attributes are removed."""

    def test_strips_script_tags(self) -> None:
        result = sanitize_html("<p>Hello</p><script>alert('xss')</script>")
        assert "<script>" not in result
        assert "alert" not in result
        assert "<p>Hello</p>" in result

    def test_strips_onclick_handlers(self) -> None:
        result = sanitize_html('<button onclick="alert(1)">Click</button>')
        assert "onclick" not in result

    def test_strips_onerror_on_img(self) -> None:
        result = sanitize_html('<img src="x.png" onerror="alert(1)">')
        assert "onerror" not in result
        # img tag itself should be preserved (allowed tag)
        assert "<img" in result

    def test_strips_iframe(self) -> None:
        result = sanitize_html('<iframe src="https://evil.com"></iframe>')
        assert "<iframe" not in result

    def test_strips_javascript_url_in_href(self) -> None:
        result = sanitize_html('<a href="javascript:alert(1)">click</a>')
        # The javascript: URL scheme should be removed
        assert "javascript:" not in result

    def test_strips_data_uri_script(self) -> None:
        result = sanitize_html('<a href="data:text/html,<script>alert(1)</script>">click</a>')
        assert "data:" not in result
        assert "<script>" not in result

    def test_strips_style_tag(self) -> None:
        result = sanitize_html("<style>body { display: none; }</style><p>Hi</p>")
        assert "<style>" not in result
        assert "<p>Hi</p>" in result

    def test_strips_form_tag(self) -> None:
        result = sanitize_html('<form action="https://evil.com"><input type="text"></form>')
        assert "<form" not in result
        assert "<input" not in result

    def test_strips_event_handlers_comprehensively(self) -> None:
        handlers = [
            '<div onmouseover="alert(1)">hover</div>',
            '<input onfocus="alert(1)">',
            '<body onload="alert(1)">',
            '<img src="x" onmouseout="alert(1)">',
        ]
        for html in handlers:
            result = sanitize_html(html)
            assert "onmouseover" not in result
            assert "onfocus" not in result
            assert "onload" not in result
            assert "onmouseout" not in result

    def test_nested_script_bypass(self) -> None:
        # Attempt to sneak script tag through nesting
        payloads = [
            "<scr<script>ipt>alert(1)</scr</script>ipt>",
            "<<script>script>alert(1)</<script>script>",
            '<img src="x" onerror="aler&#116;(1)">',
        ]
        for payload in payloads:
            result = sanitize_html(payload)
            assert "<script>" not in result

    def test_svg_onload_stripped(self) -> None:
        result = sanitize_html('<svg onload="alert(1)"><circle r="10"/></svg>')
        assert "onload" not in result
        # svg is not in allowed tags
        assert "<svg" not in result


class TestPreservesSafeTags:
    """Verify that safe/allowed HTML is preserved."""

    def test_preserves_safe_tags(self) -> None:
        html = '<p>Hello <strong>world</strong> <em>italic</em> <a href="https://example.com">link</a></p>'
        result = sanitize_html(html)
        assert "<p>" in result
        assert "<strong>" in result
        assert "<em>" in result
        assert '<a href="https://example.com"' in result

    def test_preserves_allowed_attributes(self) -> None:
        html = '<a href="https://example.com" title="Example" target="_blank">link</a>'
        result = sanitize_html(html)
        assert 'href="https://example.com"' in result
        assert 'title="Example"' in result
        assert 'target="_blank"' in result

    def test_preserves_table_tags(self) -> None:
        html = "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>"
        result = sanitize_html(html)
        assert "<table>" in result
        assert "<thead>" in result
        assert "<tbody>" in result
        assert "<tr>" in result
        assert "<th>" in result
        assert "<td>" in result

    def test_adds_noopener_to_links(self) -> None:
        html = '<a href="https://example.com">link</a>'
        result = sanitize_html(html)
        assert 'rel="noopener noreferrer"' in result


class TestEmptyInput:
    """Verify handling of empty/falsy input."""

    def test_empty_input_returns_empty(self) -> None:
        result = sanitize_html("")
        assert result == ""

    def test_none_like_input(self) -> None:
        # The function checks `if not html` — empty string is falsy
        result = sanitize_html("")
        assert result == ""
