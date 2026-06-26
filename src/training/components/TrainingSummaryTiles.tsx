import { Activity, Flame, Heart, Zap } from "lucide-react";
import {
  formatOptionalNumber,
  formatSignedDelta
} from "../formatters";
import { recoveryTone } from "../parsers";
import type { TrainingSummaryMetrics } from "../types";

interface TrainingSummaryTilesProps {
  summary: TrainingSummaryMetrics;
}

export function TrainingSummaryTiles({ summary }: TrainingSummaryTilesProps) {
  const recoveryState = recoveryTone(summary.recoveryPct);

  return (
    <div className="training-summary-tiles">
      <section className="metric-tile">
        <div className="metric-tile-icon">
          <Zap size={18} aria-hidden="true" />
        </div>
        <p className="eyebrow">Stamina</p>
        <strong className="metric-value">
          {formatOptionalNumber(summary.staminaLevel)}
        </strong>
        <span>fitness level (0–100)</span>
      </section>

      <section
        className={`metric-tile training-recovery-tile training-recovery-${recoveryState}`}
      >
        <div className="metric-tile-icon">
          <Activity size={18} aria-hidden="true" />
        </div>
        <p className="eyebrow">Recovery</p>
        <strong className="metric-value">
          {summary.recoveryPct !== undefined
            ? `${Math.round(summary.recoveryPct)}%`
            : "-"}
        </strong>
        <span>
          {recoveryState === "high"
            ? "ready to train"
            : recoveryState === "mid"
              ? "moderate readiness"
              : recoveryState === "low"
                ? "needs rest"
                : "recovery status"}
        </span>
      </section>

      <section className="metric-tile">
        <div className="metric-tile-icon">
          <Flame size={18} aria-hidden="true" />
        </div>
        <p className="eyebrow">Training Load</p>
        <strong className="metric-value">
          {formatOptionalNumber(summary.todayLoad)}
        </strong>
        <span>
          {summary.weekLoadTotal !== undefined
            ? `${Math.round(summary.weekLoadTotal)} load over 7 days`
            : "today's load"}
        </span>
      </section>

      <section className="metric-tile">
        <div className="metric-tile-icon">
          <Heart size={18} aria-hidden="true" />
        </div>
        <p className="eyebrow">Resting HR</p>
        <strong className="metric-value">
          {summary.latestRhr !== undefined ? `${Math.round(summary.latestRhr)}` : "-"}
        </strong>
        <span>
          {summary.rhrDelta !== undefined
            ? `${formatSignedDelta(summary.rhrDelta, " bpm")} vs 7-day avg`
            : "beats per minute"}
        </span>
      </section>
    </div>
  );
}
