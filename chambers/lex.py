"""Import a LEX receipts export into a normalised list of Receipt records.

LEX column headings vary by chambers, so the mapping from logical field ->
actual CSV header is supplied externally (see config/lex_mapping.json).
"""

import csv
from dataclasses import dataclass
from datetime import date, datetime

from .money import parse_money

# Logical fields we understand. Only `date` and `gross` are required.
REQUIRED_FIELDS = ("date", "gross")
OPTIONAL_FIELDS = ("vat", "chambers_deduction", "client", "matter", "fee_note")

_DATE_FORMATS = ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%b-%Y", "%d %b %Y")


@dataclass
class Receipt:
    date: date
    gross: float            # professional fee received, excluding VAT
    vat: float              # output VAT on that fee
    chambers_deduction: float  # rent/admin retained by chambers (an expense)
    client: str = ""
    matter: str = ""
    fee_note: str = ""


def _parse_date(value):
    s = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {value!r}")


def load_receipts(csv_path, mapping, vat_rate=0.20):
    """Read `csv_path` using `mapping` (logical field -> CSV header).

    If a VAT column is not mapped, output VAT is derived as gross * vat_rate.
    """
    for field in REQUIRED_FIELDS:
        if field not in mapping:
            raise ValueError(f"mapping is missing required field {field!r}")

    receipts = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        missing = [h for h in mapping.values() if h not in reader.fieldnames]
        if missing:
            raise ValueError(
                f"CSV is missing mapped column(s): {missing}. "
                f"Available columns: {reader.fieldnames}"
            )
        for row in reader:
            gross = parse_money(row[mapping["gross"]])
            if "vat" in mapping:
                vat = parse_money(row[mapping["vat"]])
            else:
                vat = round(gross * vat_rate, 2)
            receipts.append(
                Receipt(
                    date=_parse_date(row[mapping["date"]]),
                    gross=gross,
                    vat=vat,
                    chambers_deduction=parse_money(row[mapping["chambers_deduction"]])
                    if "chambers_deduction" in mapping
                    else 0.0,
                    client=row.get(mapping.get("client", ""), "").strip(),
                    matter=row.get(mapping.get("matter", ""), "").strip(),
                    fee_note=row.get(mapping.get("fee_note", ""), "").strip(),
                )
            )
    return receipts
