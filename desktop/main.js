const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UPDATE_URL = process.env.ITSZ_STUDIO_UPDATE_URL || "https://its-ze.github.io/ITSZ-Studio/downloads/";
const CAMERA_POLL_MS = 15000;
const PORTABLE_CAMERA_CACHE_MS = 120000;
const PORTABLE_CAMERA_EMPTY_CACHE_MS = 15000;
const LINUX_GPHOTO_CACHE_MS = 120000;
const LINUX_GPHOTO_EMPTY_CACHE_MS = 15000;
const PHOTO_EXTENSIONS = new Set([
  ".3fr", ".arw", ".avif", ".bmp", ".cr2", ".cr3", ".crw", ".dib", ".dng",
  ".erf", ".fff", ".gif", ".heic", ".heif", ".hif", ".iiq", ".j2k", ".jpe",
  ".jpeg", ".jpg", ".jpf", ".jp2", ".jxl", ".kdc", ".mef", ".mos", ".mrw",
  ".nef", ".nrw", ".orf", ".pef", ".png", ".ptx", ".raf", ".raw", ".rw2",
  ".rwl", ".sr2", ".srf", ".srw", ".svg", ".tif", ".tiff", ".webp", ".x3f",
]);
const JPEG_EXTENSIONS = new Set([".jpe", ".jpeg", ".jpg"]);
const RAW_EXTENSIONS = new Set([
  ".3fr", ".arw", ".cr2", ".cr3", ".crw", ".dng", ".erf", ".fff", ".hif",
  ".iiq", ".kdc", ".mef", ".mos", ".mrw", ".nef", ".nrw", ".orf", ".pef",
  ".ptx", ".raf", ".raw", ".rw2", ".rwl", ".sr2", ".srf", ".srw", ".x3f",
]);
const TIFF_EXTENSIONS = new Set([".tif", ".tiff"]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif", ".hif"]);
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
const WINDOWS_PORTABLE_COPY_FLAGS = "20";

let mainWindow;
let cameraPollTimer;
let cameraScanInFlight = false;
let cameraDevices = new Map();
let seenCameraIds = new Set();
let ignoredCameraIds = new Set();
let portableCameraCache = { scannedAt: 0, devices: [] };
let linuxGphotoCameraCache = { scannedAt: 0, devices: [] };
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
    autoSortImports: false,
    autoSortAsk: true,
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

function powerShellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const WINDOWS_PHOTO_EXTENSIONS = Array.from(PHOTO_EXTENSIONS).map(powerShellQuote).join(", ");

const WINDOWS_PORTABLE_CAMERA_COMMON_SCRIPT = String.raw`
$PhotoExtensions = @(${WINDOWS_PHOTO_EXTENSIONS})

function Get-PortablePhotoExtension {
  param($Folder, $Item)

  $name = [string]$Item.Name
  $nameExtension = [System.IO.Path]::GetExtension($name).ToLowerInvariant()
  if ($PhotoExtensions -contains $nameExtension) {
    return $nameExtension
  }

  $type = [string]$Folder.GetDetailsOf($Item, 1)
  if ($type -match '^\s*([A-Za-z0-9]{2,5})\s+File\s*$') {
    $extension = "." + $Matches[1].ToLowerInvariant()
    if ($extension -eq ".jpeg") {
      $extension = ".jpg"
    }
    if ($PhotoExtensions -contains $extension) {
      return $extension
    }
  }

  if ($type -match 'JPEG|JPG') {
    return ".jpg"
  }
  return ""
}

function Get-PortablePhotoName {
  param($Folder, $Item)

  $extension = Get-PortablePhotoExtension $Folder $Item
  if (-not $extension) {
    return ""
  }

  $name = [string]$Item.Name
  if (-not $name.ToLowerInvariant().EndsWith($extension)) {
    $name = "$name$extension"
  }
  return $name
}

function Get-SafeSegment {
  param([string]$Value)
  $segment = ($Value -replace '[<>:"/\\|?*\x00-\x1f]', '-').Trim()
  if ($segment) {
    return $segment
  }
  return "Camera"
}

function Get-PortablePhotoEntries {
  param($Device, [int]$MaxFiles)

  $entries = New-Object System.Collections.Generic.List[object]

  function Walk-PortableItem {
    param($Item, [string]$RelativeFolder, [int]$Depth)

    if ($entries.Count -ge $MaxFiles -or $Depth -gt 12 -or -not $Item.IsFolder) {
      return
    }

    $folder = $Item.GetFolder
    if (-not $folder) {
      return
    }

    foreach ($child in @($folder.Items())) {
      if ($entries.Count -ge $MaxFiles) {
        return
      }

      if ($child.IsFolder) {
        $nextFolder = if ($RelativeFolder) { "$RelativeFolder/$($child.Name)" } else { [string]$child.Name }
        Walk-PortableItem $child $nextFolder ($Depth + 1)
        continue
      }

      $fileName = Get-PortablePhotoName $folder $child
      if (-not $fileName) {
        continue
      }

      $entries.Add([pscustomobject]@{
        Item = $child
        Name = $fileName
        Type = [string]$folder.GetDetailsOf($child, 1)
        RelativeFolder = $RelativeFolder
      }) | Out-Null
    }
  }

  Walk-PortableItem $Device "" 0
  return $entries
}

function Get-PortableDeviceByPath {
  param($Computer, [string]$DevicePath, [string]$DeviceName)

  foreach ($device in @($Computer.Items())) {
    if (-not $device.IsFolder) {
      continue
    }
    if ($DevicePath -and [string]$device.Path -eq $DevicePath) {
      return $device
    }
  }

  foreach ($device in @($Computer.Items())) {
    if ($device.IsFolder -and $DeviceName -and [string]$device.Name -eq $DeviceName) {
      return $device
    }
  }

  return $null
}
`;

const WINDOWS_PORTABLE_CAMERA_LIST_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
${WINDOWS_PORTABLE_CAMERA_COMMON_SCRIPT}

$shell = New-Object -ComObject Shell.Application
$computer = $shell.Namespace("shell:MyComputerFolder")
$devices = New-Object System.Collections.Generic.List[object]

foreach ($device in @($computer.Items())) {
  if (-not $device.IsFolder) {
    continue
  }

  $devicePath = [string]$device.Path
  if (-not $devicePath.StartsWith("::{20D04FE0-3AEA-1069-A2D8-08002B30309D}")) {
    continue
  }

  $photos = @(Get-PortablePhotoEntries $device 5000)
  if (-not $photos.Count) {
    continue
  }

  $devices.Add([pscustomobject]@{
    name = [string]$device.Name
    shellPath = $devicePath
    root = [string]$device.Name
    photoCount = $photos.Count
    sampleNames = @($photos | Select-Object -First 3 | ForEach-Object { $_.Name })
  }) | Out-Null
}

ConvertTo-Json -InputObject @($devices.ToArray()) -Compress -Depth 6
`;

const WINDOWS_PORTABLE_CAMERA_IMPORT_SCRIPT = String.raw`
param([string]$InputPath)
$ErrorActionPreference = "Stop"
${WINDOWS_PORTABLE_CAMERA_COMMON_SCRIPT}

$request = Get-Content -LiteralPath $InputPath -Raw | ConvertFrom-Json
$shell = New-Object -ComObject Shell.Application
$computer = $shell.Namespace("shell:MyComputerFolder")
$device = Get-PortableDeviceByPath $computer ([string]$request.shellPath) ([string]$request.name)
if (-not $device) {
  throw "Camera is no longer available."
}

$destinationRoot = [string]$request.destinationRoot
$deleteOriginals = [bool]$request.deleteOriginals
$maxFiles = [int]$request.maxFiles
if ($maxFiles -lt 1) {
  $maxFiles = 10000
}

New-Item -ItemType Directory -Force -Path $destinationRoot | Out-Null
$entries = @(Get-PortablePhotoEntries $device $maxFiles)
$copiedPaths = New-Object System.Collections.Generic.List[string]
$failures = New-Object System.Collections.Generic.List[object]
$deleted = 0
$deleteFailures = 0

function Get-UniqueDestinationPath {
  param([string]$DestinationPath)

  if (-not (Test-Path -LiteralPath $DestinationPath)) {
    return $DestinationPath
  }

  $directory = [System.IO.Path]::GetDirectoryName($DestinationPath)
  $name = [System.IO.Path]::GetFileNameWithoutExtension($DestinationPath)
  $extension = [System.IO.Path]::GetExtension($DestinationPath)
  $index = 2
  do {
    $next = Join-Path $directory "$name-$index$extension"
    $index += 1
  } while (Test-Path -LiteralPath $next)
  return $next
}

function Wait-CopiedPortableFile {
  param([string]$FolderPath)

  $deadline = (Get-Date).AddSeconds(180)
  $lastPath = ""
  $lastLength = -1
  $stableCount = 0

  do {
    Start-Sleep -Milliseconds 500
    $files = @(Get-ChildItem -LiteralPath $FolderPath -File -ErrorAction SilentlyContinue)
    if ($files.Count) {
      $file = $files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
      if ($file.FullName -eq $lastPath -and $file.Length -eq $lastLength -and $file.Length -gt 0) {
        $stableCount += 1
      } else {
        $stableCount = 0
        $lastPath = $file.FullName
        $lastLength = $file.Length
      }
      if ($stableCount -ge 2) {
        return $file
      }
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for camera copy to finish."
}

foreach ($entry in $entries) {
  $staging = Join-Path $destinationRoot (".incoming-" + [guid]::NewGuid().ToString("N"))
  try {
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    $stagingFolder = $shell.Namespace($staging)
    if (-not $stagingFolder) {
      throw "Could not open staging folder."
    }

    $stagingFolder.CopyHere($entry.Item, ${WINDOWS_PORTABLE_COPY_FLAGS})
    $copied = Wait-CopiedPortableFile $staging

    $relativeFolder = [string]$entry.RelativeFolder
    $safeSegments = @()
    if ($relativeFolder) {
      $safeSegments = $relativeFolder.Split("/") | Where-Object { $_ } | ForEach-Object { Get-SafeSegment $_ }
    }

    $targetDirectory = $destinationRoot
    foreach ($segment in $safeSegments) {
      $targetDirectory = Join-Path $targetDirectory $segment
    }
    New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null

    $targetPath = Get-UniqueDestinationPath (Join-Path $targetDirectory ([string]$entry.Name))
    Move-Item -LiteralPath $copied.FullName -Destination $targetPath
    $copiedPaths.Add($targetPath) | Out-Null

    if ($deleteOriginals) {
      try {
        $entry.Item.InvokeVerb("delete")
        $deleted += 1
      } catch {
        $deleteFailures += 1
        $failures.Add([pscustomobject]@{
          name = [string]$entry.Name
          message = "Copied, but deleting the original failed: $($_.Exception.Message)"
        }) | Out-Null
      }
    }
  } catch {
    $failures.Add([pscustomobject]@{
      name = [string]$entry.Name
      message = $_.Exception.Message
    }) | Out-Null
  } finally {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

ConvertTo-Json -InputObject ([pscustomobject]@{
  copied = $copiedPaths.Count
  deleted = $deleted
  failed = $failures.Count
  deleteFailures = $deleteFailures
  failures = @($failures.ToArray())
  copiedPaths = @($copiedPaths.ToArray())
}) -Compress -Depth 8
`;

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
    kind: volume.kind || "filesystem",
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

function parsePowerShellJson(stdout) {
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function runPowerShellJson(script, options = {}) {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: options.timeout || 9000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        resolve(parsePowerShellJson(stdout));
      } catch {
        resolve([]);
      }
    });
  });
}

function runPowerShellScriptJson(script, options = {}) {
  return new Promise((resolve, reject) => {
    const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const scriptPath = path.join(app.getPath("temp"), `itsz-studio-${stamp}.ps1`);
    const inputPath = options.input ? path.join(app.getPath("temp"), `itsz-studio-${stamp}.json`) : "";
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath];

    try {
      fs.writeFileSync(scriptPath, script, "utf8");
      if (inputPath) {
        fs.writeFileSync(inputPath, JSON.stringify(options.input), "utf8");
        args.push("-InputPath", inputPath);
      }
    } catch (error) {
      reject(error);
      return;
    }

    execFile("powershell.exe", args, { windowsHide: true, timeout: options.timeout || 30000 }, (error, stdout, stderr) => {
      fs.rmSync(scriptPath, { force: true });
      if (inputPath) fs.rmSync(inputPath, { force: true });

      if (error) {
        reject(new Error((stderr || error.message || "PowerShell failed").trim()));
        return;
      }
      try {
        resolve(options.expectArray === false ? JSON.parse(stdout || "{}") : parsePowerShellJson(stdout));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function runExecFile(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      timeout: options.timeout || 30000,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr || stdout || error.message || `${command} failed`).trim();
        reject(new Error(message));
        return;
      }
      resolve(stdout || "");
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

function portableDeviceId(shellPath) {
  return `wpd:${crypto.createHash("sha1").update(shellPath).digest("hex")}`;
}

function cloneCameraDevice(device) {
  return {
    ...device,
    sampleNames: Array.isArray(device.sampleNames) ? [...device.sampleNames] : [],
    scanRoots: Array.isArray(device.scanRoots) ? [...device.scanRoots] : undefined,
    gphotoFiles: Array.isArray(device.gphotoFiles) ? device.gphotoFiles.map((file) => ({ ...file })) : undefined,
  };
}

async function listWindowsPortableCameras(options = {}) {
  const now = Date.now();
  const cacheMs = portableCameraCache.devices.length ? PORTABLE_CAMERA_CACHE_MS : PORTABLE_CAMERA_EMPTY_CACHE_MS;
  if (!options.force && portableCameraCache.scannedAt && now - portableCameraCache.scannedAt < cacheMs) {
    return portableCameraCache.devices.map(cloneCameraDevice);
  }

  try {
    const devices = await runPowerShellScriptJson(WINDOWS_PORTABLE_CAMERA_LIST_SCRIPT, { timeout: 45000 });
    const portableDevices = devices
      .filter((device) => device.shellPath && device.photoCount > 0)
      .map((device) => ({
        id: portableDeviceId(device.shellPath),
        kind: "wpd",
        name: device.name || "Portable Camera",
        root: device.root || device.name || "Portable Camera",
        shellPath: device.shellPath,
        photoCount: Number(device.photoCount) || 0,
        sampleNames: Array.isArray(device.sampleNames) ? device.sampleNames : [],
      }));
    portableCameraCache = {
      scannedAt: Date.now(),
      devices: portableDevices.map(cloneCameraDevice),
    };
    return portableDevices;
  } catch {
    portableCameraCache = { scannedAt: Date.now(), devices: [] };
    return [];
  }
}

function decodeMountPath(value) {
  return value.replace(/\\040/g, " ").replace(/\\011/g, "\t");
}

function safeDecodeUriPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLinuxGvfsCameraMountName(name) {
  const lower = name.toLowerCase();
  return lower.startsWith("gphoto2:") || lower.startsWith("mtp:") || lower.startsWith("ptp:");
}

function linuxGvfsCameraName(name) {
  const decoded = safeDecodeUriPart(name);
  if (decoded.startsWith("gphoto2:")) return `Camera ${decoded.replace(/^gphoto2:/, "").replace(/^host=/, "").trim()}`;
  if (decoded.startsWith("mtp:")) return `MTP Camera ${decoded.replace(/^mtp:/, "").replace(/^host=/, "").trim()}`;
  if (decoded.startsWith("ptp:")) return `PTP Camera ${decoded.replace(/^ptp:/, "").replace(/^host=/, "").trim()}`;
  return "Linux Camera";
}

function linuxGvfsRoots() {
  if (process.platform !== "linux") return [];
  const roots = new Set();
  if (process.env.XDG_RUNTIME_DIR) roots.add(path.join(process.env.XDG_RUNTIME_DIR, "gvfs"));
  if (typeof process.getuid === "function") roots.add(`/run/user/${process.getuid()}/gvfs`);

  try {
    for (const entry of fs.readdirSync("/run/user", { withFileTypes: true })) {
      if (entry.isDirectory()) roots.add(path.join("/run/user", entry.name, "gvfs"));
    }
  } catch {
    // /run/user may not exist on every Unix-like desktop.
  }

  return Array.from(roots).filter((root) => {
    try {
      return fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
}

function listLinuxGvfsVolumes() {
  const volumes = [];
  for (const gvfsRoot of linuxGvfsRoots()) {
    let entries;
    try {
      entries = fs.readdirSync(gvfsRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (!isLinuxGvfsCameraMountName(entry.name)) continue;
      const root = path.join(gvfsRoot, entry.name);
      volumes.push({
        id: `linux-gvfs:${root}`,
        kind: "gvfs",
        root,
        name: linuxGvfsCameraName(entry.name),
        removable: true,
        portable: true,
      });
    }
  }
  return volumes;
}

function dedupeVolumes(volumes) {
  const seen = new Set();
  return volumes.filter((volume) => {
    const key = volume.root;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function parseGphotoAutoDetect(stdout) {
  const cameras = [];
  let inRows = false;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^-{3,}/.test(line)) {
      inRows = true;
      continue;
    }
    if (!inRows || /^Model\s+Port$/i.test(line)) continue;

    const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    let model = parts[0] || "";
    let port = parts[1] || "";
    if (!port) {
      const match = line.match(/^(.+?)\s+((?:usb|ptpip|disk|serial):\S+)$/i);
      if (match) {
        model = match[1].trim();
        port = match[2].trim();
      }
    }
    if (model && port) cameras.push({ model, port });
  }
  return cameras;
}

function parseGphotoFileList(stdout) {
  const files = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^#(\d+)\s+(.+?)(?=\s{2,}\S|\s*$)/);
    if (!match) continue;
    files.push({
      number: Number(match[1]),
      name: match[2].trim(),
    });
  }
  return files.filter((file) => Number.isFinite(file.number) && file.name && isPhotoPath(file.name));
}

function gphotoArgs(port, args) {
  return port ? ["--port", port, ...args] : args;
}

async function listLinuxGphotoPhotoFiles(port) {
  const stdout = await runExecFile("gphoto2", gphotoArgs(port, ["--list-files"]), { timeout: 45000 });
  return parseGphotoFileList(stdout);
}

function linuxGphotoDeviceId(model, port) {
  return `gphoto2:${crypto.createHash("sha1").update(`${model}\n${port}`).digest("hex")}`;
}

async function listLinuxGphotoCameras(options = {}) {
  if (process.platform !== "linux") return [];
  const now = Date.now();
  const cacheMs = linuxGphotoCameraCache.devices.length ? LINUX_GPHOTO_CACHE_MS : LINUX_GPHOTO_EMPTY_CACHE_MS;
  if (!options.force && linuxGphotoCameraCache.scannedAt && now - linuxGphotoCameraCache.scannedAt < cacheMs) {
    return linuxGphotoCameraCache.devices.map(cloneCameraDevice);
  }

  try {
    await runExecFile("gphoto2", ["--version"], { timeout: 5000 });
  } catch {
    linuxGphotoCameraCache = { scannedAt: Date.now(), devices: [] };
    return [];
  }

  try {
    const detected = parseGphotoAutoDetect(await runExecFile("gphoto2", ["--auto-detect"], { timeout: 12000 }));
    const devices = [];
    for (const camera of detected) {
      let photoFiles = [];
      try {
        photoFiles = await listLinuxGphotoPhotoFiles(camera.port);
      } catch {
        photoFiles = [];
      }
      if (!photoFiles.length) continue;
      devices.push({
        id: linuxGphotoDeviceId(camera.model, camera.port),
        kind: "gphoto2",
        name: camera.model || "Linux Camera",
        root: `gphoto2://${camera.port}`,
        port: camera.port,
        photoCount: photoFiles.length,
        sampleNames: photoFiles.slice(0, 3).map((file) => file.name),
        gphotoFiles: photoFiles.slice(0, 10000),
      });
    }
    linuxGphotoCameraCache = {
      scannedAt: Date.now(),
      devices: devices.map(cloneCameraDevice),
    };
    return devices;
  } catch {
    linuxGphotoCameraCache = { scannedAt: Date.now(), devices: [] };
    return [];
  }
}

async function listMountedVolumes() {
  if (process.platform === "win32") return listWindowsVolumes();
  if (process.platform === "linux") return dedupeVolumes([...listUnixVolumes(), ...listLinuxGvfsVolumes()]);
  return listUnixVolumes();
}

async function scanCameraDevices(options = {}) {
  const volumes = await listMountedVolumes();
  const devices = [];

  for (const volume of volumes) {
    const device = buildCameraDevice(volume);
    if (device && (volume.removable || fs.existsSync(path.join(volume.root, "DCIM")))) {
      devices.push(device);
    }
  }

  if (process.platform === "win32") {
    devices.push(...await listWindowsPortableCameras({ force: Boolean(options.forcePortableScan) }));
  }
  if (process.platform === "linux" && !devices.some((device) => device.kind === "gvfs")) {
    devices.push(...await listLinuxGphotoCameras({ force: Boolean(options.forcePortableScan) }));
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

function sanitizeFileName(value) {
  const fileName = path.basename(String(value || "photo"));
  const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim();
  return safeName && safeName !== "." && safeName !== ".." ? safeName : "photo";
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

function sortFolderForPhoto(filePath) {
  const extension = extensionFor(filePath);
  if (RAW_EXTENSIONS.has(extension)) return "RAW";
  if (JPEG_EXTENSIONS.has(extension)) return "JPG";
  if (extension === ".png") return "PNG";
  if (TIFF_EXTENSIONS.has(extension)) return "TIFF";
  if (HEIC_EXTENSIONS.has(extension)) return "HEIC";
  if (extension === ".webp") return "WEBP";
  if (extension === ".gif") return "GIF";
  return "Other Photos";
}

function sortImportPathForPhoto(importRoot, fileName) {
  return path.join(importRoot, sortFolderForPhoto(fileName), sanitizeFileName(path.basename(fileName)));
}

function maybeSortedDestinationPath(importRoot, fileName, autoSortApproved) {
  if (!autoSortApproved) return path.join(importRoot, sanitizeFileName(path.basename(fileName)));
  return sortImportPathForPhoto(importRoot, fileName);
}

function sortCopiedImportPaths(copiedPaths, importRoot, autoSortApproved) {
  if (!autoSortApproved) {
    return {
      copiedPaths,
      sorted: 0,
      sortFolders: [],
      sortFailures: [],
    };
  }

  const sortedPaths = [];
  const sortFolders = new Set();
  const sortFailures = [];
  let sorted = 0;

  for (const filePath of copiedPaths) {
    try {
      if (!isPhotoPath(filePath) || !fs.existsSync(filePath)) {
        sortedPaths.push(filePath);
        continue;
      }

      const folder = sortFolderForPhoto(filePath);
      const destinationPath = uniqueDestinationPath(path.join(importRoot, folder, sanitizeFileName(path.basename(filePath))));
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

      if (path.resolve(filePath) !== path.resolve(destinationPath)) {
        fs.renameSync(filePath, destinationPath);
        sorted += 1;
      }
      sortFolders.add(folder);
      sortedPaths.push(destinationPath);
    } catch (error) {
      sortedPaths.push(filePath);
      sortFailures.push({
        name: path.basename(filePath),
        message: `Copied, but sorting failed: ${error.message || "sort failed"}`,
      });
    }
  }

  return {
    copiedPaths: sortedPaths,
    sorted,
    sortFolders: Array.from(sortFolders).sort((left, right) => left.localeCompare(right)),
    sortFailures,
  };
}

async function importPortableCameraPhotos(device, settings, deleteOriginals, autoSortApproved) {
  const date = new Date().toISOString().slice(0, 10);
  const importRoot = path.join(settings.homeFolder, "Camera Imports", sanitizeSegment(device.name), date);
  const result = await runPowerShellScriptJson(WINDOWS_PORTABLE_CAMERA_IMPORT_SCRIPT, {
    expectArray: false,
    timeout: 30 * 60 * 1000,
    input: {
      shellPath: device.shellPath,
      name: device.name,
      destinationRoot: importRoot,
      deleteOriginals,
      maxFiles: 10000,
    },
  });
  const copiedPaths = Array.isArray(result.copiedPaths) ? result.copiedPaths : [];
  const sortedResult = sortCopiedImportPaths(copiedPaths, importRoot, autoSortApproved);
  const importFailures = Array.isArray(result.failures) ? result.failures : [];
  const failures = [
    ...importFailures,
    ...sortedResult.sortFailures,
  ];
  const importFailed = Number(result.failed) || importFailures.length;

  return {
    copied: Number(result.copied) || sortedResult.copiedPaths.length,
    sorted: sortedResult.sorted,
    sortFolders: sortedResult.sortFolders,
    deleted: Number(result.deleted) || 0,
    failed: importFailed + sortedResult.sortFailures.length,
    failures,
    destination: importRoot,
    records: sortedResult.copiedPaths.slice(0, 1000).map((filePath) => makePhotoRecord(filePath, importRoot)),
  };
}

async function importLinuxGphotoPhotos(device, settings, deleteOriginals, autoSortApproved) {
  const date = new Date().toISOString().slice(0, 10);
  const importRoot = path.join(settings.homeFolder, "Camera Imports", sanitizeSegment(device.name), date);
  const failures = [];
  const copiedPaths = [];
  const copiedFileNumbers = new Set();
  let deleted = 0;
  let photoFiles = [];

  try {
    photoFiles = await listLinuxGphotoPhotoFiles(device.port);
  } catch {
    photoFiles = Array.isArray(device.gphotoFiles) ? device.gphotoFiles : [];
  }
  if (!photoFiles.length) {
    throw new Error("No supported photo files were found on the camera.");
  }

  fs.mkdirSync(importRoot, { recursive: true });
  for (const photo of photoFiles.slice(0, 10000)) {
    try {
      const destinationPath = uniqueDestinationPath(maybeSortedDestinationPath(importRoot, photo.name, autoSortApproved));
      await runExecFile("gphoto2", gphotoArgs(device.port, [
        "--get-file",
        String(photo.number),
        "--filename",
        destinationPath,
      ]), { timeout: 3 * 60 * 1000 });
      if (!fs.existsSync(destinationPath)) {
        throw new Error("Camera download finished without creating the file.");
      }
      copiedPaths.push(destinationPath);
      copiedFileNumbers.add(photo.number);
    } catch (error) {
      failures.push({
        name: photo.name,
        message: error.message || "Import failed",
      });
    }
  }

  if (deleteOriginals && copiedFileNumbers.size) {
    const copiedPhotos = photoFiles
      .filter((photo) => copiedFileNumbers.has(photo.number))
      .sort((left, right) => right.number - left.number);

    for (const photo of copiedPhotos) {
      try {
        await runExecFile("gphoto2", gphotoArgs(device.port, ["--delete-file", String(photo.number)]), { timeout: 60000 });
        deleted += 1;
      } catch (error) {
        failures.push({
          name: photo.name,
          message: `Copied, but deleting the original failed: ${error.message || "delete failed"}`,
        });
      }
    }
  }

  return {
    copied: copiedPaths.length,
    sorted: autoSortApproved ? copiedPaths.length : 0,
    sortFolders: autoSortApproved
      ? Array.from(new Set(copiedPaths.map(sortFolderForPhoto))).sort((left, right) => left.localeCompare(right))
      : [],
    deleted,
    failed: failures.length,
    failures,
    destination: importRoot,
    records: copiedPaths.slice(0, 1000).map((filePath) => makePhotoRecord(filePath, importRoot)),
  };
}

async function importCameraPhotos(deviceId, options = {}) {
  const settings = readSettings();
  const deleteOriginals = Boolean(options.deleteOriginals);
  const autoSortApproved = Boolean(settings.autoSortImports && options.autoSortApproved);
  if (!settings.homeFolder) {
    throw new Error("Set a home folder before importing from a camera.");
  }

  const device = cameraDevices.get(deviceId);
  if (!device) {
    throw new Error("Camera is no longer available.");
  }

  if (device.kind === "wpd") {
    return importPortableCameraPhotos(device, settings, deleteOriginals, autoSortApproved);
  }

  if (device.kind === "gphoto2") {
    return importLinuxGphotoPhotos(device, settings, deleteOriginals, autoSortApproved);
  }

  if (!fs.existsSync(device.root)) {
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
      const destinationPath = autoSortApproved
        ? uniqueDestinationPath(sortImportPathForPhoto(importRoot, sourcePath))
        : uniqueDestinationPath(path.join(importRoot, relative));
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
    sorted: autoSortApproved ? copiedPaths.length : 0,
    sortFolders: autoSortApproved
      ? Array.from(new Set(copiedPaths.map(sortFolderForPhoto))).sort((left, right) => left.localeCompare(right))
      : [],
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
    autoSortImports: Boolean(settings.autoSortImports),
    autoSortAsk: settings.autoSortAsk !== false,
    autoSortStatus: settings.autoSortImports ? "Approved" : "Off",
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
      autoSortImports: Boolean(settings.autoSortImports),
      autoSortAsk: settings.autoSortAsk !== false,
      autoSortStatus: settings.autoSortImports ? "Approved" : "Off",
      status: settings.homeFolder ? "Home ready" : "Set a home folder",
    };
  }

  const next = updateSettings({ homeFolder: result.filePaths[0] });
  return {
    enabled: true,
    homeFolder: next.homeFolder,
    deleteOriginals: Boolean(next.deleteCameraOriginals),
    autoSortImports: Boolean(next.autoSortImports),
    autoSortAsk: next.autoSortAsk !== false,
    autoSortStatus: next.autoSortImports ? "Approved" : "Off",
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
    autoSortImports: Boolean(next.autoSortImports),
    autoSortAsk: next.autoSortAsk !== false,
    autoSortStatus: next.autoSortImports ? "Approved" : "Off",
    status: next.deleteCameraOriginals ? "Delete after import on" : "Keep camera originals",
  };
});

ipcMain.handle("library:set-auto-sort", (_event, options = {}) => {
  const next = updateSettings({
    autoSortImports: Boolean(options.autoSortImports),
    autoSortAsk: options.autoSortAsk !== false,
  });
  return {
    enabled: true,
    homeFolder: next.homeFolder,
    deleteOriginals: Boolean(next.deleteCameraOriginals),
    autoSortImports: Boolean(next.autoSortImports),
    autoSortAsk: next.autoSortAsk !== false,
    autoSortStatus: next.autoSortImports ? "Approved" : "Off",
    status: next.autoSortImports ? "Auto sort ready" : "Auto sort off",
  };
});

ipcMain.handle("library:scan-cameras", async () => {
  const devices = await scanCameraDevices({ forcePortableScan: true });
  return devices.map(publicCameraDevice);
});

ipcMain.handle("library:ignore-camera", (_event, deviceId) => {
  if (deviceId) ignoredCameraIds.add(deviceId);
  return { status: "Camera ignored" };
});

ipcMain.handle("library:import-camera", (_event, options = {}) => {
  return importCameraPhotos(options.deviceId, {
    deleteOriginals: Boolean(options.deleteOriginals),
    autoSortApproved: Boolean(options.autoSortApproved),
  });
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
