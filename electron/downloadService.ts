import { app } from "electron";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { addDownloads } from "./database";
import type { BinaryCheck, BinaryName, BinaryStatus, DownloadAudioResult } from "./types";

const execFileAsync = promisify(execFile);
const MAX_CAPTURED_LINES = 120;

interface ResolvedBinary {
  name: BinaryName;
  command: string;
  source: "bundled" | "path";
}

export function getDownloadDirectory(): string {
  const directory = path.join(app.getPath("userData"), "downloads");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export async function getBinaryStatus(): Promise<BinaryStatus> {
  const [ytDlp, ffmpeg] = await Promise.all([
    checkBinary("yt-dlp"),
    checkBinary("ffmpeg")
  ]);

  return { ytDlp, ffmpeg };
}

export async function downloadAudio(url: string): Promise<DownloadAudioResult> {
  return downloadAudioWithProgress(url);
}

export async function downloadAudioWithProgress(
  url: string,
  onProgress?: (percent: number) => void
): Promise<DownloadAudioResult> {
  const trimmedUrl = url.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error("Enter a valid YouTube URL or playlist URL.");
  }

  const outputDirectory = getDownloadDirectory();
  const outputTemplate = path.join(
    outputDirectory,
    "%(title).200B [%(id)s].%(ext)s"
  );

  return runAudioDownload(trimmedUrl, outputTemplate, trimmedUrl, {
    allowPlaylist: isPlaylistUrl(trimmedUrl),
    onProgress
  });
}

export async function downloadAudioSearch(
  searchQuery: string,
  fileBaseName: string,
  sourceUrl: string
): Promise<DownloadAudioResult> {
  const trimmedQuery = searchQuery.trim();
  if (!trimmedQuery) {
    throw new Error("Search query is required.");
  }

  const outputDirectory = getDownloadDirectory();
  const safeBaseName = nextAvailableBaseName(
    outputDirectory,
    sanitizeFileBaseName(fileBaseName)
  );
  const outputTemplate = path.join(outputDirectory, `${safeBaseName}.%(ext)s`);

  return runAudioDownload(`ytsearch1:${trimmedQuery}`, outputTemplate, sourceUrl, {
    allowPlaylist: false
  });
}

async function runAudioDownload(
  input: string,
  outputTemplate: string,
  sourceUrl: string,
  options: { allowPlaylist: boolean; onProgress?: (percent: number) => void }
): Promise<DownloadAudioResult> {
  const ytDlp = resolveBinary("yt-dlp");
  const ffmpeg = resolveBinary("ffmpeg");
  const outputDirectory = getDownloadDirectory();
  const before = new Set(listMp3Files(outputDirectory));
  const args = [
    "--no-mtime",
    "--newline",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    outputTemplate
  ];

  args.unshift(options.allowPlaylist ? "--yes-playlist" : "--no-playlist");

  if (ffmpeg.source === "bundled") {
    args.push("--ffmpeg-location", path.dirname(ffmpeg.command));
  }

  args.push(input);

  const onLine = options.onProgress
    ? (line: string) => {
        const match = /\[download\]\s+([\d.]+)%/.exec(line);
        if (match) {
          const percent = Number.parseFloat(match[1]);
          if (Number.isFinite(percent)) {
            options.onProgress?.(percent);
          }
        }
      }
    : undefined;

  const output = await runProcess(ytDlp.command, args, onLine);
  const after = listMp3Files(outputDirectory);
  const newFiles = after.filter((filePath) => !before.has(filePath));

  if (newFiles.length === 0) {
    throw new Error("yt-dlp finished, but no MP3 files were created.");
  }

  return {
    tracks: addDownloads(newFiles, sourceUrl),
    output
  };
}

async function checkBinary(name: BinaryName): Promise<BinaryCheck> {
  const resolved = resolveBinary(name);

  try {
    const { stdout, stderr } = await execFileAsync(
      resolved.command,
      ["--version"],
      { timeout: 6000, windowsHide: true }
    );

    return {
      name,
      available: true,
      command: resolved.command,
      source: resolved.source,
      version: (stdout || stderr).trim().split(/\r?\n/)[0]
    };
  } catch (error) {
    return {
      name,
      available: false,
      command: resolved.command,
      source: resolved.source === "bundled" ? "bundled" : "missing",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveBinary(name: BinaryName): ResolvedBinary {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const platformDirectory = `${process.platform}-${process.arch}`;
  const basePaths = [
    process.resourcesPath,
    app.getAppPath(),
    process.cwd()
  ].filter(Boolean);

  for (const basePath of basePaths) {
    const candidates = [
      path.join(basePath, "bin", platformDirectory, executable),
      path.join(basePath, "bin", executable)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return {
          name,
          command: candidate,
          source: "bundled"
        };
      }
    }
  }

  return {
    name,
    command: executable,
    source: "path"
  };
}

function runProcess(
  command: string,
  args: string[],
  onLine?: (line: string) => void
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    const child = spawn(command, args, {
      windowsHide: true
    });

    const capture = (chunk: Buffer): void => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        onLine?.(trimmed);
        lines.push(trimmed);
        if (lines.length > MAX_CAPTURED_LINES) {
          lines.shift();
        }
      }
    };

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(lines);
        return;
      }

      reject(
        new Error(
          `${path.basename(command)} exited with code ${code ?? "unknown"}.\n${lines.join("\n")}`
        )
      );
    });
  });
}

function listMp3Files(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
    .map((entry) => path.join(directory, entry.name));
}

function sanitizeFileBaseName(fileName: string): string {
  const sanitized = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "Spotify Track";
}

function nextAvailableBaseName(directory: string, baseName: string): string {
  let candidate = baseName;
  let index = 1;

  while (fs.existsSync(path.join(directory, `${candidate}.mp3`))) {
    candidate = `${baseName} (${index})`;
    index += 1;
  }

  return candidate;
}

function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/playlist" && parsed.searchParams.has("list");
  } catch {
    return false;
  }
}
