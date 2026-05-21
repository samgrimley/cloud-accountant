"""Receipt sources behind a common interface.

The estimator works on a normalised list of Receipt records and does not care
where they came from. LEX is the one source that may not expose an API, so it
has two implementations: a live connector (to be wired up once chambers
confirms API/DB access from the Mac mini) and a CSV-export fallback.
"""

from typing import List, Protocol

from .lex import Receipt, load_receipts


class ReceiptSource(Protocol):
    def receipts(self) -> List[Receipt]: ...


class LexCsvSource:
    """Read receipts from a LEX CSV export. The working fallback today."""

    def __init__(self, csv_path, mapping, vat_rate=0.20):
        self._csv_path = csv_path
        self._mapping = mapping
        self._vat_rate = vat_rate

    def receipts(self) -> List[Receipt]:
        return load_receipts(self._csv_path, self._mapping, self._vat_rate)


class LexApiSource:
    """Live LEX connector (REST API or read-only LAN database query).

    Stub until chambers confirms how the Mac mini can reach LEX. When it does,
    implement `receipts()` to map LEX rows onto Receipt records.
    """

    def __init__(self, **config):
        self._config = config

    def receipts(self) -> List[Receipt]:
        raise NotImplementedError(
            "LEX live connector not configured. Confirm with chambers whether "
            "the Mac mini can reach a LEX API or its database read-only, then "
            "implement this. Use LexCsvSource with an export in the meantime."
        )
