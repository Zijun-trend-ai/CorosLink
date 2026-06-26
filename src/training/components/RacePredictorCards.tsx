import type { TrainingHubRacePredictor } from "../../../electron/types";
import { formatDurationSeconds } from "../formatters";

interface RacePredictorCardsProps {
  racePredictor: TrainingHubRacePredictor | null;
}

export function RacePredictorCards({ racePredictor }: RacePredictorCardsProps) {
  const scores = racePredictor?.runScoreList ?? [];

  return (
    <section className="panel training-race-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Race Predictor</p>
          <h2>Estimated finish times</h2>
        </div>
      </div>

      {scores.length > 0 ? (
        <div className="race-card-grid">
          {scores.map((score, index) => {
            const label =
              score.distanceLabel ??
              (score.distance
                ? `${(score.distance / 1000).toFixed(1)} km`
                : `Race ${index + 1}`);

            return (
              <article
                key={`${label}-${score.predictSeconds ?? index}`}
                className="race-card"
              >
                <p className="eyebrow">{label}</p>
                <strong>
                  {score.predictSeconds
                    ? formatDurationSeconds(score.predictSeconds)
                    : "-"}
                </strong>
                {score.score !== undefined ? (
                  <span>score {Math.round(score.score)}</span>
                ) : (
                  <span>predicted finish</span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="training-empty-chart">
          No race predictions available yet. Complete more runs to unlock estimates.
        </p>
      )}
    </section>
  );
}
