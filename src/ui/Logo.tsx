import { View, StyleSheet } from 'react-native';

import { BrandMark } from './BrandMark';
import { brand } from './brand';
import { Text } from './Text';
import { useTheme } from './useTheme';

/**
 * The FlexYug mark — the "loaded-bar" barbell (see BrandMark.tsx).
 * Kept under the historical name `FBarMark` so existing call sites (Today,
 * Login) don't need to change. `accent`/`ink` pass through to the mark.
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
  return <BrandMark size={size} accent={accent} ink={ink} />;
}

/** Full lockup — mark + Anton wordmark. Used on Login and the splash. */
export function Logo({
  size = 40,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <BrandMark size={size} />
      {showWordmark && (
        <Text variant="displayXL" color={theme.color.inkHero} style={{ fontSize: size * 0.62 }}>
          {brand.name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
});
