export function formatTrainingTimestamp(value?: number): string {
  if (!value) {
    return "Unknown";
  }

  const timestamp = value < 10_000_000_000 ? value * 1000 : value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function formatDurationSeconds(value?: number): string {
  if (!Number.isFinite(value) || !value) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDistanceMeters(value?: number): string {
  if (!Number.isFinite(value) || !value) {
    return "0 km";
  }

  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} km`;
}

export function formatElevationMeters(value?: number): string {
  if (!Number.isFinite(value) || !value) {
    return "-";
  }

  return `${Math.round(value)} m`;
}

export function formatOptionalNumber(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatPaceSecondsPerKm(value?: number): string {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

export function formatHappenDayLabel(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    return value;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(year, month, day));
}

export function formatSignedDelta(value?: number, suffix = ""): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  const rounded = Math.round(value * 10) / 10;
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded}${suffix}`;
}

export function recentTrainingHubDateList(days: number): string[] {
  return Array.from({ length: days }, (_value, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  });
}

export function formatUpcomingWorkoutDate(happenDay: string): string {
  if (!/^\d{8}$/.test(happenDay)) {
    return happenDay;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = Number(happenDay.slice(0, 4));
  const month = Number(happenDay.slice(4, 6)) - 1;
  const day = Number(happenDay.slice(6, 8));
  const date = new Date(year, month, day);
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays > 0 && diffDays <= 6) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short"
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

export function formatUpcomingWorkoutLoad(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value)}TL`;
}
