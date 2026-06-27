import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const RELEASES_URL = "https://github.com/JunAkerBuilds/CorosLink/releases";
const API_URL = "https://api.github.com/repos/JunAkerBuilds/CorosLink/releases/latest";

interface ReleaseAssets {
  macUrl: string | null;
  winUrl: string | null;
  version: string | null;
}

export function Download() {
  const reduced = usePrefersReducedMotion();
  const [assets, setAssets] = useState<ReleaseAssets>({
    macUrl: null,
    winUrl: null,
    version: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRelease() {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("No release");
        const data = await res.json();
        if (cancelled) return;

        const macAsset = data.assets?.find((a: { name: string }) =>
          a.name.endsWith(".dmg"),
        );
        const winAsset = data.assets?.find((a: { name: string }) =>
          a.name.endsWith(".exe"),
        );

        setAssets({
          macUrl: macAsset?.browser_download_url ?? null,
          winUrl: winAsset?.browser_download_url ?? null,
          version: data.tag_name ?? null,
        });
      } catch {
        if (!cancelled) setAssets({ macUrl: null, winUrl: null, version: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRelease();
    return () => {
      cancelled = true;
    };
  }, []);

  const macHref = assets.macUrl ?? RELEASES_URL;
  const winHref = assets.winUrl ?? RELEASES_URL;
  const releaseLabel = loading
    ? "Checking release..."
    : assets.version
      ? `Download ${assets.version}`
      : "View releases";
  const reveal = {
    initial: { opacity: 0, y: reduced ? 0 : 34 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "0px 0px -120px 0px" },
    transition: { duration: 0.68, ease: "easeOut" as const },
  };

  return (
    <section id="download" className="download-section">
      <motion.div className="container download-panel" {...reveal}>
        <motion.p className="eyebrow" {...reveal}>
          Get CorosLink
        </motion.p>
        <motion.h2 {...reveal}>Download the desktop companion.</motion.h2>
        <motion.p {...reveal}>
          Free for macOS and Windows. Builds are distributed through GitHub
          Releases and remain unsigned while the project is young.
        </motion.p>

        <div className="download-actions">
          <motion.a
            href={macHref}
            target="_blank"
            rel="noopener noreferrer"
            className="download-option"
            initial={{ opacity: 0, y: reduced ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -120px 0px" }}
            transition={{ duration: 0.56, ease: "easeOut" }}
            whileHover={reduced ? undefined : { y: -5 }}
            whileTap={reduced ? undefined : { scale: 0.99 }}
          >
            <span>macOS</span>
            <strong>{assets.macUrl || loading ? releaseLabel : "View releases"}</strong>
          </motion.a>
          <motion.a
            href={winHref}
            target="_blank"
            rel="noopener noreferrer"
            className="download-option"
            initial={{ opacity: 0, y: reduced ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -120px 0px" }}
            transition={{ delay: reduced ? 0 : 0.1, duration: 0.56, ease: "easeOut" }}
            whileHover={reduced ? undefined : { y: -5 }}
            whileTap={reduced ? undefined : { scale: 0.99 }}
          >
            <span>Windows</span>
            <strong>{assets.winUrl || loading ? releaseLabel : "View releases"}</strong>
          </motion.a>
        </div>

        {!loading && !assets.macUrl && !assets.winUrl && (
          <motion.p
            className="download-fallback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            No installer assets were found in the latest release. Use GitHub Releases
            or build from source.
          </motion.p>
        )}
      </motion.div>
    </section>
  );
}
