from collections.abc import Sequence

import numpy as np

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


def alert(code: AlertCode) -> Alert:
    return Alert(code=code, severity=SEVERITY[code])


def job_alerts(seasons: Sequence[Season]) -> list[Alert]:
    if not seasons:
        return [alert(AlertCode.NO_COVERAGE)]
    if len(seasons) == 1:
        return [alert(AlertCode.SINGLE_SEASON)]
    return []


def has_saturated_core(saturated_count: np.ndarray, radius: int = TARGET_RADIUS_PX) -> bool:
    row, col = (saturated_count.shape[0] - 1) // 2, (saturated_count.shape[1] - 1) // 2
    core = saturated_count[row - radius : row + radius + 1, col - radius : col + radius + 1]
    return bool(np.any(core > 0))


def frame_alerts(n_exposures_used: int, saturated_count: np.ndarray) -> list[Alert]:
    alerts = []
    if n_exposures_used < MIN_EXPOSURES_PER_FRAME:
        alerts.append(alert(AlertCode.FEW_EXPOSURES))
    if has_saturated_core(saturated_count):
        alerts.append(alert(AlertCode.SATURATED_CORE))
    return alerts
