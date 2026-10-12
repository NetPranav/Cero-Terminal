#!/usr/bin/env node
/**
 * make-cero-logo.mjs: draw the Cero logo as vector art, and animate circles turning into it.
 *
 * The logo (assets/brand/Application_LOGO.jpeg) is a dark sphere lit from behind, with a halftone of white dots
 * on the lower-left and a bright rim at the top right. This script rebuilds that from numbers, so the dots can
 * move: concentric rings of dots slide into the halftone, then the rim lights up.
 *
 *   node scripts/brand/make-cero-logo.mjs
 * Writes assets/brand/cero-logo.svg (still) and assets/brand/cero-logo-animated.svg (loops every 10 seconds).
 * No dependencies. The same numbers give the same files.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/brand');
const CX = 450, CY = 450, R = 340;          // sphere in a 900 x 900 box
const T = 10;                                // seconds per loop
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const f = (n, d = 1) => Number(n.toFixed(d));

// ---- halftone dots on the sphere: latitude rings around a pole that points to the upper right ----
const pole = norm([0.62, -0.55, 0.56]);       // x right, y down, z toward the viewer
const ref = Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
const u = norm([ref[1] * pole[2] - ref[2] * pole[1], ref[2] * pole[0] - ref[0] * pole[2], ref[0] * pole[1] - ref[1] * pole[0]]);
const v = [pole[1] * u[2] - pole[2] * u[1], pole[2] * u[0] - pole[0] * u[2], pole[0] * u[1] - pole[1] * u[0]];
const STEP = (5.6 * Math.PI) / 180;
const dots = [];
for (let lat = STEP / 2; lat < Math.PI; lat += STEP) {
  const ring = Math.sin(lat);
  const count = Math.max(1, Math.round((2 * Math.PI * ring) / STEP));
  for (let i = 0; i < count; i++) {
    const lon = ((i + (Math.round(lat / STEP) % 2) * 0.5) / count) * 2 * Math.PI;
    const n = [0, 1, 2].map(k => pole[k] * Math.cos(lat) + (u[k] * Math.cos(lon) + v[k] * Math.sin(lon)) * ring);
    if (n[2] < 0.03) continue;                                     // the far side
    const lit = smooth(0.62, -0.42, dot(n, pole));                 // bright away from the pole
    if (lit < 0.08) continue;
    const squash = Math.max(0.22, n[2]);                           // dots flatten toward the edge, along the radius
    const r = f(STEP * R * 0.5 * (0.14 + 0.62 * lit), 2);
    if (r < 0.9) continue;
    const angle = f((Math.atan2(n[1], n[0]) * 180) / Math.PI, 1);  // the flat direction points at the middle
    dots.push({ x: f(CX + n[0] * R * 0.985), y: f(CY + n[1] * R * 0.985), r, ry: f(r * Math.sqrt(squash), 2), angle, op: f(0.4 + 0.6 * lit, 2) });
  }
}
// where each dot starts: the same direction from the middle, but on the nearest of a few concentric rings
const RING = 46;
for (const d of dots) {
  const dx = d.x - CX, dy = d.y - CY;
  const dist = Math.hypot(dx, dy) || 1;
  const ringIndex = Math.max(1, Math.round(dist / RING));
  d.ring = ringIndex;
  d.sx = f(CX + (dx / dist) * ringIndex * RING);
  d.sy = f(CY + (dy / dist) * ringIndex * RING);
  d.angle01 = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
}
const maxRing = Math.max(...dots.map(d => d.ring));

// ---- shared pieces ----
const defs = `
  <radialGradient id="body" cx="42%" cy="60%" r="62%">
    <stop offset="0" stop-color="#0d0e12"/><stop offset="0.7" stop-color="#15161b"/><stop offset="1" stop-color="#2a2c33"/>
  </radialGradient>
  <linearGradient id="rimFade" gradientUnits="userSpaceOnUse" x1="${CX + R * 0.75}" y1="${CY - R * 0.75}" x2="${CX - R * 0.55}" y2="${CY + R * 0.55}">
    <stop offset="0" stop-color="#fff"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <mask id="rimMask"><rect width="900" height="900" fill="url(#rimFade)"/></mask>
  <filter id="glowWide" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="glowTight" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter>`;

const sphereBody = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#body)"/>`;
const rim = (extra = '') => `
  <g mask="url(#rimMask)"${extra}>
    <circle cx="${CX}" cy="${CY}" r="${R + 6}" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="64" filter="url(#glowWide)"/>
    <circle cx="${CX}" cy="${CY}" r="${R - 4}" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="24" filter="url(#glowTight)"/>
    <circle cx="${CX}" cy="${CY}" r="${R - 2}" fill="none" stroke="#fff" stroke-width="7"/>
  </g>`;

const still = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900" role="img" aria-label="Cero">
  <title>Cero</title>
  <defs>${defs}
  </defs>
  <rect width="900" height="900" fill="#000"/>
  ${sphereBody}
  <g fill="#fff" filter="url(#dotGlow)" opacity="0.9">
${dots.map(d => `    <ellipse cx="${d.x}" cy="${d.y}" rx="${d.ry}" ry="${d.r}" transform="rotate(${d.angle} ${d.x} ${d.y})" fill-opacity="${d.op}"/>`).join('\n')}
  </g>${rim()}
</svg>
`;

// ---- the animation: SMIL, so it plays when the file is opened or used as an <img> ----
const EASE = '0.25 0.1 0.25 1';
const times = a => a.map(x => f(Math.min(1, Math.max(0, x)), 4)).join(';');
const splines = n => Array(n).fill(EASE).join(';');
const anim = (target, attr, values, keyTimes, extra = '') =>
  `<animate attributeName="${attr}" values="${values.join(';')}" keyTimes="${times(keyTimes)}" calcMode="spline" keySplines="${splines(values.length - 1)}" dur="${T}s" repeatCount="indefinite"${extra}/>`;

const dotAnims = dots.map(d => {
  const ta = 0.09 + 0.12 * (d.ring / maxRing);          // appears on its ring, inner rings first
  const ts = 0.36 + 0.16 * d.angle01;                   // then slides out to its place, sweeping around
  const te = ts + 0.15;
  const dx = f(d.sx - d.x), dy = f(d.sy - d.y);
  const move = `<animateTransform attributeName="transform" type="translate" values="${dx} ${dy};${dx} ${dy};${dx} ${dy};0 0;0 0" keyTimes="${times([0, ta, ts, te, 1])}" calcMode="spline" keySplines="${splines(4)}" dur="${T}s" repeatCount="indefinite"/>`;
  const grow = (attr, end) => `<animate attributeName="${attr}" values="0;0;2.2;2.2;${end};${end};0" keyTimes="${times([0, ta, ta + 0.035, ts, te, 0.985, 1])}" calcMode="spline" keySplines="${splines(6)}" dur="${T}s" repeatCount="indefinite"/>`;
  return `    <g>${move}<ellipse cx="${d.x}" cy="${d.y}" rx="0" ry="0" transform="rotate(${d.angle} ${d.x} ${d.y})" fill-opacity="${d.op}">${grow('rx', d.ry)}${grow('ry', d.r)}</ellipse></g>`;
}).join('\n');

// ripples: three thin rings spreading out from a point that starts the whole thing
const ripples = [0, 1, 2].map(i => {
  const t0 = 0.01 + i * 0.045, t1 = t0 + 0.22;
  return `    <circle cx="${CX}" cy="${CY}" r="0" fill="none" stroke="#fff" stroke-width="2" stroke-opacity="0">
      <animate attributeName="r" values="0;0;${R + 60};${R + 60}" keyTimes="${times([0, t0, t1, 1])}" calcMode="spline" keySplines="${splines(3)}" dur="${T}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" values="0;0;0.75;0;0" keyTimes="${times([0, t0, t0 + 0.02, t1, 1])}" dur="${T}s" repeatCount="indefinite"/>
    </circle>`;
}).join('\n');

// the rings of dots are drawn faintly as circles first, then dissolve as the dots leave them
const guideRings = Array.from({ length: maxRing }, (_, i) => i + 1).map(k => {
  const t0 = 0.09 + 0.12 * (k / maxRing), t1 = 0.50 + 0.1 * (k / maxRing);
  return `    <circle cx="${CX}" cy="${CY}" r="${k * RING}" fill="none" stroke="#fff" stroke-width="1" stroke-opacity="0">
      <animate attributeName="stroke-opacity" values="0;0;0.28;0.28;0;0" keyTimes="${times([0, t0, t0 + 0.04, t1 - 0.06, t1, 1])}" dur="${T}s" repeatCount="indefinite"/>
    </circle>`;
}).join('\n');

const animated = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900" role="img" aria-label="Cero">
  <title>Cero</title>
  <defs>${defs}
  </defs>
  <rect width="900" height="900" fill="#000"/>
  <g>
    <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="${times([0, 0.9, 0.985, 0.995, 1])}" dur="${T}s" repeatCount="indefinite"/>
    <!-- 1. a point, then rings spreading out from it -->
    <circle cx="${CX}" cy="${CY}" r="0" fill="#fff">
      <animate attributeName="r" values="0;0;7;7;0;0" keyTimes="${times([0, 0.0, 0.025, 0.07, 0.11, 1])}" dur="${T}s" repeatCount="indefinite"/>
    </circle>
${ripples}
    <!-- 2. rings of dots that slide into the halftone -->
${guideRings}
    <!-- 3. the body of the sphere settles in under the dots -->
    <g>
      <animate attributeName="opacity" values="0;0;1;1" keyTimes="${times([0, 0.36, 0.62, 1])}" dur="${T}s" repeatCount="indefinite"/>
      ${sphereBody}
    </g>
    <g fill="#fff" filter="url(#dotGlow)" opacity="0.9">
${dotAnims}
    </g>
    <!-- 4. the rim lights up, sweeping round from the top right -->
    <g>
      <animate attributeName="opacity" values="0;0;1;1" keyTimes="${times([0, 0.55, 0.72, 1])}" dur="${T}s" repeatCount="indefinite"/>${rim()}
    </g>
  </g>
</svg>
`;

writeFileSync(resolve(OUT, 'cero-logo.svg'), still);
writeFileSync(resolve(OUT, 'cero-logo-animated.svg'), animated);
console.log(`${dots.length} dots; still ${(still.length / 1024).toFixed(0)} KB, animated ${(animated.length / 1024).toFixed(0)} KB`);
