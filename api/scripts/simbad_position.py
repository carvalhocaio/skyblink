import argparse

import numpy as np
from astropy.time import Time
from astroquery.simbad import Simbad, conf

from skyblink.domain.proper_motion import StellarAstrometry, apparent_position

MIRRORS = ("simbad.cds.unistra.fr", "simbad.harvard.edu")
FIELDS = ("pmra", "pmdec", "plx_value", "rvz_radvel")
SIMBAD_EPOCH = 2000.0
NEGLIGIBLE_PARALLAX_MAS = 1e-3


def _value(row, key: str, default: float) -> float:
    value = row[key]
    return default if np.ma.is_masked(value) or not np.isfinite(value) else float(value)


def query(name: str):
    errors = []
    for server in MIRRORS:
        conf.server = server
        try:
            simbad = Simbad()
            simbad.add_votable_fields(*FIELDS)
            table = simbad.query_object(name)
        except Exception as error:
            errors.append(f"{server}: {type(error).__name__}")
            continue
        if table is None or len(table) == 0:
            raise SystemExit(f"{name!r} not found in SIMBAD ({server})")
        return server, table[0]
    raise SystemExit(f"SIMBAD unavailable: {'; '.join(errors)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="SIMBAD position of a target propagated to a date")
    parser.add_argument("name")
    parser.add_argument("--date", default=None, help="ISO date or datetime (UTC); default: now")
    args = parser.parse_args()
    when = Time(args.date, scale="utc") if args.date else Time.now()
    server, row = query(args.name)
    star = StellarAstrometry(
        ra=float(row["ra"]),
        dec=float(row["dec"]),
        ref_epoch_jyear=SIMBAD_EPOCH,
        parallax_mas=_value(row, "plx_value", NEGLIGIBLE_PARALLAX_MAS),
        pmra_mas_yr=_value(row, "pmra", 0.0),
        pmdec_mas_yr=_value(row, "pmdec", 0.0),
        radial_velocity_km_s=_value(row, "rvz_radvel", 0.0),
    )
    ra, dec = apparent_position(star, when.mjd)
    shift = np.hypot((ra - star.ra) * np.cos(np.radians(dec)), dec - star.dec) * 3600
    print(f"SIMBAD ({server}): {row['main_id']}  ra={star.ra:.6f} dec={star.dec:+.6f} (ICRS, epoch J2000)")
    print(f"  pmra={star.pmra_mas_yr} pmdec={star.pmdec_mas_yr} mas/yr  plx={star.parallax_mas} mas")
    print(f"  rv={star.radial_velocity_km_s} km/s  coo_bibcode={row['coo_bibcode']}")
    print(f'position on {when.iso[:10]}: ra={ra:.4f} dec={dec:+.4f}  ({shift:.1f}" from the J2000 position)')


if __name__ == "__main__":
    main()
