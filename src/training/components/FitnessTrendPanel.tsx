import { useEffect, useMemo, useState } from "react";
import type { TrainingHubActivity } from "../../../electron/types";
import { formatHappenDayLabel } from "../formatters";
import { mergeTrainingDayLists } from "../parsers";
import type { TrainingHubSnapshot } from "../types";
import {
  buildWeeklyActivitySeries,
  buildWeeklyActivityYAxisTicks,
  enrichDayListWithActivityTotals,
  formatWeeklyActivityAxisTick,
  getWeeklyActivityMetricLabel,
  getWeeklyActivityYAxisUnitLabel,
  WEEKLY_ACTIVITY_METRICS,
  type WeeklyActivityMetric
} from "../weeklyActivity";

interface FitnessTrendPanelProps {
  snapshot: TrainingHubSnapshot | null;
  activities?: TrainingHubActivity[];
}

export function FitnessTrendPanel({
  snapshot,
  activities = []
}: FitnessTrendPanelProps) {
  const [barsVisible, setBarsVisible] = useState(false);
  const [metric, setMetric] = useState<WeeklyActivityMetric>("distance");
  const dayList = useMemo(
    () =>
      enrichDayListWithActivityTotals(
        mergeTrainingDayLists(
          snapshot?.dailyMetrics ?? null,
          snapshot?.analytics ?? null
        ),
        activities
      ),
    [snapshot, activities]
  );
  const series = useMemo(
    () => buildWeeklyActivitySeries(dayList, metric),
    [dayList, metric]
  );
  const maxValue = series.yMax || 1;
  const yAxisTicks = useMemo(
    () => buildWeeklyActivityYAxisTicks(maxValue),
    [maxValue]
  );
  const yAxisUnitLabel = getWeeklyActivityYAxisUnitLabel(metric, series.yAxisUnit);

  useEffect(() => {
    setBarsVisible(false);
    const frame = requestAnimationFrame(() => setBarsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [metric, series.hasData]);

  return (
    <section className="panel training-fitness-panel">
      <div className="training-fitness-header">
        <p className="eyebrow">Weekly Activity</p>
        <label className="training-metric-select-wrap">
          <span className="sr-only">Activity metric</span>
          <select
            className="training-range-pill training-metric-select"
            value={metric}
            onChange={(event) =>
              setMetric(event.target.value as WeeklyActivityMetric)
            }
          >
            {WEEKLY_ACTIVITY_METRICS.map((option) => (
              <option key={option} value={option}>
                {getWeeklyActivityMetricLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {series.hasData ? (
        <div
          className="training-fitness-chart"
          role="img"
          aria-label={`Weekly ${series.metricLabel.toLowerCase()} chart. Week total ${series.weeklyTotal}. Y-axis in ${yAxisUnitLabel || series.metricLabel}.`}
        >
          <div className="training-fitness-y-axis" aria-hidden="true">
            {yAxisUnitLabel ? (
              <span className="training-fitness-y-unit">{yAxisUnitLabel}</span>
            ) : null}
            <div className="training-fitness-y-ticks">
              {[...yAxisTicks].reverse().map((tick) => (
                <span key={tick} className="training-fitness-y-tick">
                  {formatWeeklyActivityAxisTick(tick, metric, series.yAxisUnit)}
                </span>
              ))}
            </div>
          </div>

          <div className="training-fitness-plot">
            <div className="training-fitness-grid-lines" aria-hidden="true">
              {yAxisTicks.map((tick) => (
                <span
                  key={tick}
                  className="training-fitness-grid-line"
                  style={{ bottom: `${(tick / maxValue) * 100}%` }}
                />
              ))}
            </div>

            <div
              className="training-fitness-bars"
              role="list"
              aria-label="Weekly activity for the current calendar week"
            >
              {series.days.map((bar, index) => {
                const hasValue = bar.value > 0;
                const fullLabel = formatHappenDayLabel(bar.happenDay);

                return (
                  <span
                    key={bar.happenDay}
                    className={`training-fitness-day${
                      !hasValue ? " is-empty" : ""
                    }${bar.isToday ? " is-today" : ""}`}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${fullLabel}: ${bar.displayValue}`}
                  >
                    <span
                      className="training-fitness-bar"
                      style={{
                        height:
                          barsVisible && hasValue
                            ? `${Math.max(10, (bar.value / maxValue) * 100)}%`
                            : undefined,
                        transitionDelay: `${index * 60}ms`
                      }}
                    />
                    <span className="training-fitness-date">{bar.weekdayLabel}</span>
                    <span className="training-fitness-tooltip" role="tooltip">
                      <strong>{fullLabel}</strong>
                      <span>{series.metricLabel}: {bar.displayValue}</span>
                      {series.weeklyTotal !== "—" ? (
                        <span>Week total: {series.weeklyTotal}</span>
                      ) : null}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="training-empty-state">No weekly activity data yet.</p>
      )}
    </section>
  );
}
