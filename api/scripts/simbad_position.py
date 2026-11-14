import argparse

import numpy as np
from astropy.time import Time

from skyblink.adapters.simbad import CatalogLookupError, resolve
from skyblink.domain.proper_motion import apparent_position


def main() -> None:
    parser = argparse.ArgumentParser(description="SIMBAD position of a target propagated to a date")
    parser.add_argument("name")
    parser.add_argument("--date", default=None, help="ISO date or datetime (UTC); default: now")
    args = parser.parse_args()
    when = Time(args.date, scale="utc") if args.date else Time.now()
    try:
        entry = resolve(args.name)
    except CatalogLookupError as error:
        raise SystemExit(str(error)) from error
    star = entry.astrometry
    ra, dec = apparent_position(star, when.mjd)
    shift = np.hypot((ra - star.ra) * np.cos(np.radians(dec)), dec - star.dec) * 3600
    print(
        f"{entry.catalog} ({entry.server}): {entry.object}  "
        f"ra={star.ra:.6f} dec={star.dec:+.6f} (epoch J2000)"
    )
    print(f"  pmra={star.pmra_mas_yr} pmdec={star.pmdec_mas_yr} mas/yr  plx={star.parallax_mas} mas")
    print(f"  rv={star.radial_velocity_km_s} km/s  coo_bibcode={entry.coordinates_source}")
    print(f'position on {when.iso[:10]}: ra={ra:.4f} dec={dec:+.4f}  ({shift:.1f}" from the J2000 position)')


if __name__ == "__main__":
    main()
