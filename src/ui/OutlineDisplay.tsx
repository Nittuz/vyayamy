/**
 * OutlineDisplay — a single stroked display word (Blacktop typography).
 *
 * Budget: max one per screen, for one emphasized word inside a display
 * headline — chrome only, never user content (same rule as the display Text
 * variants).
 *
 * Implementation: layered real <Text> in the display variant's own font, not
 * SVG — react-native-svg's <Text> cannot resolve the dynamically registered
 * Anton family on iOS and silently falls back to the system font, breaking
 * the metrics next to solid display lines. Eight hairline-offset ink copies
 * draw the stroke; a knockout copy on top (page background color) hollows the
 * interior. Consequence: only place this on a solid `bg`-colored ground —
 * anywhere else the knockout would read as a smudge, so pass `knockoutColor`.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './useTheme';

export type OutlineDisplaySize = 'display' | 'displayXL' | 'displayXXL';

export interface OutlineDisplayProps {
  /** The one emphasized word. Uppercased like every display variant. */
  children: string;
  size?: OutlineDisplaySize;
  /** Interior color; defaults to the page background. */
  knockoutColor?: string;
}

// Unit circle at 8 compass points; scaled by the hairline stroke weight.
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-0.7071, -0.7071],
  [0.7071, -0.7071],
  [-0.7071, 0.7071],
  [0.7071, 0.7071],
] as const;

export function OutlineDisplay({
  children,
  size = 'displayXL',
  knockoutColor,
}: OutlineDisplayProps) {
  const theme = useTheme();
  const w = theme.depth.hairline;
  const word = children.toUpperCase();
  const interior = knockoutColor ?? theme.color.bg;

  return (
    <View style={styles.box} accessible accessibilityLabel={word}>
      {DIRS.map(([dx, dy], i) => (
        <Text
          key={i}
          variant={size}
          color={theme.color.ink}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[
            i === 0 ? null : StyleSheet.absoluteFill,
            { transform: [{ translateX: dx * w }, { translateY: dy * w }] },
          ]}
        >
          {word}
        </Text>
      ))}
      <Text
        variant={size}
        color={interior}
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={StyleSheet.absoluteFill}
      >
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'flex-start' },
});
