import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import sharp from "sharp";

const PHOTO_EXTENSIONS = new Set([
  ".3fr", ".arw", ".avif", ".bmp", ".cr2", ".cr3", ".crw", ".dib", ".dng",
  ".erf", ".fff", ".gif", ".heic", ".heif", ".hif", ".iiq", ".j2k", ".jpe",
  ".jpeg", ".jpg", ".jpf", ".jp2", ".jxl", ".kdc", ".mef", ".mos", ".mrw",
  ".nef", ".nrw", ".orf", ".pef", ".png", ".ptx", ".raf", ".raw", ".rw2",
  ".rwl", ".sr2", ".srf", ".srw", ".svg", ".tif", ".tiff", ".webp", ".x3f",
]);
const RAW_EXTENSIONS = new Set([
  ".3fr", ".arw", ".cr2", ".cr3", ".crw", ".dng", ".erf", ".fff", ".hif",
  ".iiq", ".kdc", ".mef", ".mos", ".mrw", ".nef", ".nrw", ".orf", ".pef",
  ".ptx", ".raf", ".raw", ".rw2", ".rwl", ".sr2", ".srf", ".srw", ".x3f",
]);
const JPEG_EXTENSIONS = new Set([".jpe", ".jpeg", ".jpg"]);
const FAST_METADATA_EXTENSIONS = new Set([".avif", ".bmp", ".dib", ".gif", ".jpe", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"]);
const VISUAL_RECOGNITION_EXTENSIONS = new Set([".avif", ".bmp", ".dib", ".jpe", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"]);
const GENERIC_SCENE_KEYS = new Set(["photo", "raw", "jpg", "other"]);
const RECOGNITION_CACHE_VERSION = 3;
const RECOGNITION_SAMPLE_SIZE = 48;
const CACHE_DIR_NAMES = new Set([
  ".git",
  ".ts",
  ".cache",
  ".thumbnail",
  ".thumbnails",
  "$recycle.bin",
  "system volume information",
  "_itsz sort test",
  "_itsz sorted",
]);

const DEFAULT_ROOT = "F:\\Dropbox\\Media\\Pictures";

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    mode: "plan",
    batchLimit: 32,
    batchMaxMb: 300,
    metadataLimit: 250,
    recognitionLimit: 400,
    noRecognition: false,
    includeDotFolders: false,
    reportDir: "",
    cachePath: "",
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = argv[++index] || options.root;
    else if (arg === "--mode") options.mode = argv[++index] || options.mode;
    else if (arg === "--batch-limit") options.batchLimit = Number(argv[++index] || options.batchLimit);
    else if (arg === "--batch-max-mb") options.batchMaxMb = Number(argv[++index] || options.batchMaxMb);
    else if (arg === "--metadata-limit") options.metadataLimit = Number(argv[++index] || options.metadataLimit);
    else if (arg === "--recognition-limit") options.recognitionLimit = Number(argv[++index] || options.recognitionLimit);
    else if (arg === "--no-recognition") options.noRecognition = true;
    else if (arg === "--report-dir") options.reportDir = argv[++index] || "";
    else if (arg === "--cache-path") options.cachePath = argv[++index] || "";
    else if (arg === "--include-dot-folders") options.includeDotFolders = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  options.root = path.resolve(options.root);
  if (!["plan", "test-copy", "move-smart", "move-semantic"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/photo-library-sort.mjs --mode plan
  node scripts/photo-library-sort.mjs --mode test-copy --batch-limit 32
  node scripts/photo-library-sort.mjs --mode move-smart --execute
  node scripts/photo-library-sort.mjs --mode move-semantic --execute

Options:
  --root <path>            Photo library root. Default: ${DEFAULT_ROOT}
  --mode <plan|test-copy|move-smart|move-semantic>
  --batch-limit <count>    Test-copy file count. Default: 32
  --batch-max-mb <mb>      Test-copy byte cap. Default: 300
  --metadata-limit <count> Max safe image metadata reads. Default: 250
  --recognition-limit <n>  Max local visual recognitions. Default: 400
  --no-recognition         Use names/folders/dates only
  --cache-path <path>      Recognition cache JSON path
  --include-dot-folders    Include cache/dot folders such as .ts
  --report-dir <path>      Report output folder
  --execute                Required for move-smart and move-semantic`);
}

function isPhotoPath(filePath) {
  return PHOTO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isRaw(filePath) {
  return RAW_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isJpeg(filePath) {
  return JPEG_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function sanitizeSegment(value, fallback = "Unknown") {
  const safe = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return safe || fallback;
}

function shouldSkipDirectory(dirent, options) {
  const name = dirent.name.toLowerCase();
  if (!options.includeDotFolders && dirent.name.startsWith(".")) return true;
  return CACHE_DIR_NAMES.has(name);
}

async function scanPhotos(root, options) {
  const files = [];
  const skippedDirectories = [];

  async function walk(directory) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      skippedDirectories.push({ path: directory, reason: error.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry, options)) {
          skippedDirectories.push({ path: fullPath, reason: "cache-or-dot-folder" });
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile() && isPhotoPath(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return { files: files.sort((left, right) => left.localeCompare(right)), skippedDirectories };
}

function dateFromName(name) {
  const patterns = [
    /(?:PXL_|IMG_|VID_|Screenshot[_ -]?)(\d{4})(\d{2})(\d{2})[_ -]?(\d{2})?(\d{2})?(\d{2})?/i,
    /^(\d{4})(\d{2})(\d{2})[_ -]?(\d{2})?(\d{2})?(\d{2})?/,
    /^(\d{4})[-_. ](\d{2})[-_. ](\d{2})(?:[ T_.-](\d{2})[._-](\d{2})[._-](\d{2}))?/,
  ];

  for (const pattern of patterns) {
    const match = String(name).match(pattern);
    if (!match) continue;
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(year)) {
      return { date, source: "filename" };
    }
  }
  return null;
}

function dateFromFolder(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const match = normalized.match(/(?:^|\/)(\d{4})[-_](\d{2})[-_](\d{2})(?:\/|$)/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return { date, source: "folder" };
}

function dateFromExifBuffer(buffer) {
  if (!buffer) return null;
  const text = buffer.toString("latin1");
  const match = text.match(/(20\d{2}|19\d{2}):([01]\d):([0-3]\d)\s+([0-2]\d):([0-5]\d):([0-5]\d)/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (Number.isNaN(date.getTime())) return null;
  return { date, source: "exif" };
}

async function readImageMetadata(filePath) {
  try {
    const metadata = await sharp(filePath, { failOn: "none", limitInputPixels: false }).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      camera: [metadata.exif?.make, metadata.exif?.model].filter(Boolean).join(" ").trim(),
      exifDate: dateFromExifBuffer(metadata.exif),
      metadataReadable: true,
    };
  } catch {
    return {
      width: 0,
      height: 0,
      camera: "",
      exifDate: null,
      metadataReadable: false,
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lumaAt(data, index) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function analyzeRecognitionMetrics(data, size) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;
  let luma = 0;
  let greenPixels = 0;
  let bluePixels = 0;
  let skyPixels = 0;
  let skinPixels = 0;
  let centerSkinPixels = 0;
  let grayPixels = 0;
  let warmPixels = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let edgeEnergy = 0;
  let centerPixels = 0;
  const total = size * size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const inCenter = x > size * 0.25 && x < size * 0.75 && y > size * 0.14 && y < size * 0.72;

      red += r;
      green += g;
      blue += b;
      saturation += sat;
      luma += lum;
      if (g > r * 1.08 && g > b * 1.08 && sat > 0.16) greenPixels += 1;
      if (b > r * 1.08 && b > g * 1.03 && sat > 0.12) bluePixels += 1;
      if (b > 92 && g > 84 && b > r * 1.08 && lum > 86) skyPixels += 1;
      if (r > 72 && g > 44 && b > 28 && r > g * 1.05 && g > b * 1.04 && sat > 0.18 && sat < 0.72) {
        skinPixels += 1;
        if (inCenter) centerSkinPixels += 1;
      }
      if (sat < 0.13) grayPixels += 1;
      if (r > g * 1.08 && r > b * 1.16 && sat > 0.25) warmPixels += 1;
      if (lum < 58) darkPixels += 1;
      if (lum > 202) brightPixels += 1;
      if (inCenter) centerPixels += 1;

      if (x > 0 && y > 0) {
        const left = lumaAt(data, index - 4);
        const up = lumaAt(data, index - size * 4);
        edgeEnergy += Math.min(80, Math.abs(lum - left) + Math.abs(lum - up));
      }
    }
  }

  return {
    avgRed: red / total,
    avgGreen: green / total,
    avgBlue: blue / total,
    avgLuma: luma / total,
    avgSaturation: saturation / total,
    greenRatio: greenPixels / total,
    blueRatio: bluePixels / total,
    skyRatio: skyPixels / total,
    skinRatio: skinPixels / total,
    centerSkinRatio: centerPixels ? centerSkinPixels / centerPixels : 0,
    grayRatio: grayPixels / total,
    warmRatio: warmPixels / total,
    darkRatio: darkPixels / total,
    brightRatio: brightPixels / total,
    edgeScore: edgeEnergy / Math.max(1, total - size * 2),
  };
}

function makeSemanticRecord(scene, sceneKey, labels = [], confidence = 0.5, source = "rules", metrics = {}) {
  return {
    scene,
    sceneKey,
    labels: Array.from(new Set([sceneKey, ...labels].filter(Boolean))),
    confidence: clamp(confidence, 0.1, 0.98),
    source,
    metrics,
  };
}

function classifyTextScene(relativePath, category) {
  const text = String(relativePath || "").toLowerCase();
  if (category === "Screenshots") return makeSemanticRecord("Screenshots", "screenshots", ["screen"], 0.98, "path");
  if (category === "Edited") return makeSemanticRecord("Edited Photos", "edited", ["edited"], 0.9, "path");
  if (/theat(er|re)|cinema|movie|stage|auditorium|concert|performance|play\b/.test(text)) {
    return makeSemanticRecord("Theater", "theater", ["event", "indoor"], 0.86, "path");
  }
  if (/vacation|trip|travel|beach|ocean|sea|lake|river|boat|cruise|pool|shore|marina|island|water/.test(text)) {
    return makeSemanticRecord("Water Vacation", "water-vacation", ["water", "travel"], 0.84, "path");
  }
  if (/park|trail|hike|woods|forest|garden|camp|mountain|nature|outdoor/.test(text)) {
    return makeSemanticRecord("Nature", "nature", ["outdoors"], 0.76, "path");
  }
  if (/receipt|scan|document|paper|note/.test(text)) return makeSemanticRecord("Documents", "documents", ["paper"], 0.82, "path");
  if (/portrait|family|people|person|group/.test(text)) return makeSemanticRecord("People", "people", ["faces"], 0.72, "path");
  if (category === "RAW") return makeSemanticRecord("RAW Photos", "raw", ["raw"], 0.35, "type");
  if (category === "JPG") return makeSemanticRecord("Photos", "photo", ["jpg"], 0.35, "type");
  return makeSemanticRecord("Photos", "photo", ["general"], 0.3, "type");
}

function classifyVisualScene(metrics, relativePath) {
  const text = String(relativePath || "").toLowerCase();
  const waterEvidence = metrics.blueRatio > 0.2 && metrics.avgBlue > metrics.avgRed * 1.05 && metrics.avgSaturation > 0.16;
  const theaterText = /theat(er|re)|cinema|movie|stage|auditorium|concert|performance|play\b/.test(text);
  const theaterVisual = metrics.darkRatio > 0.52 && metrics.warmRatio > 0.13 && metrics.blueRatio < 0.14 && metrics.skyRatio < 0.05 && metrics.edgeScore > 12;

  if (theaterText) {
    return makeSemanticRecord(
      "Theater",
      "theater",
      ["indoor", "low-light", "event"],
      0.88,
      "path",
      metrics,
    );
  }

  if (/vacation|trip|travel|beach|ocean|sea|lake|river|boat|cruise|pool|shore|marina|island|water/.test(text) || waterEvidence) {
    return makeSemanticRecord(
      "Water Vacation",
      "water-vacation",
      ["water", metrics.skyRatio > 0.08 ? "sky" : "", "outdoors"],
      waterEvidence ? clamp(0.52 + metrics.blueRatio + metrics.skyRatio * 0.25, 0.5, 0.9) : 0.84,
      waterEvidence ? "visual" : "path",
      metrics,
    );
  }

  if (theaterVisual) {
    return makeSemanticRecord(
      "Theater",
      "theater",
      ["indoor", "low-light", "event"],
      clamp(0.52 + metrics.darkRatio * 0.32 + metrics.warmRatio, 0.5, 0.82),
      "visual",
      metrics,
    );
  }

  if (metrics.greenRatio > 0.17 || (metrics.greenRatio + metrics.skyRatio > 0.28 && metrics.avgSaturation > 0.15)) {
    return makeSemanticRecord(
      "Nature",
      "nature",
      ["outdoors", metrics.skyRatio > 0.08 ? "sky" : "", metrics.greenRatio > 0.22 ? "trees" : ""],
      clamp(0.52 + metrics.greenRatio + metrics.skyRatio * 0.55, 0.45, 0.9),
      "visual",
      metrics,
    );
  }

  if (metrics.skinRatio > 0.07 || metrics.centerSkinRatio > 0.05) {
    return makeSemanticRecord(
      metrics.centerSkinRatio > 0.08 ? "Portraits" : "People",
      "people",
      ["people", metrics.centerSkinRatio > 0.08 ? "portrait" : ""],
      clamp(0.46 + metrics.skinRatio * 2.0 + metrics.centerSkinRatio, 0.42, 0.88),
      "visual",
      metrics,
    );
  }

  if ((metrics.brightRatio > 0.32 && metrics.grayRatio > 0.38) || /scan|doc|receipt|paper|note/.test(text)) {
    return makeSemanticRecord("Documents", "documents", ["paper"], clamp(0.54 + metrics.brightRatio * 0.5, 0.45, 0.88), "visual", metrics);
  }

  if (metrics.darkRatio > 0.46 || metrics.avgLuma < 68 || /night|dark|neon/.test(text)) {
    return makeSemanticRecord("Night", "night", ["low-light"], clamp(0.55 + metrics.darkRatio * 0.5, 0.48, 0.9), "visual", metrics);
  }

  if ((metrics.grayRatio > 0.42 && metrics.edgeScore > 14) || /street|building|city|urban|architecture/.test(text)) {
    return makeSemanticRecord("City / Structure", "city", ["structure"], clamp(0.48 + metrics.grayRatio * 0.45 + metrics.edgeScore / 100, 0.42, 0.84), "visual", metrics);
  }

  if (metrics.warmRatio > 0.18 && metrics.avgSaturation > 0.2) {
    return makeSemanticRecord("Indoor / Objects", "objects", ["indoor"], clamp(0.46 + metrics.warmRatio, 0.42, 0.78), "visual", metrics);
  }

  return makeSemanticRecord("Photos", "photo", metrics.avgSaturation < 0.12 ? ["neutral"] : ["general"], 0.42, "visual", metrics);
}

async function recognizeVisual(filePath, relativePath) {
  const { data, info } = await sharp(filePath, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize(RECOGNITION_SAMPLE_SIZE, RECOGNITION_SAMPLE_SIZE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const metrics = analyzeRecognitionMetrics(data, info.width || RECOGNITION_SAMPLE_SIZE);
  return classifyVisualScene(metrics, relativePath);
}

function chooseSemantic(textScene, visualScene) {
  if (!visualScene) return textScene;
  if (textScene && textScene.confidence >= 0.8 && !GENERIC_SCENE_KEYS.has(textScene.sceneKey)) return textScene;
  if (visualScene.confidence >= 0.5 && !GENERIC_SCENE_KEYS.has(visualScene.sceneKey)) return visualScene;
  if (textScene && !GENERIC_SCENE_KEYS.has(textScene.sceneKey)) return textScene;
  return visualScene.confidence >= textScene.confidence ? visualScene : textScene;
}

function recognitionCacheKey(filePath, stats) {
  return `${path.resolve(filePath).toLowerCase()}|${stats.size}|${Math.round(stats.mtimeMs)}`;
}

async function loadRecognitionCache(cachePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf8"));
    if (parsed.version === RECOGNITION_CACHE_VERSION && parsed.entries && typeof parsed.entries === "object") return parsed;
  } catch {
    // Missing or invalid cache just means this run starts cold.
  }
  return { version: RECOGNITION_CACHE_VERSION, entries: {} };
}

async function saveRecognitionCache(cachePath, cache) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function formatDatePart(date, part) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (part === "year") return String(year);
  if (part === "month") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function classifyPhoto(filePath, relativePath, metadata) {
  const extension = path.extname(filePath).toLowerCase();
  const text = `${relativePath} ${path.basename(filePath)}`.toLowerCase();
  if (text.includes("screenshot") || text.includes("screen shot") || text.includes("snip")) return "Screenshots";
  if (text.includes("edited") || text.includes("-edit") || text.includes("_edit") || text.includes("clean")) return "Edited";
  if (isRaw(filePath)) return "RAW";
  if (isJpeg(filePath)) return "JPG";
  if ([".png", ".webp", ".gif", ".bmp", ".avif"].includes(extension)) return "Web and PNG";
  if (metadata.width && metadata.height && metadata.width >= 3000 && metadata.height >= 2000) return "Photos";
  return "Other Photos";
}

function pairStem(name) {
  return String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_ ]?(edited|edit|clean|copy|\(\d+\)|~\d+)$/i, "")
    .toLowerCase();
}

function sourceCluster(relativePath) {
  const parts = String(relativePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return "Root";
  return parts[0];
}

function semanticStrength(record) {
  if (!record || GENERIC_SCENE_KEYS.has(record.semanticKey)) return 0;
  return Number(record.semanticConfidence) || 0;
}

function applySemantic(record, semantic, reason) {
  record.semanticScene = semantic.scene;
  record.semanticKey = semantic.sceneKey;
  record.semanticLabels = semantic.labels.join(";");
  record.semanticConfidence = semantic.confidence;
  record.recognitionSource = semantic.source;
  record.groupingReason = reason || semantic.source;
}

function strongestSemantic(records) {
  const weighted = new Map();
  const exemplars = new Map();
  for (const record of records) {
    const strength = semanticStrength(record);
    if (!strength) continue;
    weighted.set(record.semanticKey, (weighted.get(record.semanticKey) || 0) + strength);
    if (!exemplars.has(record.semanticKey) || semanticStrength(record) > semanticStrength(exemplars.get(record.semanticKey))) {
      exemplars.set(record.semanticKey, record);
    }
  }
  const [key, score] = [...weighted.entries()].sort((left, right) => right[1] - left[1])[0] || [];
  if (!key) return null;
  const exemplar = exemplars.get(key);
  return {
    scene: exemplar.semanticScene,
    sceneKey: exemplar.semanticKey,
    labels: String(exemplar.semanticLabels || "").split(";").filter(Boolean),
    confidence: clamp(score / Math.max(1, records.length), 0.45, 0.94),
    source: "correlated",
  };
}

function correlateSemanticEvents(records) {
  const pairGroups = new Map();
  for (const record of records) {
    const key = `${record.captureDateText || "unknown"}::${sourceCluster(record.relativePath)}::${pairStem(record.name)}`;
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key).push(record);
  }

  for (const group of pairGroups.values()) {
    const semantic = strongestSemantic(group);
    if (!semantic) continue;
    for (const record of group) {
      if (semanticStrength(record) < semantic.confidence) applySemantic(record, semantic, "raw-jpg-pair");
    }
  }

  const eventGroups = new Map();
  for (const record of records) {
    const key = `${record.captureDateText || "Unknown Date"}::${sourceCluster(record.relativePath)}`;
    if (!eventGroups.has(key)) eventGroups.set(key, []);
    eventGroups.get(key).push(record);
  }

  for (const group of eventGroups.values()) {
    if (group.length < 3) continue;
    const semantic = strongestSemantic(group);
    if (!semantic || semantic.confidence < 0.42) continue;
    const count = group.filter((record) => record.semanticKey === semantic.sceneKey).length;
    if (count < 2 && count / group.length < 0.35) continue;
    for (const record of group) {
      if (record.semanticKey === "screenshots" || record.semanticKey === "documents") continue;
      if (semanticStrength(record) < 0.58 || GENERIC_SCENE_KEYS.has(record.semanticKey)) applySemantic(record, semantic, "same-day-event");
    }
  }

  for (const record of records) {
    record.eventName = `${record.semanticScene} - ${record.captureDateText || "Unknown Date"}`;
    record.eventCluster = sourceCluster(record.relativePath);
  }
}

function chooseCaptureDate(filePath, relativePath, stats, metadata) {
  return (
    dateFromName(path.basename(filePath)) ||
    metadata.exifDate ||
    dateFromFolder(relativePath) ||
    { date: stats.mtime, source: "modified" }
  );
}

function uniqueDestination(destination, seen) {
  const parsed = path.parse(destination);
  const key = destination.toLowerCase();
  const current = seen.get(key) || 0;
  if (!current) {
    seen.set(key, 1);
    return { destination, collision: false };
  }

  let index = current + 1;
  let next = "";
  do {
    next = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  } while (seen.has(next.toLowerCase()));
  seen.set(key, current + 1);
  seen.set(next.toLowerCase(), 1);
  return { destination: next, collision: true };
}

function buildFlattenPlan(records, root) {
  const seen = new Map();
  return records.map((record) => {
    const target = path.join(root, path.basename(record.source));
    const resolved = uniqueDestination(target, seen);
    return { ...record, target: resolved.destination, collision: resolved.collision, strategy: "flatten" };
  });
}

function buildSmartPlan(records, root) {
  const seen = new Map();
  return records.map((record) => {
    const date = record.captureDate;
    const year = date ? formatDatePart(date, "year") : "Unknown Date";
    const day = date ? formatDatePart(date, "day") : "Unknown Date";
    const category = sanitizeSegment(record.category, "Other Photos");
    const target = path.join(root, year, day, category, path.basename(record.source));
    const resolved = uniqueDestination(target, seen);
    return { ...record, target: resolved.destination, collision: resolved.collision, strategy: "smart" };
  });
}

function semanticBucket(record) {
  if (record.semanticKey === "screenshots" || record.semanticKey === "documents" || record.semanticKey === "edited") return "Files";
  return sanitizeSegment(record.category, "Files");
}

function buildSemanticPlan(records, root) {
  const seen = new Map();
  return records.map((record) => {
    const date = record.captureDateText || "Unknown Date";
    const scene = sanitizeSegment(record.semanticScene || "Photos", "Photos");
    const bucket = sanitizeSegment(semanticBucket(record), "Files");
    const target = path.join(root, scene, date, bucket, path.basename(record.source));
    const resolved = uniqueDestination(target, seen);
    return { ...record, target: resolved.destination, collision: resolved.collision, strategy: "semantic" };
  });
}

async function buildRecords(files, root, options, cache) {
  const records = [];
  let metadataReads = 0;
  let recognitionReads = 0;
  let recognitionCacheHits = 0;
  for (const filePath of files) {
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(root, filePath);
    const extension = path.extname(filePath).toLowerCase();
    const readMetadata = metadataReads < options.metadataLimit && FAST_METADATA_EXTENSIONS.has(extension);
    const metadata = readMetadata
      ? await readImageMetadata(filePath)
      : { width: 0, height: 0, camera: "", exifDate: null, metadataReadable: false };
    if (readMetadata) metadataReads += 1;
    const capture = chooseCaptureDate(filePath, relativePath, stats, metadata);
    const category = classifyPhoto(filePath, relativePath, metadata);
    const textScene = classifyTextScene(relativePath, category);
    let visualScene = null;
    const canRecognize = !options.noRecognition && VISUAL_RECOGNITION_EXTENSIONS.has(extension);
    const cacheKey = recognitionCacheKey(filePath, stats);
    if (canRecognize && cache.entries[cacheKey]) {
      visualScene = cache.entries[cacheKey];
      recognitionCacheHits += 1;
    } else if (canRecognize && recognitionReads < options.recognitionLimit) {
      try {
        visualScene = await recognizeVisual(filePath, relativePath);
        cache.entries[cacheKey] = visualScene;
      } catch {
        visualScene = null;
      }
      recognitionReads += 1;
    }
    const semantic = chooseSemantic(textScene, visualScene);
    records.push({
      source: filePath,
      relativePath,
      name: path.basename(filePath),
      extension,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      captureDate: capture.date,
      captureDateText: capture.date ? formatDatePart(capture.date, "day") : "",
      dateSource: capture.source,
      category,
      width: metadata.width,
      height: metadata.height,
      metadataReadable: metadata.metadataReadable,
      semanticScene: semantic.scene,
      semanticKey: semantic.sceneKey,
      semanticLabels: semantic.labels.join(";"),
      semanticConfidence: semantic.confidence,
      recognitionSource: semantic.source,
      groupingReason: semantic.source,
    });
  }
  records.stats = { metadataReads, recognitionReads, recognitionCacheHits };
  correlateSemanticEvents(records);
  return records;
}

function csvEscape(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeCsv(filePath, rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function summarizePlan(plan) {
  const byCategory = new Map();
  const byDateSource = new Map();
  const bySemanticScene = new Map();
  const byRecognitionSource = new Map();
  const byGroupingReason = new Map();
  let bytes = 0;
  let collisions = 0;
  let nested = 0;
  let metadataReadable = 0;

  for (const row of plan) {
    bytes += row.size;
    if (row.collision) collisions += 1;
    if (path.dirname(row.relativePath) !== ".") nested += 1;
    if (row.metadataReadable) metadataReadable += 1;
    byCategory.set(row.category, (byCategory.get(row.category) || 0) + 1);
    byDateSource.set(row.dateSource, (byDateSource.get(row.dateSource) || 0) + 1);
    if (row.semanticScene) bySemanticScene.set(row.semanticScene, (bySemanticScene.get(row.semanticScene) || 0) + 1);
    if (row.recognitionSource) byRecognitionSource.set(row.recognitionSource, (byRecognitionSource.get(row.recognitionSource) || 0) + 1);
    if (row.groupingReason) byGroupingReason.set(row.groupingReason, (byGroupingReason.get(row.groupingReason) || 0) + 1);
  }

  return {
    files: plan.length,
    nested,
    rootLevel: plan.length - nested,
    totalBytes: bytes,
    totalGb: Number((bytes / 1024 / 1024 / 1024).toFixed(2)),
    metadataReadable,
    collisions,
    byCategory: Object.fromEntries([...byCategory.entries()].sort((a, b) => b[1] - a[1])),
    byDateSource: Object.fromEntries([...byDateSource.entries()].sort((a, b) => b[1] - a[1])),
    bySemanticScene: Object.fromEntries([...bySemanticScene.entries()].sort((a, b) => b[1] - a[1])),
    byRecognitionSource: Object.fromEntries([...byRecognitionSource.entries()].sort((a, b) => b[1] - a[1])),
    byGroupingReason: Object.fromEntries([...byGroupingReason.entries()].sort((a, b) => b[1] - a[1])),
  };
}

function chooseBatch(records, options) {
  const nested = records
    .filter((record) => path.dirname(record.relativePath) !== ".")
    .sort((left, right) => {
      const folderCompare = path.dirname(left.relativePath).localeCompare(path.dirname(right.relativePath));
      return folderCompare || left.name.localeCompare(right.name);
    });
  const selected = [];
  let bytes = 0;
  const maxBytes = options.batchMaxMb * 1024 * 1024;
  const seenCategories = new Set();

  for (const record of nested) {
    if (selected.length >= options.batchLimit) break;
    if (bytes + record.size > maxBytes && selected.length > 0) continue;
    const categoryBonus = seenCategories.has(record.category) ? 0 : 1;
    if (!categoryBonus && selected.length < Math.floor(options.batchLimit / 2)) continue;
    selected.push(record);
    seenCategories.add(record.category);
    bytes += record.size;
  }

  for (const record of nested) {
    if (selected.length >= options.batchLimit) break;
    if (selected.includes(record)) continue;
    if (bytes + record.size > maxBytes && selected.length > 0) continue;
    selected.push(record);
    bytes += record.size;
  }

  return selected;
}

async function copyPlan(plan, destinationRoot, sourceRoot) {
  const resolvedRoot = path.resolve(destinationRoot);
  for (const item of plan) {
    const relativeTarget = path.relative(sourceRoot, item.target);
    const target = path.resolve(destinationRoot, relativeTarget);
    if (!target.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep)) {
      throw new Error(`Refusing to copy outside test root: ${target}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(item.source, target);
  }
}

async function movePlan(plan, root) {
  const resolvedRoot = path.resolve(root);
  for (const item of plan) {
    const target = path.resolve(item.target);
    if (!target.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep)) {
      throw new Error(`Refusing to move outside root: ${target}`);
    }
    if (path.resolve(item.source).toLowerCase() === target.toLowerCase()) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(item.source, target);
  }
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootStats = await fs.stat(options.root);
  if (!rootStats.isDirectory()) throw new Error(`Root is not a directory: ${options.root}`);

  const runId = makeRunId();
  const reportDir = path.resolve(options.reportDir || path.join(process.cwd(), "reports", "photo-sort", runId));
  await fs.mkdir(reportDir, { recursive: true });
  const cachePath = path.resolve(options.cachePath || path.join(process.cwd(), "reports", "photo-sort", `recognition-cache-v${RECOGNITION_CACHE_VERSION}.json`));
  const recognitionCache = await loadRecognitionCache(cachePath);

  const scan = await scanPhotos(options.root, options);
  const records = await buildRecords(scan.files, options.root, options, recognitionCache);
  await saveRecognitionCache(cachePath, recognitionCache);
  const flattenPlan = buildFlattenPlan(records, options.root);
  const smartPlan = buildSmartPlan(records, options.root);
  const semanticPlan = buildSemanticPlan(records, options.root);
  const batchRecords = chooseBatch(records, options);
  const batchFlatten = buildFlattenPlan(batchRecords, options.root);
  const batchSmart = buildSmartPlan(batchRecords, options.root);
  const batchSemantic = buildSemanticPlan(batchRecords, options.root);

  const columns = [
    "strategy",
    "relativePath",
    "category",
    "semanticScene",
    "semanticConfidence",
    "recognitionSource",
    "groupingReason",
    "eventName",
    "eventCluster",
    "captureDateText",
    "dateSource",
    "extension",
    "size",
    "metadataReadable",
    "collision",
    "target",
  ];
  await writeCsv(path.join(reportDir, "plan-flatten.csv"), flattenPlan, columns);
  await writeCsv(path.join(reportDir, "plan-smart.csv"), smartPlan, columns);
  await writeCsv(path.join(reportDir, "plan-semantic.csv"), semanticPlan, columns);
  await writeCsv(path.join(reportDir, "test-batch-smart.csv"), batchSmart, columns);
  await writeCsv(path.join(reportDir, "test-batch-flatten.csv"), batchFlatten, columns);
  await writeCsv(path.join(reportDir, "test-batch-semantic.csv"), batchSemantic, columns);

  let testCopyRoot = "";
  if (options.mode === "test-copy") {
    testCopyRoot = path.join(options.root, "_ITSZ Sort Test", runId);
    await copyPlan(batchFlatten, path.join(testCopyRoot, "flatten"), options.root);
    await copyPlan(batchSmart, path.join(testCopyRoot, "smart"), options.root);
    await copyPlan(batchSemantic, path.join(testCopyRoot, "semantic"), options.root);
  }

  if (options.mode === "move-smart") {
    if (!options.execute) {
      throw new Error("move-smart requires --execute. Run plan or test-copy first.");
    }
    await movePlan(smartPlan, options.root);
  }
  if (options.mode === "move-semantic") {
    if (!options.execute) {
      throw new Error("move-semantic requires --execute. Run plan or test-copy first.");
    }
    await movePlan(semanticPlan, options.root);
  }

  const summary = {
    runId,
    root: options.root,
    mode: options.mode,
    reportDir,
    skippedDirectories: scan.skippedDirectories,
    flattened: summarizePlan(flattenPlan),
    smart: summarizePlan(smartPlan),
    semantic: summarizePlan(semanticPlan),
    recognition: {
      cachePath,
      metadataReads: records.stats?.metadataReads || 0,
      visualReads: records.stats?.recognitionReads || 0,
      cacheHits: records.stats?.recognitionCacheHits || 0,
      limit: options.noRecognition ? 0 : options.recognitionLimit,
    },
    testBatch: {
      files: batchSemantic.length,
      totalMb: Number((batchSemantic.reduce((sum, row) => sum + row.size, 0) / 1024 / 1024).toFixed(2)),
      copiedTo: testCopyRoot,
    },
    recommendation: {
      use: "semantic",
      reason: "Semantic sorting keeps the date/type protection from smart sorting, then promotes recognizable events such as Water Vacation, Theater, Nature, People, Screenshots, and Documents before the date folder.",
    },
  };

  await fs.writeFile(path.join(reportDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
