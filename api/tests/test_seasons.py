from skyblink.domain.seasons import group_into_seasons
from tests.factories import make_exposure


def test_splits_on_gaps_longer_than_thirty_days():
    exposures = [make_exposure(obs_id=str(mjd), mjd=mjd) for mjd in (110.0, 0.0, 10.0, 40.0, 75.0)]

    seasons = group_into_seasons(exposures)

    assert [[e.mjd for e in s.exposures] for s in seasons] == [[0.0, 10.0, 40.0], [75.0], [110.0]]
    assert [s.id for s in seasons] == [0, 1, 2]


def test_gap_of_exactly_thirty_days_stays_in_same_season():
    seasons = group_into_seasons([make_exposure(mjd=0.0), make_exposure(mjd=30.0)])

    assert len(seasons) == 1
    assert (seasons[0].start_mjd, seasons[0].end_mjd, seasons[0].n_exposures) == (0.0, 30.0, 2)


def test_season_filters_by_detector():
    season = group_into_seasons([make_exposure(detector="D1"), make_exposure(detector="D6")])[0]

    assert [e.detector for e in season.for_detector("D6")] == ["D6"]


def test_no_exposures_means_no_seasons():
    assert group_into_seasons([]) == []
