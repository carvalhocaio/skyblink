import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import numpy as np

IGNORED_BY_SPECTROPHOTOMETRY_TOOL = (
    "SUR_ERROR",
    "NONFUNC",
    "MISSING_DATA",
    "HOT",
    "COLD",
    "PERSIST",
    "BLOOM",
    "SNOWBALL",
    "HALO",
    "SATELLITE_HALO",
)
SATURATION = ("OVERFLOW", "NONLINEAR")
KNOWN_SOURCE = ("SOURCE",)

_NAME_CARD = re.compile(r"^MSKN(\d{4})$")


def parse_flag_bits(header: Mapping[str, object]) -> dict[str, int]:
    bits: dict[str, int] = {}
    for key in header:
        match = _NAME_CARD.match(key)
        if match:
            plane = match.group(1)
            bits[str(header[key]).strip()] = int(header.get(f"MSKM{plane}", 1 << int(plane)))
    return bits


def _combine(bits: Mapping[str, int], names: Iterable[str]) -> int:
    value = 0
    for name in names:
        value |= bits.get(name, 0)
    return value


@dataclass(frozen=True)
class FlagMasks:
    bad: int
    saturated: int
    source: int
    missing: tuple[str, ...]

    @classmethod
    def from_header(cls, header: Mapping[str, object]) -> "FlagMasks":
        bits = parse_flag_bits(header)
        wanted = IGNORED_BY_SPECTROPHOTOMETRY_TOOL + SATURATION + KNOWN_SOURCE
        return cls(
            bad=_combine(bits, IGNORED_BY_SPECTROPHOTOMETRY_TOOL),
            saturated=_combine(bits, SATURATION),
            source=_combine(bits, KNOWN_SOURCE),
            missing=tuple(name for name in wanted if name not in bits),
        )

    def bad_pixels(self, flags: np.ndarray) -> np.ndarray:
        return (flags & self.bad) != 0

    def saturated_pixels(self, flags: np.ndarray) -> np.ndarray:
        return (flags & self.saturated) != 0

    def source_pixels(self, flags: np.ndarray) -> np.ndarray:
        return (flags & self.source) != 0
