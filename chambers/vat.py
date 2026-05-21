"""Standard-scheme VAT estimate from receipts (cash/receipts basis).

Barristers may account for VAT on fees received. Output VAT is the VAT element
of fees received; net VAT due is output less recoverable input VAT (which comes
from Xero/expenses and is supplied as a figure here).
"""


def vat_summary(receipts, input_vat=0.0):
    output_vat = sum(r.vat for r in receipts)
    return {
        "output_vat": output_vat,
        "input_vat": input_vat,
        "net_vat_due": output_vat - input_vat,
    }
