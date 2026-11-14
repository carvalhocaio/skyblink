import math
from dataclasses import dataclass

from astropy.wcs import WCS

from skyblink.domain.models import Target

SPHEREX_PIXEL_ARCSEC = 6.15


@dataclass(frozen=True)
class FrameGrid:
    wcs: WCS
    shape: tuple[int, int]

    @classmethod
    def centered_on(cls, target: Target, pixel_arcsec: float = SPHEREX_PIXEL_ARCSEC) -> "FrameGrid":
        side = math.ceil(target.fov_arcmin * 60 / pixel_arcsec)
        side += 1 - side % 2
        pixel_deg = pixel_arcsec / 3600
        wcs = WCS(naxis=2)
        wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        wcs.wcs.crval = [target.ra, target.dec]
        wcs.wcs.crpix = [(side + 1) / 2, (side + 1) / 2]
        wcs.wcs.cdelt = [-pixel_deg, pixel_deg]
        return cls(wcs=wcs, shape=(side, side))

    @property
    def cutout_size_deg(self) -> float:
        side_deg = self.shape[0] * abs(self.wcs.wcs.cdelt[1])
        return round(side_deg * math.sqrt(2), 4)
