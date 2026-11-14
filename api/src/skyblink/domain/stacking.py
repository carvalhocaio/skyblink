from dataclasses import dataclass

import numpy as np
from astropy.stats import sigma_clip

MIN_EXPOSURES_FOR_REJECTION = 5
REJECTION_SIGMA = 4.0


@dataclass(frozen=True)
class StackResult:
    image: np.ndarray
    coverage: np.ndarray
    rejected: np.ndarray


def weighted_mean_stack(data: np.ndarray, variance: np.ndarray) -> StackResult:
    valid = np.isfinite(data) & np.isfinite(variance) & (variance > 0)
    coverage_before = valid.sum(axis=0)
    rejected = np.zeros_like(valid)
    if data.shape[0] >= MIN_EXPOSURES_FOR_REJECTION:
        clipped = sigma_clip(
            np.where(valid, data, np.nan),
            sigma=REJECTION_SIGMA,
            stdfunc="mad_std",
            axis=0,
            masked=True,
        )
        eligible = coverage_before >= MIN_EXPOSURES_FOR_REJECTION
        rejected = np.ma.getmaskarray(clipped) & valid & eligible
        valid &= ~rejected
    weights = np.where(valid, 1.0 / np.where(valid, variance, 1.0), 0.0)
    weight_sum = weights.sum(axis=0)
    weighted = (weights * np.where(valid, data, 0.0)).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        image = np.where(weight_sum > 0, weighted / weight_sum, np.nan)
    return StackResult(image=image, coverage=valid.sum(axis=0), rejected=rejected.sum(axis=0))
