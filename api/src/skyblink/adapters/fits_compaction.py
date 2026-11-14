import io
from pathlib import Path

from astropy.io import fits

KEPT_EXTENSIONS = ("IMAGE", "FLAGS", "VARIANCE", "ZODI", "WCS-WAVE")


def _extension_names(hdul: fits.HDUList) -> list[str]:
    return [hdu.name for hdu in hdul[1:]]


def is_compact(path: Path) -> bool:
    with fits.open(path, lazy_load_hdus=True) as hdul:
        return set(_extension_names(hdul)) <= set(KEPT_EXTENSIONS)


def compact_fits(content: bytes) -> bytes:
    with fits.open(io.BytesIO(content)) as hdul:
        kept = [hdu.copy() for hdu in hdul[1:] if hdu.name in KEPT_EXTENSIONS]
        compact = fits.HDUList([fits.PrimaryHDU(header=hdul[0].header.copy()), *kept])
        buffer = io.BytesIO()
        compact.writeto(buffer)
    return buffer.getvalue()
