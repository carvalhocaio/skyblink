import io
import os

import numpy as np
from astropy.io import fits

from skyblink.adapters.cutout_cache import COMPACT_MARKER, CutoutCache, CutoutKey
from skyblink.adapters.fits_compaction import KEPT_EXTENSIONS, compact_fits, is_compact
from tests.factories import irsa_cutout_bytes


def key(name: str) -> CutoutKey:
    return CutoutKey(name, "D6", 1.0, 2.0, 0.1)


def test_compaction_keeps_science_extensions_with_headers_and_drops_epsf():
    original = irsa_cutout_bytes()

    compact = compact_fits(original)

    with fits.open(io.BytesIO(compact)) as small, fits.open(io.BytesIO(original)) as big:
        assert [hdu.name for hdu in small[1:]] == list(KEPT_EXTENSIONS)
        assert small[0].header["VERSION"] == "7.0.5"
        for name in KEPT_EXTENSIONS:
            assert small[name].header == big[name].header
            assert np.array_equal(np.asarray(small[name].data), np.asarray(big[name].data))
    assert len(compact) < len(original) / 5
    assert compact_fits(compact) == compact


def test_existing_cache_is_compacted_in_place_once(tmp_path):
    raw = irsa_cutout_bytes()
    cache = CutoutCache(tmp_path)
    paths = [cache.put(key(name), raw) for name in ("a", "b")]
    os.utime(paths[0], (100, 100))

    report = cache.compact_all()

    assert (report.files, report.compacted, report.bytes_before) == (2, 2, 2 * len(raw))
    assert report.bytes_after < report.bytes_before / 5
    assert all(is_compact(path) for path in paths)
    assert paths[0].stat().st_mtime == 100
    assert cache.total_bytes == report.bytes_after
    assert (tmp_path / COMPACT_MARKER).exists()
    assert cache.compact_all().skipped


def test_eviction_removes_least_recently_used_until_below_watermark(tmp_path):
    cache = CutoutCache(tmp_path, max_bytes=2500)
    first = cache.put(key("first"), b"x" * 1000)
    os.utime(first, (100, 100))
    second = cache.put(key("second"), b"x" * 1000)
    os.utime(second, (200, 200))

    assert cache.get(key("first")) is not None
    third = cache.put(key("third"), b"x" * 1000)

    assert first.exists() and third.exists()
    assert not second.exists()
    assert cache.get(key("second")) is None
    assert cache.total_bytes == 2000


def test_cache_measures_existing_files_on_start(tmp_path):
    CutoutCache(tmp_path).put(key("a"), b"x" * 700)
    CutoutCache(tmp_path).mark_no_coverage(key("b"))

    assert CutoutCache(tmp_path).total_bytes == 700
