function basename(name: string): string {
  const parts = name.split(/[/\\]/);
  return parts[parts.length - 1] ?? name;
}

export function normalizeMusicFileName(name: string): string {
  return basename(name).normalize("NFC").toLowerCase();
}

export function musicFileNamesMatch(
  localName: string,
  watchName: string,
): boolean {
  const local = normalizeMusicFileName(localName);
  const watch = normalizeMusicFileName(watchName);

  if (local === watch) {
    return true;
  }

  if (!local.endsWith(".mp3") || !watch.endsWith(".mp3")) {
    return false;
  }

  const localStem = local.slice(0, -4);
  const watchStem = watch.slice(0, -4);

  if (localStem === watchStem) {
    return true;
  }

  const collision = /^(.+) \((\d+)\)$/.exec(watchStem);
  return Boolean(collision && collision[1] === localStem);
}
