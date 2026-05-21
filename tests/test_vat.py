import unittest
from dataclasses import dataclass
from datetime import date

from chambers.vat import vat_summary


@dataclass
class FakeReceipt:
    vat: float
    gross: float = 0.0
    date: date = date(2025, 4, 6)


class VatTests(unittest.TestCase):
    def test_output_vat_sums_receipts(self):
        receipts = [FakeReceipt(vat=2400.0), FakeReceipt(vat=1700.0)]
        self.assertAlmostEqual(vat_summary(receipts)["output_vat"], 4100.0, places=2)

    def test_net_vat_after_input(self):
        receipts = [FakeReceipt(vat=4100.0)]
        result = vat_summary(receipts, input_vat=600.0)
        self.assertAlmostEqual(result["net_vat_due"], 3500.0, places=2)


if __name__ == "__main__":
    unittest.main()
