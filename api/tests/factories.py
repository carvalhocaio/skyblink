import io
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from skyblink.domain.models import Exposure


def make_exposure(
    obs_id: str = "2025W33_2C_0321_1",
    detector: str = "D6",
    mjd: float = 60902.0,
    collection: str = "spherex_dr1",
) -> Exposure:
    return Exposure(
        obs_id=obs_id,
        detector=detector,
        mjd=mjd,
        wavelength_um=(4.4115, 5.0096),
        access_url=f"https://irsa.example/{obs_id}{detector}.fits",
        collection=collection,
    )


def write_cutout(
    path: Path,
    wcs: WCS,
    image: np.ndarray,
    *,
    flags: np.ndarray | None = None,
    variance: np.ndarray | None = None,
    zodi: np.ndarray | None = None,
    planes: dict[int, str] | None = None,
    mjd: float | None = None,
) -> Path:
    header = wcs.to_header()
    if mjd is not None:
        header["MJD-AVG"] = mjd
    flags_header = header.copy()
    for plane, name in (planes or {}).items():
        flags_header[f"MSKN{plane:04d}"] = name
        flags_header[f"MSKM{plane:04d}"] = 1 << plane
    zeros = np.zeros(image.shape)
    fits.HDUList(
        [
            fits.PrimaryHDU(),
            fits.ImageHDU(image.astype(np.float32), header, name="IMAGE"),
            fits.ImageHDU((zeros if flags is None else flags).astype(np.int32), flags_header, name="FLAGS"),
            fits.ImageHDU(
                (zeros + 1 if variance is None else variance).astype(np.float32), header, name="VARIANCE"
            ),
            fits.ImageHDU((zeros if zodi is None else zodi).astype(np.float32), header, name="ZODI"),
        ]
    ).writeto(path)
    return path


def irsa_cutout_bytes(shape: tuple[int, int] = (7, 6), epsf_rows: int = 50) -> bytes:
    rng = np.random.default_rng(0)
    header = fits.Header({"BUNIT": "MJy / sr", "DETECTOR": 6})
    flags_header = fits.Header({"MSKN0001": "OVERFLOW", "MSKM0001": 2})
    epsf = fits.BinTableHDU.from_columns(
        [fits.Column(name="PSF", format="1089D", array=rng.normal(size=(epsf_rows, 1089)))], name="EPSF"
    )
    wave = fits.BinTableHDU.from_columns(
        [fits.Column(name="CVAL", format="9J", array=np.arange(9).reshape(1, 9))], name="WCS-WAVE"
    )
    buffer = io.BytesIO()
    fits.HDUList(
        [
            fits.PrimaryHDU(header=fits.Header({"VERSION": "7.0.5"})),
            fits.ImageHDU(rng.normal(size=shape).astype(np.float32), header, name="IMAGE"),
            fits.ImageHDU(np.zeros(shape, dtype=np.int32), flags_header, name="FLAGS"),
            fits.ImageHDU(np.ones(shape, dtype=np.float32), header, name="VARIANCE"),
            fits.ImageHDU(np.zeros(shape, dtype=np.float32), header, name="ZODI"),
            epsf,
            wave,
        ]
    ).writeto(buffer)
    return buffer.getvalue()
