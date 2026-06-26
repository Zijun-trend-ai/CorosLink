import type { TrainingHubRacePredictor } from "../../../electron/types";
import { formatOptionalNumber, formatPaceSecondsPerKm } from "../formatters";

interface FitnessScoresPanelProps {
  racePredictor: TrainingHubRacePredictor | null;
}

interface ScoreItem {
  label: string;
  value?: number;
}

function ScoreBar({ label, value }: ScoreItem) {
  const percent =
    value !== undefined ? Math.max(0, Math.min(100, value)) : undefined;

  return (
    <div className="score-bar">
      <div className="score-bar-header">
        <span>{label}</span>
        <strong>{formatOptionalNumber(value)}</strong>
      </div>
      <div className="score-bar-track">
        <span
          className="score-bar-fill"
          style={{ width: percent !== undefined ? `${percent}%` : "0%" }}
        />
      </div>
    </div>
  );
}

export function FitnessScoresPanel({ racePredictor }: FitnessScoresPanelProps) {
  if (!racePredictor) {
    return (
      <section className="panel training-scores-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Fitness Scores</p>
            <h2>Not loaded</h2>
          </div>
        </div>
        <p className="training-empty-chart">Fitness scores could not be loaded.</p>
      </section>
    );
  }

  const scores: ScoreItem[] = [
    { label: "Aerobic Endurance", value: racePredictor.aerobicEnduranceScore },
    {
      label: "Lactate Threshold",
      value: racePredictor.lactateThresholdCapacityScore
    },
    { label: "Anaerobic Endurance", value: racePredictor.anaerobicEnduranceScore },
    { label: "Anaerobic Capacity", value: racePredictor.anaerobicCapacityScore }
  ];

  return (
    <section className="panel training-scores-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Fitness Scores</p>
          <h2>EvoLab breakdown</h2>
        </div>
      </div>

      <div className="score-bar-list">
        {scores.map((score) => (
          <ScoreBar key={score.label} label={score.label} value={score.value} />
        ))}
      </div>

      <div className="training-threshold-grid">
        <div>
          <span>LTHR</span>
          <strong>
            {racePredictor.lthr !== undefined
              ? `${Math.round(racePredictor.lthr)} bpm`
              : "-"}
          </strong>
        </div>
        <div>
          <span>LT Pace</span>
          <strong>{formatPaceSecondsPerKm(racePredictor.ltsp)}</strong>
        </div>
      </div>
    </section>
  );
}
