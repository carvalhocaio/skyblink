from skyblink.domain.models import Target
from skyblink.services.discovery import discover_seasons
from tests.factories import make_exposure


class FakeSearch:
    def __init__(self, exposures):
        self._exposures = exposures

    async def search(self, target):
        return self._exposures


async def test_seasons_are_split_using_all_detectors_before_filtering():
    exposures = [
        make_exposure(obs_id="a", detector="D6", mjd=0.0),
        make_exposure(obs_id="b", detector="D1", mjd=20.0),
        make_exposure(obs_id="c", detector="D6", mjd=40.0),
        make_exposure(obs_id="d", detector="D1", mjd=200.0),
    ]

    seasons = await discover_seasons(FakeSearch(exposures), Target(0, 0), ["D6"])

    assert [(s.id, [e.obs_id for e in s.exposures]) for s in seasons] == [(0, ["a", "c"])]


async def test_all_detectors_when_none_requested():
    exposures = [make_exposure(detector=d, obs_id=d) for d in ("D1", "D6", "D9")]

    seasons = await discover_seasons(FakeSearch(exposures), Target(0, 0), None)

    assert [e.detector for e in seasons[0].exposures] == ["D1", "D6"]
