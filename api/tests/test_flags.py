import numpy as np
from astropy.io.fits import Header

from skyblink.domain.flags import FlagMasks, parse_flag_bits


def flags_header(planes: dict[int, str]) -> Header:
    header = Header()
    for plane, name in planes.items():
        header[f"MSKN{plane:04d}"] = name
        header[f"MSKM{plane:04d}"] = 1 << plane
    return header


SPHEREX_PLANES = {
    1: "OVERFLOW",
    2: "SUR_ERROR",
    6: "NONFUNC",
    9: "MISSING_DATA",
    10: "HOT",
    11: "COLD",
    15: "NONLINEAR",
    17: "PERSIST",
    21: "SOURCE",
    26: "BLOOM",
    27: "SNOWBALL",
    28: "HALO",
}


def test_reads_bit_names_and_masks_from_header():
    assert parse_flag_bits(flags_header({0: "TRANSIENT", 21: "SOURCE"})) == {
        "TRANSIENT": 1,
        "SOURCE": 1 << 21,
    }


def test_masks_combine_named_bits_and_report_missing_names():
    masks = FlagMasks.from_header(flags_header(SPHEREX_PLANES))

    assert masks.saturated == (1 << 1) | (1 << 15) | (1 << 26)
    assert masks.source == 1 << 21
    assert masks.bad & masks.saturated == 0
    assert masks.bad & masks.source == 0
    assert masks.missing == ("SATELLITE_HALO",)


def test_pixel_selection_uses_masks():
    masks = FlagMasks.from_header(flags_header(SPHEREX_PLANES))
    flags = np.array([0, 1 << 10, 1 << 1, (1 << 21) | (1 << 0), 1 << 26, (1 << 26) | (1 << 2)], dtype=np.int32)

    assert masks.bad_pixels(flags).tolist() == [False, True, False, False, False, True]
    assert masks.saturated_pixels(flags).tolist() == [False, False, True, False, True, True]
    assert masks.source_pixels(flags).tolist() == [False, False, False, True, False, False]
