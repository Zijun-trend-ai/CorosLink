import type { ReactNode } from "react";
import { Activity, Flame, Heart, Zap } from "lucide-react";
import {
  formatOptionalNumber,
  formatSignedDelta
} from "../formatters";
import { recoveryTone } from "../parsers";
import type { TrainingSummaryMetrics } from "../types";

interface TrainingSummaryTilesProps {
  summary: TrainingSummaryMetrics;
  layout?: "row" | "stack";
}

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  variant?: "bar" | "widget";
  tone?: "stamina" | "load" | "heart" | "recovery-high" | "recovery-mid" | "recovery-low" | "recovery-neutral";
}

function StatCard({
  icon,
  label,
  value,
  detail,
  variant = "bar",
  tone = "stamina"
}: StatCardProps) {
  if (variant === "widget") {
    return (
      <section className={`training-stat-card is-widget tone-${tone}`}>
        <div className="training-stat-card__icon" aria-hidden="true">
          {icon}
        </div>
        <p className="training-stat-card__label">{label}</p>
        <strong
          className={`training-stat-card__value${
            value === "–" ? " is-empty" : ""
          }`}
        >
          {value}
        </strong>
        <span className="training-stat-card__detail">{detail}</span>
      </section>
    );
  }

  return (
    <section className={`training-stat-card tone-${tone}`}>
      <div className="training-stat-card__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="training-stat-card__label">{label}</p>
      <span className="training-stat-card__detail">{detail}</span>
      <strong className="training-stat-card__value">{value}</strong>
    </section>
  );
}

export function TrainingSummaryTiles({
  summary,
  layout = "row"
}: TrainingSummaryTilesProps) {
  const recoveryState = recoveryTone(summary.recoveryPct);
  const recoveryToneClass =
    recoveryState === "neutral"
      ? "recovery-neutral"
      : (`recovery-${recoveryState}` as const);
  const variant = layout === "stack" ? "widget" : "bar";
  const iconSize = variant === "widget" ? 13 : 16;

  return (
    <div
      className={`training-summary-tiles${
        layout === "stack" ? " is-stack" : ""
      }`}
    >
      <StatCard
        icon={<Zap size={iconSize} />}
        label="Stamina"
        value={formatOptionalNumber(summary.staminaLevel)}
        detail={variant === "widget" ? "fitness 0–100" : "fitness level (0–100)"}
        variant={variant}
        tone="stamina"
      />

      <StatCard
        icon={<Activity size={iconSize} />}
        label="Recovery"
        value={
          summary.recoveryPct !== undefined
            ? `${Math.round(summary.recoveryPct)}%`
            : "–"
        }
        detail={
          recoveryState === "high"
            ? "ready to train"
            : recoveryState === "mid"
              ? variant === "widget"
                ? "moderate"
                : "moderate readiness"
              : recoveryState === "low"
                ? "needs rest"
                : variant === "widget"
                  ? "status"
                  : "recovery status"
        }
        variant={variant}
        tone={recoveryToneClass}
      />

      <StatCard
        icon={<Flame size={iconSize} />}
        label={variant === "widget" ? "Load" : "Training Load"}
        value={formatOptionalNumber(summary.todayLoad)}
        detail={
          summary.weekLoadTotal !== undefined
            ? variant === "widget"
              ? `${Math.round(summary.weekLoadTotal)} / 7 days`
              : `${Math.round(summary.weekLoadTotal)} load over 7 days`
            : variant === "widget"
              ? "today"
              : "today's load"
        }
        variant={variant}
        tone="load"
      />

      <StatCard
        icon={<Heart size={iconSize} />}
        label="Resting HR"
        value={
          summary.latestRhr !== undefined ? `${Math.round(summary.latestRhr)}` : "–"
        }
        detail={
          summary.rhrDelta !== undefined
            ? variant === "widget"
              ? `${formatSignedDelta(summary.rhrDelta, "")} vs avg`
              : `${formatSignedDelta(summary.rhrDelta, " bpm")} vs 7-day avg`
            : variant === "widget"
              ? "bpm"
              : "beats per minute"
        }
        variant={variant}
        tone="heart"
      />
    </div>
  );
}
