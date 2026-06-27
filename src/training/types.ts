import type { FormEvent } from "react";
import type {
  TrainingHubActivity,
  TrainingHubActivityDetail,
  TrainingHubActivityFileType,
  TrainingHubAnalytics,
  TrainingHubDailyMetric,
  TrainingHubDailyMetrics,
  TrainingHubDashboard,
  TrainingHubRacePredictor,
  TrainingHubSportType,
  TrainingHubStatus,
  TrainingHubUpcomingWorkout
} from "../../electron/types";

export interface TrainingTrendPoint {
  date: string;
  label: string;
  trainingLoad?: number;
  avgSleepHrv?: number;
  sleepHrvBase?: number;
  rhr?: number;
}

export interface TrainingSummaryMetrics {
  staminaLevel?: number;
  recoveryPct?: number;
  todayLoad?: number;
  weekLoadTotal?: number;
  latestRhr?: number;
  rhrDelta?: number;
}

export interface TrainingHubSnapshot {
  summary: TrainingSummaryMetrics;
  trendPoints: TrainingTrendPoint[];
  racePredictor: TrainingHubRacePredictor | null;
  dashboard: TrainingHubDashboard | null;
  analytics: TrainingHubAnalytics | null;
  dailyMetrics: TrainingHubDailyMetrics | null;
}

export interface TrainingHubViewProps {
  status: TrainingHubStatus | null;
  email: string;
  password: string;
  activities: TrainingHubActivity[];
  upcomingWorkouts: TrainingHubUpcomingWorkout[];
  snapshot: TrainingHubSnapshot | null;
  sportTypes: TrainingHubSportType[];
  activityDetail: TrainingHubActivityDetail | null;
  fileUrl: string | null;
  busy: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onLoadDetail: (activity: TrainingHubActivity) => void;
  onGetFileUrl: (
    activity: TrainingHubActivity,
    fileType: TrainingHubActivityFileType
  ) => void;
}

export type { TrainingHubDailyMetric };
