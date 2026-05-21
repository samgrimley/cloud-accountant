"""Load a tax-year rates file. Figures change each Budget - verify before relying."""

import json


def load_rates(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
