import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { haptics } from '@/ui/haptics';
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  staleCount: number;
  onPress: () => void;
}

export function QuarantineBanner({ staleCount, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (staleCount === 0) return null;
  const label = staleCount === 1 ? "1 item didn't sync" : `${staleCount} items didn't sync`;

  return (
    <Plate
      tone="danger"
      offset="sm"
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, tap to review`}
      style={styles.banner}
      faceStyle={styles.face}
    >
      <Text variant="meta" color={theme.color.onAccent}>
        {label} · Tap to review
      </Text>
    </Plate>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: { marginHorizontal: theme.space.s4, marginTop: theme.space.s3 },
    face: { paddingVertical: theme.space.s3, paddingHorizontal: theme.space.s4 },
  });
