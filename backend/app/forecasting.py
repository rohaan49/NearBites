"""Small, dependency-free daily demand forecasts for seller planning."""

from statistics import mean


def weekday_average(values: list[int], horizon: int) -> list[float]:
    """Mean of matching weekdays in the last eight complete weeks."""
    n = len(values)
    recent = range(max(0, n - 56), n)
    fallback = mean(values) if values else 0.0
    return [
        max(0.0, mean([values[i] for i in recent if i % 7 == (n + step) % 7])
            if any(i % 7 == (n + step) % 7 for i in recent) else fallback)
        for step in range(horizon)
    ]


def holt_winters_additive(values: list[int], horizon: int) -> list[float]:
    """Additive level, trend and seven-day seasonal exponential smoothing."""
    if len(values) < 14:
        raise ValueError("Two complete weeks are needed to initialize the seasonal model")
    first = mean(values[:7])
    second = mean(values[7:14])
    level = first
    trend = (second - first) / 7
    seasons = [value - first for value in values[:7]]
    alpha, beta, gamma = 0.35, 0.08, 0.25
    for t in range(7, len(values)):
        old_level = level
        old_season = seasons[t % 7]
        level = alpha * (values[t] - old_season) + (1 - alpha) * (level + trend)
        trend = beta * (level - old_level) + (1 - beta) * trend
        seasons[t % 7] = gamma * (values[t] - level) + (1 - gamma) * old_season
    return [max(0.0, level + (step + 1) * trend + seasons[(len(values) + step) % 7]) for step in range(horizon)]


def compare_forecasts(values: list[int], horizon: int = 8) -> dict:
    """Choose by MAE on a later 14-day holdout, then refit on all completed days."""
    baseline = weekday_average(values, horizon)
    result = {"selected": "weekday_average", "weekday": baseline, "holt_winters": None,
              "validation": None}
    if len(values) < 56 or sum(values) < 20:
        return result
    holdout = values[-14:]
    train = values[:-14]
    baseline_errors = weekday_average(train, 14)
    winter_errors = holt_winters_additive(train, 14)
    baseline_mae = mean(abs(a - p) for a, p in zip(holdout, baseline_errors))
    winter_mae = mean(abs(a - p) for a, p in zip(holdout, winter_errors))
    result["holt_winters"] = holt_winters_additive(values, horizon)
    result["selected"] = "holt_winters" if winter_mae < baseline_mae else "weekday_average"
    result["validation"] = {"days": 14, "weekday_mae": round(baseline_mae, 2),
                            "holt_winters_mae": round(winter_mae, 2)}
    return result
