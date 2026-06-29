import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const serviceUrl = pathToFileURL(
  path.join(repoRoot, "dist-electron", "mapService.js")
);

const {
  buildOrsDirectionsBody,
  buildRouteGpx,
  downloadCorosMapPackageToCache,
  geocodeRouteLocation,
  getCorosMapInstallProgress,
  inspectCorosMapFolder,
  installCorosMapFolder,
  parseRouteCoordinateInput,
  parseCorosMapManifest,
  setCorosMapInstallProgressListener
} = await import(`${serviceUrl.href}?cacheBust=${Date.now()}`);

const fixturePath = path.join(
  repoRoot,
  "scripts",
  "fixtures",
  "coros-map-manifest-v5.json"
);
const manifestFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const manifest = parseCorosMapManifest(manifestFixture);

assert.equal(manifest.version, "5");
assert.equal(manifest.bundleVersion, "5.0.3");
assert.equal(manifest.packages.length, 4);
assert.equal(manifest.packages[0].title, "North America");
assert.equal(manifest.packages[0].type, "landscape");
assert.equal(
  manifest.packages[0].downloadUrl,
  "https://map-oss-us.coros.com/regionMap/v5/north-america_landscape_5.0.3.zip"
);
assert.equal(manifest.packages[2].title, "North America - 1");

const loopBody = buildOrsDirectionsBody(
  {
    startLocation: "Toronto",
    distanceKm: 5,
    mode: "loop",
    surfacePreference: "trail",
    avoidHighways: true,
    elevationPreference: "flatter"
  },
  [-79.3832, 43.6532]
);

assert.deepEqual(loopBody.coordinates, [[-79.3832, 43.6532]]);
assert.equal(loopBody.elevation, true);
assert.equal(loopBody.instructions, false);
assert.equal(loopBody.options.round_trip.length, 5000);
assert.equal(loopBody.options.avoid_features, undefined);
assert.equal(
  loopBody.options.profile_params.weightings.steepness_difficulty,
  1
);

const pinnedStart = parseRouteCoordinateInput("43.65320, -79.38320");
assert.deepEqual(pinnedStart?.coordinates, [-79.3832, 43.6532]);
assert.equal(pinnedStart?.label, "Pinned 43.65320, -79.38320");
assert.equal(parseRouteCoordinateInput("191, -79.38320"), undefined);
assert.equal(parseRouteCoordinateInput("Toronto"), undefined);

const pinnedGeocode = await geocodeRouteLocation("43.65320, -79.38320");
assert.deepEqual(pinnedGeocode, {
  label: "Pinned 43.65320, -79.38320",
  lat: 43.6532,
  lon: -79.3832
});
await assert.rejects(
  () => geocodeRouteLocation(""),
  /Enter a location to find on the map/
);

const pointBody = buildOrsDirectionsBody(
  {
    startLocation: "Start",
    destinationLocation: "Finish",
    distanceKm: 10,
    mode: "point-to-point",
    surfacePreference: "road",
    avoidHighways: false,
    elevationPreference: "any"
  },
  [-79, 43],
  [-80, 44]
);

assert.deepEqual(pointBody.coordinates, [
  [-79, 43],
  [-80, 44]
]);
assert.equal(pointBody.options, undefined);

const gpx = buildRouteGpx({
  id: "route-1",
  name: "5K <Loop>",
  createdAt: "2026-06-28T00:00:00.000Z",
  startLocation: "Start",
  distanceMeters: 5000,
  mode: "loop",
  surfacePreference: "trail",
  avoidHighways: true,
  elevationPreference: "hilly",
  points: [
    { lat: 43.1, lon: -79.1, elevation: 100 },
    { lat: 43.2, lon: -79.2, elevation: 125 }
  ]
});

assert.match(gpx, /<name>5K &lt;Loop&gt;<\/name>/);
assert.match(gpx, /<trkpt lat="43.1" lon="-79.1"><ele>100<\/ele><\/trkpt>/);

const cacheRoot = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "coroslink-map-cache-test-")
);
try {
  const payload = Buffer.from("tiny mocked coros map zip");
  const progressUpdates = [];
  const pkg = {
    ...manifest.packages[0],
    sizeBytes: payload.length
  };
  const abortController = new AbortController();
  const cached = await downloadCorosMapPackageToCache(pkg, {
    cacheDirectory: cacheRoot,
    signal: abortController.signal,
    fetchImpl: async (input, init) => {
      assert.equal(input, pkg.downloadUrl);
      assert.equal(init?.signal, abortController.signal);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(payload.subarray(0, 6));
            controller.enqueue(payload.subarray(6));
            controller.close();
          }
        }),
        {
          status: 200,
          headers: {
            "content-length": String(payload.length)
          }
        }
      );
    },
    onProgress: (progress) => progressUpdates.push(progress)
  });

  assert.equal(cached.packageId, pkg.id);
  assert.equal(cached.title, pkg.title);
  assert.equal(cached.sizeBytes, payload.length);
  assert.equal(fs.readFileSync(cached.filePath, "utf8"), payload.toString());
  assert.equal(progressUpdates.at(-1)?.progress, 1);
} finally {
  await fs.promises.rm(cacheRoot, { recursive: true, force: true });
}

const tempRoot = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "coroslink-maps-test-")
);
const sourceRoot = path.join(tempRoot, "downloaded");
const sourceMap = path.join(sourceRoot, "map");
const watchRoot = path.join(tempRoot, "COROS PACE PRO");
const watchMap = path.join(watchRoot, "map");

try {
  await fs.promises.mkdir(path.join(sourceMap, "north-america"), {
    recursive: true
  });
  await fs.promises.writeFile(path.join(sourceMap, "index.dat"), "map-index");
  await fs.promises.writeFile(
    path.join(sourceMap, "north-america", "tile.dat"),
    "tile-data"
  );
  await fs.promises.mkdir(path.join(watchRoot, "Music"), { recursive: true });
  await fs.promises.mkdir(watchMap, { recursive: true });
  await fs.promises.writeFile(path.join(watchMap, "base.map"), "existing");

  const selection = await inspectCorosMapFolder(sourceRoot);
  assert.equal(selection.mapPath, sourceMap);
  assert.equal(selection.fileCount, 2);
  assert.equal(selection.sizeBytes, "map-index".length + "tile-data".length);

  process.env.COROS_WATCH_PATH = watchRoot;
  const installProgressUpdates = [];
  setCorosMapInstallProgressListener((progress) => {
    if (progress) {
      installProgressUpdates.push(progress);
    }
  });
  const result = await installCorosMapFolder(sourceRoot);

  assert.equal(result.installedPath, watchMap);
  assert.equal(fs.existsSync(path.join(watchMap, "base.map")), true);
  assert.equal(fs.existsSync(path.join(watchMap, "index.dat")), true);
  assert.equal(
    fs.existsSync(path.join(watchMap, "north-america", "tile.dat")),
    true
  );
  assert.equal(result.watch.connected, true);
  assert.equal(result.watch.mapPath, watchMap);
  assert.equal(result.watch.mapFileCount, 3);
  assert.equal(getCorosMapInstallProgress()?.phase, "completed");
  assert.equal(getCorosMapInstallProgress()?.progress, 1);
  assert.equal(
    installProgressUpdates.some((progress) => progress.phase === "copying"),
    true
  );
  assert.equal(installProgressUpdates.at(-1)?.phase, "completed");

  await assert.rejects(
    () => installCorosMapFolder(watchMap),
    /already on the watch/
  );
} finally {
  delete process.env.COROS_WATCH_PATH;
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}

console.log("Maps service tests passed.");
