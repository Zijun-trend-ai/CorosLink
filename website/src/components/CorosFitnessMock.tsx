import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const trendBars = [48, 56, 52, 64, 68, 76, 72, 84];
const racePredictions = [
  { distance: "5K", time: "21:48" },
  { distance: "10K", time: "45:36" },
  { distance: "Half", time: "1:43:12" },
];
const activities = [
  { title: "Tempo progression", detail: "8.2 mi · 154 bpm", load: "+42" },
  { title: "Easy aerobic", detail: "5.6 mi · 138 bpm", load: "+24" },
  { title: "Track intervals", detail: "6 x 800m · FIT ready", load: "+38" },
];

export function CorosFitnessMock() {
  const reduced = usePrefersReducedMotion();
  const ringOffset = reduced ? 62 : [126, 62, 62, 126];
  const ringTransition = reduced
    ? { duration: 0 }
    : {
        duration: 6.4,
        ease: "easeInOut" as const,
        repeat: Infinity,
        times: [0, 0.48, 0.78, 1],
      };

  return (
    <div className="fitness-mock" aria-label="COROS fitness data desktop dashboard mock">
      <header className="fitness-mock-header">
        <div>
          <span>Training Intelligence</span>
          <strong>COROS account connected</strong>
        </div>
        <div className="fitness-sync-badge">
          <motion.span
            aria-hidden="true"
            animate={reduced ? undefined : { opacity: [0.45, 1, 0.45] }}
            transition={reduced ? undefined : { duration: 1.8, repeat: Infinity }}
          />
          {reduced ? "Updated" : "Syncing data"}
        </div>
      </header>

      <div className="fitness-dashboard-grid">
        <section className="fitness-card fitness-card--recovery" aria-label="Recovery readiness">
          <div className="fitness-card-header">
            <span>Recovery</span>
            <em>{reduced ? "Ready" : "Live"}</em>
          </div>
          <div className="fitness-ring-wrap">
            <svg viewBox="0 0 140 140" aria-hidden="true">
              <circle className="fitness-ring-track" cx="70" cy="70" r="54" />
              <motion.circle
                className="fitness-ring-value"
                cx="70"
                cy="70"
                r="54"
                strokeDasharray="339.3"
                animate={{ strokeDashoffset: ringOffset }}
                transition={ringTransition}
              />
            </svg>
            <div>
              <strong>82%</strong>
              <span>Ready</span>
            </div>
          </div>
          <p>Stamina is stable and recovery is trending up after yesterday's easy run.</p>
        </section>

        <section className="fitness-card fitness-card--trend" aria-label="Fitness trend chart">
          <div className="fitness-card-header">
            <span>Fitness trend</span>
            <em>8 weeks</em>
          </div>
          <div className="fitness-chart" aria-hidden="true">
            {trendBars.map((height, index) => (
              <motion.span
                key={`${height}-${index}`}
                style={{ height: `${height}%` }}
                animate={
                  reduced
                    ? undefined
                    : { opacity: [0.55, 1, 0.7], scaleY: [0.92, 1, 0.94] }
                }
                transition={
                  reduced
                    ? undefined
                    : {
                        delay: index * 0.08,
                        duration: 2.2,
                        repeat: Infinity,
                        repeatDelay: 2.6,
                        ease: "easeInOut",
                      }
                }
              />
            ))}
          </div>
          <div className="fitness-trend-summary">
            <span>
              <strong>+11</strong>
              base fitness
            </span>
            <span>
              <strong>-4</strong>
              fatigue
            </span>
          </div>
        </section>

        <section className="fitness-card fitness-card--race" aria-label="Race predictor estimates">
          <div className="fitness-card-header">
            <span>Race predictor</span>
            <em>Current</em>
          </div>
          <div className="race-prediction-grid">
            {racePredictions.map((race, index) => (
              <motion.div
                key={race.distance}
                animate={
                  reduced
                    ? undefined
                    : {
                        borderColor: [
                          "rgba(255,255,255,0.08)",
                          "rgba(45,154,116,0.38)",
                          "rgba(255,255,255,0.08)",
                        ],
                      }
                }
                transition={
                  reduced
                    ? undefined
                    : {
                        delay: index * 0.2,
                        duration: 2.4,
                        repeat: Infinity,
                        repeatDelay: 3,
                      }
                }
              >
                <span>{race.distance}</span>
                <strong>{race.time}</strong>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="fitness-card fitness-card--activity" aria-label="Recent activities">
          <div className="fitness-card-header">
            <span>Recent activity</span>
            <em>FIT export</em>
          </div>
          <div className="activity-stack">
            {activities.map((activity, index) => (
              <motion.div
                className="activity-row"
                key={activity.title}
                animate={
                  reduced
                    ? { opacity: 1, y: 0 }
                    : { opacity: [0.76, 1, 0.86], y: [0, -2, 0] }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        delay: index * 0.18,
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 3.2,
                        ease: "easeInOut",
                      }
                }
              >
                <span className="activity-icon" aria-hidden="true" />
                <span>
                  <strong>{activity.title}</strong>
                  <small>{activity.detail}</small>
                </span>
                <em>{activity.load}</em>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
