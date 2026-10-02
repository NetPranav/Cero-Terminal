/**
 * pack-ico.mjs — Pack multiple PNG files into a valid Microsoft Windows ICO file.
 *
 * An ICO file consists of:
 * - 6-byte header
 * - 16-byte directory entry per image
 * - Raw PNG byte payloads
 */

import * as fs from 'fs';

export function packIco(pngPaths, outPath) {
  const images = pngPaths.map(p => {
    const data = fs.readFileSync(p);
    // Parse PNG width and height from IHDR chunk (bytes 16..24)
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return {
      width,
      height,
      data
    };
  });

  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  let currentOffset = headerSize + numImages * dirEntrySize;

  const out = Buffer.alloc(currentOffset + images.reduce((acc, img) => acc + img.data.length, 0));

  // Write header: reserved (0), type (1 = icon), count (numImages)
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(numImages, 4);

  // Write directory entries
  let entryOffset = 6;
  for (const img of images) {
    const w = img.width >= 256 ? 0 : img.width;
    const h = img.height >= 256 ? 0 : img.height;
    out.writeUInt8(w, entryOffset);
    out.writeUInt8(h, entryOffset + 1);
    out.writeUInt8(0, entryOffset + 2); // Colors
    out.writeUInt8(0, entryOffset + 3); // Reserved
    out.writeUInt16LE(1, entryOffset + 4); // Color planes
    out.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    out.writeUInt32LE(img.data.length, entryOffset + 8); // Size
    out.writeUInt32LE(currentOffset, entryOffset + 12); // Offset

    // Copy PNG data
    img.data.copy(out, currentOffset);
    currentOffset += img.data.length;
    entryOffset += dirEntrySize;
  }

  fs.writeFileSync(outPath, out);
}

// CLI usage: node pack-ico.mjs out.ico in1.png in2.png ...
if (process.argv[1] && (process.argv[1].endsWith('pack-ico.mjs') || process.argv[1].endsWith('pack-ico.js'))) {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    const out = args[0];
    const inputs = args.slice(1);
    packIco(inputs, out);
  }
}
