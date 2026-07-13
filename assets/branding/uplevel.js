#!/usr/bin/env node
/**
 * Brand-mark uplevel round (July 2026) — candidate generator on the CURRENT
 * Blacktop palette (forge.js predates the volt overhaul and keeps the ember
 * palette for history).
 *
 * Pure geometry, no deps. Emits one SVG per candidate per scheme into
 * assets/branding/uplevel/, plus a composite contact-sheet SVG rendering every
 * candidate at 160/48/24px on blacktop, chalk, and flat-mono (iOS tinted).
 *
 *   node assets/branding/uplevel.js          # write SVGs
 *   node assets/branding/render-uplevel.js   # rasterize contact sheet PNG
 *
 * The chosen mark graduates into BrandMark.tsx (variant) + forge-mark.svg.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'uplevel');

// Mirror of src/ui/colors.ts (assets are generated, not themed).
const SCHEMES = {
  dark: { field: '#121212', primary: '#FAF9F4', accent: '#D8FF3E' },
  light: { field: '#EFEEE9', primary: '#0C0C0C', accent: '#55650B' },
  tinted: { field: '#1C1C1E', primary: '#FFFFFF', accent: '#FFFFFF' },
};

// All marks live in a 240×240 viewBox on a coarse grid so they survive 24px.

/** Milled Plate II — the loaded-end, forged heavier: fat rim, 12 square-cut
 *  ticks, and a SQUARE volt bore. The one round element in an all-sharp
 *  system, machined to accept our bar. */
function milledPlate(c) {
  const TICKS = 12;
  const INNER = 52;
  const OUTER = 72;
  let ticks = '';
  for (let i = 0; i < TICKS; i++) {
    const a = (i * Math.PI * 2) / TICKS - Math.PI / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ticks += `<line x1="${120 + cos * INNER}" y1="${120 + sin * INNER}" x2="${
      120 + cos * OUTER
    }" y2="${120 + sin * OUTER}" stroke="${c.primary}" stroke-width="14" stroke-linecap="butt"/>`;
  }
  return `
    <circle cx="120" cy="120" r="96" fill="none" stroke="${c.primary}" stroke-width="18"/>
    ${ticks}
    <rect x="88" y="88" width="64" height="64" fill="${c.accent}"/>`;
}

/** Stamp — stencil F on a bone plate over a volt slab: the UI depth model as
 *  the mark. Stencil bridges keep the arms detached, crate-lettering style. */
function stamp(c) {
  // Volt slab offset +28/+28 behind a bone plate; a bold stencil F punched
  // through the face (field shows through the cuts). Anton-heavy proportions,
  // 10px stencil bridge detaching the arms from the stem.
  return `
    <rect x="46" y="46" width="176" height="176" fill="${c.accent}"/>
    <rect x="18" y="18" width="176" height="176" fill="${c.primary}"/>
    <!-- stem -->
    <rect x="52" y="36" width="44" height="140" fill="${c.field}"/>
    <!-- top arm -->
    <rect x="106" y="36" width="62" height="32" fill="${c.field}"/>
    <!-- mid arm -->
    <rect x="106" y="94" width="50" height="28" fill="${c.field}"/>`;
}

/** Loaded Bar — side-view barbell as slabs: volt bar through bone plates.
 *  Symmetric on purpose; a loaded bar is equilibrium. */
function loadedBar(c) {
  return `
    <!-- bar -->
    <rect x="16" y="104" width="208" height="32" fill="${c.accent}"/>
    <!-- inner plates (tall) -->
    <rect x="60" y="36" width="40" height="168" fill="${c.primary}"/>
    <rect x="140" y="36" width="40" height="168" fill="${c.primary}"/>
    <!-- outer plates (shorter) -->
    <rect x="28" y="66" width="24" height="108" fill="${c.primary}"/>
    <rect x="188" y="66" width="24" height="108" fill="${c.primary}"/>`;
}

/** Tally — four bone strokes, one volt strike: a closed set of five.
 *  Logging is the product; the mark is the count. */
function tally(c) {
  const strokes = [40, 88, 136, 184]
    .map((x) => `<rect x="${x}" y="40" width="24" height="160" fill="${c.primary}"/>`)
    .join('');
  return `
    ${strokes}
    <rect x="10" y="106" width="220" height="28" fill="${c.accent}"
          transform="rotate(-20 120 120)"/>`;
}

const marks = [
  {
    id: 'milled-plate',
    name: 'Milled Plate II',
    blurb: 'The loaded-end forged heavier: fat rim, 12 square-cut ticks, square volt bore.',
    render: milledPlate,
  },
  {
    id: 'stamp',
    name: 'Stamp',
    blurb: 'Stencil F on a bone plate over a volt slab — the UI depth model as the mark.',
    render: stamp,
  },
  {
    id: 'loaded-bar',
    name: 'Loaded Bar',
    blurb: 'Side-view barbell as slabs: volt bar under bone plates. Equilibrium.',
    render: loadedBar,
  },
  {
    id: 'tally',
    name: 'Tally',
    blurb: 'Four strokes and the volt strike: a closed set of five. The count is the brand.',
    render: tally,
  },
];

function svgDoc(inner, field) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${
    field ? `<rect width="240" height="240" fill="${field}"/>` : ''
  }${inner}</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const mark of marks) {
  for (const [scheme, c] of Object.entries(SCHEMES)) {
    fs.writeFileSync(path.join(OUT, `${mark.id}-${scheme}.svg`), svgDoc(mark.render(c), c.field));
  }
}

// Composite contact sheet: rows = candidates, cols = dark 160 / dark 48 / dark 24
// / light 160 / light 48 / tinted 96.
const CELL = 200;
const ROW_H = 220;
const LABEL_H = 40;
const sheetW = CELL * 6;
const sheetH = marks.length * ROW_H + LABEL_H;
let cells = '';
const cols = [
  ['dark', 160],
  ['dark', 48],
  ['dark', 24],
  ['light', 160],
  ['light', 48],
  ['tinted', 96],
];
cols.forEach(([scheme, size], ci) => {
  cells += `<text x="${ci * CELL + CELL / 2}" y="26" fill="#888" font-family="monospace" font-size="16" text-anchor="middle">${scheme} ${size}px</text>`;
});
marks.forEach((mark, ri) => {
  const y0 = LABEL_H + ri * ROW_H;
  cells += `<text x="12" y="${y0 + 18}" fill="#aaa" font-family="monospace" font-size="15">${mark.name}</text>`;
  cols.forEach(([scheme, size], ci) => {
    const c = SCHEMES[scheme];
    const pad = (CELL - size) / 2;
    const x = ci * CELL + pad;
    const y = y0 + 24 + (160 - size) / 2;
    cells += `<rect x="${ci * CELL + 8}" y="${y0 + 24}" width="${CELL - 16}" height="176" fill="${c.field}"/>`;
    cells += `<g transform="translate(${x} ${y}) scale(${size / 240})">${mark.render(c)}</g>`;
  });
});
fs.writeFileSync(
  path.join(OUT, 'contact-sheet.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}" height="${sheetH}"><rect width="${sheetW}" height="${sheetH}" fill="#0a0a0a"/>${cells}</svg>`,
);
console.log(`wrote ${marks.length * 3} SVGs + contact-sheet.svg to ${OUT}`);
