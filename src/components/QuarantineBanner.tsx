import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useFontScale } from '@/ui/useFontScale';
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
  const fontScale = useFontScale();
  if (staleCount === 0) return null;
  const label = staleCount === 1 ? '1 item in quarantine' : `${staleCount} items in quarantine`;

  return (
    <Plate
      tone="panel"
      border="soft"
      press="highlight"
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, tap to review`}
      style={styles.banner}
      faceStyle={styles.face}
    >
      {/* The action is the trailing chevron, not a word glued to the count:
          at accessibility type sizes "· Review" wrapped onto its own line
          with the dot dangling (HIG review 2026-10-04, finding 1). */}
      <Text
        variant="meta"
        color={theme.color.danger}
        numberOfLines={2}
        // Metadata ceiling (the strip/label cap): uncapped, the count ran
        // to 2.6× with a line box to match and read as a poster, not a strip.
        maxFontSizeMultiplier={1.5}
        style={styles.label}
      >
        {label}
      </Text>
      <Icon name="chevron-right" size={Math.round(18 * fontScale)} color={theme.color.danger} />
    </Plate>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: { marginHorizontal: theme.space.s4, marginTop: theme.space.s3 },
    face: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s3,
      paddingVertical: theme.space.s3,
      paddingHorizontal: theme.space.s4,
      minHeight: theme.touch.min,
      justifyContent: 'center',
      // border="soft" supplies the hairline weight; danger recolors it.
      borderColor: theme.color.danger,
    },
    label: { flex: 1 },
  });
