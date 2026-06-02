import { View, Text, StyleSheet } from 'react-native';

import { Medal } from './Medal';
import { brand } from './theme';
import { useTheme } from './useTheme';

/**
 * The FlexYug mark — a struck rose-gold championship medal with a Fraunces "F"
 * monogram (see Medal.tsx). Kept under the historical name `FBarMark` so
 * existing call sites (Today, Login) don't need to change. The optional
 * `accent`/`ink` props are ignored now that the mark is a fixed-brand medal.
 */
export function FBarMark({ size = 40 }: { size?: number; accent?: string; ink?: string }) {
  return <Medal size={size} />;
}

/** Full lockup — medal mark + wordmark. Used on Login and the splash. */
export function Logo({ size = 40, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Medal size={size} />
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
