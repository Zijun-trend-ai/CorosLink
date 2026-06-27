import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  DriveCandidate,
  WatchConnectionSmokeOptionId,
  WatchStatus,
  WatchTrack
} from "./types";
import { fallbackBytesForModel, resolveWatchModel } from "./watchModels";

const execFileAsync = promisify(execFile);
const INSTALLER_VOLUME_PATTERN = /desktop|setup|installer|\.dmg/i;
const ORIGINAL_COROS_WATCH_PATH = process.env.COROS_WATCH_PATH;

interface WatchConnectionSmokeFixture {
  volumeName: string;
  createMusicFolder: boolean;
  trackNames: string[];
  totalBytes?: number;
}

const WATCH_CONNECTION_SMOKE_FIXTURES: Record<
  Exclude<WatchConnectionSmokeOptionId, "auto">,
  WatchConnectionSmokeFixture
> = {
  none: {
    volumeName: "COROS WATCH EMPTY",
    createMusicFolder: false,
    trackNames: []
  },
  "pace-pro": {
    volumeName: "COROS PACE PRO",
    createMusicFolder: true,
    trackNames: ["Existing Track.mp3", "Workout Mix.mp3"],
    totalBytes: fallbackBytesForModel("pace-pro")
  },
  "pace-4": {
    volumeName: "COROS PACE 4",
    createMusicFolder: true,
    trackNames: ["Warmup.mp3"],
    totalBytes: fallbackBytesForModel("pace-4")
  },
  "pace-3": {
    volumeName: "COROS PACE 3",
    createMusicFolder: true,
    trackNames: ["Cooldown.mp3"],
    totalBytes: fallbackBytesForModel("pace-3")
  },
  nomad: {
    volumeName: "COROS NOMAD",
    createMusicFolder: true,
    trackNames: ["Trail Mix.mp3"],
    totalBytes: fallbackBytesForModel("nomad")
  },
  "unknown-pace": {
    volumeName: "COROS PACE",
    createMusicFolder: true,
    trackNames: ["Track.mp3"],
    totalBytes: fallbackBytesForModel("pace-4")
  },
  installer: {
    volumeName: "COROS Desktop-0.1.0-arm64",
    createMusicFolder: false,
    trackNames: []
  }
};

let activeSmokeTempRoot: string | undefined;
let activeSmokeWatchRoot: string | undefined;
let activeSmokeTotalBytes: number | undefined;
let activeWatchConnectionSmokeOptionId: WatchConnectionSmokeOptionId = "auto";

interface RawVolume {
  name: string;
  rootPath: string;
}

interface StorageStats {
  totalBytes?: number;
  freeBytes?: number;
  usedBytes?: number;
}

export async function getWatchStatus(): Promise<WatchStatus> {
  try {
    const candidates = await findDriveCandidates();
    const selected = candidates.find((candidate) => candidate.musicPath);

    if (!selected?.musicPath) {
      return {
        connected: false,
        checkedAt: new Date().toISOString(),
        tracks: [],
        candidates
      };
    }

    const musicPath = selected.musicPath;
    const tracks = listWatchTracks(musicPath);
    const model = resolveWatchModel(selected.name, selected.totalBytes);

    return {
      connected: true,
      checkedAt: new Date().toISOString(),
      name: selected.name,
      model,
      rootPath: selected.rootPath,
      musicPath,
      totalBytes: selected.totalBytes,
      freeBytes: selected.freeBytes,
      usedBytes: selected.usedBytes,
      tracks,
      candidates
    };
  } catch (error) {
    return {
      connected: false,
      checkedAt: new Date().toISOString(),
      tracks: [],
      candidates: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function getWatchConnectionSmokeOption(): WatchConnectionSmokeOptionId {
  return activeWatchConnectionSmokeOptionId;
}

export async function setWatchConnectionSmokeOption(
  optionId: WatchConnectionSmokeOptionId
): Promise<WatchStatus> {
  if (optionId === "auto") {
    activeWatchConnectionSmokeOptionId = "auto";
    await clearActiveSmokeFixture();
    restoreOriginalWatchPathOverride();
    return getWatchStatus();
  }

  const fixture = WATCH_CONNECTION_SMOKE_FIXTURES[optionId];
  if (!fixture) {
    throw new Error(`Unknown watch smoke option: ${optionId}`);
  }

  await clearActiveSmokeFixture();
  restoreOriginalWatchPathOverride();

  try {
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), `coroslink-watch-smoke-${optionId}-`)
    );
    const watchRoot = path.join(tempRoot, fixture.volumeName);
    await fs.promises.mkdir(watchRoot, { recursive: true });

    if (fixture.createMusicFolder) {
      const musicPath = path.join(watchRoot, "Music");
      await fs.promises.mkdir(musicPath, { recursive: true });

      for (const trackName of fixture.trackNames) {
        await fs.promises.writeFile(path.join(musicPath, trackName), "mp3");
      }

      await fs.promises.writeFile(path.join(musicPath, "._Ghost.mp3"), "junk");
      await fs.promises.writeFile(path.join(musicPath, ".DS_Store"), "junk");
      await fs.promises.writeFile(path.join(musicPath, "notes.txt"), "ignore");
    }

    activeSmokeTempRoot = tempRoot;
    activeSmokeWatchRoot = watchRoot;
    activeSmokeTotalBytes = fixture.totalBytes;
    activeWatchConnectionSmokeOptionId = optionId;
    process.env.COROS_WATCH_PATH = watchRoot;
    return getWatchStatus();
  } catch (error) {
    activeWatchConnectionSmokeOptionId = "auto";
    await clearActiveSmokeFixture();
    restoreOriginalWatchPathOverride();
    throw error;
  }
}

export async function deleteWatchTrack(relativePath: string): Promise<void> {
  const status = await getWatchStatus();
  if (!status.connected || !status.musicPath) {
    throw new Error("No COROS watch is connected.");
  }

  const targetPath = safeResolveInside(status.musicPath, relativePath);
  const fileName = path.basename(targetPath);
  if (!isWatchMusicFile(fileName)) {
    throw new Error("Only MP3 files can be deleted from the watch.");
  }

  fs.rmSync(targetPath, { force: true });
}

export async function transferFileToWatch(filePath: string): Promise<WatchTrack> {
  if (!filePath.toLowerCase().endsWith(".mp3")) {
    throw new Error("COROS watches only support MP3 files.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error("Local MP3 file no longer exists.");
  }

  const status = await getWatchStatus();
  if (!status.connected || !status.musicPath) {
    throw new Error("No COROS watch is connected.");
  }

  fs.mkdirSync(status.musicPath, { recursive: true });

  const destination = nextAvailablePath(
    status.musicPath,
    sanitizeFileName(path.basename(filePath))
  );
  fs.copyFileSync(filePath, destination);

  const stats = fs.statSync(destination);
  return {
    name: path.basename(destination),
    relativePath: path.relative(status.musicPath, destination),
    absolutePath: destination,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
}

async function findDriveCandidates(): Promise<DriveCandidate[]> {
  const volumes = await listVolumes();
  const candidates: DriveCandidate[] = [];

  for (const volume of volumes) {
    if (INSTALLER_VOLUME_PATTERN.test(volume.name)) {
      continue;
    }

    const musicPath = path.join(volume.rootPath, "Music");
    const hasMusicFolder = isDirectory(musicPath);

    if (!hasMusicFolder) {
      continue;
    }

    const storage = getStorageStats(volume.rootPath, volume.name);
    candidates.push({
      name: volume.name,
      rootPath: volume.rootPath,
      musicPath,
      ...storage,
      reason: "Music folder found"
    });
  }

  return candidates.sort((left, right) => left.name.localeCompare(right.name));
}

async function listVolumes(): Promise<RawVolume[]> {
  const explicitWatchPath = process.env.COROS_WATCH_PATH;
  if (explicitWatchPath) {
    return [
      {
        name: path.basename(explicitWatchPath) || "COROS Watch",
        rootPath: explicitWatchPath
      }
    ];
  }

  if (process.platform === "darwin") {
    return listMacVolumes();
  }

  if (process.platform === "win32") {
    return listWindowsVolumes();
  }

  return listLinuxVolumes();
}

function listMacVolumes(): RawVolume[] {
  const base = "/Volumes";
  if (!isDirectory(base)) {
    return [];
  }

  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      rootPath: path.join(base, entry.name)
    }));
}

async function listWindowsVolumes(): Promise<RawVolume[]> {
  const command = [
    "Get-CimInstance Win32_LogicalDisk",
    "| Where-Object { $_.DriveType -in 2,3 }",
    "| Select-Object DeviceID,VolumeName",
    "| ConvertTo-Json -Compress"
  ].join(" ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { windowsHide: true }
  );

  if (!stdout.trim()) {
    return [];
  }

  const parsed = JSON.parse(stdout.trim()) as
    | { DeviceID: string; VolumeName?: string }[]
    | { DeviceID: string; VolumeName?: string };
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows.map((row) => ({
    name: row.VolumeName || row.DeviceID,
    rootPath: `${row.DeviceID}\\`
  }));
}

function listLinuxVolumes(): RawVolume[] {
  const user = os.userInfo().username;
  const bases = [`/media/${user}`, `/run/media/${user}`, "/mnt"];

  return bases.flatMap((base) => {
    if (!isDirectory(base)) {
      return [];
    }

    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => ({
        name: entry.name,
        rootPath: path.join(base, entry.name)
      }));
  });
}

function listWatchTracks(musicPath: string): WatchTrack[] {
  const tracks: WatchTrack[] = [];

  function walk(currentPath: string): void {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || !isWatchMusicFile(entry.name)) {
        continue;
      }

      const stats = fs.statSync(absolutePath);
      tracks.push({
        name: entry.name,
        relativePath: path.relative(musicPath, absolutePath),
        absolutePath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      });
    }
  }

  walk(musicPath);
  return tracks.sort((left, right) => left.name.localeCompare(right.name));
}

function isWatchMusicFile(name: string): boolean {
  if (!name.toLowerCase().endsWith(".mp3")) {
    return false;
  }

  if (name.startsWith(".")) {
    return false;
  }

  return true;
}

function getStorageStats(rootPath: string, volumeName: string): StorageStats {
  if (
    activeSmokeWatchRoot &&
    path.resolve(rootPath) === path.resolve(activeSmokeWatchRoot)
  ) {
    return {
      totalBytes:
        activeSmokeTotalBytes ?? fallbackBytesForModel(resolveWatchModel(volumeName))
    };
  }

  try {
    const stats = fs.statfsSync(rootPath);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    return {
      totalBytes,
      freeBytes,
      usedBytes: totalBytes - freeBytes
    };
  } catch {
    const model = resolveWatchModel(volumeName);
    return {
      totalBytes: fallbackBytesForModel(model)
    };
  }
}

async function clearActiveSmokeFixture(): Promise<void> {
  const tempRoot = activeSmokeTempRoot;
  activeSmokeTempRoot = undefined;
  activeSmokeWatchRoot = undefined;
  activeSmokeTotalBytes = undefined;

  if (tempRoot) {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
}

function restoreOriginalWatchPathOverride(): void {
  if (ORIGINAL_COROS_WATCH_PATH) {
    process.env.COROS_WATCH_PATH = ORIGINAL_COROS_WATCH_PATH;
  } else {
    delete process.env.COROS_WATCH_PATH;
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function safeResolveInside(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  const normalizedBase = path.resolve(basePath) + path.sep;
  if (!resolved.startsWith(normalizedBase)) {
    throw new Error("Track path is outside the watch Music folder.");
  }

  return resolved;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
}

function nextAvailablePath(directory: string, fileName: string): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}
