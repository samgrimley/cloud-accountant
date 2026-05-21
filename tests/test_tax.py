import json
import os
import unittest

from chambers.tax import class4_nic, income_tax, personal_allowance

ROOT = os.path.dirname(os.path.dirname(__file__))
with open(os.path.join(ROOT, "config", "rates", "2026-27.json"), encoding="utf-8") as fh:
    RATES = json.load(fh)
IT = RATES["income_tax"]
NIC = RATES["class4_nic"]


class IncomeTaxTests(unittest.TestCase):
    def test_below_personal_allowance(self):
        self.assertEqual(income_tax(10000, IT)["tax"], 0.0)

    def test_basic_rate(self):
        # 40000 - 12570 = 27430 @ 20%
        self.assertAlmostEqual(income_tax(40000, IT)["tax"], 5486.0, places=2)

    def test_higher_rate(self):
        # 7540 (basic) + 11892 (29730 @ 40%)
        self.assertAlmostEqual(income_tax(80000, IT)["tax"], 19432.0, places=2)

    def test_additional_rate_with_full_pa_taper(self):
        # PA fully tapered at 130000; 7540 + 29948 + 7843.5
        self.assertAlmostEqual(income_tax(130000, IT)["tax"], 45331.5, places=2)

    def test_pa_taper_midpoint(self):
        # 110000 -> PA reduced by 5000 to 7570
        self.assertAlmostEqual(personal_allowance(110000, IT), 7570.0, places=2)


class Class4NicTests(unittest.TestCase):
    def test_below_lower_limit(self):
        self.assertEqual(class4_nic(10000, NIC), 0.0)

    def test_main_band_only(self):
        # (40000 - 12570) @ 6%
        self.assertAlmostEqual(class4_nic(40000, NIC), 1645.8, places=2)

    def test_main_and_upper_band(self):
        # 37700 @ 6% + 29730 @ 2%
        self.assertAlmostEqual(class4_nic(80000, NIC), 2856.6, places=2)


if __name__ == "__main__":
    unittest.main()
