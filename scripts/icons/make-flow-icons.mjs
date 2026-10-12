/**
 * make-flow-icons.mjs — High-precision rasterizer and generator for .flow icons.
 *
 * Renders all required icon sizes (16..1024) using high-quality 2D subpixel
 * anti-aliasing, packs flow.ico (Windows), generates flow.icns (macOS),
 * produces application-x-cero-workflow.svg (Linux), and creates the
 * contact sheet docs/brand/flow-icon-preview.png.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { packIco } from './pack-ico.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

const masterSvg = path.join(rootDir, 'assets/brand/flow-icon.svg');
const outDir = path.join(rootDir, 'src-tauri/icons/flow');
const docsBrandDir = path.join(rootDir, 'docs/brand');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(docsBrandDir, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

/**
 * Pure standard PNG encoder using Node zlib
 */
export function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    let crc = 0xFFFFFFFF;
    for (let i = 4; i < 8 + len; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
      }
    }
    buf.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, 8 + len);
    return buf;
  }

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    scanlines[y * (stride + 1)] = 0; // Filter None
    rgbaBuffer.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idatData = zlib.deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- 2D SDF Drawing Utilities ------------------------------------------------

function distPointToSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.hypot(dx, dy);
}

function distToRoundedBox(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const outside = Math.hypot(Math.max(0, dx), Math.max(0, dy)) - r;
  const inside = Math.min(Math.max(dx, dy), 0) - r;
  return dx > 0 || dy > 0 ? outside : inside;
}

function blendPixel(buf, idx, r, g, b, a) {
  if (a <= 0) return;
  const invA = 1 - a;
  const bgR = buf[idx];
  const bgG = buf[idx + 1];
  const bgB = buf[idx + 2];
  const bgA = buf[idx + 3] / 255;

  const outA = a + bgA * invA;
  if (outA > 0) {
    buf[idx] = Math.round((r * a + bgR * bgA * invA) / outA);
    buf[idx + 1] = Math.round((g * a + bgG * bgA * invA) / outA);
    buf[idx + 2] = Math.round((b * a + bgB * bgA * invA) / outA);
    buf[idx + 3] = Math.round(outA * 255);
  }
}

/**
 * Render the flow icon into an RGBA buffer at any width/height
 */
export function renderFlowIcon(targetSize) {
  const buf = Buffer.alloc(targetSize * targetSize * 4, 0);
  const scale = targetSize / 1024;
  const isSmall = targetSize < 48;

  const AA_RADIUS = 0.75 / scale;

  for (let py = 0; py < targetSize; py++) {
    const y1024 = (py + 0.5) / scale;
    for (let px = 0; px < targetSize; px++) {
      const x1024 = (px + 0.5) / scale;
      const idx = (py * targetSize + px) * 4;

      // 1. Page Body Geometry (Center: 512, 512; Half-size: 330, 410; Radius: 72)
      // Cut top-right corner from (652, 102) to (842, 292): line equation: (x - 652) + (y - 102) - 190 <= 0 -> x + y <= 944
      const dBox = distToRoundedBox(x1024, y1024, 512, 512, 330, 410, 72);
      const isAboveFoldCut = (x1024 + y1024) - 944; // > 0 is in the fold area

      // Dist to cut edge
      const cutEdgeDist = (x1024 + y1024 - 944) / Math.SQRT2;

      // Outer 6px dark contrast shadow
      const dOuter = Math.max(dBox - 6, isAboveFoldCut > 0 ? cutEdgeDist - 6 : -999);
      if (dOuter <= AA_RADIUS) {
        const aOuter = Math.max(0, Math.min(1, 0.5 - dOuter / AA_RADIUS)) * 0.35;
        blendPixel(buf, idx, 0, 0, 0, aOuter);
      }

      // Page Fill (#0c0d12) & 14px Border (rgba(255,255,255,0.18))
      if (dBox <= AA_RADIUS) {
        const inMainPage = isAboveFoldCut <= AA_RADIUS;
        if (inMainPage) {
          const cutFade = Math.max(0, Math.min(1, 0.5 - cutEdgeDist / AA_RADIUS));
          const boxFade = Math.max(0, Math.min(1, 0.5 - dBox / AA_RADIUS));
          const pageAlpha = boxFade * (1 - Math.max(0, Math.min(1, 0.5 + cutEdgeDist / AA_RADIUS)));

          // Page fill: #0c0d12
          blendPixel(buf, idx, 12, 13, 18, pageAlpha);

          // 14px border inside page
          const borderThickness = isSmall ? 18 : 14;
          const distFromBorder = Math.abs(dBox + borderThickness / 2) - borderThickness / 2;
          if (distFromBorder <= AA_RADIUS) {
            const bAlpha = Math.max(0, Math.min(1, 0.5 - distFromBorder / AA_RADIUS)) * (isSmall ? 0.25 : 0.18);
            blendPixel(buf, idx, 255, 255, 255, bAlpha * pageAlpha);
          }

          // Top inner highlight along top edge
          if (y1024 >= 108 && y1024 <= 114 && x1024 >= 254 && x1024 <= 640) {
            blendPixel(buf, idx, 255, 255, 255, 0.06);
          }
        }
      }

      // 2. Fold Flap: Triangle (652, 102), (652, 292), (842, 292)
      // inside when x >= 652 and y <= 292 and (x + y >= 944)
      const dFlapX = 652 - x1024;
      const dFlapY = y1024 - 292;
      const dFlapHypot = (944 - (x1024 + y1024)) / Math.SQRT2;
      const dFlap = Math.max(dFlapX, dFlapY, dFlapHypot);

      if (dFlap <= AA_RADIUS) {
        const flapAlpha = Math.max(0, Math.min(1, 0.5 - dFlap / AA_RADIUS));
        // Fill: #1a1c24
        blendPixel(buf, idx, 26, 28, 36, flapAlpha);

        // Fold crease diagonal line (width 5, rgba(255,255,255,0.30))
        const creaseDist = Math.abs(dFlapHypot);
        if (creaseDist <= (2.5 + AA_RADIUS)) {
          const creaseAlpha = Math.max(0, Math.min(1, 0.5 - (creaseDist - 2.5) / AA_RADIUS)) * 0.30;
          blendPixel(buf, idx, 255, 255, 255, creaseAlpha * flapAlpha);
        }
      }

      // 3. Centre Mark: 3 Circles + Connector Line + Run Ring
      const c1x = isSmall ? 330 : 350, c1y = isSmall ? 450 : 405;
      const c2x = isSmall ? 512 : 505, c2y = isSmall ? 512 : 455;
      const c3x = isSmall ? 694 : 660, c3y = isSmall ? 584 : 515;
      const cRad = isSmall ? 64 : 44;
      const lineWidth = isSmall ? 36 : 22;
      const ringRadius = isSmall ? 102 : 76;
      const ringWidth = isSmall ? 18 : 10;

      // Connecting line segments
      const dLine1 = distPointToSegment(x1024, y1024, c1x, c1y, c2x, c2y) - lineWidth / 2;
      const dLine2 = distPointToSegment(x1024, y1024, c2x, c2y, c3x, c3y) - lineWidth / 2;
      const dLine = Math.min(dLine1, dLine2);

      // Circles
      const dCircle1 = Math.hypot(x1024 - c1x, y1024 - c1y) - cRad;
      const dCircle2 = Math.hypot(x1024 - c2x, y1024 - c2y) - cRad;
      const dCircle3 = Math.hypot(x1024 - c3x, y1024 - c3y) - cRad;
      const dMarks = Math.min(dLine, dCircle1, dCircle2, dCircle3);

      if (dMarks <= AA_RADIUS) {
        const markAlpha = Math.max(0, Math.min(1, 0.5 - dMarks / AA_RADIUS)) * (isSmall ? 0.95 : 0.92);
        blendPixel(buf, idx, 255, 255, 255, markAlpha);
      }

      // Run Ring around Circle 3
      const dRing = Math.abs(Math.hypot(x1024 - c3x, y1024 - c3y) - ringRadius) - ringWidth / 2;
      if (dRing <= AA_RADIUS) {
        const ringAlpha = Math.max(0, Math.min(1, 0.5 - dRing / AA_RADIUS)) * (isSmall ? 0.50 : 0.40);
        blendPixel(buf, idx, 255, 255, 255, ringAlpha);
      }

      // 4. Word "FLOW" (Omit below 48px)
      if (!isSmall && y1024 >= 670 && y1024 <= 790 && x1024 >= 320 && x1024 <= 700) {
        let insideLetter = false;

        // F: (326..386, 675..785)
        if (x1024 >= 326 && x1024 <= 348 && y1024 >= 675 && y1024 <= 785) insideLetter = true;
        if (x1024 >= 326 && x1024 <= 386 && y1024 >= 675 && y1024 <= 695) insideLetter = true;
        if (x1024 >= 326 && x1024 <= 380 && y1024 >= 720 && y1024 <= 740) insideLetter = true;

        // L: (418..478, 675..785)
        if (x1024 >= 418 && x1024 <= 440 && y1024 >= 675 && y1024 <= 785) insideLetter = true;
        if (x1024 >= 418 && x1024 <= 478 && y1024 >= 765 && y1024 <= 785) insideLetter = true;

        // O: (508..578, 675..785, hollow)
        const dOBox = distToRoundedBox(x1024, y1024, 543, 730, 35, 55, 18);
        const dOInner = distToRoundedBox(x1024, y1024, 543, 730, 15, 35, 8);
        if (dOBox <= 0 && dOInner > 0) insideLetter = true;

        // W: (608..698, 675..785)
        const dW1 = distPointToSegment(x1024, y1024, 610, 675, 626, 785) - 10;
        const dW2 = distPointToSegment(x1024, y1024, 626, 785, 646, 715) - 10;
        const dW3 = distPointToSegment(x1024, y1024, 646, 715, 666, 785) - 10;
        const dW4 = distPointToSegment(x1024, y1024, 666, 785, 682, 675) - 10;
        if (Math.min(dW1, dW2, dW3, dW4) <= 0) insideLetter = true;

        if (insideLetter) {
          blendPixel(buf, idx, 255, 255, 255, 0.85);
        }
      }
    }
  }

  return buf;
}

// Generate all PNG sizes
console.log('Rendering .flow icon sizes (16..1024)...');
for (const size of SIZES) {
  const buf = renderFlowIcon(size);
  const png = createPng(size, size, buf);
  const outPng = path.join(outDir, `flow-${size}.png`);
  fs.writeFileSync(outPng, png);
}
console.log('✓ Generated flow-16.png .. flow-1024.png');

// 1. Pack Windows flow.ico
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = icoSizes.map(s => path.join(outDir, `flow-${s}.png`));
const outIco = path.join(outDir, 'flow.ico');
packIco(icoPngs, outIco);
console.log('✓ Generated flow.ico (Windows)');

// 2. Build macOS flow.icns
const iconsetDir = path.join(outDir, 'flow.iconset');
fs.mkdirSync(iconsetDir, { recursive: true });

const icnsMap = [
  ['flow-16.png', 'icon_16x16.png'],
  ['flow-32.png', 'icon_16x16@2x.png'],
  ['flow-32.png', 'icon_32x32.png'],
  ['flow-64.png', 'icon_32x32@2x.png'],
  ['flow-128.png', 'icon_128x128.png'],
  ['flow-256.png', 'icon_128x128@2x.png'],
  ['flow-256.png', 'icon_256x256.png'],
  ['flow-512.png', 'icon_256x256@2x.png'],
  ['flow-512.png', 'icon_512x512.png'],
  ['flow-1024.png', 'icon_512x512@2x.png'],
];

for (const [src, dest] of icnsMap) {
  fs.copyFileSync(path.join(outDir, src), path.join(iconsetDir, dest));
}

try {
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(outDir, 'flow.icns')}"`, { stdio: 'ignore' });
  console.log('✓ Generated flow.icns (macOS via iconutil)');
} catch (e) {
  console.warn('iconutil skipped or not present:', e.message);
} finally {
  try { fs.rmSync(iconsetDir, { recursive: true, force: true }); } catch {}
}

// 3. Linux scalable SVG
const scalableLinuxSvg = path.join(outDir, 'application-x-cero-workflow.svg');
fs.copyFileSync(masterSvg, scalableLinuxSvg);
console.log('✓ Generated application-x-cero-workflow.svg (Linux)');

// 4. Contact sheet: docs/brand/flow-icon-preview.png
// Render contact sheet PNG directly with dark and light panels
const previewWidth = 1200;
const previewHeight = 760;
const previewBuf = Buffer.alloc(previewWidth * previewHeight * 4, 0);

// Fill overall background: #14151a
for (let i = 0; i < previewWidth * previewHeight; i++) {
  previewBuf[i * 4] = 20;
  previewBuf[i * 4 + 1] = 21;
  previewBuf[i * 4 + 2] = 26;
  previewBuf[i * 4 + 3] = 255;
}

// Function to blit a sub-buffer
function blit(destBuf, dw, dh, srcBuf, sw, sh, targetX, targetY) {
  for (let sy = 0; sy < sh; sy++) {
    const dy = targetY + sy;
    if (dy < 0 || dy >= dh) continue;
    for (let sx = 0; sx < sw; sx++) {
      const dx = targetX + sx;
      if (dx < 0 || dx >= dw) continue;
      const sIdx = (sy * sw + sx) * 4;
      const dIdx = (dy * dw + dx) * 4;
      const a = srcBuf[sIdx + 3] / 255;
      if (a <= 0) continue;
      blendPixel(destBuf, dIdx, srcBuf[sIdx], srcBuf[sIdx + 1], srcBuf[sIdx + 2], a);
    }
  }
}

// Fill Dark Panel: (x: 40..1160, y: 50..370), #0c0d12
for (let y = 50; y < 370; y++) {
  for (let x = 40; x < 1160; x++) {
    const idx = (y * previewWidth + x) * 4;
    previewBuf[idx] = 12;
    previewBuf[idx + 1] = 13;
    previewBuf[idx + 2] = 18;
    previewBuf[idx + 3] = 255;
  }
}

// Fill Light Panel: (x: 40..1160, y: 410..730), #f5f5f7
for (let y = 410; y < 730; y++) {
  for (let x = 40; x < 1160; x++) {
    const idx = (y * previewWidth + x) * 4;
    previewBuf[idx] = 245;
    previewBuf[idx + 1] = 245;
    previewBuf[idx + 2] = 247;
    previewBuf[idx + 3] = 255;
  }
}

// Blit sizes: 16, 32, 64, 128, 256
const contactSizes = [16, 32, 64, 128, 256];
let currentX = 70;
for (const s of contactSizes) {
  const iconBuf = renderFlowIcon(s);
  // Dark row
  blit(previewBuf, previewWidth, previewHeight, iconBuf, s, s, currentX, 340 - s);
  // Light row
  blit(previewBuf, previewWidth, previewHeight, iconBuf, s, s, currentX, 700 - s);
  currentX += s + 50;
}

const previewPng = createPng(previewWidth, previewHeight, previewBuf);
fs.writeFileSync(path.join(docsBrandDir, 'flow-icon-preview.png'), previewPng);
console.log('✓ Generated docs/brand/flow-icon-preview.png');
