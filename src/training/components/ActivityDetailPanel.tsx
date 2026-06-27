import { useState } from "react";
import type { TrainingHubActivityDetail } from "../../../electron/types";
import {
  formatDistanceMeters,
  formatDurationSeconds,
  formatElevationMeters,
  formatOptionalNumber
} from "../formatters";

interface ActivityDetailPanelProps {
  detail: TrainingHubActivityDetail | null;
  fileUrl: string | null;
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="activity-detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ActivityDetailPanel({ detail, fileUrl }: ActivityDetailPanelProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!detail && !fileUrl) {
    return null;
  }

  if (fileUrl) {
    return (
      <section className="panel training-file-panel">
        <div className="section-heading compact">
          <h2>Activity file URL</h2>
        </div>
        <div className="training-file-url">
          <a href={fileUrl} target="_blank" rel="noreferrer">
            {fileUrl}
          </a>
        </div>
      </section>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <section className="panel training-detail-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Activity Detail</p>
          <h2>{detail.name ?? "Selected activity"}</h2>
        </div>
      </div>

      <div className="activity-detail-grid">
        <DetailStat
          label="Duration"
          value={formatDurationSeconds(detail.duration)}
        />
        <DetailStat
          label="Distance"
          value={formatDistanceMeters(detail.distance)}
        />
        <DetailStat label="Avg HR" value={formatOptionalNumber(detail.avgHr)} />
        <DetailStat label="Max HR" value={formatOptionalNumber(detail.maxHr)} />
        <DetailStat
          label="Calories"
          value={formatOptionalNumber(detail.calories)}
        />
        <DetailStat
          label="Elevation"
          value={formatElevationMeters(detail.elevationGain)}
        />
        <DetailStat
          label="Training Load"
          value={formatOptionalNumber(detail.trainingLoad)}
        />
      </div>

      {detail.laps.length > 0 ? (
        <div className="training-laps-section">
          <h3>Laps</h3>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Duration</th>
                  <th>Distance</th>
                  <th>Avg HR</th>
                  <th>Max HR</th>
                  <th>Elev.</th>
                </tr>
              </thead>
              <tbody>
                {detail.laps.map((lap) => (
                  <tr key={lap.index}>
                    <td>{lap.index}</td>
                    <td>{formatDurationSeconds(lap.duration)}</td>
                    <td>{formatDistanceMeters(lap.distance)}</td>
                    <td>{formatOptionalNumber(lap.avgHr)}</td>
                    <td>{formatOptionalNumber(lap.maxHr)}</td>
                    <td>{formatElevationMeters(lap.elevationGain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="training-raw-toggle">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowRaw((current) => !current)}
        >
          {showRaw ? "Hide raw JSON" : "Show raw JSON"}
        </button>
      </div>

      {showRaw ? (
        <pre className="training-raw-json">{JSON.stringify(detail.raw, null, 2)}</pre>
      ) : null}
    </section>
  );
}
