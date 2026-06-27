import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const moduleUrl = pathToFileURL(
  path.join(repoRoot, "dist-electron", "musicFileNames.js"),
);

const { musicFileNamesMatch, normalizeMusicFileName } = await import(
  `${moduleUrl.href}?cacheBust=${Date.now()}`
);

const trackName =
  "bülow - Two Punks In Love (Audio) [Hqd5BbVTEz0].mp3";
const nfdWatchName = trackName
  .replace("ü", "u\u0308")
  .normalize("NFD");

assert.notEqual(trackName, nfdWatchName);
assert.equal(
  normalizeMusicFileName(trackName),
  normalizeMusicFileName(nfdWatchName),
);
assert.equal(musicFileNamesMatch(trackName, nfdWatchName), true);

assert.equal(
  musicFileNamesMatch(
    "Song.mp3",
    "Song (1).mp3",
  ),
  true,
);

assert.equal(
  musicFileNamesMatch(
    "/Users/test/downloads/Song.mp3",
    "Song.mp3",
  ),
  true,
);

assert.equal(musicFileNamesMatch("Song.mp3", "Other.mp3"), false);

console.log("music file name tests passed");
