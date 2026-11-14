from dataclasses import dataclass

import numpy as np
from astropy.visualization import AsinhStretch

LOW_PERCENTILE = 1.0
HIGH_PERCENTILE = 99.5
ASINH_SOFTENING = 0.1


@dataclass(frozen=True)
class StretchParams:
    vmin: float
    vmax: float
    softening: float = ASINH_SOFTENING

    @classmethod
    def from_image(
        cls, image: np.ndarray, low: float = LOW_PERCENTILE, high: float = HIGH_PERCENTILE
    ) -> "StretchParams":
        finite = image[np.isfinite(image)]
        if finite.size == 0:
            return cls(vmin=0.0, vmax=1.0)
        vmin, vmax = np.percentile(finite, [low, high])
        return cls(vmin=float(vmin), vmax=float(vmax if vmax > vmin else vmin + 1.0))

    def apply(self, image: np.ndarray) -> np.ndarray:
        scaled = np.clip((image - self.vmin) / (self.vmax - self.vmin), 0.0, 1.0)
        stretched = AsinhStretch(a=self.softening)(np.nan_to_num(scaled, nan=0.0), clip=True)
        return np.round(stretched * 255).astype(np.uint8)
