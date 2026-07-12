#!/usr/bin/env node
/**
 * Forged Iron brand exploration — candidate mark generator.
 *
 * Pure geometry (no deps). Emits one SVG per candidate per scheme into
 * assets/branding/exploration/, plus index.html — a contact sheet rendering
 * every candidate at hero/180/48/29px on iron-dark, bone-light, and the
 * flat-mono swatch that previews the iOS 18 tinted icon treatment.
 *
 *   node assets/branding/forge.js
 *   open assets/branding/exploration/index.html
 *
 * The chosen mark graduates to forge-mark.svg and assets/branding/build-icons.js
 * rasterizes the full store set from it (Phase 7).
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'exploration');

// Forged Iron palette (mirror of src/ui/colors.ts — assets are generated, not themed)
const SCHEMES = {
  dark: { field: '#0B0B0D', primary: '#E8E5DE', accent: '#E8602F', shadow: '#000000' },
  light: { field: '#ECEAE4', primary: '#1A1A1D', accent: '#B83E14', shadow: '#17171A' },
  // iOS tinted icons are rendered from a grayscale glyph — preview as flat mono.
  tinted: { field: '#1C1C1E', primary: '#FFFFFF', accent: '#FFFFFF', shadow: 'none' },
};

// All marks are drawn in a 240×240 viewBox on a coarse grid so they survive 29px.

const marks = [
  {
    id: 'plate-stack',
    name: 'Plate Stack',
    blurb:
      'The Plate primitive as the mark: a bone face on a hot ember slab. The UI depth model, literally.',
    render: (c) => `
      <rect x="72" y="72" width="116" height="116" fill="${c.accent}"/>
      <rect x="52" y="52" width="116" height="116" fill="${c.primary}"/>`,
  },
  {
    id: 'loaded-end',
    name: 'Loaded End',
    blurb:
      'A barbell seen end-on: plate rim, milled ticks, ember bore. Circular but flat — no coin skeuomorphism.',
    render: (c) => {
      const ticks = [];
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI * 2) / 24;
        const x1 = 120 + Math.cos(a) * 62;
        const y1 = 120 + Math.sin(a) * 62;
        const x2 = 120 + Math.cos(a) * 78;
        const y2 = 120 + Math.sin(a) * 78;
        ticks.push(
          `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c.primary}" stroke-width="7"/>`,
        );
      }
      return `
      <circle cx="120" cy="120" r="92" fill="none" stroke="${c.primary}" stroke-width="14"/>
      ${ticks.join('\n      ')}
      <circle cx="120" cy="120" r="30" fill="${c.accent}"/>`;
    },
  },
  {
    id: 'stamped-f',
    name: 'Stamped F',
    blurb:
      'Anton F struck into an iron plate riding its ember slab. Letterform identity in the new display voice.',
    render: (c) => `
      <rect x="66" y="58" width="124" height="138" fill="${c.accent}"/>
      <rect x="50" y="42" width="124" height="138" fill="${c.primary}"/>
      <text x="112" y="164" font-family="Anton, sans-serif" font-size="118" text-anchor="middle" fill="${c.field}">F</text>`,
  },
  {
    id: 'tally',
    name: 'Tally',
    blurb:
      'Four strokes and the ember slash — five sets logged. The oldest progress notation there is.',
    render: (c) => {
      const bars = [0, 1, 2, 3]
        .map((i) => `<rect x="${62 + i * 33}" y="62" width="17" height="116" fill="${c.primary}"/>`)
        .join('\n      ');
      return `
      ${bars}
      <rect x="34" y="111" width="172" height="18" fill="${c.accent}" transform="rotate(-24 120 120)"/>`;
    },
  },
  {
    id: 'knurl-band',
    name: 'Knurl Band',
    blurb:
      'A plate face crossed by a knurling band — the texture every lifter knows by feel, as geometry.',
    render: (c) => {
      const hatch = [];
      for (let i = -3; i < 10; i++) {
        const x = 28 + i * 24;
        hatch.push(
          `<line x1="${x}" y1="148" x2="${x + 56}" y2="92" stroke="${c.primary}" stroke-width="8" clip-path="url(#band)"/>`,
          `<line x1="${x + 56}" y1="148" x2="${x}" y2="92" stroke="${c.primary}" stroke-width="8" clip-path="url(#band)"/>`,
        );
      }
      return `
      <defs><clipPath id="band"><rect x="36" y="92" width="168" height="56"/></clipPath></defs>
      <circle cx="120" cy="120" r="90" fill="none" stroke="${c.primary}" stroke-width="12"/>
      <rect x="36" y="92" width="168" height="56" fill="none" stroke="${c.accent}" stroke-width="8"/>
      ${hatch.join('\n      ')}`;
    },
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    blurb: 'Plates racked into a pyramid, the working set burning ember. Progress as stacked iron.',
    render: (c) => `
      <rect x="45" y="160" width="150" height="32" fill="${c.primary}"/>
      <rect x="65" y="118" width="110" height="32" fill="${c.accent}"/>
      <rect x="85" y="76" width="70" height="32" fill="${c.primary}"/>
      <rect x="111" y="48" width="18" height="20" fill="${c.primary}"/>`,
  },
];

function svgFor(mark, scheme, { field = true, size = 240 } = {}) {
  const c = SCHEMES[scheme];
  const fieldRect = field ? `<rect width="240" height="240" fill="${c.field}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 240 240">${fieldRect}${mark.render(c)}</svg>`;
}

function writeFiles() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const mark of marks) {
    for (const scheme of ['dark', 'light']) {
      fs.writeFileSync(path.join(OUT, `${mark.id}-${scheme}.svg`), svgFor(mark, scheme));
    }
  }

  const cell = (mark, scheme, size) =>
    `<div class="cell" style="width:${size}px;height:${size}px">${svgFor(mark, scheme, { size })}</div>`;

  const rows = marks
    .map(
      (mark) => `
    <section>
      <header><h2>${mark.name} <code>${mark.id}</code></h2><p>${mark.blurb}</p></header>
      <div class="strip">
        ${cell(mark, 'dark', 180)}
        ${cell(mark, 'light', 180)}
        <div class="sizes">
          ${cell(mark, 'dark', 64)}${cell(mark, 'dark', 48)}${cell(mark, 'dark', 29)}
          ${cell(mark, 'light', 64)}${cell(mark, 'light', 48)}${cell(mark, 'light', 29)}
          ${cell(mark, 'tinted', 64)}${cell(mark, 'tinted', 48)}${cell(mark, 'tinted', 29)}
        </div>
      </div>
    </section>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>FlexYug — Forged Iron mark candidates</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">
<style>
  body { background: #131316; color: #E8E5DE; font: 14px/1.5 -apple-system, sans-serif; margin: 0; padding: 40px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin: 0; } h2 code { color: #E8602F; font-size: 13px; }
  p { color: #A6A39B; margin: 4px 0 12px; max-width: 60ch; }
  section { border-top: 2px solid #404048; padding: 24px 0; }
  .strip { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
  .sizes { display: grid; grid-template-columns: repeat(3, auto); gap: 10px; align-items: center; justify-items: center; }
  .cell { border-radius: 22%; overflow: hidden; outline: 1px solid #26262B; }
  .cell svg { display: block; width: 100%; height: 100%; }
</style></head>
<body>
<h1>FlexYug — Forged Iron mark candidates</h1>
<p>Each mark at app-icon crops: 180 hero (dark + light), then 64/48/29 in dark, light, and the flat-mono swatch approximating the iOS 18 tinted icon. Pick by <code>id</code>.</p>
${rows}
</body></html>`;

  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`Wrote ${marks.length} candidates × 2 schemes + index.html → ${OUT}`);
}

writeFiles();
