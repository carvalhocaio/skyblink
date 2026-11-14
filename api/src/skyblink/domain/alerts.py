from collections.abc import Sequence

import numpy as np

from skyblink.domain.astrometry import Drift
from skyblink.domain.models import Alert, AlertCode, Season

SEVERITY = {
    AlertCode.NO_COVERAGE: "error",
    AlertCode.SINGLE_SEASON: "warning",
    AlertCode.FEW_EXPOSURES: "warning",
    AlertCode.SATURATED_CORE: "info",
    AlertCode.ALIGNMENT_DRIFT: "warning",
}
MIN_EXPOSURES_PER_FRAME = 5
TARGET_RADIUS_PX = 1
SATURATED_CORE_MIN_FRACTION = 0.25
SATURATED_CORE_MIN_EXPOSURES = 2
ALIGNMENT_DRIFT_MAX_PX = 0.2


def alert(code: AlertCode) -> Alert:
    return Alert(code=code, severity=SEVERITY[code])


def job_alerts(seasons: Sequence[Season]) -> list[Alert]:
    if not seasons:
        return [alert(AlertCode.NO_COVERAGE)]
    if len(seasons) == 1:
        return [alert(AlertCode.SINGLE_SEASON)]
    return []


def touches_core(saturated: np.ndarray, radius: int = TARGET_RADIUS_PX) -> bool:
    row, col = (saturated.shape[0] - 1) // 2, (saturated.shape[1] - 1) // 2
    core = saturated[row - radius : row + radius + 1, col - radius : col + radius + 1]
    return bool(np.any(core > 0))


def is_saturated_core(saturated_exposures: int, n_exposures: int) -> bool:
    return (
        saturated_exposures >= SATURATED_CORE_MIN_EXPOSURES
        and saturated_exposures >= SATURATED_CORE_MIN_FRACTION * n_exposures
    )


def is_alignment_drift(drift: Drift | None) -> bool:
    return drift is not None and drift.magnitude > ALIGNMENT_DRIFT_MAX_PX


def frame_alerts(n_exposures_used: int, saturated_core_exposures: int) -> list[Alert]:
    alerts = []
    if n_exposures_used < MIN_EXPOSURES_PER_FRAME:
        alerts.append(alert(AlertCode.FEW_EXPOSURES))
    if is_saturated_core(saturated_core_exposures, n_exposures_used):
        alerts.append(alert(AlertCode.SATURATED_CORE))
    return alerts
