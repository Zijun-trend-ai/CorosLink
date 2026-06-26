import { useMemo, useState } from "react";
import {
  Activity,
  Loader2,
  LogIn,
  RefreshCw
} from "lucide-react";
import { ActivityDetailPanel } from "./components/ActivityDetailPanel";
import { FitnessScoresPanel } from "./components/FitnessScoresPanel";
import { RacePredictorCards } from "./components/RacePredictorCards";
import { RecoveryRing } from "./components/RecoveryRing";
import { TrainingActivityTable } from "./components/TrainingActivityTable";
import { TrainingSummaryTiles } from "./components/TrainingSummaryTiles";
import { TrainingTrendCharts } from "./components/TrainingTrendChart";
import type { TrainingHubViewProps } from "./types";

export function TrainingHubView({
  status,
  email,
  password,
  activities,
  snapshot,
  sportTypes,
  activityDetail,
  fileUrl,
  busy,
  onEmailChange,
  onPasswordChange,
  onLogin,
  onLogout,
  onRefresh,
  onLoadDetail,
  onGetFileUrl
}: TrainingHubViewProps) {
  const connected = Boolean(status?.authenticated);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const summary = useMemo(
    () =>
      snapshot?.summary ?? {
        staminaLevel: undefined,
        recoveryPct: undefined,
        todayLoad: undefined,
        weekLoadTotal: undefined,
        latestRhr: undefined,
        rhrDelta: undefined
      },
    [snapshot]
  );

  return (
    <div className="stack training-dashboard">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Training Hub</p>
            <h2>{connected ? "Connected" : "Connect COROS"}</h2>
          </div>
          <span className={connected ? "badge ready" : "badge"}>
            {connected ? "Authenticated" : "Not connected"}
          </span>
        </div>

        {connected ? (
          <div className="training-status-grid">
            <div>
              <span>User ID</span>
              <strong>{status?.userId ?? "Unknown"}</strong>
            </div>
            <div>
              <span>Region</span>
              <strong>{status?.regionId ?? "Unknown"}</strong>
            </div>
            {showConnectionDetails ? (
              <div className="training-status-host">
                <span>API host</span>
                <strong>{status?.baseUrl ?? "Unknown"}</strong>
              </div>
            ) : null}
            <div className="settings-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowConnectionDetails((current) => !current)}
              >
                {showConnectionDetails ? "Hide details" : "Details"}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy === "training-refresh"}
                onClick={onRefresh}
              >
                {busy === "training-refresh" ? (
                  <Loader2 className="spin" size={17} aria-hidden="true" />
                ) : (
                  <RefreshCw size={17} aria-hidden="true" />
                )}
                Refresh
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy === "training-logout"}
                onClick={onLogout}
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <form className="settings-grid training-login-grid" onSubmit={onLogin}>
            <label className="field">
              <span>Email</span>
              <input
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="COROS account email"
                type="email"
                disabled={busy === "training-login"}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="COROS password"
                type="password"
                disabled={busy === "training-login"}
              />
            </label>
            <div className="settings-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!email.trim() || !password || busy === "training-login"}
              >
                {busy === "training-login" ? (
                  <Loader2 className="spin" size={17} aria-hidden="true" />
                ) : (
                  <LogIn size={17} aria-hidden="true" />
                )}
                Log in
              </button>
            </div>
          </form>
        )}
      </section>

      {connected ? (
        <>
          <TrainingSummaryTiles summary={summary} />

          <div className="training-dashboard-grid">
            <RecoveryRing summary={summary} />
            <TrainingTrendCharts points={snapshot?.trendPoints ?? []} />
          </div>

          <div className="training-secondary-grid">
            <FitnessScoresPanel racePredictor={snapshot?.racePredictor ?? null} />
            <RacePredictorCards racePredictor={snapshot?.racePredictor ?? null} />
          </div>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Recent Activities</p>
                <h2>{activities.length} activity(s)</h2>
              </div>
              <Activity size={22} aria-hidden="true" />
            </div>
            <TrainingActivityTable
              activities={activities}
              sportTypes={sportTypes}
              busy={busy}
              onLoadDetail={onLoadDetail}
              onGetFileUrl={onGetFileUrl}
            />
          </section>

          <ActivityDetailPanel detail={activityDetail} fileUrl={fileUrl} />
        </>
      ) : (
        <section className="panel">
          <div className="training-empty-state">
            <p>Log in to load Training Hub data.</p>
          </div>
        </section>
      )}
    </div>
  );
}

export type { TrainingHubViewProps };
