import { app, dialog, shell } from "electron";
import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import {
  addGeneratedRoute,
  deleteCachedCorosMapRecord,
  getCachedCorosMap,
  getGeneratedRoute,
  getSetting,
  listCachedCorosMaps as listStoredCachedCorosMaps,
  listGeneratedRoutes as listSavedGeneratedRoutes,
  setSetting,
  updateCachedCorosMapExtractedPath,
  upsertCachedCorosMap
} from "./database";
import type {
  CachedCorosMapPackage,
  CorosMapDownloadJob,
  CorosMapInstallResult,
  CorosMapInstallProgress,
  CorosMapLocalSelection,
  CorosMapManifest,
  CorosMapPackage,
  CorosMapType,
  GenerateRouteRequest,
  GeneratedRoute,
  RouteGeocodeResult,
  RouteBuilderConfig,
  TrainingHubTrackPoint
} from "./types";
import { getWatchStatus } from "./watchService";

const COROS_MAP_HOST = "https://map-oss-us.coros.com";
const COROS_MAP_MANIFEST_URL = `${COROS_MAP_HOST}/regionMap/v5/regions_v5.json`;
const ORS_API_KEY_SETTING = "maps.openRouteServiceApiKey";
const ORS_BASE_URL = "https://api.openrouteservice.org";
const MAX_ROUTE_DISTANCE_KM = 100;
const DOWNLOAD_PROGRESS_MIN_INTERVAL_MS = 250;

interface RawCorosMapManifest {
  mapData?: RawCorosMapPackage[];
  updatedAt?: string;
  v?: string;
  host?: string;
  totalSize?: number;
  bundleVersion?: string;
}

interface RawCorosMapPackage {
  region?: string;
  parent?: string;
  type?: string;
  title?: string;
  data?: {
    size?: number;
    link?: string;
  };
}

interface DirectoryStats {
  sizeBytes: number;
  fileCount: number;
}

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

interface CorosMapDownloadOptions {
  cacheDirectory?: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  onProgress?: (progress: {
    receivedBytes: number;
    sizeBytes: number;
    progress: number;
  }) => void;
}

interface CorosMapInstallOptions {
  label?: string;
}

interface CopyDirectoryOptions {
  totalBytes: number;
  totalFiles: number;
  onProgress: (progress: { copiedBytes: number; copiedFiles: number }) => void;
}

interface UnzipperEntry extends NodeJS.ReadableStream {
  path: string;
  type: "Directory" | "File" | string;
  autodrain: () => NodeJS.ReadableStream;
}

interface UnzipperModule {
  Parse: () => NodeJS.ReadWriteStream;
}

interface OrsGeocodeResponse {
  features?: Array<{
    geometry?: {
      coordinates?: number[];
    };
    properties?: {
      label?: string;
      name?: string;
    };
  }>;
}

interface ApproximateLocationResponse {
  latitude?: number;
  longitude?: number;
  city?: string;
  region?: string;
  country_name?: string;
  error?: boolean;
  reason?: string;
}

let corosMapDownloadListener:
  | ((jobs: CorosMapDownloadJob[]) => void)
  | undefined;
const corosMapDownloadJobs = new Map<string, CorosMapDownloadJob>();
const corosMapDownloadControllers = new Map<string, AbortController>();
let corosMapInstallProgressListener:
  | ((progress: CorosMapInstallProgress | null) => void)
  | undefined;
let corosMapInstallProgress: CorosMapInstallProgress | null = null;

interface OrsDirectionsResponse {
  features?: Array<{
    geometry?: {
      type?: string;
      coordinates?: number[][];
    };
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
      ascent?: number;
      descent?: number;
    };
  }>;
}

export async function getCorosMapManifest(): Promise<CorosMapManifest> {
  const response = await fetch(COROS_MAP_MANIFEST_URL, {
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(
      `COROS map manifest request failed: ${response.status} ${response.statusText}`
    );
  }

  return parseCorosMapManifest((await response.json()) as RawCorosMapManifest);
}

export function parseCorosMapManifest(
  manifest: RawCorosMapManifest
): CorosMapManifest {
  const version = String(manifest.v ?? "5");
  const host = normalizeHost(manifest.host ?? COROS_MAP_HOST);
  const packages: CorosMapPackage[] = [];

  for (const item of manifest.mapData ?? []) {
    const type = normalizeCorosMapType(item.type);
    const region = item.region?.trim();
    const link = item.data?.link?.trim();
    const sizeBytes = Number(item.data?.size ?? 0);

    if (!type || !region || !link || !Number.isFinite(sizeBytes)) {
      continue;
    }

    packages.push({
      id: `${version}:${region}:${type}`,
      region,
      parent: item.parent?.trim() || "global",
      title: titleFromMapKey(item.title ?? region),
      type,
      sizeBytes,
      link,
      downloadUrl: `${host}${link.startsWith("/") ? "" : "/"}${link}`,
      version,
      bundleVersion: manifest.bundleVersion,
      updatedAt: manifest.updatedAt
    });
  }

  packages.sort((left, right) => {
    const parent = left.parent.localeCompare(right.parent);
    if (parent !== 0) {
      return parent;
    }

    const region = left.region.localeCompare(right.region, undefined, {
      numeric: true
    });
    if (region !== 0) {
      return region;
    }

    return left.type.localeCompare(right.type);
  });

  return {
    version,
    bundleVersion: manifest.bundleVersion,
    updatedAt: manifest.updatedAt,
    totalSizeBytes: manifest.totalSize,
    packages
  };
}

export async function openCorosMapDownload(downloadUrl: string): Promise<void> {
  validateOfficialCorosDownloadUrl(downloadUrl);

  await shell.openExternal(downloadUrl);
}

export function setCorosMapDownloadListener(
  listener: (jobs: CorosMapDownloadJob[]) => void
): void {
  corosMapDownloadListener = listener;
}

export function listCorosMapDownloadJobs(): CorosMapDownloadJob[] {
  return Array.from(corosMapDownloadJobs.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function setCorosMapInstallProgressListener(
  listener: (progress: CorosMapInstallProgress | null) => void
): void {
  corosMapInstallProgressListener = listener;
}

export function getCorosMapInstallProgress(): CorosMapInstallProgress | null {
  return corosMapInstallProgress;
}

export function downloadCorosMapPackage(
  mapPackage: CorosMapPackage
): CorosMapDownloadJob[] {
  validateCorosMapPackage(mapPackage);

  const existingActiveJob = listCorosMapDownloadJobs().find(
    (job) =>
      job.packageId === mapPackage.id &&
      (job.status === "queued" || job.status === "downloading")
  );
  if (existingActiveJob) {
    return listCorosMapDownloadJobs();
  }

  const existingCached = getCachedCorosMap(mapPackage.id);
  if (existingCached && fs.existsSync(existingCached.filePath)) {
    const now = new Date().toISOString();
    const job: CorosMapDownloadJob = {
      id: crypto.randomUUID(),
      packageId: mapPackage.id,
      title: mapPackage.title,
      region: mapPackage.region,
      type: mapPackage.type,
      downloadUrl: mapPackage.downloadUrl,
      sizeBytes: existingCached.sizeBytes,
      status: "cached",
      progress: 1,
      receivedBytes: existingCached.sizeBytes,
      filePath: existingCached.filePath,
      createdAt: now,
      updatedAt: now
    };
    corosMapDownloadJobs.set(job.id, job);
    publishCorosMapDownloadJobs();
    return listCorosMapDownloadJobs();
  }

  const now = new Date().toISOString();
  const job: CorosMapDownloadJob = {
    id: crypto.randomUUID(),
    packageId: mapPackage.id,
    title: mapPackage.title,
    region: mapPackage.region,
    type: mapPackage.type,
    downloadUrl: mapPackage.downloadUrl,
    sizeBytes: mapPackage.sizeBytes,
    status: "queued",
    progress: 0,
    receivedBytes: 0,
    createdAt: now,
    updatedAt: now
  };
  corosMapDownloadJobs.set(job.id, job);
  publishCorosMapDownloadJobs();

  void runCorosMapDownload(job.id, mapPackage);
  return listCorosMapDownloadJobs();
}

export function cancelCorosMapDownload(id: string): CorosMapDownloadJob[] {
  const controller = corosMapDownloadControllers.get(id);
  if (controller) {
    controller.abort();
    return listCorosMapDownloadJobs();
  }

  const job = corosMapDownloadJobs.get(id);
  if (job && (job.status === "queued" || job.status === "downloading")) {
    updateCorosMapDownloadJob(id, {
      status: "cancelled",
      error: "Download cancelled."
    });
  }

  return listCorosMapDownloadJobs();
}

export function clearCorosMapDownloadJob(id: string): CorosMapDownloadJob[] {
  const job = corosMapDownloadJobs.get(id);
  if (
    job &&
    !["queued", "downloading"].includes(job.status)
  ) {
    corosMapDownloadJobs.delete(id);
    publishCorosMapDownloadJobs();
  }

  return listCorosMapDownloadJobs();
}

export function listCachedCorosMaps(): CachedCorosMapPackage[] {
  const cachedPackages = listStoredCachedCorosMaps();
  const validPackages: CachedCorosMapPackage[] = [];

  for (const cached of cachedPackages) {
    if (fs.existsSync(cached.filePath)) {
      validPackages.push({
        ...cached,
        extractedPath:
          cached.extractedPath && fs.existsSync(cached.extractedPath)
            ? cached.extractedPath
            : undefined
      });
      continue;
    }

    deleteCachedCorosMapRecord(cached.packageId);
  }

  return validPackages;
}

export async function installCachedCorosMap(
  packageId: string
): Promise<CorosMapInstallResult> {
  const cached = getCachedCorosMap(packageId);
  if (!cached || !fs.existsSync(cached.filePath)) {
    deleteCachedCorosMapRecord(packageId);
    throw new Error("Cached COROS map package was not found.");
  }

  const status = await getWatchStatus();
  if (!status.connected || !status.rootPath) {
    throw new Error("Connect a COROS watch before installing maps.");
  }

  if (status.freeBytes !== undefined && cached.sizeBytes > status.freeBytes) {
    throw new Error(
      "The cached map package is larger than the free space on the watch."
    );
  }

  const extractPath = await ensureCachedCorosMapExtracted(cached);
  return installCorosMapFolder(extractPath, {
    label: cached.title
  });
}

export async function deleteCachedCorosMap(
  packageId: string
): Promise<CachedCorosMapPackage[]> {
  const cached = getCachedCorosMap(packageId);
  if (cached) {
    const cacheDirectory = getCorosMapCacheDirectory();
    await removePathInsideCache(cacheDirectory, cached.filePath);
    if (cached.extractedPath) {
      await removePathInsideCache(cacheDirectory, cached.extractedPath);
    }
  }

  deleteCachedCorosMapRecord(packageId);
  return listCachedCorosMaps();
}

export async function downloadCorosMapPackageToCache(
  mapPackage: CorosMapPackage,
  options: CorosMapDownloadOptions = {}
): Promise<CachedCorosMapPackage> {
  validateCorosMapPackage(mapPackage);
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheDirectory = options.cacheDirectory ?? getCorosMapCacheDirectory();
  await fs.promises.mkdir(cacheDirectory, { recursive: true });

  const cacheFileName = getCorosMapCacheFileName(mapPackage);
  const filePath = path.join(cacheDirectory, cacheFileName);
  const partPath = `${filePath}.part`;
  await fs.promises.rm(partPath, { force: true });

  const response = await fetchImpl(mapPackage.downloadUrl, {
    signal: options.signal
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `COROS map download failed: ${response.status} ${response.statusText}`
    );
  }

  const contentLength = Number(response.headers.get("content-length"));
  const sizeBytes =
    Number.isFinite(contentLength) && contentLength > 0
      ? contentLength
      : mapPackage.sizeBytes;
  let receivedBytes = 0;
  let lastProgressAt = 0;
  const file = fs.createWriteStream(partPath, { flags: "w" });
  const reader = response.body.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      receivedBytes += chunk.byteLength;
      if (!file.write(chunk)) {
        await once(file, "drain");
      }

      const now = Date.now();
      if (now - lastProgressAt >= DOWNLOAD_PROGRESS_MIN_INTERVAL_MS) {
        lastProgressAt = now;
        options.onProgress?.({
          receivedBytes,
          sizeBytes,
          progress: sizeBytes > 0 ? Math.min(receivedBytes / sizeBytes, 1) : 0
        });
      }
    }

    file.end();
    await once(file, "finish");
  } catch (caught) {
    file.destroy();
    await fs.promises.rm(partPath, { force: true });
    throw caught;
  }

  await fs.promises.rename(partPath, filePath);
  const finalStats = await fs.promises.stat(filePath);
  options.onProgress?.({
    receivedBytes: finalStats.size,
    sizeBytes: sizeBytes > 0 ? sizeBytes : finalStats.size,
    progress: 1
  });

  return {
    packageId: mapPackage.id,
    title: mapPackage.title,
    region: mapPackage.region,
    parent: mapPackage.parent,
    type: mapPackage.type,
    sizeBytes: sizeBytes > 0 ? sizeBytes : finalStats.size,
    downloadUrl: mapPackage.downloadUrl,
    filePath,
    downloadedAt: new Date().toISOString()
  };
}

export async function chooseCorosMapFolder(): Promise<
  CorosMapLocalSelection | undefined
> {
  const result = await dialog.showOpenDialog({
    title: "Choose extracted COROS map folder",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }

  return inspectCorosMapFolder(result.filePaths[0]!);
}

export async function inspectCorosMapFolder(
  sourcePath: string
): Promise<CorosMapLocalSelection> {
  const mapPath = await resolveMapSourcePath(sourcePath);
  const stats = await getDirectoryStats(mapPath);
  return {
    sourcePath,
    mapPath,
    sizeBytes: stats.sizeBytes,
    fileCount: stats.fileCount
  };
}

export async function installCorosMapFolder(
  sourcePath: string,
  options: CorosMapInstallOptions = {}
): Promise<CorosMapInstallResult> {
  const selection = await inspectCorosMapFolder(sourcePath);
  const status = await getWatchStatus();

  if (!status.connected || !status.rootPath) {
    throw new Error("Connect a COROS watch before installing maps.");
  }

  if (
    status.freeBytes !== undefined &&
    selection.sizeBytes > status.freeBytes
  ) {
    throw new Error(
      `The selected map folder is larger than the free space on the watch.`
    );
  }

  const installedPath = path.join(status.rootPath, "map");
  assertNotSameOrNested(selection.mapPath, installedPath);
  const label = options.label ?? path.basename(selection.sourcePath);

  publishCorosMapInstallProgress({
    active: true,
    phase: "preparing",
    label,
    sourcePath: selection.sourcePath,
    installedPath,
    copiedBytes: 0,
    totalBytes: selection.sizeBytes,
    copiedFiles: 0,
    totalFiles: selection.fileCount,
    progress: 0,
    updatedAt: new Date().toISOString()
  });

  try {
    await fs.promises.mkdir(installedPath, { recursive: true });
    publishCorosMapInstallProgress({
      active: true,
      phase: "copying",
      label,
      sourcePath: selection.sourcePath,
      installedPath,
      copiedBytes: 0,
      totalBytes: selection.sizeBytes,
      copiedFiles: 0,
      totalFiles: selection.fileCount,
      progress: 0,
      updatedAt: new Date().toISOString()
    });
    await copyDirectoryContents(selection.mapPath, installedPath, {
      totalBytes: selection.sizeBytes,
      totalFiles: selection.fileCount,
      onProgress: ({ copiedBytes, copiedFiles }) => {
        publishCorosMapInstallProgress({
          active: true,
          phase: "copying",
          label,
          sourcePath: selection.sourcePath,
          installedPath,
          copiedBytes,
          totalBytes: selection.sizeBytes,
          copiedFiles,
          totalFiles: selection.fileCount,
          progress:
            selection.sizeBytes > 0
              ? Math.min(copiedBytes / selection.sizeBytes, 1)
              : copiedFiles >= selection.fileCount
                ? 1
                : 0,
          updatedAt: new Date().toISOString()
        });
      }
    });
  } catch (caught) {
    const error = toWatchInstallError(caught, status.rootPath);
    publishCorosMapInstallProgress({
      active: false,
      phase: "failed",
      label,
      sourcePath: selection.sourcePath,
      installedPath,
      copiedBytes: corosMapInstallProgress?.copiedBytes ?? 0,
      totalBytes: selection.sizeBytes,
      copiedFiles: corosMapInstallProgress?.copiedFiles ?? 0,
      totalFiles: selection.fileCount,
      progress: corosMapInstallProgress?.progress ?? 0,
      error: error.message,
      updatedAt: new Date().toISOString()
    });
    throw error;
  }

  publishCorosMapInstallProgress({
    active: false,
    phase: "completed",
    label,
    sourcePath: selection.sourcePath,
    installedPath,
    copiedBytes: selection.sizeBytes,
    totalBytes: selection.sizeBytes,
    copiedFiles: selection.fileCount,
    totalFiles: selection.fileCount,
    progress: 1,
    updatedAt: new Date().toISOString()
  });

  return {
    ...selection,
    installedPath,
    watch: await getWatchStatus()
  };
}

export function getRouteBuilderConfig(): RouteBuilderConfig {
  return {
    openRouteServiceApiKey: getSetting(ORS_API_KEY_SETTING) ?? ""
  };
}

export function saveRouteBuilderConfig(
  config: RouteBuilderConfig
): RouteBuilderConfig {
  setSetting(ORS_API_KEY_SETTING, config.openRouteServiceApiKey.trim());
  return getRouteBuilderConfig();
}

export function listGeneratedRoutes(): GeneratedRoute[] {
  return listSavedGeneratedRoutes();
}

export async function openLocationServicesSettings(): Promise<void> {
  if (process.platform === "darwin") {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices"
    );
    return;
  }

  if (process.platform === "win32") {
    await shell.openExternal("ms-settings:privacy-location");
    return;
  }

  throw new Error("Open your system location settings and allow CorosLink.");
}

export async function getApproximateRouteLocation(
  fetchImpl: FetchLike = fetch
): Promise<RouteGeocodeResult> {
  const response = await fetchImpl("https://ipapi.co/json/", {
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(
      `Approximate location lookup failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as ApproximateLocationResponse;
  if (
    payload.error ||
    !Number.isFinite(payload.latitude) ||
    !Number.isFinite(payload.longitude)
  ) {
    throw new Error(payload.reason || "Approximate location was not available.");
  }

  return {
    label: [
      payload.city,
      payload.region,
      payload.country_name
    ].filter(Boolean).join(", ") || "Approximate location",
    lat: payload.latitude!,
    lon: payload.longitude!
  };
}

export async function geocodeRouteLocation(
  query: string
): Promise<RouteGeocodeResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Enter a location to find on the map.");
  }

  const pinnedLocation = parseRouteCoordinateInput(trimmedQuery);
  if (pinnedLocation) {
    return {
      label: pinnedLocation.label,
      lat: pinnedLocation.coordinates[1],
      lon: pinnedLocation.coordinates[0]
    };
  }

  const apiKey = getSetting(ORS_API_KEY_SETTING)?.trim();
  if (!apiKey) {
    throw new Error(
      "Save an OpenRouteService API key before finding locations on the map."
    );
  }

  const result = await geocodeLocation(trimmedQuery, apiKey);
  return {
    label: result.label,
    lat: result.coordinates[1],
    lon: result.coordinates[0]
  };
}

export async function generateRoute(
  request: GenerateRouteRequest
): Promise<GeneratedRoute> {
  const apiKey = getSetting(ORS_API_KEY_SETTING)?.trim();
  if (!apiKey) {
    throw new Error("Save an OpenRouteService API key before generating routes.");
  }

  const normalized = normalizeGenerateRouteRequest(request);
  const start = await geocodeLocation(normalized.startLocation, apiKey);
  const destination =
    normalized.mode === "point-to-point"
      ? await geocodeLocation(normalized.destinationLocation ?? "", apiKey)
      : undefined;

  const profile =
    normalized.surfacePreference === "trail" ? "foot-hiking" : "foot-walking";
  const body = buildOrsDirectionsBody(
    normalized,
    start.coordinates,
    destination?.coordinates
  );

  const response = await fetch(`${ORS_BASE_URL}/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `OpenRouteService route request failed: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 180)}` : ""}`
    );
  }

  const route = routeFromOrsResponse(
    (await response.json()) as OrsDirectionsResponse,
    normalized,
    start.label,
    destination?.label
  );
  const gpx = buildRouteGpx(route);
  const gpxPath = await writeRouteGpx(route.id, route.name, gpx);
  const saved = addGeneratedRoute({ ...route, gpxPath });
  return saved;
}

export async function exportGeneratedRoute(id: string): Promise<string | null> {
  const route = getGeneratedRoute(id);
  if (!route) {
    throw new Error("Generated route was not found.");
  }

  if (!route.gpxPath || !fs.existsSync(route.gpxPath)) {
    throw new Error("Generated route GPX file is missing.");
  }

  const result = await dialog.showSaveDialog({
    title: "Export GPX",
    defaultPath: sanitizeFileName(`${route.name}.gpx`),
    filters: [{ name: "GPX", extensions: ["gpx"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.promises.copyFile(route.gpxPath, result.filePath);
  return result.filePath;
}

export function buildOrsDirectionsBody(
  request: GenerateRouteRequest,
  startCoordinates: [number, number],
  destinationCoordinates?: [number, number]
): Record<string, unknown> {
  if (request.mode === "point-to-point" && !destinationCoordinates) {
    throw new Error("Destination coordinates are required.");
  }

  const coordinates =
    request.mode === "loop"
      ? [startCoordinates]
      : [startCoordinates, destinationCoordinates as [number, number]];
  const options: Record<string, unknown> = {};

  if (request.mode === "loop") {
    options.round_trip = {
      length: Math.round(request.distanceKm * 1000),
      points: 3,
      seed: stableSeed(
        `${request.startLocation}:${request.distanceKm}:${request.surfacePreference}`
      )
    };
  }

  if (request.elevationPreference !== "any") {
    options.profile_params = {
      weightings: {
        steepness_difficulty:
          request.elevationPreference === "flatter" ? 1 : 3
      }
    };
  }

  return {
    coordinates,
    elevation: true,
    instructions: false,
    preference: "recommended",
    ...(Object.keys(options).length > 0 ? { options } : {})
  };
}

export function buildRouteGpx(route: GeneratedRoute): string {
  const trkpts = route.points
    .filter((point) => point.lat !== undefined && point.lon !== undefined)
    .map((point) => {
      const elevation =
        point.elevation !== undefined ? `<ele>${point.elevation}</ele>` : "";
      return `      <trkpt lat="${point.lat}" lon="${point.lon}">${elevation}</trkpt>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="CorosLink" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(route.name)}</name></metadata>`,
    "  <trk>",
    `    <name>${escapeXml(route.name)}</name>`,
    "    <trkseg>",
    trkpts,
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
    ""
  ].join("\n");
}

async function runCorosMapDownload(
  jobId: string,
  mapPackage: CorosMapPackage
): Promise<void> {
  const controller = new AbortController();
  corosMapDownloadControllers.set(jobId, controller);
  updateCorosMapDownloadJob(jobId, { status: "downloading" });

  try {
    const cached = await downloadCorosMapPackageToCache(mapPackage, {
      signal: controller.signal,
      onProgress: (progress) => {
        updateCorosMapDownloadJob(jobId, {
          receivedBytes: progress.receivedBytes,
          sizeBytes: progress.sizeBytes,
          progress: progress.progress
        });
      }
    });
    const saved = upsertCachedCorosMap(cached);
    updateCorosMapDownloadJob(jobId, {
      status: "cached",
      progress: 1,
      receivedBytes: saved.sizeBytes,
      sizeBytes: saved.sizeBytes,
      filePath: saved.filePath
    });
  } catch (caught) {
    const message = toErrorMessage(caught);
    updateCorosMapDownloadJob(jobId, {
      status: controller.signal.aborted ? "cancelled" : "failed",
      error: controller.signal.aborted ? "Download cancelled." : message
    });
  } finally {
    corosMapDownloadControllers.delete(jobId);
  }
}

function updateCorosMapDownloadJob(
  id: string,
  patch: Partial<CorosMapDownloadJob>
): void {
  const job = corosMapDownloadJobs.get(id);
  if (!job) {
    return;
  }

  corosMapDownloadJobs.set(id, {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString()
  });
  publishCorosMapDownloadJobs();
}

function publishCorosMapDownloadJobs(): void {
  corosMapDownloadListener?.(listCorosMapDownloadJobs());
}

function validateCorosMapPackage(mapPackage: CorosMapPackage): void {
  if (!mapPackage.id || !mapPackage.title || !mapPackage.region) {
    throw new Error("COROS map package metadata is incomplete.");
  }

  validateOfficialCorosDownloadUrl(mapPackage.downloadUrl);

  if (!Number.isFinite(mapPackage.sizeBytes) || mapPackage.sizeBytes < 0) {
    throw new Error("COROS map package size is invalid.");
  }
}

function validateOfficialCorosDownloadUrl(downloadUrl: string): void {
  const parsed = new URL(downloadUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "map-oss-us.coros.com"
  ) {
    throw new Error("Only official COROS map download URLs can be used.");
  }
}

function getCorosMapCacheDirectory(): string {
  return path.join(app.getPath("userData"), "map-cache");
}

function getCorosMapCacheFileName(mapPackage: CorosMapPackage): string {
  const hash = crypto
    .createHash("sha256")
    .update(mapPackage.id)
    .digest("hex")
    .slice(0, 10);
  return `${sanitizeFileName(`${mapPackage.title}-${mapPackage.type}-${mapPackage.version}`)}-${hash}.zip`;
}

async function ensureCachedCorosMapExtracted(
  cached: CachedCorosMapPackage
): Promise<string> {
  const cacheDirectory = getCorosMapCacheDirectory();
  assertPathInside(cacheDirectory, cached.filePath);
  const existingExtractedPath = cached.extractedPath;

  if (existingExtractedPath && fs.existsSync(existingExtractedPath)) {
    assertPathInside(cacheDirectory, existingExtractedPath);
    await resolveMapSourcePath(existingExtractedPath);
    return existingExtractedPath;
  }

  const extractPath = path.join(
    cacheDirectory,
    "extracted",
    sanitizeFileName(`${cached.packageId}-${cached.downloadedAt}`)
  );
  assertPathInside(cacheDirectory, extractPath);
  await fs.promises.rm(extractPath, { recursive: true, force: true });
  await fs.promises.mkdir(extractPath, { recursive: true });
  await extractZipSafely(cached.filePath, extractPath);
  await resolveMapSourcePath(extractPath);
  updateCachedCorosMapExtractedPath(cached.packageId, extractPath);
  return extractPath;
}

async function extractZipSafely(
  zipPath: string,
  destinationRoot: string
): Promise<void> {
  const unzipper = require("unzipper") as UnzipperModule;
  const pendingWrites: Array<Promise<void>> = [];
  const parser = unzipper.Parse();

  await new Promise<void>((resolve, reject) => {
    parser.on("entry", (entry: UnzipperEntry) => {
      const destinationPath = path.resolve(destinationRoot, entry.path);

      try {
        assertPathInside(destinationRoot, destinationPath);
      } catch (caught) {
        entry.autodrain();
        reject(caught);
        return;
      }

      if (entry.type === "Directory") {
        pendingWrites.push(
          fs.promises
            .mkdir(destinationPath, { recursive: true })
            .then(() => undefined)
        );
        entry.autodrain();
        return;
      }

      if (entry.type !== "File") {
        entry.autodrain();
        return;
      }

      const write = fs.promises
        .mkdir(path.dirname(destinationPath), { recursive: true })
        .then(
          () =>
            new Promise<void>((writeResolve, writeReject) => {
              const output = fs.createWriteStream(destinationPath, {
                flags: "w"
              });
              entry.on("error", writeReject);
              output.on("error", writeReject);
              output.on("finish", writeResolve);
              entry.pipe(output);
            })
        );
      pendingWrites.push(write);
    });

    parser.on("close", () => {
      Promise.all(pendingWrites).then(() => resolve(), reject);
    });
    parser.on("error", reject);
    fs.createReadStream(zipPath).on("error", reject).pipe(parser);
  });
}

async function removePathInsideCache(
  cacheDirectory: string,
  targetPath: string
): Promise<void> {
  assertPathInside(cacheDirectory, targetPath);
  await fs.promises.rm(targetPath, { recursive: true, force: true });
}

function assertPathInside(rootPath: string, targetPath: string): void {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);

  if (target !== root && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new Error("Map cache path resolved outside the app cache.");
  }
}

function toErrorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function normalizeCorosMapType(value?: string): CorosMapType | undefined {
  if (value === "landscape" || value === "topo") {
    return value;
  }

  return undefined;
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

function titleFromMapKey(value: string): string {
  const raw = value.replace(/^map\./, "");
  return raw
    .split("-")
    .map((part) =>
      /^\d+$/.test(part)
        ? part
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    )
    .join(" ")
    .replace(/([A-Za-z]+)(\d+)$/, "$1 - $2");
}

async function resolveMapSourcePath(sourcePath: string): Promise<string> {
  const stats = await fs.promises.stat(sourcePath).catch(() => undefined);
  if (!stats?.isDirectory()) {
    throw new Error("Choose an extracted COROS map folder.");
  }

  if (path.basename(sourcePath).toLowerCase() === "map") {
    return sourcePath;
  }

  const nestedMapPath = path.join(sourcePath, "map");
  const nestedStats = await fs.promises.stat(nestedMapPath).catch(() => undefined);
  if (nestedStats?.isDirectory()) {
    return nestedMapPath;
  }

  throw new Error(
    "Choose the extracted COROS map folder named 'map', or its parent folder."
  );
}

async function getDirectoryStats(directoryPath: string): Promise<DirectoryStats> {
  let sizeBytes = 0;
  let fileCount = 0;

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = await fs.promises.stat(absolutePath);
      sizeBytes += stats.size;
      fileCount += 1;
    }
  }

  await walk(directoryPath);
  return { sizeBytes, fileCount };
}

function assertNotSameOrNested(sourcePath: string, destinationPath: string): void {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  const destinationInsideSource = path.relative(source, destination);
  const sourceInsideDestination = path.relative(destination, source);

  if (
    source === destination ||
    (destinationInsideSource && !destinationInsideSource.startsWith("..")) ||
    (sourceInsideDestination && !sourceInsideDestination.startsWith(".."))
  ) {
    throw new Error("The selected map folder is already on the watch.");
  }
}

async function copyDirectoryContents(
  sourcePath: string,
  destinationPath: string,
  options: CopyDirectoryOptions,
  progress = { copiedBytes: 0, copiedFiles: 0 }
): Promise<void> {
  const entries = await fs.promises.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(sourcePath, entry.name);
    const destination = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      await fs.promises.mkdir(destination, { recursive: true });
      await copyDirectoryContents(source, destination, options, progress);
      continue;
    }

    if (entry.isFile()) {
      const stats = await fs.promises.stat(source);
      await fs.promises.copyFile(source, destination);
      progress.copiedBytes += stats.size;
      progress.copiedFiles += 1;
      options.onProgress({
        copiedBytes: progress.copiedBytes,
        copiedFiles: progress.copiedFiles
      });
    }
  }
}

function publishCorosMapInstallProgress(
  progress: CorosMapInstallProgress | null
): void {
  corosMapInstallProgress = progress;
  corosMapInstallProgressListener?.(progress);
}

function toWatchInstallError(caught: unknown, watchRootPath: string): Error {
  if (isWatchDisconnectedInstallError(caught, watchRootPath)) {
    return new Error(
      "The watch disconnected while installing maps. Reconnect the watch and run Install again. CorosLink merges map files, so files that already copied can remain on the watch."
    );
  }

  return caught instanceof Error ? caught : new Error(String(caught));
}

function isWatchDisconnectedInstallError(
  caught: unknown,
  watchRootPath: string
): boolean {
  if (!caught || typeof caught !== "object") {
    return false;
  }

  const error = caught as NodeJS.ErrnoException & {
    dest?: string;
    path?: string;
  };
  const removableVolumeErrorCodes = new Set([
    "ENXIO",
    "ENODEV",
    "EIO",
    "ENOENT"
  ]);
  const targetPath = error.dest ?? error.path ?? "";
  return (
    Boolean(error.code && removableVolumeErrorCodes.has(error.code)) &&
    targetPath.startsWith(watchRootPath)
  );
}

function normalizeGenerateRouteRequest(
  request: GenerateRouteRequest
): GenerateRouteRequest {
  const startLocation = request.startLocation.trim();
  const destinationLocation = request.destinationLocation?.trim();
  const distanceKm = Number(request.distanceKm);

  if (!startLocation) {
    throw new Error("Enter a start location.");
  }

  if (
    request.mode === "point-to-point" &&
    (!destinationLocation || destinationLocation.length === 0)
  ) {
    throw new Error("Enter a destination for point-to-point routes.");
  }

  if (
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0 ||
    distanceKm > MAX_ROUTE_DISTANCE_KM
  ) {
    throw new Error(`Enter a route distance between 0 and ${MAX_ROUTE_DISTANCE_KM} km.`);
  }

  return {
    startLocation,
    destinationLocation,
    distanceKm,
    mode: request.mode,
    surfacePreference: request.surfacePreference,
    avoidHighways: request.avoidHighways,
    elevationPreference: request.elevationPreference
  };
}

async function geocodeLocation(
  query: string,
  apiKey: string
): Promise<{ coordinates: [number, number]; label: string }> {
  const pinnedLocation = parseRouteCoordinateInput(query);
  if (pinnedLocation) {
    return pinnedLocation;
  }

  const url = new URL(`${ORS_BASE_URL}/geocode/search`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", query);
  url.searchParams.set("size", "1");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouteService geocoding failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as OrsGeocodeResponse;
  const feature = payload.features?.[0];
  const coordinates = feature?.geometry?.coordinates;

  if (
    !coordinates ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    throw new Error(`OpenRouteService could not find "${query}".`);
  }

  return {
    coordinates: [coordinates[0]!, coordinates[1]!],
    label: feature?.properties?.label || feature?.properties?.name || query
  };
}

export function parseRouteCoordinateInput(
  value: string
): { coordinates: [number, number]; label: string } | undefined {
  const match = value
    .trim()
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

  return {
    coordinates: [lon, lat],
    label: `Pinned ${lat.toFixed(5)}, ${lon.toFixed(5)}`
  };
}

function routeFromOrsResponse(
  payload: OrsDirectionsResponse,
  request: GenerateRouteRequest,
  startLabel: string,
  destinationLabel?: string
): GeneratedRoute {
  const feature = payload.features?.[0];
  const coordinates = feature?.geometry?.coordinates;

  if (!coordinates || coordinates.length < 2) {
    throw new Error("OpenRouteService did not return a usable route.");
  }

  const points: TrainingHubTrackPoint[] = coordinates
    .filter((coordinate) => coordinate.length >= 2)
    .map((coordinate) => ({
      lon: coordinate[0],
      lat: coordinate[1],
      elevation: coordinate[2]
    }));
  const distanceMeters =
    feature?.properties?.summary?.distance ?? request.distanceKm * 1000;
  const now = new Date().toISOString();
  const name =
    request.mode === "loop"
      ? `${request.distanceKm} km loop from ${startLabel}`
      : `${startLabel} to ${destinationLabel ?? request.destinationLocation}`;

  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    startLocation: startLabel,
    destinationLocation: destinationLabel,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: feature?.properties?.summary?.duration,
    ascentMeters: feature?.properties?.ascent,
    descentMeters: feature?.properties?.descent,
    mode: request.mode,
    surfacePreference: request.surfacePreference,
    avoidHighways: request.avoidHighways,
    elevationPreference: request.elevationPreference,
    points,
    bounds: boundsForPoints(points)
  };
}

function boundsForPoints(
  points: TrainingHubTrackPoint[]
): GeneratedRoute["bounds"] {
  const lats = points
    .map((point) => point.lat)
    .filter((value): value is number => value !== undefined);
  const lons = points
    .map((point) => point.lon)
    .filter((value): value is number => value !== undefined);

  if (lats.length === 0 || lons.length === 0) {
    return undefined;
  }

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

async function writeRouteGpx(
  routeId: string,
  routeName: string,
  gpx: string
): Promise<string> {
  const directory = path.join(app.getPath("userData"), "routes");
  await fs.promises.mkdir(directory, { recursive: true });
  const gpxPath = path.join(
    directory,
    `${routeId}-${sanitizeFileName(routeName)}.gpx`
  );
  await fs.promises.writeFile(gpxPath, gpx, "utf8");
  return gpxPath;
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "route";
}

function stableSeed(value: string): number {
  const hash = crypto.createHash("sha256").update(value).digest();
  return hash.readUInt32BE(0);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
