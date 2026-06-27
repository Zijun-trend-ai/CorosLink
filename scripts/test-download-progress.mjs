import assert from "node:assert/strict";
import {
  computeOverallProgress,
  extractYtDlpErrors,
  parseYtDlpProgressLine
} from "../dist-electron/downloadProgress.js";

const samples = [
  {
    line: "before_dl:__TRACK__|3|12|My Song Title",
    expected: {
      trackIndex: 3,
      trackTotal: 12,
      currentTrackTitle: "My Song Title",
      phase: "downloading"
    }
  },
  {
    line: "[download] Downloading item 3 of 12",
    expected: {
      trackIndex: 3,
      trackTotal: 12,
      phase: "downloading"
    }
  },
  {
    line: "[download] 42.3% of 5.00MiB at 1.2MiB/s ETA 00:03",
    expected: {
      trackProgress: 42.3,
      phase: "downloading"
    }
  },
  {
    line: "[ExtractAudio] Destination: /tmp/song.mp3",
    expected: {
      phase: "converting"
    }
  },
  {
    line: "after_move:/Users/me/downloads/Song [abc123].mp3",
    expected: {
      phase: "between_tracks",
      completedTrackIncrement: 1
    }
  },
  {
    line: "ERROR: [youtube] abc: Video unavailable",
    expected: {
      activity: "[youtube] abc: Video unavailable"
    }
  }
];

for (const sample of samples) {
  const parsed = parseYtDlpProgressLine(sample.line);
  assert.ok(parsed, `expected parse result for ${sample.line}`);

  for (const [key, value] of Object.entries(sample.expected)) {
    assert.equal(parsed[key], value, `${sample.line} :: ${key}`);
  }
}

assert.equal(
  computeOverallProgress({
    entryType: "playlist",
    trackIndex: 3,
    trackTotal: 12,
    trackProgress: 50,
    previousProgress: 10
  }),
  20.833333333333336
);

assert.equal(
  computeOverallProgress({
    entryType: "video",
    trackProgress: 75,
    previousProgress: 50
  }),
  75
);

console.log("download progress parser tests passed");

const noisyOutput = [
  "after_move:/Users/me/song.mp3",
  "/Users/me/song.mp3",
  "ERROR: [youtube] F9kXstb9FF4: Video unavailable. This video is not available",
  "ERROR: [youtube] vEu1rLTZkk4: Video unavailable. This video is not available"
];

assert.deepEqual(extractYtDlpErrors(noisyOutput), [
  "[youtube] F9kXstb9FF4: Video unavailable. This video is not available",
  "[youtube] vEu1rLTZkk4: Video unavailable. This video is not available"
]);

console.log("yt-dlp error extraction tests passed");
