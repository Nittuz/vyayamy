/**
 * OutlineDisplay — a single stroked display word (Blacktop typography).
 *
 * react-native-svg <Text> with a hairline (1.5px) ink stroke and transparent
 * fill, sharing the display variants' metrics (Anton, size, tracking,
 * uppercase). Budget: max one per screen, for one emphasized word inside a
 * display headline — chrome only, never user content (same rule as the
 * display Text variants).
 *
 * Implementation: an invisible <Text> of the same variant sits in normal flow
 * so the component owns the exact line box the solid word would take; the SVG
 * overlays it and draws the stroked glyphs on the same metrics. Screen readers
 * read the sizer text; the SVG layer is decorative.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { resolveTextStyle } from './textVariants';
import { Text } from './Text';
import { useTheme } from './useTheme';

export type OutlineDisplaySize = 'display' | 'displayXL' | 'displayXXL';

export interface OutlineDisplayProps {
  /** The one emphasized word. Uppercased like every display variant. */
  children: string;
  size?: OutlineDisplaySize;
}

// Anton's cap height is ~0.72em; centering it in the line box puts the
// baseline half a cap below center. Keeps the stroked word sitting on the
// same optical line as solid display text beside it.
const CAP_CENTER = 0.36;

export function OutlineDisplay({ children, size = 'displayXL' }: OutlineDisplayProps) {
  const theme = useTheme();
  const variant = resolveTextStyle(size);
  const fontSize = variant.fontSize ?? 0;
  const lineHeight = variant.lineHeight ?? fontSize;
  const word = children.toUpperCase();
  const baseline = lineHeight / 2 + fontSize * CAP_CENTER;

  return (
    <View style={styles.box}>
      <Text variant={size} style={styles.sizer}>
        {word}
      </Text>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
        <SvgText
          x={0}
          y={baseline}
          fontFamily={String(variant.fontFamily)}
          fontSize={fontSize}
          letterSpacing={variant.letterSpacing}
          stroke={theme.color.ink}
          strokeWidth={theme.depth.hairline}
          fill="transparent"
        >
          {word}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'flex-start' },
  // Invisible but still measured and still read by screen readers.
  sizer: { opacity: 0 },
});
