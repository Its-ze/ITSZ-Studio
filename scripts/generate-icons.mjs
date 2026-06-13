import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const svgPath = path.join(assetsDir, "icon.svg");
const pngPath = path.join(assetsDir, "icon.png");
const icoPath = path.join(assetsDir, "icon.ico");
const sizeDir = path.join(assetsDir, "icons");

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

await fs.mkdir(sizeDir, { recursive: true });
const svg = await fs.readFile(svgPath, "utf8");

for (const size of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(sizeDir, `${size}x${size}.png`));
}

await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(pngPath);
const icoBuffer = await pngToIco([16, 24, 32, 48, 64, 128, 256].map((size) => path.join(sizeDir, `${size}x${size}.png`)));
await fs.writeFile(icoPath, icoBuffer);

console.log(`Wrote ${path.relative(root, pngPath)} and ${path.relative(root, icoPath)}`);
