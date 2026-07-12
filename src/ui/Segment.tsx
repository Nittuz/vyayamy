/**
 * Segment — the one segmented control.
 *
 * A row of flat Plates (offset "none"): ember fill for the selected option,
 * surface2 for the rest. Replaces the two divergent inline implementations
 * (Progress's Pressable-bordered rows, Profile's Plate-toned units toggle) —
 * the Plate-toned look is the sanctioned one. Appearance maths live in
 * segmentStyles.ts (pure, tested).
 *
 * Accessibility: the row is a tablist and each option a tab carrying
 * accessibilityState.selected; every option keeps the 44pt minimum target.
 */
import { StyleSheet, View } from 'react-native';

import { Plate } from './Plate';
import { resolveSegmentAppearance, type SegmentSize } from './segmentStyles';
import { Text } from './Text';
import { useTheme } from './useTheme';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

export interface SegmentProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `md` — card text, wide tracking (units toggle). `sm` — meta text (chart controls). */
  size?: SegmentSize;
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentProps<T>) {
  const theme = useTheme();

  return (
    <View accessibilityRole="tablist" style={[styles.row, { gap: theme.space.s2 }]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const a = resolveSegmentAppearance(theme, { size, selected });
        return (
          <Plate
            key={opt.value}
            offset="none"
            tone={a.tone}
            border="strong"
            radius="sm"
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityLabel={opt.accessibilityLabel ?? opt.label}
            accessibilityState={{ selected }}
            style={styles.item}
            faceStyle={[styles.face, { minHeight: theme.touch.min }]}
          >
            <Text
              variant={a.textVariant}
              color={a.textColor}
              style={a.letterSpacing != null ? { letterSpacing: a.letterSpacing } : null}
            >
              {opt.label}
            </Text>
          </Plate>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  item: { flex: 1 },
  face: { alignItems: 'center', justifyContent: 'center' },
});
