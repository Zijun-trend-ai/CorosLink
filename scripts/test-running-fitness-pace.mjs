import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const formattersUrl = pathToFileURL(
  path.join(repoRoot, "src", "training", "formatters.ts")
);

const {
  buildRunningFitnessPaceLabels,
  formatRunningFitnessPaceRange
} = await import(`${formattersUrl.href}?cacheBust=${Date.now()}`);

const fixture = [
  { index: 0, pace: 500 },
  { index: 1, pace: 443 },
  { index: 2, pace: 375 },
  { index: 3, pace: 336 },
  { index: 4, pace: 302 },
  { index: 5, pace: 273 }
];

const labels = buildRunningFitnessPaceLabels(fixture);

assert.equal(labels.Endurance, `06'16" - 07'23"/km`);
assert.equal(labels.Threshold, `05'03" - 05'36"/km`);
assert.equal(labels.Speed, `04'33" - 05'02"/km`);
assert.equal(labels.Sprint, `< 04'33"/km`);
assert.equal(formatRunningFitnessPaceRange(undefined, 273), `< 04'33"/km`);
assert.deepEqual(buildRunningFitnessPaceLabels(fixture.slice(0, 4)), {});

const fiveZoneFixture = fixture.slice(1);
const fiveZoneLabels = buildRunningFitnessPaceLabels(fiveZoneFixture);

assert.equal(fiveZoneLabels.Endurance, labels.Endurance);
assert.equal(fiveZoneLabels.Threshold, labels.Threshold);
assert.equal(fiveZoneLabels.Speed, labels.Speed);
assert.equal(fiveZoneLabels.Sprint, labels.Sprint);

console.log("running fitness pace tests passed");
