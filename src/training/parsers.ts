import type {
  TrainingHubAnalytics,
  TrainingHubDailyMetric,
  TrainingHubDailyMetrics,
  TrainingHubDashboard
} from "../../electron/types";
import { formatHappenDayLabel } from "./formatters";
import type { TrainingHubSnapshot, TrainingSummaryMetrics, TrainingTrendPoint } from "./types";

function mergeDayLists(
  dailyMetrics: TrainingHubDailyMetrics | null,
  analytics: TrainingHubAnalytics | null
): TrainingHubDailyMetric[] {
  const combined = new Map<string, TrainingHubDailyMetric>();

  for (const day of analytics?.dayList ?? []) {
    if (day.happenDay) {
      combined.set(day.happenDay, { ...day });
    }
  }

  for (const day of dailyMetrics?.dayList ?? []) {
    if (!day.happenDay) {
      continue;
    }

    combined.set(day.happenDay, {
      ...combined.get(day.happenDay),
      ...day
    });
  }

  return [...combined.values()].sort((left, right) =>
    left.happenDay.localeCompare(right.happenDay)
  );
}

function buildTrendPoints(dayList: TrainingHubDailyMetric[]): TrainingTrendPoint[] {
  return dayList.slice(-7).map((day) => ({
    date: day.happenDay,
    label: formatHappenDayLabel(day.happenDay),
    trainingLoad: day.trainingLoad,
    avgSleepHrv: day.avgSleepHrv,
    sleepHrvBase: day.sleepHrvBase,
    rhr: day.rhr
  }));
}

function buildSummary(
  dayList: TrainingHubDailyMetric[],
  dashboard: TrainingHubDashboard | null
): TrainingSummaryMetrics {
  const racePredictor = dashboard?.racePredictor ?? null;
  const recent = dayList.slice(-7);
  const latest = recent[recent.length - 1];
  const priorRhrValues = recent
    .slice(0, -1)
    .map((day) => day.rhr)
    .filter((value): value is number => Number.isFinite(value));

  const priorRhrAverage =
    priorRhrValues.length > 0
      ? priorRhrValues.reduce((total, value) => total + value, 0) /
        priorRhrValues.length
      : undefined;

  const weekLoadTotal = recent.reduce(
    (total, day) => total + (day.trainingLoad ?? 0),
    0
  );
  const latestRhr = latest?.rhr ?? dashboard?.rhr;

  return {
    staminaLevel: racePredictor?.staminaLevel ?? latest?.staminaLevel,
    recoveryPct: racePredictor?.recoveryPct ?? dashboard?.recoveryPct,
    todayLoad: latest?.trainingLoad,
    weekLoadTotal: weekLoadTotal > 0 ? weekLoadTotal : undefined,
    latestRhr,
    rhrDelta:
      latestRhr !== undefined && priorRhrAverage !== undefined
        ? latestRhr - priorRhrAverage
        : undefined
  };
}

export function buildTrainingHubSnapshot(
  analytics: TrainingHubAnalytics | null,
  dashboard: TrainingHubDashboard | null,
  dailyMetrics: TrainingHubDailyMetrics | null
): TrainingHubSnapshot {
  const dayList = mergeDayLists(dailyMetrics, analytics);

  return {
    summary: buildSummary(dayList, dashboard),
    trendPoints: buildTrendPoints(dayList),
    racePredictor: dashboard?.racePredictor ?? null,
    dashboard,
    analytics,
    dailyMetrics
  };
}

export function recoveryTone(
  recoveryPct?: number
): "low" | "mid" | "high" | "neutral" {
  if (recoveryPct === undefined) {
    return "neutral";
  }

  if (recoveryPct < 40) {
    return "low";
  }

  if (recoveryPct < 70) {
    return "mid";
  }

  return "high";
}
