#!/usr/bin/env node
/**
 * Rasterize the Forged Iron "loaded-end" mark into the full store-asset set.
 * Reproducible: re-run after editing the geometry below.
 *
 *   node assets/branding/build-icons.js
 *
 * Outputs into assets/: icon.png + iOS dark/tinted variants, the Android
 * adaptive foreground (+ monochrome), light/dark splash marks, and the
 * notification icon (white-on-transparent).
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ASSETS = path.join(__dirname, '..');

// Forged Iron palette (mirror of src/ui/colors.ts).
const IRON = '#0B0B0D';
const BONE = '#E8E5DE';
const INK = '#1A1A1D';
const EMBER = '#E8602F';
const PAPER = '#ECEAE4';

// "loaded-end" geometry on a 240 grid (mirror of src/ui/BrandMark.tsx).
const TICKS = 24;
const tickLines = Array.from({ length: TICKS }, (_, i) => {
  const a = (i * Math.PI * 2) / TICKS;
  return {
    x1: 120 + Math.cos(a) * 62,
    y1: 120 + Math.sin(a) * 62,
    x2: 120 + Math.cos(a) * 78,
    y2: 120 + Math.sin(a) * 78,
  };
});

function mark(rim, bore, strokeScale = 1) {
  const ticks = tickLines
    .map(
      (t) =>
        `<line x1="${t.x1.toFixed(2)}" y1="${t.y1.toFixed(2)}" x2="${t.x2.toFixed(2)}" y2="${t.y2.toFixed(2)}" stroke="${rim}" stroke-width="${7 * strokeScale}"/>`,
    )
    .join('');
  return (
    `<circle cx="120" cy="120" r="92" fill="none" stroke="${rim}" stroke-width="${14 * strokeScale}"/>` +
    ticks +
    `<circle cx="120" cy="120" r="30" fill="${bore}"/>`
  );
}

function iconSvg(px, { field, rim, bore, markFraction = 0.6, strokeScale = 1 }) {
  const markPx = px * markFraction;
  const off = (px - markPx) / 2;
  const scale = markPx / 240;
  const fieldRect = field ? `<rect width="${px}" height="${px}" fill="${field}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${fieldRect}<g transform="translate(${off},${off}) scale(${scale})">${mark(rim, bore, strokeScale)}</g></svg>`;
}

function render(svg, px) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
}

function write(name, svg, px) {
  fs.writeFileSync(path.join(ASSETS, name), render(svg, px));
  console.log(`  ${name}`);
}

console.log('Forged Iron store assets:');
// App icon — full-bleed mark on iron.
write('icon.png', iconSvg(1024, { field: IRON, rim: BONE, bore: EMBER }), 1024);
// iOS 18 dark variant — same on iron (system shows it in dark contexts).
write('icon-dark.png', iconSvg(1024, { field: IRON, rim: BONE, bore: EMBER }), 1024);
// iOS 18 tinted variant — grayscale on transparent; the system applies the tint.
write('icon-tinted.png', iconSvg(1024, { field: null, rim: '#FFFFFF', bore: '#FFFFFF' }), 1024);
// Android adaptive foreground — mark only, extra safe-zone padding (system crops ~33%).
write(
  'adaptive-icon.png',
  iconSvg(1024, { field: null, rim: BONE, bore: EMBER, markFraction: 0.46 }),
  1024,
);
// Android themed-icon monochrome layer — white on transparent.
write(
  'adaptive-icon-mono.png',
  iconSvg(1024, { field: null, rim: '#FFFFFF', bore: '#FFFFFF', markFraction: 0.46 }),
  1024,
);
// Splash marks — transparent field, ink rim for light, bone rim for dark.
write(
  'splash-light.png',
  iconSvg(600, { field: null, rim: INK, bore: EMBER, markFraction: 0.8 }),
  600,
);
write(
  'splash-dark.png',
  iconSvg(600, { field: null, rim: BONE, bore: EMBER, markFraction: 0.8 }),
  600,
);
// Notification icon — Android requires a white silhouette on transparent.
write(
  'notification-icon.png',
  iconSvg(96, { field: null, rim: '#FFFFFF', bore: '#FFFFFF', markFraction: 0.78 }),
  96,
);
console.log(`Done. (paper ${PAPER} / iron ${IRON} backgrounds set in app.config.ts)`);
