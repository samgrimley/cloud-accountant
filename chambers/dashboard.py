"""Build and render the 'how screwed am I in January' summary from receipts."""

from .money import format_money as fm
from .tax import class4_nic, income_tax
from .vat import vat_summary


def _period(receipts):
    dates = [r.date for r in receipts]
    if not dates:
        return 0, None, None
    start, end = min(dates), max(dates)
    return (end - start).days + 1, start, end


def summarise(receipts, rates, other_expenses=0.0, input_vat=0.0, prior_liability=None):
    days, start, end = _period(receipts)
    annualise = 365.0 / days if days else 1.0

    turnover = sum(r.gross for r in receipts)
    chambers_deductions = sum(r.chambers_deduction for r in receipts)
    net_profit = turnover - chambers_deductions - other_expenses
    annual_profit = net_profit * annualise

    it = income_tax(annual_profit, rates["income_tax"])
    nic = class4_nic(annual_profit, rates["class4_nic"])
    annual_liability = it["tax"] + nic
    set_aside_rate = annual_liability / annual_profit if annual_profit > 0 else 0.0

    vat = vat_summary(receipts, input_vat)

    poa = None
    threshold = rates["payments_on_account"]["threshold"]
    if prior_liability and prior_liability > threshold:
        poa = prior_liability / 2.0

    return {
        "period_days": days,
        "period_start": start,
        "period_end": end,
        "turnover": turnover,
        "chambers_deductions": chambers_deductions,
        "other_expenses": other_expenses,
        "net_profit": net_profit,
        "annual_profit": annual_profit,
        "income_tax": it["tax"],
        "class4_nic": nic,
        "annual_liability": annual_liability,
        "set_aside_rate": set_aside_rate,
        "set_aside_period": net_profit * set_aside_rate,
        "output_vat": vat["output_vat"],
        "input_vat": vat["input_vat"],
        "net_vat_due": vat["net_vat_due"],
        "payment_on_account": poa,
        "tax_year": rates.get("tax_year", "?"),
    }


def render(s):
    pct = f"{s['set_aside_rate'] * 100:.1f}%"
    lines = [
        f"Barrister tax/VAT estimate  (rates: {s['tax_year']})",
        "=" * 52,
        f"Period            {s['period_start']} to {s['period_end']} ({s['period_days']} days)",
        "",
        "Income (this period)",
        f"  Fees received (turnover)   {fm(s['turnover']):>14}",
        f"  Chambers deductions       {fm(-s['chambers_deductions']):>14}",
        f"  Other expenses            {fm(-s['other_expenses']):>14}",
        f"  Net profit                {fm(s['net_profit']):>14}",
        "",
        f"Annualised projection        {fm(s['annual_profit']):>14}",
        f"  Income tax                {fm(s['income_tax']):>14}",
        f"  Class 4 NIC               {fm(s['class4_nic']):>14}",
        f"  Total liability           {fm(s['annual_liability']):>14}",
        f"  Effective set-aside rate  {pct:>14}",
        "",
        f"Set aside from this period   {fm(s['set_aside_period']):>14}",
        "",
        "VAT (standard scheme, this period)",
        f"  Output VAT                {fm(s['output_vat']):>14}",
        f"  Input VAT (supplied)      {fm(-s['input_vat']):>14}",
        f"  Net VAT due               {fm(s['net_vat_due']):>14}",
    ]
    if s["payment_on_account"] is not None:
        lines += [
            "",
            "Payments on account (from prior-year liability)",
            f"  Due 31 Jan                {fm(s['payment_on_account']):>14}",
            f"  Due 31 Jul                {fm(s['payment_on_account']):>14}",
        ]
    lines += [
        "",
        "Estimate only - not tax advice. Verify rates and figures with HMRC",
        "or your accountant before relying on them.",
    ]
    return "\n".join(lines)
