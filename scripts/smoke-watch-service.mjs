import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const serviceUrl = pathToFileURL(
  path.join(repoRoot, "dist-electron", "watchService.js")
);

const tempRoot = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "coros-watch-smoke-")
);
const watchRoot = path.join(tempRoot, "COROS PACE PRO");
const musicPath = path.join(watchRoot, "Music");
const sourceTrack = path.join(tempRoot, "Workout Mix.mp3");

try {
  await fs.promises.mkdir(musicPath, { recursive: true });
  await fs.promises.writeFile(path.join(musicPath, "Existing Track.mp3"), "mp3");
  await fs.promises.writeFile(path.join(musicPath, "notes.txt"), "ignore");
  await fs.promises.writeFile(sourceTrack, "new mp3");

  process.env.COROS_WATCH_PATH = watchRoot;

  const {
    deleteWatchTrack,
    getWatchStatus,
    transferFileToWatch
  } = await import(`${serviceUrl.href}?cacheBust=${Date.now()}`);

  const initial = await getWatchStatus();
  assert.equal(initial.connected, true);
  assert.equal(initial.name, "COROS PACE PRO");
  assert.equal(initial.rootPath, watchRoot);
  assert.equal(initial.musicPath, musicPath);
  assert.equal(initial.tracks.length, 1);
  assert.equal(initial.tracks[0].name, "Existing Track.mp3");

  const copied = await transferFileToWatch(sourceTrack);
  assert.equal(copied.name, "Workout Mix.mp3");
  assert.equal(
    fs.existsSync(path.join(musicPath, "Workout Mix.mp3")),
    true
  );

  await deleteWatchTrack("Existing Track.mp3");
  assert.equal(
    fs.existsSync(path.join(musicPath, "Existing Track.mp3")),
    false
  );

  const afterDelete = await getWatchStatus();
  assert.deepEqual(
    afterDelete.tracks.map((track) => track.name),
    ["Workout Mix.mp3"]
  );

  console.log("Watch service smoke check passed.");
} finally {
  delete process.env.COROS_WATCH_PATH;
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}
