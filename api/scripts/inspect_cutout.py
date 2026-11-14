import argparse
from pathlib import Path

import numpy as np
from astropy.io import fits

from skyblink.domain.flags import FlagMasks, parse_flag_bits


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    for path in parser.parse_args().paths:
        with fits.open(path) as hdul:
            image = hdul["IMAGE"]
            flags = hdul["FLAGS"]
            print(f"== {path.name}")
            print(f"   extensions: {[hdu.name for hdu in hdul]}")
            print(f"   image: {image.data.shape} {image.header['BUNIT']} {image.header['CTYPE1']}")
            print(f"   MJD-AVG: {image.header.get('MJD-AVG')}")
            for name, mask in parse_flag_bits(flags.header).items():
                count = int(np.count_nonzero(flags.data & mask))
                print(f"   bit {int(mask).bit_length() - 1:2d} {name:14} pixels={count}")
            print(f"   missing expected names: {FlagMasks.from_header(flags.header).missing}")


if __name__ == "__main__":
    main()
