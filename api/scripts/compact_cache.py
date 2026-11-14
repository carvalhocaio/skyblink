import logging

from skyblink.config import Settings
from skyblink.wiring import cutout_cache


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    report = cutout_cache(Settings.from_env()).compact_all()
    if report.skipped:
        print("cache already compact (marker present)")


if __name__ == "__main__":
    main()
