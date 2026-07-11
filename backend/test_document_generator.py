"""Test _parse_markdown_outline parsing logic (no LLM calls required)."""
from services.document_generator import _parse_markdown_outline

SAMPLE = """# Quarterly Report
## Overview
- Revenue grew 12%
- Costs remained flat
## Financial Summary
| Quarter | Revenue |
| Q1 | 100 |
| Q2 | 112 |
"""


def test_title_and_sections():
    result = _parse_markdown_outline(SAMPLE)
    assert result["title"] == "Quarterly Report", result
    assert len(result["sections"]) == 2, result
    print("PASS: title and section count")


def test_bullets_section():
    result = _parse_markdown_outline(SAMPLE)
    overview = result["sections"][0]
    assert overview["heading"] == "Overview", overview
    assert overview["bullets"] == ["Revenue grew 12%", "Costs remained flat"], overview
    assert overview["table"] is None, overview
    print("PASS: bullets section parsed correctly")


def test_table_section():
    result = _parse_markdown_outline(SAMPLE)
    financials = result["sections"][1]
    assert financials["heading"] == "Financial Summary", financials
    assert financials["bullets"] == [], financials
    assert financials["table"] == [["Quarter", "Revenue"], ["Q1", "100"], ["Q2", "112"]], financials
    print("PASS: table section parsed correctly")


def test_untitled_fallback():
    result = _parse_markdown_outline("## Just a section\n- one bullet\n")
    assert result["title"] == "Untitled Document", result
    print("PASS: missing title falls back to 'Untitled Document'")


if __name__ == "__main__":
    test_title_and_sections()
    test_bullets_section()
    test_table_section()
    test_untitled_fallback()
    print("All document_generator parser tests passed.")
