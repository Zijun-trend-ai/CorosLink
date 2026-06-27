import type { LocalTrack, WatchTrack } from "../../electron/types";
import { musicFileNamesMatch } from "../../electron/musicFileNames";

export function findWatchTrackForLocal(
  track: LocalTrack,
  watchTracks: WatchTrack[],
): WatchTrack | undefined {
  return watchTracks.find((watchTrack) =>
    musicFileNamesMatch(track.filePath, watchTrack.name),
  );
}

export function isLocalTrackOnWatch(
  track: LocalTrack,
  watchTracks: WatchTrack[],
  watchConnected: boolean,
): boolean {
  const onWatchNow = Boolean(findWatchTrackForLocal(track, watchTracks));
  if (watchConnected) {
    return onWatchNow;
  }

  return onWatchNow || Boolean(track.transferredAt);
}

export function countPendingTransfers(
  downloads: LocalTrack[],
  watchTracks: WatchTrack[],
  watchConnected: boolean,
): number {
  return downloads.filter(
    (track) => !isLocalTrackOnWatch(track, watchTracks, watchConnected),
  ).length;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function sumBytes(tracks: { sizeBytes: number }[]): number {
  return tracks.reduce((total, track) => total + track.sizeBytes, 0);
}
