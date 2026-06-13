import fs from "node:fs/promises";
import path from "node:path";

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

const manifest = {
  app: "ITSZ's Studio",
  version: process.env.RELEASE_VERSION?.replace(/^v/, "") || packageJson.version,
  generatedAt: new Date().toISOString(),
  updateFeed: `${baseUrl}/`,
  installers: {
    windows: {
      installer: urlFor(windowsSetup),
      portable: urlFor(windowsPortable),
      latest: urlFor(find(/^latest\.yml$/i)),
    },
    linux: {
      appImage: urlFor(find(/\.AppImage$/i)),
      deb: urlFor(find(/\.deb$/i)),
      rpm: urlFor(find(/\.rpm$/i)),
      latest: urlFor(find(/^latest-linux\.yml$/i)),
    },
  },
};

await fs.writeFile(path.join(downloadsDir, "updates.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared Pages downloads for ${manifest.version}`);
