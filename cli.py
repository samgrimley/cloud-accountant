#!/usr/bin/env python3
"""Estimate barrister tax/VAT/NIC from a LEX receipts export.

Example:
    python cli.py --receipts sample/lex_receipts_sample.csv \
        --mapping config/lex_mapping.json --rates config/rates.json \
        --other-expenses-pct 0.05 --prior-liability 38000
"""

import argparse
import json
import sys

from chambers.dashboard import render, summarise
from chambers.rates import current_tax_year, load_rates_for
from chambers.sources import LexCsvSource


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--receipts", required=True, help="LEX receipts CSV export")
    p.add_argument("--mapping", required=True, help="JSON mapping of logical field -> CSV header")
    p.add_argument("--rates-dir", default="config/rates", help="Directory of per-tax-year rates files")
    p.add_argument("--tax-year", default=None, help="Tax-year label, e.g. 2026-27 (default: current)")
    p.add_argument("--other-expenses", type=float, default=0.0, help="Non-chambers expenses for the period (£)")
    p.add_argument("--other-expenses-pct", type=float, default=None, help="Non-chambers expenses as a fraction of turnover (e.g. 0.05)")
    p.add_argument("--input-vat", type=float, default=0.0, help="Recoverable input VAT for the period (£)")
    p.add_argument("--prior-liability", type=float, default=None, help="Prior-year income tax + Class 4 NIC, for payments on account (£)")
    args = p.parse_args(argv)

    with open(args.mapping, encoding="utf-8") as fh:
        mapping = json.load(fh)
    rates = load_rates_for(args.tax_year or current_tax_year(), args.rates_dir)

    source = LexCsvSource(args.receipts, mapping, rates["vat"]["standard_rate"])
    receipts = source.receipts()
    if not receipts:
        print("No receipts found in export.", file=sys.stderr)
        return 1

    other = args.other_expenses
    if args.other_expenses_pct is not None:
        other += sum(r.gross for r in receipts) * args.other_expenses_pct

    summary = summarise(
        receipts,
        rates,
        other_expenses=other,
        input_vat=args.input_vat,
        prior_liability=args.prior_liability,
    )
    print(render(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
