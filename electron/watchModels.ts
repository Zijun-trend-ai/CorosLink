export type WatchModelId = "pace-pro" | "pace-4" | "pace-3" | "nomad";

export const PACE_PRO_BYTES = 32 * 1024 * 1024 * 1024;
export const PACE_4_BYTES = 4 * 1024 * 1024 * 1024;
export const PACE_3_BYTES = PACE_4_BYTES;
export const NOMAD_BYTES = PACE_PRO_BYTES;

const PACE_PRO_STORAGE_THRESHOLD = 16 * 1024 * 1024 * 1024;

export function normalizeVolumeName(name?: string): string {
  return (name ?? "")
    .trim()
    .toUpperCase()
    .replace(/^COROS\s+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/PACE(\d)/g, "PACE $1")
    .replace(/\s+/g, " ")
    .trim();
}

function matchWatchModelFromName(
  normalized: string
): WatchModelId | undefined {
  if (/\bPACE\s*PRO\b/.test(normalized)) {
    return "pace-pro";
  }

  if (/\bPACE\s*4\b/.test(normalized)) {
    return "pace-4";
  }

  if (/\bPACE\s*3\b/.test(normalized)) {
    return "pace-3";
  }

  if (/\bNOMAD\b/.test(normalized)) {
    return "nomad";
  }

  return undefined;
}

export function resolveWatchModel(
  name?: string,
  totalBytes?: number
): WatchModelId | undefined {
  const fromName = matchWatchModelFromName(normalizeVolumeName(name));
  if (fromName) {
    return fromName;
  }

  if (totalBytes !== undefined && totalBytes >= PACE_PRO_STORAGE_THRESHOLD) {
    return "pace-pro";
  }

  return undefined;
}

export function fallbackBytesForModel(model?: WatchModelId): number {
  if (model === "pace-pro" || model === "nomad") {
    return PACE_PRO_BYTES;
  }

  if (model === "pace-4" || model === "pace-3") {
    return PACE_4_BYTES;
  }

  return PACE_PRO_BYTES;
}
