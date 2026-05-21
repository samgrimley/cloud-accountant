"""Sanity-check a rates dict so a bad fetch can't silently corrupt the maths."""


def validate(rates):
    """Return a list of human-readable problems. Empty list means it's sane."""
    problems = []

    it = rates.get("income_tax", {})
    pa = it.get("personal_allowance")
    taper = it.get("pa_taper_threshold")
    if not isinstance(pa, (int, float)) or pa <= 0:
        problems.append(f"income_tax.personal_allowance should be positive, got {pa!r}")
    if not isinstance(taper, (int, float)) or (isinstance(pa, (int, float)) and taper <= pa):
        problems.append(f"income_tax.pa_taper_threshold should exceed the personal allowance, got {taper!r}")

    bands = it.get("bands", [])
    if len(bands) < 2:
        problems.append("income_tax.bands should list at least two bands")
    last_upper = pa if isinstance(pa, (int, float)) else 0
    for i, band in enumerate(bands):
        rate = band.get("rate")
        upper = band.get("upper")
        if not isinstance(rate, (int, float)) or not (0 <= rate <= 1):
            problems.append(f"band {i} rate should be between 0 and 1, got {rate!r}")
        is_last = i == len(bands) - 1
        if is_last:
            if upper is not None:
                problems.append("the top income-tax band should have upper = null")
        else:
            if not isinstance(upper, (int, float)):
                problems.append(f"band {i} upper should be a number, got {upper!r}")
            elif upper <= last_upper:
                problems.append(f"band {i} upper ({upper}) should exceed the previous threshold ({last_upper})")
            else:
                last_upper = upper

    nic = rates.get("class4_nic", {})
    lpl, upl = nic.get("lower_profits_limit"), nic.get("upper_profits_limit")
    if not isinstance(lpl, (int, float)) or not isinstance(upl, (int, float)) or upl <= lpl:
        problems.append(f"class4_nic upper_profits_limit should exceed lower_profits_limit, got {lpl!r}/{upl!r}")
    for key in ("main_rate", "upper_rate"):
        r = nic.get(key)
        if not isinstance(r, (int, float)) or not (0 <= r < 1):
            problems.append(f"class4_nic.{key} should be between 0 and 1, got {r!r}")

    vat_rate = rates.get("vat", {}).get("standard_rate")
    if not isinstance(vat_rate, (int, float)) or not (0 < vat_rate < 1):
        problems.append(f"vat.standard_rate should be between 0 and 1, got {vat_rate!r}")

    return problems
