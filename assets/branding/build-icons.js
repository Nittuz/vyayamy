#!/usr/bin/env node
/**
 * Rasterize the FlexYug "loaded-bar" mark into the full store-asset set.
 * Reproducible: re-run after editing the geometry below.
 *
 *   node assets/branding/build-icons.js
 *
 * Outputs into assets/: icon.png + iOS dark/tinted variants, the Android
 * adaptive foreground (+ monochrome), light/dark splash marks, and the
 * notification icon (white-on-transparent).
 *
 * Mark chosen 2026-07-13 (uplevel round, option C): the barbell side-on as
 * slabs — volt bar through bone plates. Geometry mirrors src/ui/BrandMark.tsx;
 * keep the two in sync.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ASSETS = path.join(__dirname, '..');

// Blacktop palette (mirror of src/ui/colors.ts).
const BLACKTOP = '#121212';
const BONE = '#FAF9F4';
const INK = '#0C0C0C';
const VOLT = '#D8FF3E';
const PRESSED_VOLT = '#55650B'; // volt fails on chalk; light surfaces use this

// "loaded-bar" geometry on a 240 grid (mirror of src/ui/BrandMark.tsx).
function mark(plate, bar) {
  return (
    `<rect x="16" y="104" width="208" height="32" fill="${bar}"/>` +
    `<rect x="60" y="36" width="40" height="168" fill="${plate}"/>` +
    `<rect x="140" y="36" width="40" height="168" fill="${plate}"/>` +
    `<rect x="28" y="66" width="24" height="108" fill="${plate}"/>` +
    `<rect x="188" y="66" width="24" height="108" fill="${plate}"/>`
  );
}

function iconSvg(px, { field, plate, bar, markFraction = 0.62 }) {
  const markPx = px * markFraction;
  const off = (px - markPx) / 2;
  const scale = markPx / 240;
  const fieldRect = field ? `<rect width="${px}" height="${px}" fill="${field}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${fieldRect}<g transform="translate(${off},${off}) scale(${scale})">${mark(plate, bar)}</g></svg>`;
}

function render(svg, px) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
}

function write(name, svg, px) {
  fs.writeFileSync(path.join(ASSETS, name), render(svg, px));
  console.log(`  ${name}`);
}

console.log('Blacktop store assets (loaded-bar):');
// App icon — full-bleed mark on blacktop.
write('icon.png', iconSvg(1024, { field: BLACKTOP, plate: BONE, bar: VOLT }), 1024);
// iOS 18 dark variant — same on blacktop (system shows it in dark contexts).
write('icon-dark.png', iconSvg(1024, { field: BLACKTOP, plate: BONE, bar: VOLT }), 1024);
// iOS 18 tinted variant — grayscale on transparent; the system applies the tint.
write('icon-tinted.png', iconSvg(1024, { field: null, plate: '#FFFFFF', bar: '#FFFFFF' }), 1024);
// Android adaptive foreground — mark only, extra safe-zone padding (system crops ~33%).
write(
  'adaptive-icon.png',
  iconSvg(1024, { field: null, plate: BONE, bar: VOLT, markFraction: 0.48 }),
  1024,
);
// Android themed-icon monochrome layer — white on transparent.
write(
  'adaptive-icon-mono.png',
  iconSvg(1024, { field: null, plate: '#FFFFFF', bar: '#FFFFFF', markFraction: 0.48 }),
  1024,
);
// Splash marks — transparent field; ink plates for light, bone for dark.
write(
  'splash-light.png',
  iconSvg(600, { field: null, plate: INK, bar: PRESSED_VOLT, markFraction: 0.8 }),
  600,
);
write(
  'splash-dark.png',
  iconSvg(600, { field: null, plate: BONE, bar: VOLT, markFraction: 0.8 }),
  600,
);
// Notification icon — Android requires a white silhouette on transparent.
write(
  'notification-icon.png',
  iconSvg(96, { field: null, plate: '#FFFFFF', bar: '#FFFFFF', markFraction: 0.78 }),
  96,
);

// The canonical vector mark (dark scheme) — kept alongside the PNGs.
fs.writeFileSync(
  path.join(__dirname, 'forge-mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="${BLACKTOP}"/>${mark(BONE, VOLT)}</svg>\n`,
);
console.log('  branding/forge-mark.svg');
console.log('Done.');
