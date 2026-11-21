"""Compare a seasonal baseline with a calendar-aware spending forecast."""
from math import cos, sin, tau

import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

HORIZON = 3
METHODS = ("seasonal", "ridge")


def calendar_features(month: pd.Period) -> list[float]:
    angle = tau * (month.month - 1) / 12
    return [sin(angle), cos(angle), float(month.month in (11, 12, 1, 2))]


def predict(method: str, history: list[dict], horizon: int) -> list[int]:
    periods = [pd.Period(row["month"], freq="M") for row in history]
    if method == "seasonal":
        return [row["cents"] for row in history[-12:][:horizon]]

    model = Ridge(alpha=2)
    model.fit([calendar_features(month) for month in periods], [row["cents"] for row in history])
    features = [calendar_features(periods[-1] + step) for step in range(1, horizon + 1)]
    return [max(0, round(value)) for value in model.predict(features)]


def seasonal_outlook(history: list[dict]) -> dict | None:
    if len(history) < 24:
        return None
    forecasts = {method: [] for method in METHODS}
    actual = []
    for end in range(len(history) - 12, len(history)):
        horizon = min(HORIZON, len(history) - end)
        actual.extend(row["cents"] for row in history[end:end + horizon])
        for method in METHODS:
            forecasts[method].extend(predict(method, history[:end], horizon))
    errors = {method: mean_absolute_error(actual, values) for method, values in forecasts.items()}
    method = min(errors, key=errors.__getitem__)
    latest = pd.Period(history[-1]["month"], freq="M")
    return {
        "method": method,
        "errors": {name: round(error) for name, error in errors.items()},
        "recent": history[-6:],
        "months": [
            {"month": str(latest + offset), "cents": cents}
            for offset, cents in enumerate(predict(method, history, HORIZON), 1)
        ],
    }
