import { useEffect, useState } from "react";
import type { TrainingSummaryMetrics } from "../types";

interface RecoveryRingProps {
  summary: TrainingSummaryMetrics;
}

export function RecoveryRing({ summary }: RecoveryRingProps) {
  const [isReady, setIsReady] = useState(false);
  const stamina = summary.staminaLevel ?? 0;
  const recovery = summary.recoveryPct ?? stamina;
  const percent = Math.max(0, Math.min(100, recovery));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (percent / 100) * circumference;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <section className="panel training-ring-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Readiness</p>
          <h2>{percent > 0 ? `${Math.round(percent)}%` : "No data"}</h2>
        </div>
      </div>

      <div
        className={`storage-ring training-recovery-ring${isReady ? " is-ready" : ""}`}
        aria-label={`${Math.round(percent)}% recovery`}
      >
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle className="storage-ring-track" cx="64" cy="64" r={radius} />
          <circle
            className="storage-ring-progress training-recovery-ring-progress"
            cx="64"
            cy="64"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={isReady ? targetOffset : circumference}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="storage-ring-label">
          <strong>{percent > 0 ? `${Math.round(percent)}%` : "-"}</strong>
          <span>
            {summary.staminaLevel !== undefined
              ? `stamina ${Math.round(summary.staminaLevel)}`
              : "recovery"}
          </span>
        </div>
      </div>
    </section>
  );
}
