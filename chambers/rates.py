"""Load tax-year rates and select the right year for a date.

A UK tax year runs 6 April to 5 April and is labelled by its two calendar
years, e.g. 2026-27. Rates files live in a directory, one per tax year:
config/rates/2026-27.json. Figures change each Budget - verify before relying.
"""

import json
import os
from datetime import date


def tax_year_start(d):
    """Return the calendar year in which `d`'s UK tax year began."""
    return d.year if (d.month, d.day) >= (4, 6) else d.year - 1


def tax_year_label(start_year):
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def current_tax_year(d=None):
    return tax_year_label(tax_year_start(d or date.today()))


def load_rates(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_rates_for(when, rates_dir):
    """Load the rates file for a tax-year label or a date."""
    label = when if isinstance(when, str) else current_tax_year(when)
    path = os.path.join(rates_dir, f"{label}.json")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No rates file for tax year {label} at {path}. "
            f"Create it or run chambers.rates_fetch to populate it."
        )
    return load_rates(path)
