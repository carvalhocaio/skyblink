from dataclasses import dataclass

import astropy.units as u
from astropy.coordinates import GCRS, Distance, SkyCoord
from astropy.time import Time

FAR_AWAY = 1 * u.Gpc


@dataclass(frozen=True)
class StellarAstrometry:
    ra: float
    dec: float
    ref_epoch_jyear: float
    parallax_mas: float
    pmra_mas_yr: float
    pmdec_mas_yr: float
    radial_velocity_km_s: float = 0.0


BARNARD_GAIA_DR3 = StellarAstrometry(
    ra=269.44850252543836,
    dec=4.739420051112412,
    ref_epoch_jyear=2016.0,
    parallax_mas=546.975939730948,
    pmra_mas_yr=-801.5509783684709,
    pmdec_mas_yr=10362.394206546573,
    radial_velocity_km_s=-110.46822,
)


def apparent_position(
    star: StellarAstrometry, mjd: float, include_parallax: bool = True
) -> tuple[float, float]:
    when = Time(mjd, format="mjd", scale="utc")
    reference = SkyCoord(
        ra=star.ra * u.deg,
        dec=star.dec * u.deg,
        distance=Distance(parallax=star.parallax_mas * u.mas),
        pm_ra_cosdec=star.pmra_mas_yr * u.mas / u.yr,
        pm_dec=star.pmdec_mas_yr * u.mas / u.yr,
        radial_velocity=star.radial_velocity_km_s * u.km / u.s,
        obstime=Time(star.ref_epoch_jyear, format="jyear", scale="tcb"),
    )
    moved = reference.apply_space_motion(new_obstime=when)
    if not include_parallax:
        return float(moved.ra.deg), float(moved.dec.deg)
    near = SkyCoord(moved.ra, moved.dec, distance=moved.distance).transform_to(GCRS(obstime=when))
    far = SkyCoord(moved.ra, moved.dec, distance=FAR_AWAY).transform_to(GCRS(obstime=when))
    lon, lat = far.spherical_offsets_to(near)
    observed = SkyCoord(moved.ra, moved.dec).spherical_offsets_by(lon, lat)
    return float(observed.ra.deg), float(observed.dec.deg)
