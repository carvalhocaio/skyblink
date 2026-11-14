from dataclasses import dataclass

import numpy as np
from astropy.stats import mad_std
from scipy import ndimage

CENTROID_HALF_WIDTH = 3
CENTROID_ITERATIONS = 3
MIN_FINITE_FRACTION = 0.5
BOOTSTRAP_SAMPLES = 2000


def centroid(
    image: np.ndarray,
    guess_xy: tuple[float, float],
    half: int = CENTROID_HALF_WIDTH,
    iterations: int = CENTROID_ITERATIONS,
) -> tuple[float, float] | None:
    x, y = guess_xy
    for _ in range(iterations):
        col, row = round(x), round(y)
        if not (half <= row < image.shape[0] - half and half <= col < image.shape[1] - half):
            return None
        box = image[row - half : row + half + 1, col - half : col + half + 1]
        finite = np.isfinite(box)
        weights = np.clip(np.where(finite, box, 0.0), 0.0, None)
        if finite.mean() < MIN_FINITE_FRACTION or weights.sum() <= 0:
            return None
        offsets = np.arange(-half, half + 1)
        x = col + (weights.sum(axis=0) * offsets).sum() / weights.sum()
        y = row + (weights.sum(axis=1) * offsets).sum() / weights.sum()
    return float(x), float(y)


def bootstrap_means(
    positions: np.ndarray, samples: int = BOOTSTRAP_SAMPLES, rng: np.random.Generator | None = None
) -> np.ndarray:
    rng = rng or np.random.default_rng(0)
    picks = rng.integers(0, len(positions), size=(samples, len(positions)))
    return positions[picks].mean(axis=1)


@dataclass(frozen=True)
class Shift:
    dx: float
    dy: float
    dx_err: float
    dy_err: float
    magnitude: float
    magnitude_err: float


def bootstrap_shift(
    first: np.ndarray,
    last: np.ndarray,
    samples: int = BOOTSTRAP_SAMPLES,
    rng: np.random.Generator | None = None,
) -> Shift:
    rng = rng or np.random.default_rng(0)
    deltas = bootstrap_means(last, samples, rng) - bootstrap_means(first, samples, rng)
    observed = last.mean(axis=0) - first.mean(axis=0)
    magnitudes = np.hypot(deltas[:, 0], deltas[:, 1])
    return Shift(
        dx=float(observed[0]),
        dy=float(observed[1]),
        dx_err=float(deltas[:, 0].std(ddof=1)),
        dy_err=float(deltas[:, 1].std(ddof=1)),
        magnitude=float(np.hypot(*observed)),
        magnitude_err=float(magnitudes.std(ddof=1)),
    )


def find_reference_stars(
    image: np.ndarray,
    exclude_xy: tuple[float, float],
    exclude_radius: float,
    threshold: float,
    saturated: np.ndarray | None = None,
    isolation: int = 7,
    edge: int = CENTROID_HALF_WIDTH + 1,
) -> list[tuple[float, float]]:
    filled = np.nan_to_num(image, nan=-np.inf)
    peaks = (filled == ndimage.maximum_filter(filled, size=isolation)) & (filled > threshold)
    if saturated is not None:
        peaks &= ~ndimage.binary_dilation(saturated > 0, iterations=CENTROID_HALF_WIDTH)
    rows, cols = image.shape
    return [
        (float(x), float(y))
        for y, x in zip(*np.nonzero(peaks), strict=True)
        if edge <= y < rows - edge
        and edge <= x < cols - edge
        and np.hypot(x - exclude_xy[0], y - exclude_xy[1]) > exclude_radius
    ]


REFERENCE_MIN_SNR = 10.0
CENTRE_EXCLUSION_RADIUS = 1.5
MIN_REFERENCE_STARS = 3
OUTLIER_SPREADS = 3.0
MAD_TO_SIGMA = 1.4826
MIN_SPREAD_PX = 0.02
MEDIAN_ERROR_FACTOR = 1.2533


@dataclass(frozen=True)
class Drift:
    dx: float
    dy: float
    n_stars: int
    dx_err: float = 0.0
    dy_err: float = 0.0

    @property
    def magnitude(self) -> float:
        return float(np.hypot(self.dx, self.dy))


@dataclass(frozen=True)
class DriftMeasurement:
    drift: Drift | None
    kept: tuple[tuple[tuple[float, float], tuple[float, float]], ...]
    dropped: tuple[tuple[tuple[float, float], tuple[float, float]], ...]

    @property
    def usable(self) -> int:
        return len(self.kept) + len(self.dropped)


def consistent_offsets(offsets: np.ndarray) -> np.ndarray:
    median = np.median(offsets, axis=0)
    deviation = np.abs(offsets - median)
    spread = np.maximum(MAD_TO_SIGMA * np.median(deviation, axis=0), MIN_SPREAD_PX)
    return np.all(deviation <= OUTLIER_SPREADS * spread, axis=1)


def median_with_error(offsets: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    median = np.median(offsets, axis=0)
    scatter = np.std(offsets, axis=0, ddof=1)
    return median, MEDIAN_ERROR_FACTOR * scatter / np.sqrt(len(offsets))


def frame_noise(image: np.ndarray) -> float:
    return float(mad_std(image, ignore_nan=True))


def frame_centre(image: np.ndarray) -> tuple[float, float]:
    return (image.shape[1] - 1) / 2, (image.shape[0] - 1) / 2


def select_reference_stars(
    image: np.ndarray, saturated: np.ndarray | None, min_snr: float = REFERENCE_MIN_SNR
) -> list[tuple[float, float]]:
    return find_reference_stars(
        image,
        frame_centre(image),
        CENTRE_EXCLUSION_RADIUS,
        threshold=min_snr * frame_noise(image),
        saturated=saturated,
    )


def measure_drift(
    reference: np.ndarray, image: np.ndarray, stars: list[tuple[float, float]]
) -> DriftMeasurement:
    measured = []
    for star in stars:
        before, after = centroid(reference, star), centroid(image, star)
        if before is not None and after is not None:
            measured.append((star, (after[0] - before[0], after[1] - before[1])))
    if len(measured) < MIN_REFERENCE_STARS:
        return DriftMeasurement(None, tuple(measured), ())
    keep = consistent_offsets(np.array([offset for _, offset in measured]))
    kept = tuple(m for m, k in zip(measured, keep, strict=True) if k)
    dropped = tuple(m for m, k in zip(measured, keep, strict=True) if not k)
    if len(kept) < MIN_REFERENCE_STARS:
        return DriftMeasurement(None, kept, dropped)
    median, error = median_with_error(np.array([offset for _, offset in kept]))
    drift = Drift(float(median[0]), float(median[1]), len(kept), float(error[0]), float(error[1]))
    return DriftMeasurement(drift, kept, dropped)
