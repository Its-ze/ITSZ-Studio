import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const siteDir = path.join(root, "site");
const downloadsDir = path.join(siteDir, "downloads");
const releasesDir = path.join(downloadsDir, "releases");
const baseUrl = (process.env.PAGES_BASE_URL || "https://its-ze.github.io/ITSZ-Studio/downloads").replace(/\/$/, "");

await fs.mkdir(downloadsDir, { recursive: true });

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath);
      return [fullPath];
    }));
    return files.flat();
  } catch {
    return [];
  }
}

const releaseFiles = await listFiles(releasesDir);
for (const file of releaseFiles) {
  const fileName = path.basename(file);
  await fs.copyFile(file, path.join(downloadsDir, fileName));
}

const downloadFiles = await listFiles(downloadsDir);
const names = downloadFiles.map((file) => path.basename(file));
const find = (pattern) => names.find((name) => pattern.test(name));
const urlFor = (name) => name ? `${baseUrl}/${encodeURIComponent(name)}` : "";
const windowsSetup = find(/setup.*\.exe$/i) || names.find((name) => /\.exe$/i.test(name) && !/portable/i.test(name));
const windowsPortable = find(/portable.*\.exe$/i);
const linuxAppImage = find(/\.AppImage$/i);
const linuxDeb = find(/\.deb$/i);
const linuxRpm = find(/\.rpm$/i);
const windowsLatest = find(/^latest\.yml$/i);
const linuxLatest = find(/^latest-linux\.yml$/i);

async function describeArtifact(name) {
  if (!name) return { url: "", bytes: 0, sha256: "" };
  const file = downloadFiles.find((candidate) => path.basename(candidate) === name);
  if (!file) throw new Error(`Release artifact was listed but not found: ${name}`);
  const content = await fs.readFile(file);
  return {
    url: urlFor(name),
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

const artifacts = {
  windowsInstaller: await describeArtifact(windowsSetup),
  windowsPortable: await describeArtifact(windowsPortable),
  linuxAppImage: await describeArtifact(linuxAppImage),
  linuxDeb: await describeArtifact(linuxDeb),
  linuxRpm: await describeArtifact(linuxRpm),
  windowsLatest: await describeArtifact(windowsLatest),
  linuxLatest: await describeArtifact(linuxLatest),
};

const manifest = {
  app: "ITSZ's Studio",
  version: process.env.RELEASE_VERSION?.replace(/^v/, "") || packageJson.version,
  generatedAt: new Date().toISOString(),
  updateFeed: `${baseUrl}/`,
  installers: {
    windows: {
      installer: urlFor(windowsSetup),
      portable: urlFor(windowsPortable),
      latest: urlFor(windowsLatest),
    },
    linux: {
      appImage: urlFor(linuxAppImage),
      deb: urlFor(linuxDeb),
      rpm: urlFor(linuxRpm),
      latest: urlFor(linuxLatest),
    },
  },
  verification: {
    algorithm: "sha256",
    artifacts,
  },
};

await fs.writeFile(path.join(downloadsDir, "updates.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared Pages downloads for ${manifest.version}`);
