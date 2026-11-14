import argparse
import asyncio
import logging
from dataclasses import dataclass

import numpy as np
from astropy.time import Time

from skyblink.adapters.irsa_cutouts import CutoutClient
from skyblink.config import Settings
from skyblink.domain.astrometry import (
    bootstrap_means,
    bootstrap_shift,
    centroid,
    measure_drift,
    select_reference_stars,
)
from skyblink.domain.grid import SPHEREX_PIXEL_ARCSEC, FrameGrid
from skyblink.domain.models import Exposure, Season, Target
from skyblink.domain.proper_motion import BARNARD_GAIA_DR3, apparent_position
from skyblink.domain.seasons import spread_evenly
from skyblink.services.discovery import discover_seasons
from skyblink.services.frame_builder import FrameImage, reproject_exposure, stack_cutouts
from skyblink.wiring import cutout_client, http_client, sia_client


@dataclass(frozen=True)
class SeasonMeasurement:
    season: Season
    positions: np.ndarray
    mean_mjd: float
    frame: FrameImage
    predicted_xy: np.ndarray


async def fetch_paths(cutouts: CutoutClient, exposures: list[Exposure], target: Target, grid: FrameGrid):
    paths = await asyncio.gather(
        *(cutouts.fetch(e, target.ra, target.dec, grid.cutout_size_deg) for e in exposures)
    )
    return [(e, p) for e, p in zip(exposures, paths, strict=True) if p is not None]


def measure_season(season: Season, fetched, grid: FrameGrid) -> SeasonMeasurement:
    centre = ((grid.shape[1] - 1) / 2, (grid.shape[0] - 1) / 2)
    positions, epochs = [], []
    for exposure, path in fetched:
        found = centroid(reproject_exposure(path, grid).data, centre)
        if found is not None:
            positions.append(found)
            epochs.append(exposure.mjd)
    mean_mjd = float(np.mean(epochs))
    predicted = grid.wcs.world_to_pixel_values(*apparent_position(BARNARD_GAIA_DR3, mean_mjd))
    return SeasonMeasurement(
        season=season,
        positions=np.array(positions),
        mean_mjd=mean_mjd,
        frame=stack_cutouts([p for _, p in fetched], grid),
        predicted_xy=np.array(predicted, dtype=float),
    )


def describe(dx: float, dy: float) -> str:
    return f"({dx:+.3f}, {dy:+.3f}) px"


def report(measurements: list[SeasonMeasurement]) -> None:
    for m in measurements:
        sigma = bootstrap_means(m.positions).std(axis=0, ddof=1)
        mean = m.positions.mean(axis=0)
        coadd = centroid(m.frame.image, tuple(mean))
        print(
            f"season {m.season.id} {Time(m.mean_mjd, format='mjd').iso[:10]} n={len(m.positions)}: "
            f"x={mean[0]:.3f}±{sigma[0]:.3f} y={mean[1]:.3f}±{sigma[1]:.3f} px "
            f"(per-exposure scatter {m.positions.std(axis=0, ddof=1).round(3).tolist()} px; "
            f"coadd centroid {np.round(coadd, 3).tolist()})"
        )
    first, last = measurements[0], measurements[-1]
    shift = bootstrap_shift(first.positions, last.positions)
    predicted = last.predicted_xy - first.predicted_xy
    years = (last.mean_mjd - first.mean_mjd) / 365.25
    scale = SPHEREX_PIXEL_ARCSEC
    print(f"\nshift season {first.season.id} -> {last.season.id} over {years:.3f} yr")
    print(
        f"  measured (per-exposure mean): {describe(shift.dx, shift.dy)}  "
        f"|d| = {shift.magnitude:.3f} ± {shift.magnitude_err:.3f} px = "
        f'{shift.magnitude * scale:.2f} ± {shift.magnitude_err * scale:.2f}"'
    )
    print(f"    dx ± {shift.dx_err:.3f} px, dy ± {shift.dy_err:.3f} px")
    first_coadd = centroid(first.frame.image, tuple(first.positions.mean(axis=0)))
    last_coadd = centroid(last.frame.image, tuple(last.positions.mean(axis=0)))
    coadd_shift = np.subtract(last_coadd, first_coadd)
    print(
        f"  measured (coadd centroid):    {describe(*coadd_shift)}  |d| = {np.hypot(*coadd_shift):.3f} px = "
        f'{np.hypot(*coadd_shift) * scale:.2f}"'
    )
    print(
        f"  Gaia DR3 predicted:           {describe(*predicted)}  |d| = {np.hypot(*predicted):.3f} px = "
        f'{np.hypot(*predicted) * scale:.2f}"'
    )
    residual = np.array([shift.dx, shift.dy]) - predicted
    sigma = np.hypot(shift.dx_err, shift.dy_err)
    print(
        f"  measured - predicted:         {describe(*residual)}  |r| = {np.hypot(*residual):.3f} px "
        f"({np.hypot(*residual) / sigma:.1f} sigma)"
    )
    stars = select_reference_stars(first.frame.image, first.frame.saturated_count)
    drift, usable = measure_drift(first.frame.image, last.frame.image, stars)
    if drift is None:
        print(f"  background stars: only {usable} usable (need 3), alignment not checked")
    else:
        print(f"  background stars: n={drift.n_stars} median offset = {drift.magnitude:.3f} px")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ra", type=float, default=269.4464)
    parser.add_argument("--dec", type=float, default=4.7668)
    parser.add_argument("--fov-arcmin", type=float, default=6.0)
    parser.add_argument("--detector", default="D6")
    parser.add_argument("--max-exposures", type=int, default=30)
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    settings = Settings.from_env()
    target = Target(args.ra, args.dec, args.fov_arcmin)
    grid = FrameGrid.centered_on(target)
    async with http_client(settings) as client:
        seasons = await discover_seasons(sia_client(client, settings), target, [args.detector])
        cutouts = cutout_client(client, settings)
        fetched = [
            await fetch_paths(cutouts, spread_evenly(s.exposures, args.max_exposures), target, grid)
            for s in seasons
        ]
    report([measure_season(s, f, grid) for s, f in zip(seasons, fetched, strict=True)])


if __name__ == "__main__":
    asyncio.run(main())
