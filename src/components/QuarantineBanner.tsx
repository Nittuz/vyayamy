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

/**
 * Stuck-sync attention strip. Danger is spoken quietly in Blacktop: a panel
 * with a danger hairline and danger text, never a filled slab. The same
 * quiet-danger treatment and copy register as Today's sync-trouble row
 * ("N changes waiting to sync · Details").
 */
export function QuarantineBanner({ staleCount, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (staleCount === 0) return null;
  const label = staleCount === 1 ? '1 item in quarantine' : `${staleCount} items in quarantine`;

  return (
    <Plate
      tone="panel"
      border="soft"
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, tap to review`}
      style={styles.banner}
      faceStyle={styles.face}
    >
      <Text variant="meta" color={theme.color.danger}>
        {label} · Review
      </Text>
    </Plate>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: { marginHorizontal: theme.space.s4, marginTop: theme.space.s3 },
    face: {
      paddingVertical: theme.space.s3,
      paddingHorizontal: theme.space.s4,
      minHeight: theme.touch.min,
      justifyContent: 'center',
      // border="soft" supplies the hairline weight; danger recolors it.
      borderColor: theme.color.danger,
    },
  });
