import {
  listYouTubeHistory,
  markYouTubeDownloaded,
  recordYouTubeVisit
} from "./database";
import { downloadAudio } from "./downloadService";
import type {
  DownloadAudioResult,
  YouTubeHistoryEntry,
  YouTubeHistoryEntryType
} from "./types";

export function getYouTubeHistory(): YouTubeHistoryEntry[] {
  return listYouTubeHistory();
}

export function saveYouTubeVisit(
  url: string,
  title?: string
): YouTubeHistoryEntry {
  const normalizedUrl = normalizeYouTubeUrl(url);
  return recordYouTubeVisit({
    url: normalizedUrl,
    title: cleanYouTubeTitle(title),
    entryType: classifyYouTubeUrl(normalizedUrl)
  });
}

export interface YouTubeDownloadItem {
  url: string;
  title?: string;
}

export async function downloadFromYouTubeBrowser(
  url: string,
  title?: string
): Promise<DownloadAudioResult> {
  const normalizedUrl = normalizeYouTubeUrl(url);
  const entryType = classifyYouTubeUrl(normalizedUrl);

  if (entryType !== "video" && entryType !== "playlist") {
    throw new Error("Open a YouTube video or playlist before downloading.");
  }

  const result = await downloadAudio(normalizedUrl);
  markYouTubeDownloaded({
    url: normalizedUrl,
    title: cleanYouTubeTitle(title),
    entryType
  });

  return result;
}

export async function downloadMultipleFromYouTubeBrowser(
  items: YouTubeDownloadItem[]
): Promise<DownloadAudioResult> {
  const queue = items.filter((item) => item.url.trim());

  if (queue.length === 0) {
    throw new Error("Select at least one YouTube video to download.");
  }

  const tracks = [];
  const output: string[] = [];

  for (const item of queue) {
    const result = await downloadFromYouTubeBrowser(item.url, item.title);
    tracks.push(...result.tracks);
    output.push(...result.output);
  }

  return { tracks, output };
}

export function normalizeYouTubeUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    throw new Error("Enter a valid YouTube URL.");
  }

  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const videoId = parsed.pathname.split("/").filter(Boolean)[0];
    if (videoId) {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }
  }

  if (!host.endsWith("youtube.com")) {
    throw new Error("Only YouTube URLs can be opened in the browser.");
  }

  const videoId = parsed.searchParams.get("v");
  const playlistId = parsed.searchParams.get("list");
  const searchQuery = parsed.searchParams.get("search_query");

  if (parsed.pathname === "/watch" && videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  if (parsed.pathname === "/playlist" && playlistId) {
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  }

  if (parsed.pathname === "/results" && searchQuery) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
  }

  parsed.hash = "";
  return parsed.toString();
}

export function classifyYouTubeUrl(url: string): YouTubeHistoryEntryType {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      return "video";
    }

    if (!host.endsWith("youtube.com")) {
      return "youtube";
    }

    if (parsed.pathname === "/watch" && parsed.searchParams.has("v")) {
      return "video";
    }

    if (parsed.pathname === "/playlist" && parsed.searchParams.has("list")) {
      return "playlist";
    }

    if (parsed.pathname === "/results") {
      return "search";
    }
  } catch {
    return "youtube";
  }

  return "youtube";
}

function cleanYouTubeTitle(title?: string): string {
  return (title ?? "YouTube")
    .replace(/\s+-\s+YouTube$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
