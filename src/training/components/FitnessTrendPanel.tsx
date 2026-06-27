import { useEffect, useState } from "react";
import type { TrainingHubDailyMetric } from "../../../electron/types";
import { formatSignedDelta } from "../formatters";
import type { TrainingHubSnapshot } from "../types";

interface FitnessTrendPanelProps {
  snapshot: TrainingHubSnapshot | null;
}

function mergeDayList(snapshot: TrainingHubSnapshot | null): TrainingHubDailyMetric[] {
  const combined = new Map<string, TrainingHubDailyMetric>();

  for (const day of snapshot?.analytics?.dayList ?? []) {
    if (day.happenDay) {
      combined.set(day.happenDay, { ...day });
    }
  }

  for (const day of snapshot?.dailyMetrics?.dayList ?? []) {
    if (!day.happenDay) {
      continue;
    }
    combined.set(day.happenDay, { ...combined.get(day.happenDay), ...day });
  }

  return [...combined.values()].sort((left, right) =>
    left.happenDay.localeCompare(right.happenDay)
  );
}

function delta(values: number[]): number | undefined {
  return values.length >= 2 ? values[values.length - 1] - values[0] : undefined;
}

export function FitnessTrendPanel({ snapshot }: FitnessTrendPanelProps) {
  const [isReady, setIsReady] = useState(false);
  const days = mergeDayList(snapshot);

  const hasStamina = days.some((day) => Number.isFinite(day.staminaLevel));
  const bars = days
    .map((day) => ({
      key: day.happenDay,
      value: hasStamina ? day.staminaLevel : day.trainingLoad
    }))
    .filter((bar): bar is { key: string; value: number } =>
      Number.isFinite(bar.value)
    )
    .slice(-8);

  const maxValue = bars.reduce((max, bar) => Math.max(max, bar.value), 0) || 1;

  const fitnessDelta = delta(
    days.map((day) => day.staminaLevel).filter((v): v is number => Number.isFinite(v))
  );
  const fatigueDelta = delta(
    days
      .map((day) => day.tiredRateNew)
      .filter((v): v is number => Number.isFinite(v))
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(frame);
  }, [bars.length]);

  return (
    <section className="panel training-fitness-panel">
      <div className="training-fitness-header">
        <p className="eyebrow">Fitness Trend</p>
        <span className="training-range-pill">
          {bars.length > 0 ? `Last ${bars.length} days` : "No data"}
        </span>
      </div>

      {bars.length > 0 ? (
        <>
          <div className="training-fitness-bars" aria-hidden="true">
            {bars.map((bar, index) => (
              <span
                key={bar.key}
                className="training-fitness-bar"
                style={{
                  height: isReady
                    ? `${Math.max(16, (bar.value / maxValue) * 100)}%`
                    : "0%",
                  transitionDelay: `${index * 60}ms`
                }}
              />
            ))}
          </div>

          <div className="training-fitness-tiles">
            <div
              className={`training-fitness-tile ${
                fitnessDelta === undefined
                  ? ""
                  : fitnessDelta >= 0
                    ? "is-good"
                    : "is-warn"
              }`}
            >
              <strong>{formatSignedDelta(fitnessDelta)}</strong>
              <span>base fitness</span>
            </div>
            <div
              className={`training-fitness-tile ${
                fatigueDelta === undefined
                  ? ""
                  : fatigueDelta <= 0
                    ? "is-good"
                    : "is-warn"
              }`}
            >
              <strong>{formatSignedDelta(fatigueDelta)}</strong>
              <span>fatigue</span>
            </div>
          </div>
        </>
      ) : (
        <p className="training-empty-state">No fitness trend data yet.</p>
      )}
    </section>
  );
}
