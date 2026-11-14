import argparse
import asyncio
import logging

import numpy as np
from astropy.time import Time

from skyblink.adapters.png_renderer import render_animation, render_png
from skyblink.config import Settings
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Target
from skyblink.domain.seasons import spread_evenly
from skyblink.domain.stretch import StretchParams
from skyblink.services.discovery import discover_seasons
from skyblink.services.frame_builder import FrameBuilder
from skyblink.wiring import cutout_client, http_client, sia_client


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ra", type=float, default=269.4464)
    parser.add_argument("--dec", type=float, default=4.7668)
    parser.add_argument("--fov-arcmin", type=float, default=6.0)
    parser.add_argument("--detector", default="D6")
    parser.add_argument("--seasons", type=int, nargs="*", help="season ids; all when omitted")
    parser.add_argument("--max-exposures", type=int, default=30)
    parser.add_argument("--upscale", type=int, default=8)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    settings = Settings.from_env()
    target = Target(args.ra, args.dec, args.fov_arcmin)
    grid = FrameGrid.centered_on(target)
    output = settings.output_dir / f"{args.ra:.4f}_{args.dec:+.4f}_{args.detector}"

    async with http_client(settings) as client:
        seasons = await discover_seasons(sia_client(client, settings), target, [args.detector])
        cutouts = cutout_client(client, settings)
        builder = FrameBuilder(cutouts)
        stretch: StretchParams | None = None
        images = []
        for season in seasons:
            if args.seasons is not None and season.id not in args.seasons:
                continue
            exposures = spread_evenly(season.exposures, args.max_exposures)
            frame = await builder.build(exposures, target, grid)
            stretch = stretch or StretchParams.from_image(frame.image)
            path = render_png(frame.image, stretch, output / f"season{season.id}.png", args.upscale)
            np.save(output / f"season{season.id}.npy", frame.image)
            images.append(frame.image)
            date = Time((season.start_mjd + season.end_mjd) / 2, format="mjd").iso[:10]
            saturated = int((frame.saturated_count > 0).sum())
            print(
                f"season {season.id} ({date}): {frame.n_exposures_used}/{len(exposures)} exposures, "
                f"coverage median {np.median(frame.coverage):.0f}, saturated px {saturated}, "
                f"download {frame.download_s:.1f}s + assembly {frame.assembly_s:.1f}s -> {path}"
            )
        print(f"stretch: {stretch}")
        if len(images) > 1:
            print(f"animation -> {render_animation(images, stretch, output / 'seasons.gif', args.upscale)}")


if __name__ == "__main__":
    asyncio.run(main())
