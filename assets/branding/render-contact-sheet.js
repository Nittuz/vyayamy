#!/usr/bin/env node
/**
 * One-off: rasterize the exploration SVGs into a single contact-sheet PNG so the
 * candidates can be reviewed as an image. Builds one composite SVG (grid of all
 * candidates × dark/light at 160px + a 40px small-size row) then renders it.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, 'exploration');
const ids = ['plate-stack', 'loaded-end', 'stamped-f', 'tally', 'knurl-band', 'pyramid'];
const antonPath = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  '@expo-google-fonts',
  'anton',
  '400Regular',
  'Anton_400Regular.ttf',
);

// Pull the inner markup (everything after the opening <svg ...> and field rect) per id/scheme.
function inner(id, scheme) {
  const raw = fs.readFileSync(path.join(OUT, `${id}-${scheme}.svg`), 'utf8');
  const body = raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return body;
}

const COL_W = 360;
const ROW_H = 250;
const cols = 2;
const rows = Math.ceil(ids.length / cols);
const W = cols * COL_W + 40;
const H = rows * ROW_H + 60;

let cells = '';
ids.forEach((id, i) => {
  const cx = 20 + (i % cols) * COL_W;
  const cy = 50 + Math.floor(i / cols) * ROW_H;
  const place = (scheme, dx, size) =>
    `<g transform="translate(${cx + dx},${cy}) scale(${size / 240})">${inner(id, scheme)}</g>` +
    `<rect x="${cx + dx}" y="${cy}" width="${size}" height="${size}" fill="none" stroke="#26262B"/>`;
  cells += `
    <rect x="${cx}" y="${cy}" width="160" height="160" fill="#0B0B0D"/>
    ${place('dark', 0, 160)}
    <rect x="${cx + 170}" y="${cy}" width="160" height="160" fill="#ECEAE4"/>
    ${place('light', 170, 160)}
    <text x="${cx}" y="${cy + 182}" font-family="sans-serif" font-size="15" fill="#E8E5DE">${id}</text>`;
});

const composite = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#131316"/>
  <text x="20" y="30" font-family="sans-serif" font-size="18" fill="#E8602F">FlexYug — Forged Iron mark candidates (dark | light)</text>
  ${cells}
</svg>`;

const resvg = new Resvg(composite, {
  font: { fontFiles: [antonPath], loadSystemFonts: true, defaultFontFamily: 'sans-serif' },
});
fs.writeFileSync(path.join(OUT, 'contact-sheet.png'), resvg.render().asPng());
console.log('Wrote contact-sheet.png');
