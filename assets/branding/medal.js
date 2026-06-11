/**
 * FlexYug — Olympic-medal coin generator. Instrument Serif "F".
 * Struck-medal language: reeded (milled) edge, beveled raised rim, engine-turned
 * sunburst field, central cartouche, optional laurel + engraved ring text.
 *
 * buildMedal({ metal, laurel, ringText, sunburst, fInk }) -> 1024 SVG string.
 */
const fs = require('fs');

const opentype = require('opentype.js');

const SERIF = '/tmp/node_modules/@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf';

// Instrument Serif F outline, centered on (512,500) and guaranteed to fit
// inside the cartouche circle (radius cartR) with padding.
function fMark(ink, capHeight, cartR, fontFile) {
  capHeight = capHeight || 250;
  cartR = cartR || 172;
  const font = opentype.parse(fs.readFileSync(fontFile || SERIF).buffer);
  const p = font.getPath('F', 0, 0, 1000);
  const b = p.getBoundingBox();
  let s = capHeight / (b.y2 - b.y1);
  // shrink to fit the glyph's bounding circle inside the cartouche (with pad)
  const hw = ((b.x2 - b.x1) / 2) * s, hh = (capHeight / 2);
  const rad = Math.hypot(hw, hh);
  const maxR = cartR - 30;
  if (rad > maxR) s *= maxR / rad;
  const cx = ((b.x1 + b.x2) / 2) * s, cy = ((b.y1 + b.y2) / 2) * s;
  const tx = 512 - cx, ty = 500 - cy, d = p.toPathData(2);
  const G = (ddx, ddy) => `transform="translate(${(tx + ddx).toFixed(2)} ${(ty + ddy).toFixed(2)}) scale(${s.toFixed(4)})"`;
  return `
    <g ${G(0, -5)} filter="url(#soft)"><path d="${d}" fill="#0C0A06" opacity=".5"/></g>
    <g ${G(0, 6)}><path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="22" opacity=".10"/></g>
    <g ${G(0, 0)}><path d="${d}" fill="${ink}"/></g>`;
}

const METALS = {
  gold:     { c:['#FCF3D2','#EAD493','#B8923A','#74591A','#D2AE5C','#F4E2A6','#9C7C30'], rim:['#FFF8E0','#9C7B2E','#3C2C0C'], ink:'#3A2A0C' },
  bronze:   { c:['#F3DAB4','#D8AC72','#8E5E32','#4E3014','#B68150','#E4C194','#7C5026'], rim:['#FBE6C6','#7C5026','#2E1C0C'], ink:'#3A2410' },
  titanium: { c:['#EFEBE3','#CBC4B6','#6E695E','#48443C','#857F73','#CAC3B5','#8E887C'], rim:['#FCFAF4','#5E594F','#191712'], ink:'#262420' },
  gunmetal: { c:['#AEB6B2','#7C847F','#3A413D','#21262300'.slice(0,7),'#444B47','#888F8A','#52595500'.slice(0,7)], rim:['#C6CCC8','#3A413D','#0C0F0D'], ink:'#15433000'.slice(0,7) },
  rose:     { c:['#FBEEE4','#ECCBB8','#C8987E','#8E6249','#D8AB92','#F3DACB','#B0826A'], rim:['#FCEFE6','#9C6E56','#3E251A'], ink:'#3A2117' },
};

function bandsGrad(id, c) {
  const o=[0,17,40,52,68,86,100];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${c.map((x,i)=>`<stop offset="${o[i]}%" stop-color="${x}"/>`).join('')}</linearGradient>`;
}

function reeded(cx, cy, rIn, rOut, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * rIn,  y1 = cy + Math.sin(a) * rIn;
    const x2 = cx + Math.cos(a) * rOut, y2 = cy + Math.sin(a) * rOut;
    const col = i % 2 ? '#000' : '#fff';
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="3.2" opacity="${i%2?0.18:0.16}"/>`;
  }
  return s;
}

function sunburst(cx, cy, rIn, rOut, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * rIn,  y1 = cy + Math.sin(a) * rIn;
    const x2 = cx + Math.cos(a) * rOut, y2 = cy + Math.sin(a) * rOut;
    const col = i % 2 ? '#FFFFFF' : '#000000';
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="6" opacity="0.05"/>`;
  }
  return s;
}

function laurel(cx, cy, r) {
  // two arcs of leaves sweeping up the sides from the bottom
  function branch(dir) {
    let s = '';
    const start = Math.PI/2 + dir*0.18;       // near bottom
    const end   = Math.PI/2 + dir*1.15;       // up the side
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i/steps;
      const a = start + (end-start)*t;
      const lr = r - t*6;
      const x = cx + Math.cos(a)*lr, y = cy + Math.sin(a)*lr;
      const leafAng = (a*180/Math.PI) + dir*70;
      const len = 30 - t*10, w = 11 - t*3;
      s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${leafAng.toFixed(1)})"><ellipse cx="0" cy="0" rx="${len.toFixed(1)}" ry="${w.toFixed(1)}"/></g>`;
    }
    return s;
  }
  return `<g fill="#000000" opacity=".16" transform="translate(0 3)">${branch(1)}${branch(-1)}</g>
          <g fill="#FFFFFF" opacity=".22">${branch(1)}${branch(-1)}</g>`;
}

function buildMedal(opts = {}) {
  const key = opts.metal || 'gold';
  const m = METALS[key];
  const fInk = opts.fInk || m.ink;
  const useLaurel = !!opts.laurel;
  const useText = opts.ringText !== false;
  const useSun = opts.sunburst !== false;
  const cartR = opts.cartR || 178;
  const fCap = opts.fCap || 250;

  const ring = useText ? `
    <g fill="${fInk}" opacity=".62" font-family="Geist" font-weight="600" font-size="34" letter-spacing="6">
      <defs>
        <path id="arcTop" d="M 200 500 A 312 312 0 0 1 824 500" />
        <path id="arcBot" d="M 210 540 A 302 302 0 0 0 814 540" />
      </defs>
      <text text-anchor="middle"><textPath href="#arcTop" startOffset="50%">FLEXYUG</textPath></text>
      <text text-anchor="middle"><textPath href="#arcBot" startOffset="50%">THE STRENGTH ERA</textPath></text>
    </g>` : '';

  const scale = opts.scale || 1;
  const transparentBg = !!opts.transparentBg;
  const open = scale !== 1 ? `<g transform="translate(512 500) scale(${scale}) translate(-512 -500)">` : '';
  const close = scale !== 1 ? `</g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="field" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#141C17"/><stop offset="60%" stop-color="#0E1411"/><stop offset="100%" stop-color="#090C0A"/></radialGradient>
    ${bandsGrad('metal', m.c)}
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.rim[0]}"/><stop offset="50%" stop-color="${m.rim[1]}"/><stop offset="100%" stop-color="${m.rim[2]}"/></linearGradient>
    <radialGradient id="sheen" cx="38%" cy="24%" r="52%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".5"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="cart" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".10"/><stop offset="100%" stop-color="#000000" stop-opacity=".12"/></radialGradient>
    <filter id="soft" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>

  ${transparentBg ? '' : `<rect width="1024" height="1024" fill="url(#field)"/>`}
  ${open}
  <!-- reeded milled edge -->
  ${reeded(512,500,372,400,140)}
  <!-- beveled raised rim -->
  <circle cx="512" cy="500" r="384" fill="url(#rim)"/>
  <circle cx="512" cy="500" r="358" fill="#000" opacity=".25"/>
  <!-- medal face -->
  <circle cx="512" cy="500" r="350" fill="url(#metal)"/>
  <circle cx="512" cy="500" r="350" fill="url(#sheen)"/>
  ${useSun ? sunburst(512,500,150,338,72) : ''}
  <!-- inner guilloché rings -->
  <circle cx="512" cy="500" r="320" fill="none" stroke="#000" stroke-width="2" opacity=".25"/>
  <circle cx="512" cy="500" r="314" fill="none" stroke="#fff" stroke-width="1.5" opacity=".14"/>
  ${ring}
  ${useLaurel ? laurel(512,512,250) : ''}
  <!-- central cartouche -->
  <circle cx="512" cy="500" r="${cartR}" fill="url(#cart)"/>
  <circle cx="512" cy="500" r="${cartR}" fill="none" stroke="#000" stroke-width="2" opacity=".22"/>
  <circle cx="512" cy="500" r="${cartR - 5}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".16"/>

  ${fMark(fInk, fCap, cartR, opts.fontFile)}
  ${close}
</svg>`;
}

module.exports = { buildMedal, METALS };
