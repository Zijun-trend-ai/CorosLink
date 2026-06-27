import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const playlistTracks = [
  { title: "Morning Tempo", artist: "Northline", time: "3:42" },
  { title: "Steady Climb", artist: "Lane Signal", time: "4:08" },
  { title: "Last Kilometer", artist: "Field Kit", time: "3:19" },
];

const queueTracks = [
  { title: "Morning Tempo", state: "Converted", delay: 0 },
  { title: "Steady Climb", state: "Syncing", delay: 0.22 },
  { title: "Last Kilometer", state: "Queued", delay: 0.44 },
];

const youtubeResults = [
  { title: "Hill Repeat Cadence", channel: "Run Room Audio", length: "4:16" },
  { title: "Tempo Block Focus", channel: "Midnight Miles", length: "3:54" },
  { title: "Cooldown Drift", channel: "Signal Park", length: "5:02" },
];

export function SpotifySyncMock() {
  const reduced = usePrefersReducedMotion();
  const progressAnimation = reduced
    ? { width: "100%" }
    : { width: ["18%", "58%", "100%", "100%", "18%"] };
  const progressTransition = reduced
    ? { duration: 0 }
    : {
        duration: 7.2,
        ease: "easeInOut" as const,
        repeat: Infinity,
        times: [0, 0.42, 0.72, 0.88, 1],
      };
  const connectorAnimation = reduced
    ? { opacity: 0.72, x: 0, scale: 1 }
    : { opacity: [0, 1, 0], x: [-20, 20], scale: [0.8, 1, 0.8] };

  return (
    <div className="spotify-sync-mock" aria-label="Animated Spotify playlist sync to Pace Pro">
      <div className="sync-mock-header">
        <div>
          <span>Music Sync</span>
          <strong>Spotify playlist to Pace Pro</strong>
        </div>
        <div className="sync-live-status">
          <motion.span
            aria-hidden="true"
            animate={reduced ? undefined : { opacity: [0.45, 1, 0.45] }}
            transition={reduced ? undefined : { duration: 1.6, repeat: Infinity }}
          />
          {reduced ? "Synced" : "Live sync"}
        </div>
      </div>

      <div className="sync-flow-grid">
        <section className="sync-panel sync-panel--spotify" aria-label="Spotify playlist">
          <PanelHeader eyebrow="Spotify" title="Long Run Mix" meta="42 tracks" />
          <div className="playlist-card">
            <div className="playlist-cover" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <span className="sync-muted">Selected playlist</span>
              <strong>Saturday Pace</strong>
              <p>Ready to import from Spotify</p>
            </div>
          </div>

          <div className="track-stack">
            {playlistTracks.map((track, index) => (
              <motion.div
                className="sync-track-row"
                key={track.title}
                animate={
                  reduced
                    ? undefined
                    : {
                        backgroundColor: [
                          "rgba(255,255,255,0.035)",
                          "rgba(45,154,116,0.14)",
                          "rgba(255,255,255,0.035)",
                        ],
                      }
                }
                transition={
                  reduced
                    ? undefined
                    : {
                        delay: index * 0.32,
                        duration: 2.4,
                        repeat: Infinity,
                        repeatDelay: 3.4,
                      }
                }
              >
                <span className="sync-track-art" aria-hidden="true" />
                <span className="sync-track-meta">
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
                <time>{track.time}</time>
              </motion.div>
            ))}
          </div>
        </section>

        <Connector animation={connectorAnimation} delay={0.2} reduced={reduced} />

        <section className="sync-panel sync-panel--queue" aria-label="CorosLink sync queue">
          <PanelHeader eyebrow="CorosLink" title="Build watch-ready MP3s" meta="Local cache" />
          <div className="sync-progress-block">
            <div>
              <span>Sync progress</span>
              <strong>{reduced ? "100%" : "Syncing"}</strong>
            </div>
            <div className="sync-progress-track" aria-hidden="true">
              <motion.div
                className="sync-progress-fill"
                animate={progressAnimation}
                transition={progressTransition}
              />
            </div>
          </div>

          <div className="queue-stack">
            {queueTracks.map((track) => (
              <motion.div
                className="queue-row"
                key={track.title}
                animate={
                  reduced
                    ? { opacity: 1, y: 0 }
                    : { opacity: [0.72, 1, 0.86], y: [0, -2, 0] }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        delay: track.delay,
                        duration: 2.2,
                        repeat: Infinity,
                        repeatDelay: 2.8,
                        ease: "easeInOut",
                      }
                }
              >
                <span className="queue-file-icon" aria-hidden="true" />
                <span>
                  <strong>{track.title}.mp3</strong>
                  <small>Metadata and audio prepared</small>
                </span>
                <em>{reduced ? "Ready" : track.state}</em>
              </motion.div>
            ))}
          </div>
        </section>

        <Connector animation={connectorAnimation} delay={0.7} reduced={reduced} />

        <section className="sync-panel sync-panel--watch" aria-label="Pace Pro transfer">
          <PanelHeader eyebrow="Pace Pro" title="USB transfer" meta="Connected" />
          <div className="watch-device" aria-hidden="true">
            <div className="watch-band watch-band--top" />
            <div className="watch-face">
              <span>PACE PRO</span>
              <strong>{reduced ? "Ready" : "Syncing"}</strong>
              <small>Music folder</small>
            </div>
            <div className="watch-band watch-band--bottom" />
          </div>

          <div className="watch-transfer-card">
            <div>
              <span>Storage</span>
              <strong>3 playlists synced</strong>
            </div>
            <div className="sync-progress-track" aria-hidden="true">
              <motion.div
                className="sync-progress-fill sync-progress-fill--watch"
                animate={progressAnimation}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { ...progressTransition, delay: 0.7 }
                }
              />
            </div>
            <p>{reduced ? "Ready on Pace Pro" : "Copying tracks over USB"}</p>
          </div>
        </section>
      </div>

      <section className="youtube-browse-strip" aria-label="YouTube browsing fallback">
        <div className="youtube-browse-copy">
          <span className="sync-muted">YouTube Browser</span>
          <strong>Need one specific track?</strong>
          <p>Search, preview a result, and send it into the same local music queue.</p>
        </div>

        <div className="youtube-browser-panel">
          <div className="youtube-search-bar" aria-label="YouTube search query">
            <span aria-hidden="true" />
            <strong>hill repeat cadence</strong>
          </div>

          <div className="youtube-result-stack">
            {youtubeResults.map((result, index) => (
              <motion.div
                className="youtube-result-row"
                key={result.title}
                animate={
                  reduced
                    ? undefined
                    : {
                        borderColor: [
                          "rgba(255,255,255,0.08)",
                          "rgba(225,72,72,0.42)",
                          "rgba(255,255,255,0.08)",
                        ],
                        backgroundColor: [
                          "rgba(255,255,255,0.035)",
                          "rgba(225,72,72,0.1)",
                          "rgba(255,255,255,0.035)",
                        ],
                      }
                }
                transition={
                  reduced
                    ? undefined
                    : {
                        delay: index * 0.28,
                        duration: 2.2,
                        repeat: Infinity,
                        repeatDelay: 3.8,
                      }
                }
              >
                <span className="youtube-thumbnail" aria-hidden="true" />
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.channel}</small>
                </span>
                <time>{result.length}</time>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="youtube-import-card"
          animate={
            reduced
              ? { opacity: 1, y: 0 }
              : { opacity: [0.82, 1, 0.88], y: [0, -3, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const }
          }
        >
          <span className="youtube-import-icon" aria-hidden="true" />
          <div>
            <strong>{reduced ? "Ready in queue" : "Add to sync queue"}</strong>
            <p>Saved as watch-ready MP3</p>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function PanelHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <header className="sync-panel-header">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <em>{meta}</em>
    </header>
  );
}

function Connector({
  animation,
  delay,
  reduced,
}: {
  animation: { opacity: number; x: number; scale: number } | {
    opacity: number[];
    x: number[];
    scale: number[];
  };
  delay: number;
  reduced: boolean;
}) {
  return (
    <div className="sync-connector" aria-hidden="true">
      <motion.span
        className="sync-connector-pulse"
        animate={animation}
        transition={
          reduced
            ? { duration: 0 }
            : { delay, duration: 1.9, repeat: Infinity, ease: "easeInOut" }
        }
      />
    </div>
  );
}
