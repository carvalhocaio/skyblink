from dataclasses import dataclass

import numpy as np
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
        for y, x in zip(*np.nonzero(peaks))
        if edge <= y < rows - edge
        and edge <= x < cols - edge
        and np.hypot(x - exclude_xy[0], y - exclude_xy[1]) > exclude_radius
    ]
