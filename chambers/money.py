"""Parsing and formatting of GBP money values from LEX exports."""

import re


def parse_money(value):
    """Turn a LEX cell like '£1,234.56', '(1,234.56)' or '' into a float.

    Parentheses are treated as negative (accounting convention).
    """
    if value is None:
        return 0.0
    s = str(value).strip()
    if s == "":
        return 0.0
    negative = s.startswith("(") and s.endswith(")")
    s = re.sub(r"[^0-9.\-]", "", s)
    if s in ("", "-", "."):
        return 0.0
    amount = float(s)
    return -amount if negative else amount


def format_money(amount):
    return f"£{amount:,.2f}"
