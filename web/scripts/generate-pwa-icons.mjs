// Generate PWA PNG icons from src/app/icon.svg.
// Outputs public/icon-192.png, public/icon-512.png, src/app/apple-icon.png.
// Run: node scripts/generate-pwa-icons.mjs

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const svgPath = "src/app/icon.svg";
const raw = await readFile(svgPath, "utf8");

const svg = raw.replace(/<svg([^>]*)>/, '<svg$1 preserveAspectRatio="xMidYMid meet">');

const outputs = [
  { size: 192, path: "public/icon-192.png" },
  { size: 512, path: "public/icon-512.png" },
  { size: 180, path: "src/app/apple-icon.png" },
];

for (const { size, path } of outputs) {
  const png = await sharp(Buffer.from(svg), { density: Math.ceil((size / 32) * 96) })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path, png);
  console.log(`wrote ${path} (${size}x${size})`);
}
