import Image from "next/image";
import { motion } from "motion/react";
import { CorosFitnessMock } from "./CorosFitnessMock";
import { SpotifySyncMock } from "./SpotifySyncMock";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const viewport = { once: true, margin: "0px 0px -120px 0px" } as const;

const musicSteps = [
  ["01", "Pick a Spotify playlist", "Start with the playlist you already use for training."],
  ["02", "Build watch-ready MP3s", "CorosLink fetches tracks, metadata, and files into local storage."],
  ["03", "Send it to Pace Pro", "Transfer directly over USB to the watch music folder."],
];

export function ProductNarrative() {
  const reduced = usePrefersReducedMotion();
  const reveal = {
    initial: { opacity: 0, y: reduced ? 0 : 34 },
    whileInView: { opacity: 1, y: 0 },
    viewport,
    transition: { duration: 0.68, ease: "easeOut" as const },
  };
  const stepContainer = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduced ? 0 : 0.1,
      },
    },
  };
  const stepItem = {
    hidden: { opacity: 0, y: reduced ? 0 : 24 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <>
      <section id="features" className="feature-band feature-band--command">
        <div className="container narrative-grid narrative-grid--command">
          <motion.div className="narrative-copy" {...reveal}>
            <p className="eyebrow">Command center</p>
            <h2>Everything about the watch, in one place.</h2>
            <p>
              CorosLink brings device status, local music, transfers, and training
              readiness into a single desktop surface designed for quick decisions.
            </p>
            <div className="stat-row" aria-label="CorosLink product highlights">
              <span>
                <strong>100%</strong>
                local-first data
              </span>
              <span>
                <strong>Open</strong>
                source
              </span>
            </div>
          </motion.div>

          <motion.div
            className="product-visual product-visual--wide"
            {...reveal}
            whileHover={reduced ? undefined : { y: -6 }}
          >
            <Image
              src="/showcase/command-center.webp"
              alt="CorosLink command center with Pace Pro device status and overview dashboard"
              width={1900}
              height={1120}
              sizes="(max-width: 900px) 100vw, 62vw"
            />
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="feature-band feature-band--music">
        <div className="container narrative-stack">
          <motion.div className="section-heading" {...reveal}>
            <p className="eyebrow">Music workflow</p>
            <h2>Spotify playlist to watch, in one clean flow.</h2>
            <p>
              Choose a Spotify playlist, let CorosLink turn it into a local MP3
              library, then move it to the Pace Pro over USB. YouTube search is
              there when you need a specific track.
            </p>
          </motion.div>

          <motion.div
            className="product-visual product-visual--full product-visual--sync"
            {...reveal}
            whileHover={reduced ? undefined : { y: -6 }}
          >
            <SpotifySyncMock />
          </motion.div>

          <motion.div
            className="steps"
            variants={stepContainer}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            {musicSteps.map(([number, title, text]) => (
              <motion.article
                key={number}
                variants={stepItem}
                transition={{ duration: 0.56, ease: "easeOut" }}
              >
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="feature-band feature-band--training">
        <div className="container narrative-grid">
          <motion.div
            className="product-visual product-visual--fitness"
            {...reveal}
            whileHover={reduced ? undefined : { y: -6 }}
          >
            <CorosFitnessMock />
          </motion.div>

          <motion.div className="narrative-copy" {...reveal}>
            <p className="eyebrow">Training intelligence</p>
            <h2>Your COROS fitness data, built for desktop.</h2>
            <p>
              Connect your COROS account to review recovery, race predictions,
              activity detail, and fitness trends on a larger, easier-to-scan
              desktop surface.
            </p>
            <ul className="quiet-list">
              <li>Recovery readiness and stamina context</li>
              <li>Race predictor estimates by distance</li>
              <li>Recent activity detail and FIT export</li>
            </ul>
          </motion.div>
        </div>
      </section>

    </>
  );
}
