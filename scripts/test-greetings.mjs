import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const greetingsUrl = pathToFileURL(
  path.join(repoRoot, "src", "greetings.ts"),
);

const { getTimeOfDayGreeting, msUntilNextGreetingChange } = await import(
  `${greetingsUrl.href}?cacheBust=${Date.now()}`
);

const greetingCases = [
  [0, "Good morning"],
  [6, "Good morning"],
  [11, "Good morning"],
  [12, "Good afternoon"],
  [14, "Good afternoon"],
  [16, "Good afternoon"],
  [17, "Good evening"],
  [20, "Good evening"],
  [23, "Good evening"],
];

for (const [hour, expected] of greetingCases) {
  assert.equal(
    getTimeOfDayGreeting(hour),
    expected,
    `getTimeOfDayGreeting(${hour})`,
  );
}

const boundaryCases = [
  [new Date(2026, 5, 27, 9, 30, 0), 2.5 * 60 * 60 * 1000],
  [new Date(2026, 5, 27, 14, 15, 0), 2.75 * 60 * 60 * 1000],
  [new Date(2026, 5, 27, 22, 0, 0), 2 * 60 * 60 * 1000],
];

for (const [now, expectedMs] of boundaryCases) {
  assert.equal(
    msUntilNextGreetingChange(now),
    expectedMs,
    `msUntilNextGreetingChange(${now.toISOString()})`,
  );
}

console.log("greeting tests passed");
