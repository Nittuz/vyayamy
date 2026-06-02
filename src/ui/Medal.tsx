import Svg, {
  Defs,
  G,
  Circle,
  Line,
  Path,
  Rect,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * FlexYug brand mark — a struck rose-gold championship medal with a Fraunces
 * 900 Italic "F" monogram. Vector port of assets/branding/medal.js (the same
 * generator that produces the app icon), so the in-app logo and the icon match
 * exactly. Regenerate the F outline via that script if the glyph changes.
 *
 * `metal` lets the medal take other finishes (Iron→titanium, Ember→bronze,
 * Forge→gunmetal) for a skin-adaptive lockup; default is the fixed-brand rose.
 */

type MetalKey = 'rose' | 'titanium' | 'bronze' | 'gunmetal' | 'gold';

const METALS: Record<MetalKey, { c: string[]; rim: [string, string, string]; ink: string }> = {
  rose: {
    c: ['#FBEEE4', '#ECCBB8', '#C8987E', '#8E6249', '#D8AB92', '#F3DACB', '#B0826A'],
    rim: ['#FCEFE6', '#9C6E56', '#3E251A'],
    ink: '#2C160E',
  },
  titanium: {
    c: ['#EFEBE3', '#CBC4B6', '#6E695E', '#48443C', '#857F73', '#CAC3B5', '#8E887C'],
    rim: ['#FCFAF4', '#5E594F', '#191712'],
    ink: '#262420',
  },
  bronze: {
    c: ['#F3DAB4', '#D8AC72', '#8E5E32', '#4E3014', '#B68150', '#E4C194', '#7C5026'],
    rim: ['#FBE6C6', '#7C5026', '#2E1C0C'],
    ink: '#3A2410',
  },
  gunmetal: {
    c: ['#AEB6B2', '#7C847F', '#3A413D', '#212623', '#444B47', '#888F8A', '#525955'],
    rim: ['#C6CCC8', '#3A413D', '#0C0F0D'],
    ink: '#154330',
  },
  gold: {
    c: ['#FCF3D2', '#EAD493', '#B8923A', '#74591A', '#D2AE5C', '#F4E2A6', '#9C7C30'],
    rim: ['#FFF8E0', '#9C7B2E', '#3C2C0C'],
    ink: '#3A2A0C',
  },
};

const BAND_OFFSETS = [0, 0.17, 0.4, 0.52, 0.68, 0.86, 1];

// Fraunces 900 Italic "F", pre-fit to the cartouche (from F-outline.json).
const F_PATH =
  'M149.50-662.50Q149.50-679 161-689.50Q172.50-700 195-700L555.50-700Q589.50-700 610.75-708.50Q632-717 651-717Q687-717 692.50-678.50L702.50-512Q705.50-493.50 697.75-483Q690-472.50 674-470Q656-467.50 643.75-476.25Q631.50-485 622-507.50L613.50-533.50Q602-572.50 587.75-595.25Q573.50-618 553-628.25Q532.50-638.50 502-638.50L439-638.50Q434.50-622 425.25-588.75Q416-555.50 404.25-511.75Q392.50-468 379.75-419Q367-370 354.50-321.75Q342-273.50 331.50-231.50Q321-189.50 313.25-159.25Q305.50-129 302.50-117Q297-97 298.25-87Q299.50-77 318-73L353-67.50Q365.50-65 370.75-57Q376-49 376-37.50Q376-21 364.50-10.50Q353 0 330.50 0L40.50 0Q17.50 0 9.75-9Q2-18 2-31.50Q2-44.50 9.75-54.25Q17.50-64 30-69L53-76Q63-80 68.75-89Q74.50-98 80-116.50Q85-132 93.25-162.25Q101.50-192.50 112.25-231.50Q123-270.50 134-313.75Q145-357 156.25-399.75Q167.50-442.50 177-479.75Q186.50-517 193.25-544Q200-571 203-582Q208.50-603.50 206.50-612.25Q204.50-621 193-625.50L171.50-633Q161.50-638.50 155.50-645Q149.50-651.50 149.50-662.50M256-316.50L274.50-378L428-378Q454.50-378 472-393.25Q489.50-408.50 502.50-444.50Q509.50-456 517.50-460.75Q525.50-465.50 535.50-465.50Q551.50-465.50 559.50-457Q567.50-448.50 569.50-434L587.50-271.50Q591-249.50 581.25-239.25Q571.50-229 555-228.50Q542.50-228.50 534.50-234.75Q526.50-241 520.50-251.50Q511.50-274 499.50-288.25Q487.50-302.50 469.50-309.50Q451.50-316.50 424-316.50';
const F_T = { scale: 0.3031, tx: 405.11, ty: 608.66 };

function ticks(rIn: number, rOut: number, n: number, width: number, opacEven: number, opacOdd: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const even = i % 2 === 0;
    out.push(
      <Line
        key={i}
        x1={512 + Math.cos(a) * rIn}
        y1={500 + Math.sin(a) * rIn}
        x2={512 + Math.cos(a) * rOut}
        y2={500 + Math.sin(a) * rOut}
        stroke={even ? '#FFFFFF' : '#000000'}
        strokeWidth={width}
        opacity={even ? opacEven : opacOdd}
      />
    );
  }
  return out;
}

export function Medal({
  size = 40,
  metal = 'rose',
  field = false,
}: {
  size?: number;
  metal?: MetalKey;
  field?: boolean;
}) {
  const m = METALS[metal];
  const fT = `translate(${F_T.tx} ${F_T.ty}) scale(${F_T.scale})`;
  const fGroove = `translate(${F_T.tx} ${F_T.ty - 5}) scale(${F_T.scale})`;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <RadialGradient id="mField" cx="50%" cy="42%" r="75%">
          <Stop offset="0" stopColor="#141C17" />
          <Stop offset="0.6" stopColor="#0E1411" />
          <Stop offset="1" stopColor="#090C0A" />
        </RadialGradient>
        <LinearGradient id="mMetal" x1="0" y1="0" x2="0" y2="1">
          {m.c.map((col, i) => (
            <Stop key={i} offset={BAND_OFFSETS[i]} stopColor={col} />
          ))}
        </LinearGradient>
        <LinearGradient id="mRim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={m.rim[0]} />
          <Stop offset="0.5" stopColor={m.rim[1]} />
          <Stop offset="1" stopColor={m.rim[2]} />
        </LinearGradient>
        <RadialGradient id="mSheen" cx="38%" cy="24%" r="52%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="mCart" cx="50%" cy="42%" r="60%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </RadialGradient>
      </Defs>

      {field && <Rect width={1024} height={1024} fill="url(#mField)" />}

      {/* crisp outer contour — defines the coin on light backgrounds */}
      <Circle cx={512} cy={500} r={400} fill="none" stroke="#241009" strokeWidth={7} opacity={0.45} />

      {/* reeded milled edge */}
      {ticks(372, 400, 140, 3.2, 0.16, 0.18)}

      {/* beveled raised rim + face */}
      <Circle cx={512} cy={500} r={384} fill="url(#mRim)" />
      <Circle cx={512} cy={500} r={358} fill="#000000" opacity={0.25} />
      <Circle cx={512} cy={500} r={350} fill="url(#mMetal)" />
      <Circle cx={512} cy={500} r={350} fill="url(#mSheen)" />

      {/* engine-turned sunburst */}
      {ticks(150, 338, 72, 6, 0.05, 0.05)}

      {/* guilloché rings */}
      <Circle cx={512} cy={500} r={320} fill="none" stroke="#000000" strokeWidth={2} opacity={0.25} />
      <Circle cx={512} cy={500} r={314} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.14} />

      {/* central cartouche */}
      <Circle cx={512} cy={500} r={182} fill="url(#mCart)" />
      <Circle cx={512} cy={500} r={182} fill="none" stroke="#000000" strokeWidth={2} opacity={0.22} />
      <Circle cx={512} cy={500} r={177} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.16} />

      {/* monogram: groove shadow, lower-lip highlight, then the F */}
      <G transform={fGroove}>
        <Path d={F_PATH} fill="#0C0A06" opacity={0.4} />
      </G>
      <G transform={fT}>
        <Path d={F_PATH} fill={m.ink} />
      </G>
    </Svg>
  );
}

export default Medal;
