import { Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  TrainingHubDashboard,
  TrainingHubPersonalRecord
} from "../../../electron/types";
import {
  formatDurationSeconds,
  formatHappenDayLabel,
  formatPaceSecondsPerKm
} from "../formatters";

interface PersonalRecordsPanelProps {
  dashboard: TrainingHubDashboard | null;
}

function formatRecordDate(happenDay?: string): string {
  if (!happenDay) {
    return "—";
  }

  return formatHappenDayLabel(happenDay);
}

function formatRecordTime(record: TrainingHubPersonalRecord): string {
  if (record.duration !== undefined && record.duration > 0) {
    return formatDurationSeconds(record.duration);
  }

  return "—";
}

export function PersonalRecordsPanel({ dashboard }: PersonalRecordsPanelProps) {
  const groups = dashboard?.personalRecords ?? [];
  const [activeGroupType, setActiveGroupType] = useState<number>(
    groups[0]?.type ?? 1
  );

  const activeGroup = useMemo(
    () => groups.find((group) => group.type === activeGroupType) ?? groups[0],
    [activeGroupType, groups]
  );

  const records = (activeGroup?.records ?? []).filter(
    (record) => record.duration !== undefined || record.distance !== undefined
  );

  return (
    <section className="panel training-records-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Personal Records</h2>
        </div>
        <Trophy size={22} aria-hidden="true" />
      </div>

      {groups.length > 1 ? (
        <div className="training-records-tabs" role="tablist" aria-label="Record period">
          {groups.map((group) => (
            <button
              key={group.type}
              type="button"
              role="tab"
              aria-selected={group.type === activeGroup?.type}
              className={
                group.type === activeGroup?.type
                  ? "training-records-tab active"
                  : "training-records-tab"
              }
              onClick={() => setActiveGroupType(group.type)}
            >
              {group.label}
            </button>
          ))}
        </div>
      ) : null}

      {records.length > 0 ? (
        <div className="table-shell training-records-table-shell">
          <table>
            <thead>
              <tr>
                <th>Record</th>
                <th>Time</th>
                <th>Pace</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr
                  className="training-table-row"
                  key={`${record.type}-${record.happenDay ?? index}`}
                >
                  <td>
                    <strong className="training-records-label">
                      {record.label}
                    </strong>
                  </td>
                  <td>{formatRecordTime(record)}</td>
                  <td>{formatPaceSecondsPerKm(record.avgPace)}</td>
                  <td>{formatRecordDate(record.happenDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="training-empty-state">
          <p>No personal records loaded from your COROS dashboard yet.</p>
        </div>
      )}

      {dashboard?.sleepHrv?.recentReadings.length ? (
        <div className="training-dashboard-meta">
          <div>
            <span>Latest sleep HRV</span>
            <strong>
              {dashboard.sleepHrv.avgSleepHrv !== undefined
                ? `${Math.round(dashboard.sleepHrv.avgSleepHrv)} ms`
                : dashboard.sleepHrv.recentReadings.at(-1)?.avgSleepHrv !==
                    undefined
                  ? `${Math.round(
                      dashboard.sleepHrv.recentReadings.at(-1)!.avgSleepHrv!
                    )} ms`
                  : "—"}
            </strong>
          </div>
          <div>
            <span>Resting HR</span>
            <strong>
              {dashboard.rhr !== undefined ? `${Math.round(dashboard.rhr)} bpm` : "—"}
            </strong>
          </div>
          <div>
            <span>Max HR</span>
            <strong>
              {dashboard.fitnessMaxHr !== undefined
                ? `${Math.round(dashboard.fitnessMaxHr)} bpm`
                : "—"}
            </strong>
          </div>
        </div>
      ) : null}
    </section>
  );
}
