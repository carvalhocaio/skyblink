import dataclasses
import zlib
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from astropy.wcs import WCS

from skyblink.domain.astrometry import CENTROID_HALF_WIDTH, Drift, centroid, frame_centre, frame_noise
from skyblink.domain.grid import SPHEREX_PIXEL_ARCSEC
from skyblink.domain.proper_motion import StellarAstrometry, apparent_position
from skyblink.domain.stacking import weighted_mean_stack

MOTION_MIN_SNR = 10.0
BOOTSTRAP_RESAMPLES = 50
MIN_EXPOSURES_FOR_ERROR = 3
DAYS_PER_YEAR = 365.25
MIN_SIGMA_PX = 1e-3


class MotionUnavailable(Exception):
    pass


@dataclass(frozen=True)
class SeasonFrame:
    season_id: int
    frame_id: str
    mid_mjd: float
    image: np.ndarray
    exposure_data: np.ndarray
    exposure_variance: np.ndarray
    drift: Drift | None


@dataclass(frozen=True)
class SeasonMotion:
    season_id: int
    frame_id: str
    mid_mjd: float
    snr: float
    drift_corrected: bool
    position_px: tuple[float, float]
    position_err_px: tuple[float, float]
    offset_px: tuple[float, float]
    offset_err_px: tuple[float, float]
    predicted_offset_px: tuple[float, float] | None = None
    residual_sigma: float | None = None


@dataclass(frozen=True)
class CatalogSource:
    catalog: str
    object: str
    coordinates_source: str
    pmra_mas_yr: float
    pmdec_mas_yr: float
    parallax_mas: float | None
    radial_velocity_km_s: float | None


@dataclass(frozen=True)
class CatalogComparison:
    source: CatalogSource
    predicted_rate_arcsec_yr: float
    rate_residual_sigma: float


@dataclass(frozen=True)
class Motion:
    detector: str
    reference_season_id: int
    seasons: tuple[SeasonMotion, ...]
    rate_arcsec_yr: float
    rate_err_arcsec_yr: float
    prediction: CatalogComparison | None = None
    prediction_reason: str | None = None


def peak_snr(image: np.ndarray, xy: tuple[float, float], half: int = CENTROID_HALF_WIDTH) -> float:
    col, row = round(xy[0]), round(xy[1])
    box = image[max(row - half, 0) : row + half + 1, max(col - half, 0) : col + half + 1]
    noise = frame_noise(image)
    return float(np.nanmax(box) / noise) if noise > 0 and np.isfinite(box).any() else 0.0


def bootstrap_centroid(
    data: np.ndarray,
    variance: np.ndarray,
    guess: tuple[float, float],
    samples: int,
    rng: np.random.Generator,
) -> tuple[float, float]:
    n = data.shape[0]
    found = []
    for _ in range(samples):
        pick = rng.integers(0, n, n)
        position = centroid(weighted_mean_stack(data[pick], variance[pick]).image, guess)
        if position is not None:
            found.append(position)
    if len(found) < samples / 2:
        raise MotionUnavailable("the centroid failed in most bootstrap resamples")
    spread = np.std(np.array(found), axis=0, ddof=1)
    return float(spread[0]), float(spread[1])


def seed_for(season_id: int, mid_mjd: float) -> int:
    return zlib.crc32(f"{season_id}:{mid_mjd:.6f}".encode())


def _measure_season(frame: SeasonFrame, samples: int) -> SeasonMotion:
    found = centroid(frame.image, frame_centre(frame.image))
    if found is None:
        raise MotionUnavailable(f"no usable centroid at the centre in season {frame.season_id}")
    snr = peak_snr(frame.image, found)
    if not snr >= MOTION_MIN_SNR:
        raise MotionUnavailable(
            f"source too faint for a reliable centroid in season {frame.season_id} "
            f"(peak S/N {snr:.1f} < {MOTION_MIN_SNR:.0f})"
        )
    n = frame.exposure_data.shape[0]
    if n < MIN_EXPOSURES_FOR_ERROR:
        raise MotionUnavailable(
            f"season {frame.season_id} has {n} exposures; "
            f"{MIN_EXPOSURES_FOR_ERROR} are needed for an error bar"
        )
    rng = np.random.default_rng(seed_for(frame.season_id, frame.mid_mjd))
    error = bootstrap_centroid(frame.exposure_data, frame.exposure_variance, found, samples, rng)
    drift = frame.drift or Drift(0.0, 0.0, 0)
    position = (found[0] - drift.dx, found[1] - drift.dy)
    return SeasonMotion(
        season_id=frame.season_id,
        frame_id=frame.frame_id,
        mid_mjd=frame.mid_mjd,
        snr=snr,
        drift_corrected=frame.drift is not None,
        position_px=position,
        position_err_px=error,
        offset_px=(0.0, 0.0),
        offset_err_px=(0.0, 0.0),
    )


def fit_rate(times_yr: np.ndarray, values: np.ndarray, sigmas: np.ndarray) -> tuple[float, float]:
    weights = 1.0 / np.maximum(sigmas, MIN_SIGMA_PX) ** 2
    t_mean = np.sum(weights * times_yr) / np.sum(weights)
    spread = np.sum(weights * (times_yr - t_mean) ** 2)
    slope = np.sum(weights * (times_yr - t_mean) * values) / spread
    return float(slope), float(np.sqrt(1.0 / spread))


def total_rate_arcsec_yr(
    mjds: Sequence[float], positions: np.ndarray, sigmas: np.ndarray
) -> tuple[float, float]:
    times = np.asarray(mjds) / DAYS_PER_YEAR
    vx, ex = fit_rate(times, positions[:, 0], sigmas[:, 0])
    vy, ey = fit_rate(times, positions[:, 1], sigmas[:, 1])
    speed = float(np.hypot(vx, vy))
    error = float(np.hypot(vx * ex, vy * ey) / speed) if speed > 0 else float(np.hypot(ex, ey))
    return speed * SPHEREX_PIXEL_ARCSEC, error * SPHEREX_PIXEL_ARCSEC


def measure_motion(
    frames: Sequence[SeasonFrame], detector: str, samples: int = BOOTSTRAP_RESAMPLES
) -> Motion:
    if len(frames) < 2:
        raise MotionUnavailable("motion needs at least two seasons with a ready frame")
    seasons = [_measure_season(frame, samples) for frame in sorted(frames, key=lambda f: f.mid_mjd)]
    reference = seasons[0]
    with_offsets = [reference] + [
        dataclasses.replace(
            season,
            offset_px=(
                season.position_px[0] - reference.position_px[0],
                season.position_px[1] - reference.position_px[1],
            ),
            offset_err_px=(
                float(np.hypot(season.position_err_px[0], reference.position_err_px[0])),
                float(np.hypot(season.position_err_px[1], reference.position_err_px[1])),
            ),
        )
        for season in seasons[1:]
    ]
    rate, rate_err = total_rate_arcsec_yr(
        [s.mid_mjd for s in seasons],
        np.array([s.position_px for s in seasons]),
        np.array([s.position_err_px for s in seasons]),
    )
    return Motion(
        detector=detector,
        reference_season_id=reference.season_id,
        seasons=tuple(with_offsets),
        rate_arcsec_yr=rate,
        rate_err_arcsec_yr=rate_err,
    )


def predict_pixels(
    star: StellarAstrometry, mjds: Sequence[float], wcs: WCS, include_parallax: bool = True
) -> np.ndarray:
    world = [apparent_position(star, mjd, include_parallax=include_parallax) for mjd in mjds]
    return np.array([wcs.world_to_pixel_values(ra, dec) for ra, dec in world], dtype=float)


def compare_with_catalog(motion: Motion, predicted_px: np.ndarray, source: CatalogSource) -> Motion:
    reference = predicted_px[0]
    seasons = []
    for season, predicted in zip(motion.seasons, predicted_px, strict=True):
        offset = (float(predicted[0] - reference[0]), float(predicted[1] - reference[1]))
        residual = None
        if season.season_id != motion.reference_season_id:
            rx = (season.offset_px[0] - offset[0]) / max(season.offset_err_px[0], MIN_SIGMA_PX)
            ry = (season.offset_px[1] - offset[1]) / max(season.offset_err_px[1], MIN_SIGMA_PX)
            residual = float(np.hypot(rx, ry))
        seasons.append(dataclasses.replace(season, predicted_offset_px=offset, residual_sigma=residual))
    predicted_rate, _ = total_rate_arcsec_yr(
        [s.mid_mjd for s in motion.seasons],
        predicted_px,
        np.array([s.position_err_px for s in motion.seasons]),
    )
    comparison = CatalogComparison(
        source=source,
        predicted_rate_arcsec_yr=predicted_rate,
        rate_residual_sigma=(motion.rate_arcsec_yr - predicted_rate) / max(motion.rate_err_arcsec_yr, 1e-9),
    )
    return dataclasses.replace(motion, seasons=tuple(seasons), prediction=comparison)
