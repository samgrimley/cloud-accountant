import copy
import json
import os
import unittest

from chambers.rates import load_rates
from chambers.rates_fetch import (
    build_candidate,
    diff_rates,
    parse_income_tax,
    parse_vat,
)
from chambers.rates_validate import validate

ROOT = os.path.dirname(os.path.dirname(__file__))
FIXTURES = os.path.join(ROOT, "tests", "fixtures")


def _fixture(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as fh:
        return json.load(fh)


BASE = load_rates(os.path.join(ROOT, "config", "rates", "2026-27.json"))
INCOME = _fixture("govuk_income_tax.json")
VAT = _fixture("govuk_vat.json")


class ParseTests(unittest.TestCase):
    def test_parse_income_tax(self):
        parsed = parse_income_tax(INCOME)
        self.assertEqual(parsed["personal_allowance"], 12570)
        self.assertEqual(parsed["bands"][0], {"name": "basic", "rate": 0.20, "upper": 50270})
        self.assertEqual(parsed["bands"][1]["upper"], 125140)
        self.assertIsNone(parsed["bands"][2]["upper"])

    def test_parse_vat(self):
        self.assertEqual(parse_vat(VAT), 0.20)

    def test_parse_raises_on_changed_layout(self):
        with self.assertRaises(ValueError):
            parse_income_tax({"details": {"body": "<p>no table here</p>"}})


class CandidateTests(unittest.TestCase):
    def test_matching_data_yields_no_diff(self):
        candidate = build_candidate(BASE, INCOME, VAT)
        self.assertEqual(diff_rates(BASE, candidate), [])

    def test_changed_pa_shows_in_diff_and_validates(self):
        bumped = copy.deepcopy(INCOME)
        bumped["details"]["body"] = bumped["details"]["body"].replace("£12,570", "£13,000")
        candidate = build_candidate(BASE, bumped, VAT)
        diff = diff_rates(BASE, candidate)
        self.assertIn("  income_tax.personal_allowance: 12570 -> 13000.0", diff)
        self.assertEqual(validate(candidate), [])


class ValidateTests(unittest.TestCase):
    def test_base_is_valid(self):
        self.assertEqual(validate(BASE), [])

    def test_non_increasing_bands_rejected(self):
        bad = copy.deepcopy(BASE)
        bad["income_tax"]["bands"][1]["upper"] = 40000  # below basic upper
        self.assertTrue(validate(bad))

    def test_out_of_range_vat_rejected(self):
        bad = copy.deepcopy(BASE)
        bad["vat"]["standard_rate"] = 20  # should be 0.20
        self.assertTrue(validate(bad))


if __name__ == "__main__":
    unittest.main()
