"""Income tax and Class 4 NIC estimates for a sole-trader barrister (cash basis).

All figures are estimates to help you set money aside. They are not tax advice
and do not account for other income, reliefs, pension contributions, gift aid,
student loans, the High Income Child Benefit Charge, etc.
"""


def personal_allowance(income, it_rates):
    pa = it_rates["personal_allowance"]
    taper = it_rates["pa_taper_threshold"]
    if income > taper:
        pa = max(0.0, pa - (income - taper) / 2.0)
    return pa


def income_tax(income, it_rates):
    """Income tax on a single trading income figure, applying the tapered PA.

    Band widths are fixed by statute and do not move when the PA tapers, so they
    are derived from the *statutory* PA, not the tapered one.
    """
    pa = personal_allowance(income, it_rates)
    taxable = max(0.0, income - pa)
    bands = it_rates["bands"]
    statutory_pa = it_rates["personal_allowance"]
    basic_width = bands[0]["upper"] - statutory_pa
    higher_width = bands[1]["upper"] - bands[0]["upper"]

    remaining = taxable
    tax = 0.0
    slice_ = min(remaining, basic_width)
    tax += slice_ * bands[0]["rate"]
    remaining -= slice_
    slice_ = min(remaining, higher_width)
    tax += slice_ * bands[1]["rate"]
    remaining -= slice_
    tax += remaining * bands[2]["rate"]

    return {"personal_allowance": pa, "taxable_income": taxable, "tax": tax}


def class4_nic(profits, nic_rates):
    lpl = nic_rates["lower_profits_limit"]
    upl = nic_rates["upper_profits_limit"]
    if profits <= lpl:
        return 0.0
    main_band = min(profits, upl) - lpl
    nic = main_band * nic_rates["main_rate"]
    if profits > upl:
        nic += (profits - upl) * nic_rates["upper_rate"]
    return nic
