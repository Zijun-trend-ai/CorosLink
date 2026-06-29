import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  KeyRound,
  Loader2,
  Map as MapIcon,
  MapPin,
  Mountain,
  Navigation,
  RefreshCw,
  Route,
  Save,
  Search,
  Trash2,
  X,
  Upload
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  CachedCorosMapPackage,
  CorosMapDownloadJob,
  CorosMapInstallProgress,
  CorosMapLocalSelection,
  CorosMapManifest,
  CorosMapPackage,
  GenerateRouteRequest,
  GeneratedRoute,
  RouteBuilderConfig,
  RouteElevationPreference,
  RouteSurfacePreference,
  WatchStatus
} from "../../electron/types";
import type { CorosLinkApi } from "../coroslink-api";
import { formatBytes, formatDate } from "../media/libraryUtils";

type MapsTab = "coros" | "routes";
type RoutePinMode = "start" | "destination" | null;
type RouteMapLayer = "street" | "dark" | "topo";

interface RoutePinnedPoint {
  lat: number;
  lon: number;
}

interface RouteReadinessItem {
  label: string;
  ready: boolean;
}

const ROUTE_TILE_LAYERS: Record<
  RouteMapLayer,
  { url: string; attribution: string; maxZoom: number; subdomains?: string }
> = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    maxZoom: 19,
    subdomains: "abcd",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
  }
};

const ORS_LOGIN_URL = "https://openrouteservice.org/log-in/";
const ORS_API_INFO_URL = "https://api.openrouteservice.org/";
const ORS_HELP_PARTITION = "persist:coroslink-help";

interface WebviewElement extends HTMLElement {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getTitle: () => string;
  getURL: () => string;
  goBack: () => void;
  goForward: () => void;
  loadURL: (url: string) => Promise<void>;
  reload: () => void;
}

interface WebviewNavigationEvent extends Event {
  url?: string;
}

interface WebviewTitleEvent extends Event {
  title?: string;
}

interface WebviewFailLoadEvent extends Event {
  errorCode?: number;
  errorDescription?: string;
  validatedURL?: string;
  isMainFrame?: boolean;
}

interface MapsViewProps {
  api: CorosLinkApi;
  watchStatus: WatchStatus | null;
  onWatchStatusChange: (status: WatchStatus) => void;
  onMessage: (message: string | null) => void;
  onError: (message: string | null) => void;
}

export function MapsView({
  api,
  watchStatus,
  onWatchStatusChange,
  onMessage,
  onError
}: MapsViewProps) {
  const [activeTab, setActiveTab] = useState<MapsTab>("coros");

  return (
    <div className="maps-view stack">
      <div className="media-tabs-shell">
        <nav className="media-tabs" aria-label="Maps sections">
          <MapsTabButton
            active={activeTab === "coros"}
            icon={<MapIcon size={16} aria-hidden="true" />}
            label="COROS Maps"
            onClick={() => setActiveTab("coros")}
          />
          <MapsTabButton
            active={activeTab === "routes"}
            icon={<Route size={16} aria-hidden="true" />}
            label="Route Builder"
            onClick={() => setActiveTab("routes")}
          />
        </nav>
      </div>

      {activeTab === "coros" ? (
        <CorosMapsTab
          api={api}
          watchStatus={watchStatus}
          onWatchStatusChange={onWatchStatusChange}
          onMessage={onMessage}
          onError={onError}
        />
      ) : (
        <RouteBuilderTab
          api={api}
          onMessage={onMessage}
          onError={onError}
        />
      )}
    </div>
  );
}

function MapsTabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "media-tab active" : "media-tab"}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function CorosMapsTab({
  api,
  watchStatus,
  onWatchStatusChange,
  onMessage,
  onError
}: MapsViewProps) {
  const [manifest, setManifest] = useState<CorosMapManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showLandscape, setShowLandscape] = useState(true);
  const [showTopo, setShowTopo] = useState(true);
  const [localSelection, setLocalSelection] =
    useState<CorosMapLocalSelection | null>(null);
  const [downloadJobs, setDownloadJobs] = useState<CorosMapDownloadJob[]>([]);
  const [installProgress, setInstallProgress] =
    useState<CorosMapInstallProgress | null>(null);
  const [cachedPackages, setCachedPackages] = useState<
    CachedCorosMapPackage[]
  >([]);

  const freeBytes = watchStatus?.freeBytes;

  useEffect(() => {
    void loadManifest();
    void loadMapCacheState();
    const unsubscribeDownloads = api.onCorosMapDownloadJobsUpdate((jobs) => {
      setDownloadJobs(jobs);
      if (jobs.some((job) => job.status === "cached")) {
        void loadCachedPackages();
      }
    });
    const unsubscribeInstall = api.onCorosMapInstallProgressUpdate((progress) => {
      setInstallProgress(progress);
    });
    return () => {
      unsubscribeDownloads();
      unsubscribeInstall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadManifest() {
    setLoading(true);
    onError(null);
    try {
      setManifest(await api.getCorosMapManifest());
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function loadMapCacheState() {
    try {
      const [jobs, cached] = await Promise.all([
        api.listCorosMapDownloadJobs(),
        api.listCachedCorosMaps()
      ]);
      setInstallProgress(await api.getCorosMapInstallProgress());
      setDownloadJobs(jobs);
      setCachedPackages(cached);
    } catch (caught) {
      onError(toErrorMessage(caught));
    }
  }

  async function loadCachedPackages() {
    try {
      setCachedPackages(await api.listCachedCorosMaps());
    } catch (caught) {
      onError(toErrorMessage(caught));
    }
  }

  async function handleOpenDownload(pkg: CorosMapPackage) {
    setBusy(`open:${pkg.id}`);
    onError(null);
    onMessage(null);
    try {
      await api.openCorosMapDownload(pkg.downloadUrl);
      onMessage("Opened the official COROS map download.");
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadPackage(pkg: CorosMapPackage) {
    setBusy(`download:${pkg.id}`);
    onError(null);
    onMessage(null);
    try {
      setDownloadJobs(await api.downloadCorosMapPackage(pkg));
      onMessage(`Started downloading ${pkg.title} inside CorosLink.`);
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelDownload(job: CorosMapDownloadJob) {
    setBusy(`cancel:${job.id}`);
    onError(null);
    onMessage(null);
    try {
      setDownloadJobs(await api.cancelCorosMapDownload(job.id));
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleClearDownloadJob(job: CorosMapDownloadJob) {
    setBusy(`clear:${job.id}`);
    onError(null);
    onMessage(null);
    try {
      setDownloadJobs(await api.clearCorosMapDownloadJob(job.id));
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleInstallCached(packageId: string) {
    setBusy(`install-cache:${packageId}`);
    onError(null);
    onMessage(null);
    try {
      const result = await api.installCachedCorosMap(packageId);
      onWatchStatusChange(result.watch);
      setCachedPackages(await api.listCachedCorosMaps());
      onMessage(`Installed ${formatBytes(result.sizeBytes)} of map files.`);
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteCached(packageId: string) {
    setBusy(`delete-cache:${packageId}`);
    onError(null);
    onMessage(null);
    try {
      setCachedPackages(await api.deleteCachedCorosMap(packageId));
      onMessage("Removed the cached map package.");
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleChooseFolder() {
    setBusy("choose-folder");
    onError(null);
    onMessage(null);
    try {
      const selection = await api.chooseCorosMapFolder();
      if (selection) {
        setLocalSelection(selection);
        onMessage("Local COROS map folder selected.");
      }
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleInstallFolder() {
    if (!localSelection) {
      return;
    }

    setBusy("install-folder");
    onError(null);
    onMessage(null);
    try {
      const result = await api.installCorosMapFolder(localSelection.sourcePath);
      onWatchStatusChange(result.watch);
      onMessage(`Installed ${formatBytes(result.sizeBytes)} of map files.`);
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const regionOptions = useMemo(() => {
    const regions = new Map<string, string>();
    for (const pkg of manifest?.packages ?? []) {
      const key = pkg.parent === "global" ? pkg.region : pkg.parent;
      const title =
        pkg.parent === "global"
          ? pkg.title
          : titleFromRegionId(pkg.parent);
      regions.set(key, title);
    }

    return Array.from(regions.entries()).sort((left, right) =>
      left[1].localeCompare(right[1], undefined, { numeric: true })
    );
  }, [manifest]);

  const packages = useMemo(() => {
    const terms = normalizeSearch(query);
    return (manifest?.packages ?? []).filter((pkg) => {
      if (!showLandscape && pkg.type === "landscape") {
        return false;
      }

      if (!showTopo && pkg.type === "topo") {
        return false;
      }

      if (
        regionFilter !== "all" &&
        pkg.region !== regionFilter &&
        pkg.parent !== regionFilter
      ) {
        return false;
      }

      if (!terms) {
        return true;
      }

      return normalizeSearch(`${pkg.title} ${pkg.region} ${pkg.type}`).includes(
        terms
      );
    });
  }, [manifest, query, regionFilter, showLandscape, showTopo]);

  const cachedByPackageId = useMemo(() => {
    const cached = new Map<string, CachedCorosMapPackage>();
    for (const item of cachedPackages) {
      cached.set(item.packageId, item);
    }
    return cached;
  }, [cachedPackages]);

  const latestJobByPackageId = useMemo(() => {
    const jobs = new Map<string, CorosMapDownloadJob>();
    for (const job of downloadJobs) {
      if (!jobs.has(job.packageId)) {
        jobs.set(job.packageId, job);
      }
    }
    return jobs;
  }, [downloadJobs]);

  return (
    <div className="maps-grid">
      <section className="panel maps-sidebar">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Watch maps</p>
            <h2>{watchStatus?.connected ? watchStatus.name : "No watch"}</h2>
          </div>
          <HardDrive size={20} aria-hidden="true" />
        </div>

        <div className="map-storage-list">
          <MapStorageMetric
            label="Free"
            value={
              freeBytes !== undefined ? formatBytes(freeBytes) : "Unavailable"
            }
          />
          <MapStorageMetric
            label="Installed maps"
            value={formatBytes(watchStatus?.mapSizeBytes ?? 0)}
          />
          <MapStorageMetric
            label="Map files"
            value={String(watchStatus?.mapFileCount ?? 0)}
          />
        </div>

        <div className="maps-warning">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            COROS packages are large. Install only the regions you need and
            merge into the watch map folder.
          </p>
        </div>

        <div className="local-map-install">
          <button
            type="button"
            className="secondary-button"
            onClick={handleChooseFolder}
            disabled={busy === "choose-folder"}
          >
            {busy === "choose-folder" ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <FolderOpen size={17} aria-hidden="true" />
            )}
            Choose Local Map Folder
          </button>

          {localSelection ? (
            <div className="local-map-selection">
              <strong>{shortPath(localSelection.mapPath)}</strong>
              <span>
                {formatBytes(localSelection.sizeBytes)} ·{" "}
                {localSelection.fileCount} files
              </span>
            </div>
          ) : null}

          <button
            type="button"
            className="primary-button"
            onClick={handleInstallFolder}
            disabled={
              !watchStatus?.connected ||
              !localSelection ||
              busy === "install-folder"
            }
          >
            {busy === "install-folder" ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <Upload size={17} aria-hidden="true" />
            )}
            Install to Watch
          </button>
        </div>

        {installProgress ? (
          <MapInstallProgressPanel progress={installProgress} />
        ) : null}

        <div className="map-cache-section">
          <div className="map-cache-heading">
            <span>Cached maps</span>
            <button
              type="button"
              className="icon-button"
              title="Refresh cached maps"
              onClick={() => void loadCachedPackages()}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>

          {cachedPackages.length === 0 ? (
            <p className="map-cache-empty">No cached map packages.</p>
          ) : (
            <div className="map-cache-list">
              {cachedPackages.map((cached) => (
                <CachedMapRow
                  key={cached.packageId}
                  cached={cached}
                  busy={busy}
                  watchConnected={Boolean(watchStatus?.connected)}
                  freeBytes={freeBytes}
                  onInstall={handleInstallCached}
                  onDelete={handleDeleteCached}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel maps-main-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Official packages</p>
            <h2>
              {manifest
                ? `v${manifest.version}${manifest.bundleVersion ? ` · ${manifest.bundleVersion}` : ""}`
                : "COROS Maps"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Refresh package list"
            onClick={() => void loadManifest()}
            disabled={loading}
          >
            <RefreshCw
              size={18}
              aria-hidden="true"
              className={loading ? "spin" : ""}
            />
          </button>
        </div>

        <div className="map-filter-row">
          <label className="input-shell maps-search">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search regions"
            />
          </label>

          <select
            className="maps-select"
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
          >
            <option value="all">All regions</option>
            {regionOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>

          <label className="check-row maps-check">
            <input
              type="checkbox"
              checked={showLandscape}
              onChange={(event) => setShowLandscape(event.target.checked)}
            />
            Landscape
          </label>
          <label className="check-row maps-check">
            <input
              type="checkbox"
              checked={showTopo}
              onChange={(event) => setShowTopo(event.target.checked)}
            />
            Topo
          </label>
        </div>

        <div className="map-package-list">
          {loading && !manifest ? (
            <MapsEmpty
              icon={<Loader2 className="spin" size={20} aria-hidden="true" />}
              title="Loading packages"
            />
          ) : packages.length === 0 ? (
            <MapsEmpty
              icon={<Search size={20} aria-hidden="true" />}
              title="No matching packages"
            />
          ) : (
            packages.map((pkg) => (
              <MapPackageRow
                key={pkg.id}
                pkg={pkg}
                freeBytes={freeBytes}
                busy={busy}
                watchConnected={Boolean(watchStatus?.connected)}
                job={latestJobByPackageId.get(pkg.id)}
                cached={cachedByPackageId.get(pkg.id)}
                onDownload={handleDownloadPackage}
                onCancel={handleCancelDownload}
                onClearJob={handleClearDownloadJob}
                onInstallCached={handleInstallCached}
                onDeleteCached={handleDeleteCached}
                onOpenDownload={handleOpenDownload}
              />
            ))
          )}
        </div>

        {manifest?.updatedAt ? (
          <p className="maps-footnote">
            COROS manifest updated {manifest.updatedAt}.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function MapStorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="map-storage-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MapInstallProgressPanel({
  progress
}: {
  progress: CorosMapInstallProgress;
}) {
  const percent = Math.round(Math.max(0, Math.min(progress.progress, 1)) * 100);
  const phaseLabel =
    progress.phase === "failed"
      ? "Install failed"
      : progress.phase === "completed"
        ? "Install complete"
        : progress.phase === "preparing"
          ? "Preparing install"
          : "Copying to watch";

  return (
    <div
      className={
        progress.phase === "failed"
          ? "map-install-progress is-failed"
          : "map-install-progress"
      }
    >
      <div className="map-install-progress-heading">
        <strong>{phaseLabel}</strong>
        <span>{percent}%</span>
      </div>
      <div className="map-download-progress-track">
        <span style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
      <small>
        {progress.label} · {formatBytes(progress.copiedBytes)} of{" "}
        {formatBytes(progress.totalBytes)} · {progress.copiedFiles}/
        {progress.totalFiles} files
      </small>
      {progress.error ? (
        <p className="map-install-error">{progress.error}</p>
      ) : progress.active ? (
        <p>Keep the watch connected until the copy finishes.</p>
      ) : null}
    </div>
  );
}

function MapPackageRow({
  pkg,
  freeBytes,
  busy,
  watchConnected,
  job,
  cached,
  onDownload,
  onCancel,
  onClearJob,
  onInstallCached,
  onDeleteCached,
  onOpenDownload
}: {
  pkg: CorosMapPackage;
  freeBytes?: number;
  busy: string | null;
  watchConnected: boolean;
  job?: CorosMapDownloadJob;
  cached?: CachedCorosMapPackage;
  onDownload: (pkg: CorosMapPackage) => void;
  onCancel: (job: CorosMapDownloadJob) => void;
  onClearJob: (job: CorosMapDownloadJob) => void;
  onInstallCached: (packageId: string) => void;
  onDeleteCached: (packageId: string) => void;
  onOpenDownload: (pkg: CorosMapPackage) => void;
}) {
  const tooLarge = freeBytes !== undefined && pkg.sizeBytes > freeBytes;
  const isActiveDownload =
    job?.status === "queued" || job?.status === "downloading";
  const failedOrCancelled =
    job?.status === "failed" || job?.status === "cancelled";
  const installDisabled =
    !watchConnected || tooLarge || busy === `install-cache:${pkg.id}`;

  return (
    <div className={tooLarge ? "map-package-row is-too-large" : "map-package-row"}>
      <div className="map-package-icon">
        {pkg.type === "topo" ? (
          <Mountain size={18} aria-hidden="true" />
        ) : (
          <MapIcon size={18} aria-hidden="true" />
        )}
      </div>
      <div className="map-package-main">
        <strong>{pkg.title}</strong>
        <span>
          {pkg.type === "topo" ? "Topo" : "Landscape"} ·{" "}
          {pkg.parent === "global" ? "Full region" : titleFromRegionId(pkg.parent)}
        </span>
        {isActiveDownload ? (
          <div className="map-download-progress">
            <div className="map-download-progress-track">
              <span
                style={{
                  width: `${Math.max(2, Math.round((job?.progress ?? 0) * 100))}%`
                }}
              />
            </div>
            <small>
              {formatProgress(job)} · {formatBytes(job?.receivedBytes ?? 0)} of{" "}
              {formatBytes(job?.sizeBytes || pkg.sizeBytes)}
            </small>
          </div>
        ) : failedOrCancelled ? (
          <small className="map-download-error">
            {job.status === "failed" ? job.error || "Download failed." : "Download cancelled."}
          </small>
        ) : null}
      </div>
      <span className={tooLarge ? "badge danger" : "badge"}>
        {formatBytes(pkg.sizeBytes)}
      </span>
      {tooLarge ? <span className="badge warning">Low space</span> : null}
      {cached ? <span className="badge success">Cached</span> : null}
      <div className="map-package-actions">
        {cached ? (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() => onInstallCached(pkg.id)}
              disabled={installDisabled}
            >
              {busy === `install-cache:${pkg.id}` ? (
                <Loader2 className="spin" size={17} aria-hidden="true" />
              ) : (
                <Upload size={17} aria-hidden="true" />
              )}
              Install
            </button>
            <button
              type="button"
              className="icon-button"
              title="Delete cached package"
              onClick={() => onDeleteCached(pkg.id)}
              disabled={busy === `delete-cache:${pkg.id}`}
            >
              {busy === `delete-cache:${pkg.id}` ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Trash2 size={16} aria-hidden="true" />
              )}
            </button>
          </>
        ) : isActiveDownload && job ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onCancel(job)}
            disabled={busy === `cancel:${job.id}`}
          >
            {busy === `cancel:${job.id}` ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <X size={17} aria-hidden="true" />
            )}
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() => onDownload(pkg)}
              disabled={busy === `download:${pkg.id}`}
            >
              {busy === `download:${pkg.id}` ? (
                <Loader2 className="spin" size={17} aria-hidden="true" />
              ) : (
                <Download size={17} aria-hidden="true" />
              )}
              Download
            </button>
            <button
              type="button"
              className="icon-button"
              title="Open official COROS download in browser"
              onClick={() => onOpenDownload(pkg)}
              disabled={busy === `open:${pkg.id}`}
            >
              {busy === `open:${pkg.id}` ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <ExternalLink size={16} aria-hidden="true" />
              )}
            </button>
            {failedOrCancelled && job ? (
              <button
                type="button"
                className="icon-button"
                title="Clear download status"
                onClick={() => onClearJob(job)}
                disabled={busy === `clear:${job.id}`}
              >
                {busy === `clear:${job.id}` ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  <X size={16} aria-hidden="true" />
                )}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function CachedMapRow({
  cached,
  busy,
  watchConnected,
  freeBytes,
  onInstall,
  onDelete
}: {
  cached: CachedCorosMapPackage;
  busy: string | null;
  watchConnected: boolean;
  freeBytes?: number;
  onInstall: (packageId: string) => void;
  onDelete: (packageId: string) => void;
}) {
  const tooLarge = freeBytes !== undefined && cached.sizeBytes > freeBytes;
  const installing = busy === `install-cache:${cached.packageId}`;

  return (
    <div className="map-cache-row">
      <div>
        <strong>{cached.title}</strong>
        <span>
          {cached.type === "topo" ? "Topo" : "Landscape"} ·{" "}
          {formatBytes(cached.sizeBytes)}
        </span>
      </div>
      <div className="map-cache-actions">
        <button
          type="button"
          className="icon-button"
          title="Install cached package"
          onClick={() => onInstall(cached.packageId)}
          disabled={!watchConnected || tooLarge || installing}
        >
          {installing ? (
            <Loader2 className="spin" size={15} aria-hidden="true" />
          ) : (
            <Upload size={15} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="icon-button"
          title="Delete cached package"
          onClick={() => onDelete(cached.packageId)}
          disabled={busy === `delete-cache:${cached.packageId}`}
        >
          {busy === `delete-cache:${cached.packageId}` ? (
            <Loader2 className="spin" size={15} aria-hidden="true" />
          ) : (
            <Trash2 size={15} aria-hidden="true" />
          )}
        </button>
      </div>
      {tooLarge ? <small>Too large for current free space</small> : null}
    </div>
  );
}

function RouteBuilderTab({
  api,
  onMessage,
  onError
}: {
  api: CorosLinkApi;
  onMessage: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [config, setConfig] = useState<RouteBuilderConfig>({
    openRouteServiceApiKey: ""
  });
  const [request, setRequest] = useState<GenerateRouteRequest>({
    startLocation: "",
    destinationLocation: "",
    distanceKm: 5,
    mode: "loop",
    surfacePreference: "road",
    avoidHighways: false,
    elevationPreference: "any"
  });
  const [routes, setRoutes] = useState<GeneratedRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState<GeneratedRoute | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedOpenRouteServiceApiKey, setSavedOpenRouteServiceApiKey] =
    useState("");
  const [helpBrowserUrl, setHelpBrowserUrl] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<RoutePinMode>(null);
  const [currentLocation, setCurrentLocation] =
    useState<RoutePinnedPoint | null>(null);
  const [locationIssue, setLocationIssue] = useState(false);
  const [mapLayer, setMapLayer] = useState<RouteMapLayer>("street");
  const [fitRequestId, setFitRequestId] = useState(0);

  const draftOpenRouteServiceApiKey = config.openRouteServiceApiKey.trim();
  const hasSavedOpenRouteServiceApiKey =
    savedOpenRouteServiceApiKey.trim().length > 0;
  const hasUnsavedOpenRouteServiceApiKeyChange =
    draftOpenRouteServiceApiKey !== savedOpenRouteServiceApiKey.trim();
  const routeReadiness = getRouteReadiness(
    request,
    hasSavedOpenRouteServiceApiKey,
    hasUnsavedOpenRouteServiceApiKeyChange
  );
  const routeGenerationDisabled =
    busy === "generate-route" || !routeReadiness.ready;

  useEffect(() => {
    void Promise.all([
      api.getRouteBuilderConfig(),
      api.listGeneratedRoutes()
    ])
      .then(([nextConfig, nextRoutes]) => {
        setConfig(nextConfig);
        setSavedOpenRouteServiceApiKey(nextConfig.openRouteServiceApiKey);
        setRoutes(nextRoutes);
        setActiveRoute(nextRoutes[0] ?? null);
      })
      .catch((caught) => onError(toErrorMessage(caught)));
  }, [api, onError]);

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save-config");
    onError(null);
    onMessage(null);
    try {
      const nextConfig = await api.saveRouteBuilderConfig(config);
      setConfig(nextConfig);
      setSavedOpenRouteServiceApiKey(nextConfig.openRouteServiceApiKey);
      onMessage(
        nextConfig.openRouteServiceApiKey.trim()
          ? "Route API key saved."
          : "Route API key cleared."
      );
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (routeGenerationDisabled) {
      onError(
        hasUnsavedOpenRouteServiceApiKeyChange
          ? "Save the OpenRouteService API key before generating routes."
          : "Save an OpenRouteService API key before generating routes."
      );
      return;
    }

    setBusy("generate-route");
    onError(null);
    onMessage(null);
    try {
      const route = await api.generateRoute(request);
      setActiveRoute(route);
      setRoutes(await api.listGeneratedRoutes());
      onMessage("Route generated.");
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleExport(route: GeneratedRoute) {
    setBusy(`export:${route.id}`);
    onError(null);
    onMessage(null);
    try {
      const filePath = await api.exportGeneratedRoute(route.id);
      if (filePath) {
        onMessage("GPX exported.");
      }
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  function handleRouteModeChange(mode: GenerateRouteRequest["mode"]) {
    setRequestField(setRequest, "mode", mode);
    if (mode === "loop" && pinMode === "destination") {
      setPinMode(null);
    }
  }

  function handlePinModeChange(mode: Exclude<RoutePinMode, null>) {
    if (mode === "destination" && request.mode !== "point-to-point") {
      setRequestField(setRequest, "mode", "point-to-point");
    }

    setPinMode((current) => (current === mode ? null : mode));
  }

  const applyPointToRouteField = useCallback(
    (
      point: RoutePinnedPoint,
      target: Exclude<RoutePinMode, null>,
      message: string
    ) => {
      const value = formatPinnedRoutePoint(point);
      if (target === "start") {
        setRequestField(setRequest, "startLocation", value);
      } else {
        setRequest((current) => ({
          ...current,
          mode: "point-to-point",
          destinationLocation: value
        }));
      }

      setPinMode(null);
      onMessage(message);
    },
    [onMessage]
  );

  const handlePickRoutePoint = useCallback(
    (point: RoutePinnedPoint) => {
      if (!pinMode) {
        return;
      }

      applyPointToRouteField(
        point,
        pinMode,
        pinMode === "start" ? "Start point pinned." : "Destination point pinned."
      );
    },
    [applyPointToRouteField, pinMode]
  );

  function handleUseCurrentLocation(target: Exclude<RoutePinMode, null>) {
    if (!currentLocation) {
      onError("Use Locate me before using your current location.");
      return;
    }

    applyPointToRouteField(
      currentLocation,
      target,
      target === "start"
        ? "Start set to current location."
        : "Destination set to current location."
    );
  }

  async function handleFindOnMap(target: Exclude<RoutePinMode, null>) {
    const query =
      target === "start"
        ? request.startLocation
        : request.destinationLocation ?? "";
    if (!query.trim()) {
      onError(
        target === "start"
          ? "Enter a start location to find on the map."
          : "Enter a destination to find on the map."
      );
      return;
    }

    setBusy(`geocode:${target}`);
    onError(null);
    onMessage(null);
    try {
      const result = await api.geocodeRouteLocation(query);
      applyPointToRouteField(
        { lat: result.lat, lon: result.lon },
        target,
        `Found ${result.label}.`
      );
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleLocateMe(target?: Exclude<RoutePinMode, null>) {
    if (!navigator.geolocation) {
      onError("Location is not available in this browser.");
      return;
    }

    setBusy("locate-route");
    onError(null);
    onMessage(null);
    try {
      const position = await getCurrentPositionWithFallback(() => {
        onMessage("Still locating. Trying a longer location lookup.");
      });
      const point = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      setCurrentLocation(point);
      setLocationIssue(false);

      const targetField = target ?? pinMode;
      if (targetField) {
        applyPointToRouteField(
          point,
          targetField,
          targetField === "start"
            ? "Start set to current location."
            : "Destination set to current location."
        );
      } else if (!request.startLocation.trim()) {
        setRequestField(setRequest, "startLocation", formatPinnedRoutePoint(point));
        onMessage("Current location found and added as the start.");
      } else {
        onMessage("Current location found.");
      }
    } catch (caught) {
      setLocationIssue(true);
      if (isGeolocationTimeout(caught)) {
        onMessage("Native location timed out. Trying approximate location.");
        try {
          await applyApproximateRouteLocation(target);
          onError(null);
        } catch (fallbackError) {
          onError(
            `Native location timed out and approximate location failed: ${toErrorMessage(fallbackError)}`
          );
        }
      } else {
        onError(toGeolocationErrorMessage(caught));
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenLocationSettings() {
    setBusy("open-location-settings");
    onError(null);
    onMessage(null);
    try {
      await api.openLocationServicesSettings();
      onMessage("Opened system location settings.");
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleUseApproximateLocation() {
    setBusy("approximate-location");
    onError(null);
    onMessage(null);
    try {
      await applyApproximateRouteLocation();
    } catch (caught) {
      onError(toErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function applyApproximateRouteLocation(
    target?: Exclude<RoutePinMode, null>
  ) {
    const result = await api.getApproximateRouteLocation();
    const point = { lat: result.lat, lon: result.lon };
    setCurrentLocation(point);
    setLocationIssue(false);

    const targetField = target ?? pinMode;
    if (targetField) {
      applyPointToRouteField(
        point,
        targetField,
        `${targetField === "start" ? "Start" : "Destination"} set to approximate location.`
      );
    } else if (!request.startLocation.trim()) {
      setRequestField(setRequest, "startLocation", formatPinnedRoutePoint(point));
      onMessage(`Approximate location found near ${result.label} and added as the start.`);
    } else {
      onMessage(`Approximate location found near ${result.label}.`);
    }
  }

  function handleClearPins() {
    const clearStart = Boolean(parseRouteCoordinateValue(request.startLocation));
    const clearDestination = Boolean(
      parseRouteCoordinateValue(request.destinationLocation)
    );
    setRequest((current) => ({
      ...current,
      startLocation: clearStart ? "" : current.startLocation,
      destinationLocation: clearDestination ? "" : current.destinationLocation
    }));
    setPinMode(null);
    onMessage(
      clearStart || clearDestination
        ? "Pinned coordinates cleared."
        : "No pinned coordinates to clear."
    );
  }

  return (
    <>
      <div className="route-builder-grid">
        <section className="panel route-form-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Route Builder</p>
              <h2>Generate GPX</h2>
            </div>
            <Navigation size={20} aria-hidden="true" />
          </div>

          {!hasSavedOpenRouteServiceApiKey ? (
            <OpenRouteServiceKeyGuide
              config={config}
              busy={busy}
              onConfigChange={setConfig}
              onSubmit={handleSaveConfig}
              onOpenHelp={setHelpBrowserUrl}
            />
          ) : (
            <>
              <RouteApiKeyForm
                config={config}
                busy={busy}
                compact
                onConfigChange={setConfig}
                onSubmit={handleSaveConfig}
              />
              {hasUnsavedOpenRouteServiceApiKeyChange ? (
                <p className="route-api-note">
                  Save the OpenRouteService key before generating a route.
                </p>
              ) : null}
            </>
          )}

          <form className="route-generator-form" onSubmit={handleGenerate}>
            <div className="route-field">
              <div className="route-field-title-row">
                <span>Start location</span>
              </div>
              <div className="input-shell">
                <MapPin size={18} aria-hidden="true" />
                <input
                  value={request.startLocation}
                  onChange={(event) =>
                    setRequestField(setRequest, "startLocation", event.target.value)
                  }
                  placeholder="City, address, trailhead, or lat, lon"
                />
              </div>
              <div className="route-field-actions">
                <button
                  type="button"
                  className="route-pin-toggle"
                  onClick={() => void handleFindOnMap("start")}
                  disabled={busy === "geocode:start" || !request.startLocation.trim()}
                >
                  {busy === "geocode:start" ? (
                    <Loader2 className="spin" size={14} aria-hidden="true" />
                  ) : (
                    <Search size={14} aria-hidden="true" />
                  )}
                  Find on map
                </button>
                <button
                  type="button"
                  className="route-pin-toggle"
                  onClick={() => handleUseCurrentLocation("start")}
                  disabled={!currentLocation}
                >
                  <Navigation size={14} aria-hidden="true" />
                  Use current
                </button>
                <button
                  type="button"
                  className={
                    pinMode === "start" ? "route-pin-toggle active" : "route-pin-toggle"
                  }
                  onClick={() => handlePinModeChange("start")}
                >
                  <MapPin size={14} aria-hidden="true" />
                  Pin start
                </button>
              </div>
            </div>

            <div className="route-mode-toggle">
              <button
                type="button"
                className={request.mode === "loop" ? "active" : ""}
                onClick={() => handleRouteModeChange("loop")}
              >
                Loop
              </button>
              <button
                type="button"
                className={request.mode === "point-to-point" ? "active" : ""}
                onClick={() => handleRouteModeChange("point-to-point")}
              >
                Point-to-point
              </button>
            </div>

            {request.mode === "point-to-point" ? (
              <div className="route-field">
                <div className="route-field-title-row">
                  <span>Destination</span>
                </div>
                <div className="input-shell">
                  <MapPin size={18} aria-hidden="true" />
                  <input
                    value={request.destinationLocation ?? ""}
                    onChange={(event) =>
                      setRequestField(
                        setRequest,
                        "destinationLocation",
                        event.target.value
                      )
                    }
                    placeholder="Finish location or lat, lon"
                  />
                </div>
                <div className="route-field-actions">
                  <button
                    type="button"
                    className="route-pin-toggle"
                    onClick={() => void handleFindOnMap("destination")}
                    disabled={
                      busy === "geocode:destination" ||
                      !request.destinationLocation?.trim()
                    }
                  >
                    {busy === "geocode:destination" ? (
                      <Loader2 className="spin" size={14} aria-hidden="true" />
                    ) : (
                      <Search size={14} aria-hidden="true" />
                    )}
                    Find on map
                  </button>
                  <button
                    type="button"
                    className="route-pin-toggle"
                    onClick={() => handleUseCurrentLocation("destination")}
                    disabled={!currentLocation}
                  >
                    <Navigation size={14} aria-hidden="true" />
                    Use current
                  </button>
                  <button
                    type="button"
                    className={
                      pinMode === "destination"
                        ? "route-pin-toggle active"
                        : "route-pin-toggle"
                    }
                    onClick={() => handlePinModeChange("destination")}
                  >
                    <MapPin size={14} aria-hidden="true" />
                    Pin end
                  </button>
                </div>
              </div>
            ) : null}

          <div className="route-form-row">
            <label className="route-field">
              <span>Distance</span>
              <input
                className="maps-number-input"
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={request.distanceKm}
                onChange={(event) =>
                  setRequestField(
                    setRequest,
                    "distanceKm",
                    Number(event.target.value)
                  )
                }
              />
            </label>

            <label className="route-field">
              <span>Surface</span>
              <select
                className="maps-select"
                value={request.surfacePreference}
                onChange={(event) =>
                  setRequestField(
                    setRequest,
                    "surfacePreference",
                    event.target.value as RouteSurfacePreference
                  )
                }
              >
                <option value="road">Road</option>
                <option value="trail">Trail</option>
              </select>
            </label>
          </div>

          <div className="route-form-row">
            <label className="route-field">
              <span>Elevation</span>
              <select
                className="maps-select"
                value={request.elevationPreference}
                onChange={(event) =>
                  setRequestField(
                    setRequest,
                    "elevationPreference",
                    event.target.value as RouteElevationPreference
                  )
                }
              >
                <option value="any">Any</option>
                <option value="flatter">Flatter</option>
                <option value="hilly">Hilly</option>
              </select>
            </label>

            <label className="check-row route-check is-disabled">
              <input
                type="checkbox"
                checked={false}
                disabled
                onChange={() => undefined}
              />
              Avoid highways
              <small>Not supported by ORS walking routes</small>
            </label>
          </div>

          <RouteReadiness items={routeReadiness.items} />

          <button
            type="submit"
            className="primary-button"
            disabled={routeGenerationDisabled}
          >
            {busy === "generate-route" ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <Route size={18} aria-hidden="true" />
            )}
            Generate Route
          </button>
          </form>
        </section>

        <section className="panel route-preview-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{activeRoute?.name ?? "No route"}</h2>
            </div>
            {activeRoute ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleExport(activeRoute)}
                disabled={busy === `export:${activeRoute.id}`}
              >
                {busy === `export:${activeRoute.id}` ? (
                  <Loader2 className="spin" size={17} aria-hidden="true" />
                ) : (
                  <Download size={17} aria-hidden="true" />
                )}
                Export GPX
              </button>
            ) : null}
          </div>

          <RouteMapToolbar
            request={request}
            pinMode={pinMode}
            currentLocation={currentLocation}
            locationIssue={locationIssue}
            mapLayer={mapLayer}
            locating={busy === "locate-route"}
            openingLocationSettings={busy === "open-location-settings"}
            approximatingLocation={busy === "approximate-location"}
            readinessItems={routeReadiness.items}
            onPinModeChange={handlePinModeChange}
            onLocate={() => void handleLocateMe()}
            onOpenLocationSettings={() => void handleOpenLocationSettings()}
            onUseApproximateLocation={() => void handleUseApproximateLocation()}
            onClearPins={handleClearPins}
            onFitRoute={() => setFitRequestId((value) => value + 1)}
            onLayerChange={setMapLayer}
          />

          <div className="route-preview-surface">
            <RoutePreviewMap
              route={activeRoute}
              request={request}
              pinMode={pinMode}
              currentLocation={currentLocation}
              mapLayer={mapLayer}
              fitRequestId={fitRequestId}
              onPickPoint={handlePickRoutePoint}
            />
            <RouteStatsSidebar route={activeRoute} request={request} />
          </div>

          {routes.length > 0 ? (
            <div className="route-history">
              <h3>Recent routes</h3>
              {routes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  className={
                    activeRoute?.id === route.id
                      ? "route-history-row active"
                      : "route-history-row"
                  }
                  onClick={() => setActiveRoute(route)}
                >
                  <span>{route.name}</span>
                  <small>{formatDate(route.createdAt)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {helpBrowserUrl ? (
        <OpenRouteServiceHelpBrowser
          url={helpBrowserUrl}
          onClose={() => setHelpBrowserUrl(null)}
        />
      ) : null}
    </>
  );
}

function OpenRouteServiceKeyGuide({
  config,
  busy,
  onConfigChange,
  onSubmit,
  onOpenHelp
}: {
  config: RouteBuilderConfig;
  busy: string | null;
  onConfigChange: (config: RouteBuilderConfig) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenHelp: (url: string) => void;
}) {
  return (
    <section className="ors-key-guide">
      <div className="ors-key-guide-header">
        <div className="ors-key-guide-icon">
          <KeyRound size={20} aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">OpenRouteService</p>
          <h3>Save your route API key</h3>
        </div>
      </div>

      <p className="ors-key-guide-copy">
        Route Builder uses your own OpenRouteService key for geocoding and route
        generation.
      </p>

      <ol className="ors-key-steps">
        <li>Sign in or create an OpenRouteService account.</li>
        <li>Open API Keys or the dashboard.</li>
        <li>Copy the Basic API key and save it in CorosLink.</li>
      </ol>

      <div className="ors-key-guide-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => onOpenHelp(ORS_LOGIN_URL)}
        >
          <Globe size={17} aria-hidden="true" />
          Open OpenRouteService
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onOpenHelp(ORS_API_INFO_URL)}
        >
          <ExternalLink size={17} aria-hidden="true" />
          API Info
        </button>
      </div>

      <RouteApiKeyForm
        config={config}
        busy={busy}
        guide
        onConfigChange={onConfigChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function RouteApiKeyForm({
  config,
  busy,
  compact,
  guide,
  onConfigChange,
  onSubmit
}: {
  config: RouteBuilderConfig;
  busy: string | null;
  compact?: boolean;
  guide?: boolean;
  onConfigChange: (config: RouteBuilderConfig) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className={[
        "route-api-form",
        compact && "route-api-form-compact",
        guide && "route-api-form-guide"
      ]
        .filter(Boolean)
        .join(" ")}
      onSubmit={onSubmit}
    >
      <label className="route-field">
        <span>OpenRouteService API key</span>
        <div className="input-shell">
          <KeyRound size={18} aria-hidden="true" />
          <input
            type="password"
            value={config.openRouteServiceApiKey}
            onChange={(event) =>
              onConfigChange({
                openRouteServiceApiKey: event.target.value
              })
            }
            placeholder="ors_..."
          />
        </div>
      </label>
      <button
        type="submit"
        className={guide ? "primary-button" : "secondary-button"}
        disabled={busy === "save-config"}
      >
        {busy === "save-config" ? (
          <Loader2 className="spin" size={17} aria-hidden="true" />
        ) : (
          <Save size={17} aria-hidden="true" />
        )}
        Save Key
      </button>
    </form>
  );
}

function OpenRouteServiceHelpBrowser({
  url,
  onClose
}: {
  url: string;
  onClose: () => void;
}) {
  const webviewRef = useRef<WebviewElement | null>(null);
  const domReadyRef = useRef(false);
  const pendingUrlRef = useRef(url);
  const [webviewKey, setWebviewKey] = useState(0);
  const [webviewSrc, setWebviewSrc] = useState(url);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [title, setTitle] = useState("OpenRouteService");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (pendingUrlRef.current === url) {
      return;
    }

    pendingUrlRef.current = url;
    setCurrentUrl(url);
    setLoadError(null);
    setLoading(true);

    if (webviewRef.current && domReadyRef.current) {
      void webviewRef.current.loadURL(url).catch((caught) => {
        setLoadError(toErrorMessage(caught));
        setLoading(false);
      });
      return;
    }

    setWebviewSrc(url);
    setWebviewKey((value) => value + 1);
  }, [url]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    domReadyRef.current = false;

    const updateNavigationState = () => {
      if (!domReadyRef.current) {
        return;
      }

      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const syncFromWebview = (nextUrl?: string) => {
      if (!domReadyRef.current) {
        return;
      }

      const latestUrl = nextUrl || webview.getURL() || pendingUrlRef.current;
      pendingUrlRef.current = latestUrl;
      setCurrentUrl(latestUrl);
      setTitle(webview.getTitle() || "OpenRouteService");
      updateNavigationState();
    };

    const handleDomReady = () => {
      domReadyRef.current = true;
      setLoading(false);
      setLoadError(null);
      syncFromWebview();
    };

    const handleDidStartLoading = () => {
      setLoading(true);
      setLoadError(null);
    };

    const handleDidStopLoading = () => {
      setLoading(false);
      syncFromWebview();
    };

    const handleDidFailLoad = (event: Event) => {
      const failEvent = event as WebviewFailLoadEvent;
      if (failEvent.isMainFrame === false || failEvent.errorCode === -3) {
        return;
      }

      setLoading(false);
      setLoadError(
        failEvent.errorDescription ||
          `Failed to load ${failEvent.validatedURL || pendingUrlRef.current}.`
      );
    };

    const handleNavigation = (event: Event) => {
      syncFromWebview((event as WebviewNavigationEvent).url);
    };

    const handleTitleUpdated = (event: Event) => {
      if (!domReadyRef.current) {
        return;
      }

      setTitle(
        (event as WebviewTitleEvent).title ||
          webview.getTitle() ||
          "OpenRouteService"
      );
    };

    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);
    webview.addEventListener("did-fail-load", handleDidFailLoad);
    webview.addEventListener("did-navigate", handleNavigation);
    webview.addEventListener("did-navigate-in-page", handleNavigation);
    webview.addEventListener("page-title-updated", handleTitleUpdated);

    return () => {
      domReadyRef.current = false;
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-start-loading", handleDidStartLoading);
      webview.removeEventListener("did-stop-loading", handleDidStopLoading);
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
      webview.removeEventListener("did-navigate", handleNavigation);
      webview.removeEventListener("did-navigate-in-page", handleNavigation);
      webview.removeEventListener("page-title-updated", handleTitleUpdated);
    };
  }, [webviewKey]);

  function handleRetry() {
    setLoadError(null);
    setLoading(true);

    if (webviewRef.current && domReadyRef.current) {
      webviewRef.current.reload();
      return;
    }

    setWebviewSrc(pendingUrlRef.current);
    setWebviewKey((value) => value + 1);
  }

  return (
    <div className="ors-help-backdrop" role="dialog" aria-modal="true">
      <section className="panel ors-help-modal">
        <div className="ors-help-toolbar">
          <div className="browser-nav-actions">
            <button
              type="button"
              className="icon-button"
              title="Back"
              disabled={!canGoBack}
              onClick={() => webviewRef.current?.goBack()}
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Forward"
              disabled={!canGoForward}
              onClick={() => webviewRef.current?.goForward()}
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Reload"
              onClick={handleRetry}
            >
              <RefreshCw size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="ors-help-address">
            <strong>{title}</strong>
            <span>{currentUrl}</span>
          </div>

          <button
            type="button"
            className="icon-button"
            title="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="ors-help-webview-frame">
          <webview
            key={webviewKey}
            ref={(element) => {
              webviewRef.current = element as WebviewElement | null;
              element?.setAttribute("allowpopups", "");
            }}
            className="ors-help-webview"
            src={webviewSrc}
            partition={ORS_HELP_PARTITION}
            webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=no"
          />

          {loadError ? (
            <div className="browser-load-error">
              <AlertCircle size={24} aria-hidden="true" />
              <strong>OpenRouteService failed to load</strong>
              <span>{loadError}</span>
              <div className="browser-load-error-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleRetry}
                >
                  Retry
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}

          {loading && !loadError ? (
            <div className="browser-loading">
              <Loader2 className="spin" size={24} aria-hidden="true" />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RouteReadiness({ items }: { items: RouteReadinessItem[] }) {
  return (
    <div className="route-readiness">
      {items.map((item) => (
        <span
          key={item.label}
          className={item.ready ? "route-ready-item ready" : "route-ready-item"}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function RouteMapToolbar({
  request,
  pinMode,
  currentLocation,
  locationIssue,
  mapLayer,
  locating,
  openingLocationSettings,
  approximatingLocation,
  readinessItems,
  onPinModeChange,
  onLocate,
  onOpenLocationSettings,
  onUseApproximateLocation,
  onClearPins,
  onFitRoute,
  onLayerChange
}: {
  request: GenerateRouteRequest;
  pinMode: RoutePinMode;
  currentLocation: RoutePinnedPoint | null;
  locationIssue: boolean;
  mapLayer: RouteMapLayer;
  locating: boolean;
  openingLocationSettings: boolean;
  approximatingLocation: boolean;
  readinessItems: RouteReadinessItem[];
  onPinModeChange: (mode: Exclude<RoutePinMode, null>) => void;
  onLocate: () => void;
  onOpenLocationSettings: () => void;
  onUseApproximateLocation: () => void;
  onClearPins: () => void;
  onFitRoute: () => void;
  onLayerChange: (layer: RouteMapLayer) => void;
}) {
  const startPin = parseRouteCoordinateValue(request.startLocation);
  const destinationPin =
    request.mode === "point-to-point"
      ? parseRouteCoordinateValue(request.destinationLocation)
      : undefined;

  return (
    <div className="route-pin-panel">
      <div className="route-pin-actions">
        <button
          type="button"
          className="route-pin-command route-locate-command"
          onClick={onLocate}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="spin" size={16} aria-hidden="true" />
          ) : (
            <Navigation size={16} aria-hidden="true" />
          )}
          Locate me
        </button>
        <button
          type="button"
          className={
            pinMode === "start" ? "route-pin-command active" : "route-pin-command"
          }
          onClick={() => onPinModeChange("start")}
        >
          <MapPin size={16} aria-hidden="true" />
          Start
        </button>
        <button
          type="button"
          className={
            pinMode === "destination"
              ? "route-pin-command active"
              : "route-pin-command"
          }
          onClick={() => onPinModeChange("destination")}
        >
          <MapPin size={16} aria-hidden="true" />
          End
        </button>
        <button
          type="button"
          className="route-pin-command"
          onClick={onClearPins}
        >
          <Trash2 size={16} aria-hidden="true" />
          Clear pins
        </button>
        <button type="button" className="route-pin-command" onClick={onFitRoute}>
          <RefreshCw size={16} aria-hidden="true" />
          Fit route
        </button>
      </div>

      <div className="route-layer-switcher" aria-label="Map layer">
        {(["street", "dark", "topo"] as RouteMapLayer[]).map((layer) => (
          <button
            key={layer}
            type="button"
            className={mapLayer === layer ? "active" : ""}
            onClick={() => onLayerChange(layer)}
          >
            {routeMapLayerLabel(layer)}
          </button>
        ))}
      </div>

      {locationIssue ? (
        <div className="route-location-issue">
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            Native location did not return coordinates. Allow CorosLink/Electron
            in system settings or use an approximate network location.
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenLocationSettings}
            disabled={openingLocationSettings}
          >
            {openingLocationSettings ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <ExternalLink size={15} aria-hidden="true" />
            )}
            Open Settings
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onUseApproximateLocation}
            disabled={approximatingLocation}
          >
            {approximatingLocation ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <Navigation size={15} aria-hidden="true" />
            )}
            Use Approximate
          </button>
        </div>
      ) : null}

      <p>
        {pinMode
          ? `Click the map to set the ${pinMode === "start" ? "start" : "end"} point.`
          : "Plan from the map with exact pins, current location, or typed search."}
      </p>
      <div className="route-pin-status">
        <span className={startPin ? "badge ready" : "badge"}>
          Start {startPin ? formatPinnedRoutePoint(startPin) : "not pinned"}
        </span>
        <span className={destinationPin ? "badge ready" : "badge"}>
          End {destinationPin ? formatPinnedRoutePoint(destinationPin) : "not pinned"}
        </span>
        <span className={currentLocation ? "badge ready" : "badge"}>
          {currentLocation
            ? `Current ${formatPinnedRoutePoint(currentLocation)}`
            : "Current location not set"}
        </span>
      </div>
      <RouteReadiness items={readinessItems} />
    </div>
  );
}

function RouteStatsSidebar({
  route,
  request
}: {
  route: GeneratedRoute | null;
  request: GenerateRouteRequest;
}) {
  const requestedDistance = Number(request.distanceKm);
  const distanceLabel = route
    ? `${(route.distanceMeters / 1000).toFixed(1)} km`
    : Number.isFinite(requestedDistance) && requestedDistance > 0
      ? `${requestedDistance.toFixed(1)} km target`
      : "Not set";
  const startLabel = route?.startLocation || request.startLocation || "Not set";
  const destinationLabel =
    route?.destinationLocation ||
    (request.mode === "point-to-point"
      ? request.destinationLocation || "Not set"
      : "Loop route");

  return (
    <aside className="route-stats-sidebar">
      <div className="route-stats-heading">
        <p className="eyebrow">Route stats</p>
        <h3>{route ? "Generated route" : "Route plan"}</h3>
      </div>

      <div className="route-stat-list">
        <RouteStat label="Distance" value={distanceLabel} />
        <RouteStat
          label="Duration"
          value={route ? formatDuration(route.durationSeconds) : "After generation"}
        />
        <RouteStat
          label="Elevation"
          value={
            route
              ? `${formatMeters(route.ascentMeters)} up / ${formatMeters(route.descentMeters)} down`
              : formatElevationPreference(request.elevationPreference)
          }
        />
        <RouteStat
          label="Mode"
          value={routeModeLabel(route?.mode ?? request.mode)}
        />
        <RouteStat
          label="Surface"
          value={surfacePreferenceLabel(
            route?.surfacePreference ?? request.surfacePreference
          )}
        />
        <RouteStat
          label="Points"
          value={route ? String(route.points.length) : "After generation"}
        />
      </div>

      <div className="route-stat-locations">
        <RouteStat label="Start" value={startLabel} />
        <RouteStat label="End" value={destinationLabel} />
      </div>

      {route ? (
        <small className="route-stats-footnote">
          Generated {formatDate(route.createdAt)}
        </small>
      ) : null}
    </aside>
  );
}

function RouteStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="route-stat-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RoutePreviewMap({
  route,
  request,
  pinMode,
  currentLocation,
  mapLayer,
  fitRequestId,
  onPickPoint
}: {
  route: GeneratedRoute | null;
  request: GenerateRouteRequest;
  pinMode: RoutePinMode;
  currentLocation: RoutePinnedPoint | null;
  mapLayer: RouteMapLayer;
  fitRequestId: number;
  onPickPoint: (point: RoutePinnedPoint) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    const routePoints = route?.points
      .filter((point) => point.lat !== undefined && point.lon !== undefined)
      .map((point) => [point.lat!, point.lon!] as [number, number]);
    const startPin = parseRouteCoordinateValue(request.startLocation);
    const destinationPin =
      request.mode === "point-to-point"
        ? parseRouteCoordinateValue(request.destinationLocation)
        : undefined;

    if (!container) {
      return;
    }

    delete (container as HTMLDivElement & { _leaflet_id?: number })._leaflet_id;

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false
    });

    const tileLayer = ROUTE_TILE_LAYERS[mapLayer];
    L.tileLayer(tileLayer.url, {
      maxZoom: tileLayer.maxZoom,
      attribution: tileLayer.attribution,
      ...(tileLayer.subdomains ? { subdomains: tileLayer.subdomains } : {})
    }).addTo(map);

    const boundsPoints: Array<[number, number]> = [];

    if (routePoints && routePoints.length >= 2) {
      L.polyline(routePoints, {
        color: "#74c08f",
        weight: 4,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);

      L.circleMarker(routePoints[0]!, {
        radius: 6,
        color: "#4da3ff",
        fillColor: "#4da3ff",
        fillOpacity: 1,
        weight: 2
      }).addTo(map);

      L.circleMarker(routePoints[routePoints.length - 1]!, {
        radius: 6,
        color: "#d89b22",
        fillColor: "#d89b22",
        fillOpacity: 1,
        weight: 2
      }).addTo(map);

      boundsPoints.push(...routePoints);
    }

    if (startPin) {
      L.circleMarker([startPin.lat, startPin.lon], {
        radius: 7,
        color: "#4da3ff",
        fillColor: "#4da3ff",
        fillOpacity: 0.92,
        weight: 2
      })
        .bindTooltip("Pinned start")
        .addTo(map);
      boundsPoints.push([startPin.lat, startPin.lon]);
    }

    if (destinationPin) {
      L.circleMarker([destinationPin.lat, destinationPin.lon], {
        radius: 7,
        color: "#d89b22",
        fillColor: "#d89b22",
        fillOpacity: 0.92,
        weight: 2
      })
        .bindTooltip("Pinned end")
        .addTo(map);
      boundsPoints.push([destinationPin.lat, destinationPin.lon]);
    }

    if (currentLocation) {
      L.circleMarker([currentLocation.lat, currentLocation.lon], {
        radius: 8,
        color: "#0f172a",
        fillColor: "#7dd3fc",
        fillOpacity: 0.92,
        weight: 3
      })
        .bindTooltip("Current location")
        .addTo(map);
      boundsPoints.push([currentLocation.lat, currentLocation.lon]);
    }

    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [28, 28],
        maxZoom: 14
      });
    } else {
      map.setView([39.5, -98.35], 4);
    }

    if (pinMode) {
      map.on("click", (event: L.LeafletMouseEvent) => {
        onPickPoint({
          lat: event.latlng.lat,
          lon: event.latlng.lng
        });
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, [
    route,
    request.startLocation,
    request.destinationLocation,
    request.mode,
    currentLocation,
    mapLayer,
    fitRequestId,
    pinMode,
    onPickPoint
  ]);

  return (
    <div
      ref={mapContainerRef}
      className={pinMode ? "route-preview-map is-pinning" : "route-preview-map"}
    />
  );
}

function MapsEmpty({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="maps-empty">
      {icon}
      <strong>{title}</strong>
    </div>
  );
}

function getRouteReadiness(
  request: GenerateRouteRequest,
  hasSavedApiKey: boolean,
  hasUnsavedApiKeyChange: boolean
): { ready: boolean; items: RouteReadinessItem[] } {
  const distance = Number(request.distanceKm);
  const items: RouteReadinessItem[] = [
    {
      label: hasUnsavedApiKeyChange ? "Save key change" : "API key saved",
      ready: hasSavedApiKey && !hasUnsavedApiKeyChange
    },
    {
      label: "Start set",
      ready: request.startLocation.trim().length > 0
    },
    {
      label: "Distance valid",
      ready: Number.isFinite(distance) && distance > 0 && distance <= 100
    }
  ];

  if (request.mode === "point-to-point") {
    items.push({
      label: "Destination set",
      ready: Boolean(request.destinationLocation?.trim())
    });
  }

  return {
    ready: items.every((item) => item.ready),
    items
  };
}

async function getCurrentPositionWithFallback(
  onFallback: () => void
): Promise<GeolocationPosition> {
  try {
    return await requestCurrentPosition({
      enableHighAccuracy: false,
      timeout: 5_000,
      maximumAge: 10 * 60_000
    });
  } catch (firstError) {
    if (!isGeolocationTimeout(firstError)) {
      throw firstError;
    }
  }

  onFallback();

  try {
    return await requestCurrentPosition({
      enableHighAccuracy: true,
      timeout: 25_000,
      maximumAge: 60_000
    });
  } catch (secondError) {
    if (!isGeolocationTimeout(secondError)) {
      throw secondError;
    }
  }

  return requestCurrentPosition({
    enableHighAccuracy: false,
    timeout: 20_000,
    maximumAge: 10 * 60_000
  });
}

function requestCurrentPosition(
  options: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function routeMapLayerLabel(layer: RouteMapLayer): string {
  switch (layer) {
    case "street":
      return "Street";
    case "dark":
      return "Dark";
    case "topo":
      return "Topo-like";
  }
}

function setRequestField<Key extends keyof GenerateRouteRequest>(
  setRequest: Dispatch<SetStateAction<GenerateRouteRequest>>,
  key: Key,
  value: GenerateRouteRequest[Key]
) {
  setRequest((current) => ({
    ...current,
    [key]: value
  }));
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function titleFromRegionId(value: string): string {
  return value
    .split("-")
    .map((part) =>
      /^\d+$/.test(part)
        ? part
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    )
    .join(" ")
    .replace(/([A-Za-z]+)(\d+)$/, "$1 - $2");
}

function shortPath(value: string): string {
  const parts = value.split(/[/\\]/).filter(Boolean);
  return parts.slice(-3).join("/");
}

function parseRouteCoordinateValue(
  value?: string
): RoutePinnedPoint | undefined {
  const match = value
    ?.trim()
    .match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s+.*)?$/);

  if (!match) {
    return undefined;
  }

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return undefined;
  }

  return { lat, lon };
}

function formatPinnedRoutePoint(point: RoutePinnedPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

function formatProgress(job?: CorosMapDownloadJob): string {
  if (!job) {
    return "0%";
  }

  return `${Math.round(Math.max(0, Math.min(job.progress, 1)) * 100)}%`;
}

function formatDuration(value?: number): string {
  if (!value || !Number.isFinite(value)) {
    return "Unknown";
  }

  const minutes = Math.round(value / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

function formatMeters(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }

  return `${Math.round(value)} m`;
}

function routeModeLabel(mode: GenerateRouteRequest["mode"]): string {
  return mode === "point-to-point" ? "Point-to-point" : "Loop";
}

function surfacePreferenceLabel(
  surface: GenerateRouteRequest["surfacePreference"]
): string {
  return surface === "trail" ? "Trail / hiking" : "Road / walking";
}

function formatElevationPreference(
  preference: GenerateRouteRequest["elevationPreference"]
): string {
  switch (preference) {
    case "flatter":
      return "Prefer flatter";
    case "hilly":
      return "Prefer hilly";
    case "any":
      return "Any elevation";
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toGeolocationErrorMessage(error: unknown): string {
  if (isGeolocationTimeout(error)) {
    return [
      "Location lookup timed out.",
      "Check macOS Location Services for CorosLink/Electron, or type a city/address and use Find on map."
    ].join(" ");
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
  ) {
    const code = (error as { code: number }).code;
    if (code === 1) {
      return "Location permission was denied.";
    }

    if (code === 2) {
      return "Current location is unavailable.";
    }

  }

  return toErrorMessage(error);
}

function isGeolocationTimeout(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 3
  );
}
