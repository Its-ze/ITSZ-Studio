const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const UPDATE_URL = process.env.ITSZ_STUDIO_UPDATE_URL || "https://its-ze.github.io/ITSZ-Studio/downloads/";
const CAMERA_POLL_MS = 6500;
const PHOTO_EXTENSIONS = new Set([
  ".3fr", ".arw", ".avif", ".bmp", ".cr2", ".cr3", ".crw", ".dib", ".dng",
  ".erf", ".fff", ".gif", ".heic", ".heif", ".hif", ".iiq", ".j2k", ".jpe",
  ".jpeg", ".jpg", ".jpf", ".jp2", ".jxl", ".kdc", ".mef", ".mos", ".mrw",
  ".nef", ".nrw", ".orf", ".pef", ".png", ".ptx", ".raf", ".raw", ".rw2",
  ".rwl", ".sr2", ".srf", ".srw", ".svg", ".tif", ".tiff", ".webp", ".x3f",
]);
const PREVIEW_EXTENSIONS = new Set([".avif", ".bmp", ".dib", ".gif", ".jpe", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const MIME_BY_EXT = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".dib", "image/bmp"],
  [".gif", "image/gif"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".jpe", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".webp", "image/webp"],
]);
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

let mainWindow;
let cameraPollTimer;
let cameraScanInFlight = false;
let cameraDevices = new Map();
let seenCameraIds = new Set();
let ignoredCameraIds = new Set();
let updateState = {
  enabled: true,
  status: "Ready",
  version: app.getVersion(),
  available: false,
  downloaded: false,
  autoCheck: true,
};

function defaultSettings() {
  return {
    autoCheck: true,
    updateUrl: UPDATE_URL,
    homeFolder: "",
    deleteCameraOriginals: false,
  };
}

function readSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) };
  } catch {
    return defaultSettings();
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...defaultSettings(), ...settings }, null, 2));
}

function updateSettings(patch) {
  const next = { ...readSettings(), ...patch };
  writeSettings(next);
  return next;
}

function mergeUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:status", updateState);
  }
  return updateState;
}

function sendLibraryEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function configureAutoUpdater() {
  const settings = readSettings();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: settings.updateUrl || UPDATE_URL,
  });
  updateState.autoCheck = Boolean(settings.autoCheck);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    title: "ITSZ's Studio",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    backgroundColor: "#0c0d0c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
}

function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { role: "quit" },
      ],
    },
    {
      label: "Updates",
      submenu: [
        {
          label: "Check Now",
          click: () => checkForUpdates(),
        },
        {
          label: "Download Update",
          click: () => downloadUpdate(),
        },
        {
          label: "Install Downloaded Update",
          click: () => installDownloadedUpdate(),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function extensionFor(filePath) {
  return path.extname(filePath).toLowerCase();
}

function isPhotoPath(filePath) {
  return PHOTO_EXTENSIONS.has(extensionFor(filePath));
}

function isPreviewablePath(filePath) {
  return PREVIEW_EXTENSIONS.has(extensionFor(filePath));
}

function mimeForPath(filePath) {
  return MIME_BY_EXT.get(extensionFor(filePath)) || "application/octet-stream";
}

function placeholderDataUrl(filePath) {
  const extension = extensionFor(filePath).replace(".", "").toUpperCase() || "PHOTO";
  const name = path.basename(filePath).replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="460" viewBox="0 0 720 460">
    <rect width="720" height="460" fill="#101211"/>
    <rect x="34" y="34" width="652" height="392" rx="22" fill="#171b19" stroke="#39d8be" stroke-opacity=".42" stroke-width="3"/>
    <circle cx="360" cy="194" r="78" fill="#233530" stroke="#39d8be" stroke-width="12"/>
    <circle cx="360" cy="194" r="34" fill="#0d1110"/>
    <text x="360" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#f4f7f3">${extension}</text>
    <text x="360" y="352" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#9ba59f">${name}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function makePhotoRecord(filePath, rootPath = "") {
  const stats = fs.statSync(filePath);
  const previewSupported = isPreviewablePath(filePath);
  let src = placeholderDataUrl(filePath);

  if (previewSupported) {
    try {
      src = `data:${mimeForPath(filePath)};base64,${fs.readFileSync(filePath).toString("base64")}`;
    } catch {
      src = placeholderDataUrl(filePath);
    }
  }

  return {
    name: path.basename(filePath),
    src,
    type: mimeForPath(filePath),
    size: stats.size,
    modified: stats.mtimeMs,
    sourcePath: filePath,
    relativePath: rootPath ? path.relative(rootPath, filePath) : path.basename(filePath),
    previewSupported,
  };
}

function scanPhotoFiles(rootPaths, options = {}) {
  const roots = Array.isArray(rootPaths) ? rootPaths : [rootPaths];
  const maxFiles = options.maxFiles || 2500;
  const maxDepth = options.maxDepth || 10;
  const files = [];

  function walk(dirPath, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "$RECYCLE.BIN" && entry.name !== "System Volume Information") {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile() && isPhotoPath(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  for (const root of roots) {
    if (root && fs.existsSync(root)) walk(root, 0);
  }

  return files.sort((left, right) => {
    try {
      return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
    } catch {
      return 0;
    }
  });
}

function getCameraScanRoots(rootPath) {
  const dcim = path.join(rootPath, "DCIM");
  return fs.existsSync(dcim) ? [dcim] : [rootPath];
}

function buildCameraDevice(volume) {
  const scanRoots = getCameraScanRoots(volume.root);
  const photoFiles = scanPhotoFiles(scanRoots, { maxFiles: 5000, maxDepth: 12 });
  if (!photoFiles.length) return null;

  return {
    id: volume.id,
    name: volume.name || `Camera ${volume.root}`,
    root: volume.root,
    scanRoots,
    photoCount: photoFiles.length,
    sampleNames: photoFiles.slice(0, 3).map((filePath) => path.basename(filePath)),
  };
}

function publicCameraDevice(device) {
  return {
    id: device.id,
    name: device.name,
    root: device.root,
    photoCount: device.photoCount,
    sampleNames: device.sampleNames,
  };
}

function runPowerShellJson(script) {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 9000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch {
        resolve([]);
      }
    });
  });
}

async function listWindowsVolumes() {
  const volumes = await runPowerShellJson("Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName,FileSystem | ConvertTo-Json -Compress");
  return volumes
    .filter((volume) => volume.DeviceID && (volume.DriveType === 2 || volume.DriveType === 3))
    .map((volume) => {
      const root = `${volume.DeviceID}\\`;
      return {
        id: `win:${root.toLowerCase()}`,
        root,
        name: volume.VolumeName || root,
        removable: volume.DriveType === 2,
      };
    });
}

function decodeMountPath(value) {
  return value.replace(/\\040/g, " ").replace(/\\011/g, "\t");
}

function listUnixVolumes() {
  let mounts = "";
  try {
    mounts = fs.readFileSync("/proc/mounts", "utf8");
  } catch {
    return [];
  }

  return mounts
    .split("\n")
    .map((line) => line.trim().split(" "))
    .filter((parts) => parts.length >= 2)
    .map((parts) => decodeMountPath(parts[1]))
    .filter((mountPath) => mountPath.startsWith("/media/") || mountPath.startsWith("/run/media/") || mountPath.startsWith("/mnt/"))
    .map((mountPath) => ({
      id: `unix:${mountPath}`,
      root: mountPath,
      name: path.basename(mountPath) || mountPath,
      removable: true,
    }));
}

async function listMountedVolumes() {
  if (process.platform === "win32") return listWindowsVolumes();
  return listUnixVolumes();
}

async function scanCameraDevices() {
  const volumes = await listMountedVolumes();
  const devices = [];

  for (const volume of volumes) {
    const device = buildCameraDevice(volume);
    if (device && (volume.removable || fs.existsSync(path.join(volume.root, "DCIM")))) {
      devices.push(device);
    }
  }

  cameraDevices = new Map(devices.map((device) => [device.id, device]));
  return devices;
}

async function pollCameras() {
  if (cameraScanInFlight) return;
  cameraScanInFlight = true;
  try {
    const devices = await scanCameraDevices();
    const currentIds = new Set(devices.map((device) => device.id));

    for (const id of Array.from(seenCameraIds)) {
      if (!currentIds.has(id)) seenCameraIds.delete(id);
    }
    for (const id of Array.from(ignoredCameraIds)) {
      if (!currentIds.has(id)) ignoredCameraIds.delete(id);
    }

    const next = devices.find((device) => !seenCameraIds.has(device.id) && !ignoredCameraIds.has(device.id));
    if (next) {
      seenCameraIds.add(next.id);
      sendLibraryEvent("library:camera-detected", publicCameraDevice(next));
    }
  } finally {
    cameraScanInFlight = false;
  }
}

function startCameraWatcher() {
  clearInterval(cameraPollTimer);
  pollCameras();
  cameraPollTimer = setInterval(pollCameras, CAMERA_POLL_MS);
}

function sanitizeSegment(value) {
  return String(value || "Camera").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim() || "Camera";
}

function startsWithPath(childPath, parentPath) {
  const child = path.resolve(childPath);
  const parent = path.resolve(parentPath);
  const left = process.platform === "win32" ? child.toLowerCase() : child;
  const right = process.platform === "win32" ? parent.toLowerCase() : parent;
  return left === right || left.startsWith(`${right}${path.sep}`);
}

function uniqueDestinationPath(destinationPath) {
  if (!fs.existsSync(destinationPath)) return destinationPath;
  const parsed = path.parse(destinationPath);
  let index = 2;
  let next = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
  while (fs.existsSync(next)) {
    index += 1;
    next = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
  }
  return next;
}

function importCameraPhotos(deviceId, deleteOriginals) {
  const settings = readSettings();
  if (!settings.homeFolder) {
    throw new Error("Set a home folder before importing from a camera.");
  }

  const device = cameraDevices.get(deviceId);
  if (!device || !fs.existsSync(device.root)) {
    throw new Error("Camera is no longer available.");
  }

  if (startsWithPath(settings.homeFolder, device.root)) {
    throw new Error("Choose a home folder that is not on the camera.");
  }

  const sourceFiles = scanPhotoFiles(device.scanRoots, { maxFiles: 10000, maxDepth: 12 });
  const date = new Date().toISOString().slice(0, 10);
  const importRoot = path.join(settings.homeFolder, "Camera Imports", sanitizeSegment(device.name), date);
  const copiedPaths = [];
  const failures = [];
  let deleted = 0;

  for (const sourcePath of sourceFiles) {
    try {
      const relative = path.relative(device.root, sourcePath);
      if (relative.startsWith("..")) continue;
      const destinationPath = uniqueDestinationPath(path.join(importRoot, relative));
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);

      const sourceStats = fs.statSync(sourcePath);
      const destinationStats = fs.statSync(destinationPath);
      if (sourceStats.size !== destinationStats.size) {
        throw new Error("Copied file size did not match original.");
      }

      copiedPaths.push(destinationPath);
      if (deleteOriginals) {
        fs.unlinkSync(sourcePath);
        deleted += 1;
      }
    } catch (error) {
      failures.push({
        name: path.basename(sourcePath),
        message: error.message || "Import failed",
      });
    }
  }

  return {
    copied: copiedPaths.length,
    deleted,
    failed: failures.length,
    failures,
    destination: importRoot,
    records: copiedPaths.slice(0, 1000).map((filePath) => makePhotoRecord(filePath, importRoot)),
  };
}

async function checkForUpdates() {
  configureAutoUpdater();
  if (!app.isPackaged) {
    return mergeUpdateState({
      status: "Update checks run after install",
      available: false,
      downloaded: false,
    });
  }
  mergeUpdateState({ status: "Checking", available: false, downloaded: false });
  return autoUpdater.checkForUpdates();
}

async function downloadUpdate() {
  if (!updateState.available || !app.isPackaged) {
    return mergeUpdateState({ status: app.isPackaged ? "No update ready" : "Download runs after install" });
  }
  mergeUpdateState({ status: "Downloading" });
  return autoUpdater.downloadUpdate();
}

function installDownloadedUpdate() {
  if (!updateState.downloaded || !app.isPackaged) {
    return mergeUpdateState({ status: app.isPackaged ? "No downloaded update" : "Install runs after install" });
  }
  mergeUpdateState({ status: "Installing" });
  autoUpdater.quitAndInstall(false, true);
  return updateState;
}

autoUpdater.on("checking-for-update", () => mergeUpdateState({ status: "Checking" }));
autoUpdater.on("update-available", (info) => mergeUpdateState({
  status: `${info.version} available`,
  available: true,
  downloaded: false,
}));
autoUpdater.on("update-not-available", () => mergeUpdateState({
  status: "Up to date",
  available: false,
  downloaded: false,
}));
autoUpdater.on("download-progress", (progress) => mergeUpdateState({
  status: `Downloading ${Math.round(progress.percent)}%`,
}));
autoUpdater.on("update-downloaded", (info) => mergeUpdateState({
  status: `${info.version} ready to install`,
  available: true,
  downloaded: true,
}));
autoUpdater.on("error", (error) => mergeUpdateState({
  status: error && error.message ? error.message : "Update error",
  available: false,
  downloaded: false,
}));

ipcMain.handle("updates:get-info", () => {
  const settings = readSettings();
  return mergeUpdateState({
    enabled: true,
    version: app.getVersion(),
    autoCheck: Boolean(settings.autoCheck),
  });
});

ipcMain.handle("updates:set-auto-check", (_event, autoCheck) => {
  const settings = readSettings();
  const next = { ...settings, autoCheck: Boolean(autoCheck) };
  writeSettings(next);
  return mergeUpdateState({
    autoCheck: next.autoCheck,
    status: next.autoCheck ? "Auto check on launch" : "Manual checks only",
  });
});

ipcMain.handle("updates:check", () => checkForUpdates());
ipcMain.handle("updates:download", () => downloadUpdate());
ipcMain.handle("updates:install", () => installDownloadedUpdate());

ipcMain.handle("library:get-info", () => {
  const settings = readSettings();
  return {
    enabled: true,
    homeFolder: settings.homeFolder,
    deleteOriginals: Boolean(settings.deleteCameraOriginals),
    status: settings.homeFolder ? "Home ready" : "Set a home folder",
  };
});

ipcMain.handle("library:choose-home-folder", async () => {
  const settings = readSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose ITSZ's Studio Home Folder",
    defaultPath: settings.homeFolder || app.getPath("pictures"),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths.length) {
    return {
      enabled: true,
      homeFolder: settings.homeFolder,
      deleteOriginals: Boolean(settings.deleteCameraOriginals),
      status: settings.homeFolder ? "Home ready" : "Set a home folder",
    };
  }

  const next = updateSettings({ homeFolder: result.filePaths[0] });
  return {
    enabled: true,
    homeFolder: next.homeFolder,
    deleteOriginals: Boolean(next.deleteCameraOriginals),
    status: "Home folder set",
  };
});

ipcMain.handle("library:open-home-folder", async () => {
  const settings = readSettings();
  if (!settings.homeFolder) return { status: "Set a home folder first" };
  fs.mkdirSync(settings.homeFolder, { recursive: true });
  const error = await shell.openPath(settings.homeFolder);
  return { status: error || "Opened home folder" };
});

ipcMain.handle("library:load-home-folder", () => {
  const settings = readSettings();
  if (!settings.homeFolder) return { status: "Set a home folder first", records: [] };
  fs.mkdirSync(settings.homeFolder, { recursive: true });
  const files = scanPhotoFiles(settings.homeFolder, { maxFiles: 1000, maxDepth: 12 });
  return {
    status: files.length ? `Loaded ${files.length} home photo${files.length === 1 ? "" : "s"}` : "No photos in home folder",
    homeFolder: settings.homeFolder,
    records: files.map((filePath) => makePhotoRecord(filePath, settings.homeFolder)),
  };
});

ipcMain.handle("library:set-delete-originals", (_event, deleteOriginals) => {
  const next = updateSettings({ deleteCameraOriginals: Boolean(deleteOriginals) });
  return {
    enabled: true,
    homeFolder: next.homeFolder,
    deleteOriginals: Boolean(next.deleteCameraOriginals),
    status: next.deleteCameraOriginals ? "Delete after import on" : "Keep camera originals",
  };
});

ipcMain.handle("library:scan-cameras", async () => {
  const devices = await scanCameraDevices();
  return devices.map(publicCameraDevice);
});

ipcMain.handle("library:ignore-camera", (_event, deviceId) => {
  if (deviceId) ignoredCameraIds.add(deviceId);
  return { status: "Camera ignored" };
});

ipcMain.handle("library:import-camera", (_event, options = {}) => {
  return importCameraPhotos(options.deviceId, Boolean(options.deleteOriginals));
});

app.whenReady().then(() => {
  configureAutoUpdater();
  createWindow();
  createMenu();
  startCameraWatcher();

  const settings = readSettings();
  mergeUpdateState({
    enabled: true,
    version: app.getVersion(),
    autoCheck: Boolean(settings.autoCheck),
    status: app.isPackaged ? "Ready" : "Development build",
  });

  if (settings.autoCheck && app.isPackaged) {
    setTimeout(() => checkForUpdates(), 1500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
