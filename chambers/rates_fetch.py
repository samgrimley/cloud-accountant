"""Refresh income-tax bands and the VAT rate from gov.uk.

gov.uk has no clean rates API, so we read the Content API JSON for the relevant
pages and parse the figures out of the page tables. Because that parsing is
brittle, this never silently overwrites a live rates file: by default it shows a
diff and only writes when you pass --promote (and only if validation passes).

Self-employed Class 4 NIC lives on a different page with a different layout and
is NOT auto-fetched; it is preserved from the existing file and must be checked
by hand each year.

Run on the always-on machine, e.g. weekly:
    python -m chambers.rates_fetch --year 2026-27            # dry run, shows diff
    python -m chambers.rates_fetch --year 2026-27 --promote  # writes if valid
"""

import argparse
import json
import os
import re
import urllib.request

from .rates import load_rates, current_tax_year
from .rates_validate import validate

GOVUK_API = "https://www.gov.uk/api/content/"
INCOME_TAX_SLUG = "income-tax-rates"
VAT_SLUG = "vat-rates"


def fetch_govuk(slug, opener=urllib.request.urlopen):
    req = urllib.request.Request(
        GOVUK_API + slug, headers={"User-Agent": "cloud-accountant-rates/1.0"}
    )
    with opener(req, timeout=20) as resp:
        return json.load(resp)


def _rows(body_html):
    for raw in re.findall(r"<tr>(.*?)</tr>", body_html, re.S | re.I):
        text = re.sub(r"<[^>]+>", " ", raw)
        yield re.sub(r"\s+", " ", text).strip()


def _amounts(text):
    return [float(a.replace(",", "")) for a in re.findall(r"£([\d,]+)", text)]


def _rates(text):
    return [float(p) / 100 for p in re.findall(r"(\d+(?:\.\d+)?)\s*%", text)]


def parse_income_tax(content):
    """Extract personal allowance and the rate bands from the page body."""
    body = content.get("details", {}).get("body", "")
    pa = None
    basic = higher = additional = None
    for row in _rows(body):
        low = row.lower()
        amounts, rates = _amounts(row), _rates(row)
        if "personal allowance" in low and amounts:
            pa = amounts[0]
        elif "basic rate" in low and amounts and rates:
            basic = {"name": "basic", "rate": rates[0], "upper": amounts[-1]}
        elif "higher rate" in low and amounts and rates:
            higher = {"name": "higher", "rate": rates[0], "upper": amounts[-1]}
        elif "additional rate" in low and rates:
            additional = {"name": "additional", "rate": rates[0], "upper": None}

    if not (pa and basic and higher and additional):
        raise ValueError(
            "Could not parse income-tax page; gov.uk layout may have changed. "
            "Check the page and update parse_income_tax()."
        )
    return {"personal_allowance": pa, "bands": [basic, higher, additional]}


def parse_vat(content):
    body = content.get("details", {}).get("body", "")
    for row in _rows(body):
        if "standard" in row.lower():
            rates = _rates(row)
            if rates:
                return rates[0]
    raise ValueError("Could not find the standard VAT rate on the VAT page.")


def build_candidate(base, income_tax_content, vat_content):
    """Overlay parsed figures onto a copy of the existing rates dict."""
    candidate = json.loads(json.dumps(base))  # deep copy
    parsed_it = parse_income_tax(income_tax_content)
    candidate["income_tax"]["personal_allowance"] = parsed_it["personal_allowance"]
    candidate["income_tax"]["bands"] = parsed_it["bands"]
    candidate["vat"]["standard_rate"] = parse_vat(vat_content)
    return candidate


def _flatten(d, prefix=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            out.update(_flatten(v, f"{prefix}{k}."))
    elif isinstance(d, list):
        for i, v in enumerate(d):
            out.update(_flatten(v, f"{prefix}{i}."))
    else:
        out[prefix.rstrip(".")] = d
    return out


def diff_rates(old, new):
    """Human-readable list of changed/added/removed leaf values."""
    fo, fn = _flatten(old), _flatten(new)
    lines = []
    for key in sorted(set(fo) | set(fn)):
        a, b = fo.get(key, "<absent>"), fn.get(key, "<absent>")
        if a != b:
            lines.append(f"  {key}: {a} -> {b}")
    return lines


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--year", default=None, help="Tax-year label, e.g. 2026-27 (default: current)")
    p.add_argument("--rates-dir", default="config/rates")
    p.add_argument("--promote", action="store_true", help="Write the candidate if it validates")
    p.add_argument("--income-fixture", help="Local JSON instead of fetching the income-tax page")
    p.add_argument("--vat-fixture", help="Local JSON instead of fetching the VAT page")
    args = p.parse_args(argv)

    year = args.year or current_tax_year()
    path = os.path.join(args.rates_dir, f"{year}.json")
    if not os.path.exists(path):
        print(f"No existing rates file at {path} to update.")
        return 1
    base = load_rates(path)

    def source(fixture, slug):
        if fixture:
            with open(fixture, encoding="utf-8") as fh:
                return json.load(fh)
        return fetch_govuk(slug)

    income = source(args.income_fixture, INCOME_TAX_SLUG)
    vat = source(args.vat_fixture, VAT_SLUG)
    candidate = build_candidate(base, income, vat)

    changes = diff_rates(base, candidate)
    if not changes:
        print(f"{year}: no change.")
        return 0

    print(f"{year}: proposed changes")
    print("\n".join(changes))

    problems = validate(candidate)
    if problems:
        print("\nVALIDATION FAILED - not promoting:")
        print("\n".join(f"  - {p}" for p in problems))
        return 2

    if args.promote:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(candidate, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print(f"\nPromoted -> {path}")
    else:
        print("\nDry run. Re-run with --promote to write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
