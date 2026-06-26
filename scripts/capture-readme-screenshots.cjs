"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

const ROOT = path.join(__dirname, "..");
const DIST_ELECTRON = path.join(ROOT, "dist-electron");
const OUTPUT_DIR = path.join(ROOT, "docs", "screenshots");
const DEV_SERVER_URL = "http://127.0.0.1:5173/";

const { deleteDownload, getDownloadById, initializeDatabase, listDownloads, markDownloadTransferred } = require(path.join(DIST_ELECTRON, "database"));
const { downloadAudio, getBinaryStatus } = require(path.join(DIST_ELECTRON, "downloadService"));
const {
  clearCompletedJobs,
  clearJob,
  enqueueDownloads,
  listJobs,
  setJobListener
} = require(path.join(DIST_ELECTRON, "downloadQueue"));
const {
  getSpotifyConfig,
  getSpotifyStatus,
  listSpotifyPlaylists,
  listSpotifyPlaylistTracks,
  listSpotifySyncState,
  loginSpotify,
  logoutSpotify,
  saveSpotifyConfig,
  syncSpotifyPlaylist
} = require(path.join(DIST_ELECTRON, "spotifyService"));
const {
  getDailyMetrics,
  getRacePredictor,
  getSportTypeMap,
  getTrainingAnalytics,
  getTrainingHubActivityDetail,
  getTrainingHubActivityFileUrl,
  getTrainingHubStatus,
  listTrainingHubActivities,
  loginTrainingHub,
  logoutTrainingHub
} = require(path.join(DIST_ELECTRON, "trainingHubService"));
const { deleteWatchTrack, getWatchStatus, transferFileToWatch } = require(path.join(DIST_ELECTRON, "watchService"));
const {
  configureYouTubeBrowserSession,
  registerYouTubeBrowserHandlers,
  resetYouTubeBrowserSession
} = require(path.join(DIST_ELECTRON, "youtubeBrowserService"));
const {
  downloadFromYouTubeBrowser,
  downloadMultipleFromYouTubeBrowser,
  getYouTubeHistory,
  saveYouTubeVisit
} = require(path.join(DIST_ELECTRON, "youtubeService"));

let mainWindow;
let viteProcess;

function registerIpcHandlers() {
  ipcMain.handle("watch:getStatus", () => getWatchStatus());
  ipcMain.handle("watch:deleteTrack", async (_event, relativePath) => {
    await deleteWatchTrack(relativePath);
    return getWatchStatus();
  });
  ipcMain.handle("watch:transferLocalTrack", async (_event, id) => {
    const download = getDownloadById(id);
    if (!download) {
      throw new Error("Local track was not found.");
    }
    const copiedTrack = await transferFileToWatch(download.filePath);
    markDownloadTransferred(id);
    return { copiedTrack, watch: await getWatchStatus() };
  });
  ipcMain.handle("downloads:list", () => listDownloads());
  ipcMain.handle("downloads:downloadAudio", (_event, url) => downloadAudio(url));
  ipcMain.handle("downloads:delete", (_event, id, removeFile) => {
    deleteDownload(id, removeFile);
    return listDownloads();
  });
  ipcMain.handle("binaries:getStatus", () => getBinaryStatus());
  ipcMain.handle("youtube:listHistory", () => getYouTubeHistory());
  ipcMain.handle("youtube:recordVisit", (_event, url, title) => saveYouTubeVisit(url, title));
  ipcMain.handle("youtube:download", (_event, url, title) => downloadFromYouTubeBrowser(url, title));
  ipcMain.handle("youtube:downloadMultiple", (_event, items) => downloadMultipleFromYouTubeBrowser(items));
  ipcMain.handle("youtube:enqueueDownload", (_event, items) => enqueueDownloads(items));
  ipcMain.handle("youtube:listJobs", () => listJobs());
  ipcMain.handle("youtube:clearJob", (_event, id) => clearJob(id));
  ipcMain.handle("youtube:clearCompletedJobs", () => clearCompletedJobs());
  ipcMain.handle("youtube:resetSession", () => resetYouTubeBrowserSession());
  ipcMain.handle("spotify:getConfig", () => getSpotifyConfig());
  ipcMain.handle("spotify:saveConfig", (_event, config) => saveSpotifyConfig(config));
  ipcMain.handle("spotify:getStatus", () => getSpotifyStatus());
  ipcMain.handle("spotify:login", () => loginSpotify(mainWindow));
  ipcMain.handle("spotify:logout", () => logoutSpotify());
  ipcMain.handle("spotify:listPlaylists", () => listSpotifyPlaylists());
  ipcMain.handle("spotify:listPlaylistTracks", (_event, playlistId) => listSpotifyPlaylistTracks(playlistId));
  ipcMain.handle("spotify:listSyncState", (_event, playlistId) => listSpotifySyncState(playlistId));
  ipcMain.handle("spotify:syncPlaylist", (event, playlistId, autoTransfer) =>
    syncSpotifyPlaylist(playlistId, autoTransfer, (update) => {
      event.sender.send("spotify:syncUpdate", update);
    })
  );
  ipcMain.handle("trainingHub:getStatus", () => getTrainingHubStatus());
  ipcMain.handle("trainingHub:login", (_event, email, password) => loginTrainingHub(email, password));
  ipcMain.handle("trainingHub:logout", () => logoutTrainingHub());
  ipcMain.handle("trainingHub:listActivities", (_event, page, size) => listTrainingHubActivities(page, size));
  ipcMain.handle("trainingHub:getActivityDetail", (_event, activityId, sportType) =>
    getTrainingHubActivityDetail(activityId, sportType)
  );
  ipcMain.handle("trainingHub:getActivityFileUrl", (_event, activityId, sportType, fileType) =>
    getTrainingHubActivityFileUrl(activityId, sportType, fileType)
  );
  ipcMain.handle("trainingHub:getTrainingAnalytics", () => getTrainingAnalytics());
  ipcMain.handle("trainingHub:getRacePredictor", () => getRacePredictor());
  ipcMain.handle("trainingHub:getDailyMetrics", (_event, dateList) => getDailyMetrics(dateList));
  ipcMain.handle("trainingHub:getSportTypeMap", () => getSportTypeMap());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevServer(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(DEV_SERVER_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await wait(300);
  }
  throw new Error("Timed out waiting for Vite dev server.");
}

function startVite() {
  viteProcess = spawn("npm", ["run", "dev:renderer"], {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env }
  });
}

function stopVite() {
  if (!viteProcess || viteProcess.killed) {
    return;
  }
  viteProcess.kill("SIGTERM");
}

async function clickButton(label) {
  const clicked = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const buttons = [...document.querySelectorAll("button")];
      const match = buttons.find((button) => button.textContent.trim().includes(${JSON.stringify(label)}));
      if (!match) {
        return false;
      }
      match.click();
      return true;
    })()
  `);
  if (!clicked) {
    throw new Error(`Could not find button: ${label}`);
  }
}

async function waitForUiReady() {
  await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const check = () => {
        const buttons = document.querySelectorAll("button").length;
        if (buttons > 3) {
          resolve(true);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    })
  `);
}

async function captureScreenshot(name) {
  await wait(1200);
  await mainWindow.webContents.executeJavaScript(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  const image = await mainWindow.webContents.capturePage();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`Saved ${outputPath}`);
}

app.whenReady().then(async () => {
  startVite();
  await waitForDevServer();

  configureYouTubeBrowserSession();
  registerYouTubeBrowserHandlers();
  initializeDatabase(app.getPath("userData"));
  registerIpcHandlers();
  setJobListener(() => {});

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(DIST_ELECTRON, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(DEV_SERVER_URL);
  await waitForUiReady();
  await wait(1500);

  await captureScreenshot("overview");

  await clickButton("Media");
  await captureScreenshot("library");

  await clickButton("YouTube");
  await wait(2500);
  await captureScreenshot("youtube");

  await clickButton("Spotify");
  await captureScreenshot("spotify");

  await clickButton("Training Hub");
  await captureScreenshot("training-hub");

  stopVite();
  app.quit();
});

app.on("window-all-closed", () => {
  stopVite();
  app.quit();
});

process.on("exit", stopVite);
