import { FileDown, Loader2, Search } from "lucide-react";
import type {
  TrainingHubActivity,
  TrainingHubActivityFileType,
  TrainingHubSportType
} from "../../../electron/types";
import {
  formatDistanceMeters,
  formatDurationSeconds,
  formatElevationMeters,
  formatOptionalNumber,
  formatTrainingTimestamp
} from "../formatters";

interface TrainingActivityTableProps {
  activities: TrainingHubActivity[];
  sportTypes: TrainingHubSportType[];
  busy: string | null;
  onLoadDetail: (activity: TrainingHubActivity) => void;
  onGetFileUrl: (
    activity: TrainingHubActivity,
    fileType: TrainingHubActivityFileType
  ) => void;
}

function resolveSportName(
  activity: TrainingHubActivity,
  sportTypeMap: Map<number, string>
): string {
  return (
    activity.sportName ??
    sportTypeMap.get(activity.sportType) ??
    `Sport ${activity.sportType}`
  );
}

function sportChipClass(sportType: number): string {
  const palette = sportType % 5;
  return `sport-chip sport-chip-${palette}`;
}

export function TrainingActivityTable({
  activities,
  sportTypes,
  busy,
  onLoadDetail,
  onGetFileUrl
}: TrainingActivityTableProps) {
  const sportTypeMap = new Map(
    sportTypes.map((item) => [item.sportType, item.sportName])
  );

  if (activities.length === 0) {
    return (
      <div className="training-empty-state">
        <p>No Training Hub activities loaded.</p>
      </div>
    );
  }

  return (
    <div className="table-shell training-activity-table-shell">
      <table>
        <thead>
          <tr>
            <th>Activity</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Distance</th>
            <th>Load</th>
            <th>Avg HR</th>
            <th>Calories</th>
            <th>Elev.</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {activities.map((activity, index) => {
            const sportName = resolveSportName(activity, sportTypeMap);
            const activityName =
              activity.name || sportName || `Activity ${index + 1}`;

            return (
              <tr key={activity.activityId || `${activity.sportType}-${index}`}>
                <td>
                  <div className="training-activity-name">
                    <strong>{activityName}</strong>
                    <span className={sportChipClass(activity.sportType)}>
                      {sportName}
                    </span>
                  </div>
                </td>
                <td>{formatTrainingTimestamp(activity.startTime)}</td>
                <td>{formatDurationSeconds(activity.duration)}</td>
                <td>{formatDistanceMeters(activity.distance)}</td>
                <td>{formatOptionalNumber(activity.trainingLoad)}</td>
                <td>{formatOptionalNumber(activity.avgHr)}</td>
                <td>{formatOptionalNumber(activity.calories)}</td>
                <td>{formatElevationMeters(activity.elevationGain)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      title="Load activity detail"
                      disabled={busy === `training-detail:${activity.activityId}`}
                      onClick={() => onLoadDetail(activity)}
                    >
                      {busy === `training-detail:${activity.activityId}` ? (
                        <Loader2 className="spin" size={17} aria-hidden="true" />
                      ) : (
                        <Search size={17} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title="Get FIT file URL"
                      disabled={busy === `training-file:${activity.activityId}:4`}
                      onClick={() => onGetFileUrl(activity, 4)}
                    >
                      {busy === `training-file:${activity.activityId}:4` ? (
                        <Loader2 className="spin" size={17} aria-hidden="true" />
                      ) : (
                        <FileDown size={17} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
