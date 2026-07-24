import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.resolve(process.env.MANIFEST_PATH || path.join(root, "site", "downloads", "updates.json"));
const downloadsDir = path.dirname(manifestPath);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const expectedVersion = String(process.env.RELEASE_VERSION || "").replace(/^v/, "");

if (expectedVersion && manifest.version !== expectedVersion) {
  throw new Error(`Manifest version ${manifest.version} does not match ${expectedVersion}`);
}
if (manifest.verification?.algorithm !== "sha256") {
  throw new Error("Manifest verification algorithm must be sha256");
}

const requiredArtifacts = [
  "windowsInstaller",
  "windowsPortable",
  "linuxAppImage",
  "linuxDeb",
  "linuxRpm",
  "windowsLatest",
  "linuxLatest",
];

for (const key of requiredArtifacts) {
  const record = manifest.verification.artifacts?.[key];
  if (!record?.url || !Number.isSafeInteger(record.bytes) || record.bytes <= 0 || !/^[a-f0-9]{64}$/.test(record.sha256 || "")) {
    throw new Error(`Incomplete verification record: ${key}`);
  }
  const fileName = decodeURIComponent(new URL(record.url).pathname.split("/").pop());
  const filePath = path.join(downloadsDir, fileName);
  const content = await fs.readFile(filePath);
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.length !== record.bytes) {
    throw new Error(`${key} byte count mismatch`);
  }
  if (actualSha256 !== record.sha256) {
    throw new Error(`${key} SHA-256 mismatch`);
  }
}

const installerLinks = [
  manifest.installers?.windows?.installer,
  manifest.installers?.windows?.portable,
  manifest.installers?.windows?.latest,
  manifest.installers?.linux?.appImage,
  manifest.installers?.linux?.deb,
  manifest.installers?.linux?.rpm,
  manifest.installers?.linux?.latest,
];
if (installerLinks.some((url) => !url)) {
  throw new Error("Manifest is missing one or more platform download URLs");
}

console.log(`Verified ${requiredArtifacts.length} ITSZ Studio ${manifest.version} release artifacts.`);
