import os
import unittest
from datetime import date

from chambers.rates import (
    current_tax_year,
    load_rates_for,
    tax_year_label,
    tax_year_start,
)

ROOT = os.path.dirname(os.path.dirname(__file__))
RATES_DIR = os.path.join(ROOT, "config", "rates")


class TaxYearTests(unittest.TestCase):
    def test_start_before_6_april(self):
        self.assertEqual(tax_year_start(date(2026, 4, 5)), 2025)

    def test_start_on_6_april(self):
        self.assertEqual(tax_year_start(date(2026, 4, 6)), 2026)

    def test_label_format(self):
        self.assertEqual(tax_year_label(2026), "2026-27")
        self.assertEqual(tax_year_label(1999), "1999-00")

    def test_current_tax_year_for_date(self):
        self.assertEqual(current_tax_year(date(2026, 5, 21)), "2026-27")


class LoadRatesTests(unittest.TestCase):
    def test_load_by_label(self):
        rates = load_rates_for("2026-27", RATES_DIR)
        self.assertEqual(rates["tax_year"], "2026-27")

    def test_load_by_date(self):
        rates = load_rates_for(date(2026, 5, 21), RATES_DIR)
        self.assertEqual(rates["tax_year"], "2026-27")

    def test_missing_year_raises(self):
        with self.assertRaises(FileNotFoundError):
            load_rates_for("1990-91", RATES_DIR)


if __name__ == "__main__":
    unittest.main()
