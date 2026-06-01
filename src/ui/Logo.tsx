import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { brand } from './theme';
import { useTheme } from './useTheme';

/**
 * The F-bar mark: a slab "F" whose middle arm is a loaded barbell.
 * The F (stem + top arm) uses `ink`; the barbell (mid arm + plates) uses
 * `accent`, so the mark adopts the active skin's accent — green in Forge,
 * steel in Iron, saffron in Ember. Pass explicit `accent`/`ink` to override
 * (e.g. a fixed-color app icon); otherwise it reads the active theme.
 */
export function FBarMark({
  size = 40,
  accent,
  ink,
}: {
  size?: number;
  accent?: string;
  ink?: string;
}) {
  const theme = useTheme();
  const a = accent ?? theme.color.accent;
  const i = ink ?? theme.color.inkHero;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* F stem */}
      <Rect x={22} y={14} width={15} height={72} rx={4} fill={i} />
      {/* F top arm */}
      <Rect x={22} y={14} width={50} height={15} rx={4} fill={i} />
      {/* middle arm = loaded barbell */}
      <Rect x={22} y={46} width={44} height={11} rx={5} fill={a} />
      <Rect x={60} y={40} width={8} height={23} rx={3} fill={a} />
      <Rect x={70} y={44} width={6} height={15} rx={3} fill={a} />
    </Svg>
  );
}

/** Full lockup — F-bar mark + wordmark. Used on Login and the splash. */
export function Logo({ size = 40, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <FBarMark size={size} />
      {showWordmark && (
        <Text style={[styles.wordmark, { color: theme.color.inkHero, fontSize: size * 0.6 }]}>
          {brand.name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 8 },
  wordmark: { fontWeight: '600', letterSpacing: -0.5 },
});
