from dataclasses import dataclass

import numpy as np
from astroquery.simbad import Simbad, conf

from skyblink.domain.proper_motion import StellarAstrometry

CATALOG = "SIMBAD"
MIRRORS = ("simbad.cds.unistra.fr", "simbad.harvard.edu")
FIELDS = ("pmra", "pmdec", "plx_value", "rvz_radvel")
SIMBAD_EPOCH = 2000.0
NEGLIGIBLE_PARALLAX_MAS = 1e-3


class CatalogLookupError(Exception):
    pass


@dataclass(frozen=True)
class CatalogEntry:
    catalog: str
    server: str
    object: str
    coordinates_source: str
    astrometry: StellarAstrometry
    parallax_known: bool
    radial_velocity_known: bool


def _value(row, key: str) -> float | None:
    value = row[key]
    return None if np.ma.is_masked(value) or not np.isfinite(value) else float(value)


def _entry(server: str, row) -> CatalogEntry:
    parallax, rv = _value(row, "plx_value"), _value(row, "rvz_radvel")
    return CatalogEntry(
        catalog=CATALOG,
        server=server,
        object=str(row["main_id"]),
        coordinates_source=str(row["coo_bibcode"]),
        astrometry=StellarAstrometry(
            ra=float(row["ra"]),
            dec=float(row["dec"]),
            ref_epoch_jyear=SIMBAD_EPOCH,
            parallax_mas=parallax if parallax and parallax > 0 else NEGLIGIBLE_PARALLAX_MAS,
            pmra_mas_yr=_value(row, "pmra") or 0.0,
            pmdec_mas_yr=_value(row, "pmdec") or 0.0,
            radial_velocity_km_s=rv or 0.0,
        ),
        parallax_known=bool(parallax and parallax > 0),
        radial_velocity_known=rv is not None,
    )


def resolve(name: str) -> CatalogEntry:
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
            raise CatalogLookupError(f"{name!r} not found in {CATALOG}")
        return _entry(server, table[0])
    raise CatalogLookupError(f"{CATALOG} unavailable ({'; '.join(errors)})")
