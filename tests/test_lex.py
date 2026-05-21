import json
import os
import unittest

from chambers.lex import load_receipts
from chambers.money import parse_money

ROOT = os.path.dirname(os.path.dirname(__file__))
SAMPLE = os.path.join(ROOT, "sample", "lex_receipts_sample.csv")
with open(os.path.join(ROOT, "config", "lex_mapping.json"), encoding="utf-8") as fh:
    MAPPING = json.load(fh)


class MoneyTests(unittest.TestCase):
    def test_parse_currency_string(self):
        self.assertEqual(parse_money("£12,000.00"), 12000.0)

    def test_parse_parentheses_as_negative(self):
        self.assertEqual(parse_money("(1,234.56)"), -1234.56)

    def test_parse_blank(self):
        self.assertEqual(parse_money(""), 0.0)


class LexImportTests(unittest.TestCase):
    def test_loads_all_rows(self):
        receipts = load_receipts(SAMPLE, MAPPING)
        self.assertEqual(len(receipts), 14)

    def test_first_row_fields(self):
        r = load_receipts(SAMPLE, MAPPING)[0]
        self.assertEqual(r.gross, 12000.0)
        self.assertEqual(r.vat, 2400.0)
        self.assertEqual(r.chambers_deduction, 1800.0)
        self.assertEqual(r.client, "Acme Solicitors LLP")

    def test_derives_vat_when_unmapped(self):
        mapping = {k: v for k, v in MAPPING.items() if k != "vat"}
        r = load_receipts(SAMPLE, mapping, vat_rate=0.20)[0]
        self.assertAlmostEqual(r.vat, 2400.0, places=2)


if __name__ == "__main__":
    unittest.main()
