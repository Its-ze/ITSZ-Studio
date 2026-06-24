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
    includeDotFolders: false,
    reportDir: "",
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = argv[++index] || options.root;
    else if (arg === "--mode") options.mode = argv[++index] || options.mode;
    else if (arg === "--batch-limit") options.batchLimit = Number(argv[++index] || options.batchLimit);
    else if (arg === "--batch-max-mb") options.batchMaxMb = Number(argv[++index] || options.batchMaxMb);
    else if (arg === "--metadata-limit") options.metadataLimit = Number(argv[++index] || options.metadataLimit);
    else if (arg === "--report-dir") options.reportDir = argv[++index] || "";
    else if (arg === "--include-dot-folders") options.includeDotFolders = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  options.root = path.resolve(options.root);
  if (!["plan", "test-copy", "move-smart"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/photo-library-sort.mjs --mode plan
  node scripts/photo-library-sort.mjs --mode test-copy --batch-limit 32
  node scripts/photo-library-sort.mjs --mode move-smart --execute

Options:
  --root <path>            Photo library root. Default: ${DEFAULT_ROOT}
  --mode <plan|test-copy|move-smart>
  --batch-limit <count>    Test-copy file count. Default: 32
  --batch-max-mb <mb>      Test-copy byte cap. Default: 300
  --metadata-limit <count> Max safe image metadata reads. Default: 250
  --include-dot-folders    Include cache/dot folders such as .ts
  --report-dir <path>      Report output folder
  --execute                Required for move-smart`);
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

async function buildRecords(files, root, options) {
  const records = [];
  let metadataReads = 0;
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
    });
  }
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

  const scan = await scanPhotos(options.root, options);
  const records = await buildRecords(scan.files, options.root, options);
  const flattenPlan = buildFlattenPlan(records, options.root);
  const smartPlan = buildSmartPlan(records, options.root);
  const batchRecords = chooseBatch(records, options);
  const batchFlatten = buildFlattenPlan(batchRecords, options.root);
  const batchSmart = buildSmartPlan(batchRecords, options.root);

  const columns = [
    "strategy",
    "relativePath",
    "category",
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
  await writeCsv(path.join(reportDir, "test-batch-smart.csv"), batchSmart, columns);
  await writeCsv(path.join(reportDir, "test-batch-flatten.csv"), batchFlatten, columns);

  let testCopyRoot = "";
  if (options.mode === "test-copy") {
    testCopyRoot = path.join(options.root, "_ITSZ Sort Test", runId);
    await copyPlan(batchFlatten, path.join(testCopyRoot, "flatten"), options.root);
    await copyPlan(batchSmart, path.join(testCopyRoot, "smart"), options.root);
  }

  if (options.mode === "move-smart") {
    if (!options.execute) {
      throw new Error("move-smart requires --execute. Run plan or test-copy first.");
    }
    await movePlan(smartPlan, options.root);
  }

  const summary = {
    runId,
    root: options.root,
    mode: options.mode,
    reportDir,
    skippedDirectories: scan.skippedDirectories,
    flattened: summarizePlan(flattenPlan),
    smart: summarizePlan(smartPlan),
    testBatch: {
      files: batchSmart.length,
      totalMb: Number((batchSmart.reduce((sum, row) => sum + row.size, 0) / 1024 / 1024).toFixed(2)),
      copiedTo: testCopyRoot,
    },
    recommendation: {
      use: "smart",
      reason: "Flattening creates name collisions and removes useful date/type context; smart keeps capture-date folders, RAW/JPG separation, screenshots, edits, and unknown-date fallbacks.",
    },
  };

  await fs.writeFile(path.join(reportDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
