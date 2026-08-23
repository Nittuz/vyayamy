/**
 * Button — the Blacktop action primitive, built on Plate.
 *
 * `primary` is the volt plate (the one "act now" fill), `secondary` a panel,
 * `ghost` flat text for tertiary actions, `danger` a ghost-destructive row
 * (danger text, no fill, plus a hairline danger border — the same quiet-danger
 * treatment as QuarantineBanner / Today's sync row: destructive actions are
 * quiet, not loud, but still visibly marked).
 * Labels are uppercase stamped type on primary/secondary; ghost and danger
 * stay sentence-case.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Icon, type IconName } from './icons';
import { Plate } from './Plate';
import { resolveDisabledFaceStyles, type PlateTone } from './plateStyles';
import { Text } from './Text';
import { useTheme, type Theme } from './useTheme';

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverted';
export type ButtonSize = 'cta' | 'row';

export interface ButtonProps {
  label: string;
  kind?: ButtonKind;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const TONE_FOR_KIND: Record<ButtonKind, PlateTone> = {
  primary: 'volt',
  secondary: 'panel',
  ghost: 'ghost',
  danger: 'ghost',
  inverted: 'inverted',
};

export function Button({
  label,
  kind = 'primary',
  size = 'cta',
  loading = false,
  disabled = false,
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Honest disabled face (Button primitive fix, dark-poster Login review):
  // only the FILLED kinds — primary's volt, inverted's ink — get the opacity
  // smear replaced. A smeared translucent volt/ink face reads as a broken
  // render; a flat surface2 face with real inkTertiary text reads as a state.
  // Ghost/secondary/danger keep Plate's stock dim — already-quiet tones where
  // dimming still reads as intentional.
  const isFilledKind = kind === 'primary' || kind === 'inverted';
  const honestDisabled = disabled && isFilledKind;
  const disabledStyles = useMemo(() => resolveDisabledFaceStyles(theme), [theme]);

  const textColor = honestDisabled
    ? disabledStyles.ink
    : kind === 'primary'
      ? theme.color.onAccent
      : kind === 'inverted'
        ? theme.color.bg
        : kind === 'danger'
          ? theme.color.danger
          : theme.color.ink;

  const stamped = kind === 'primary' || kind === 'secondary' || kind === 'inverted';

  const content = loading ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <View style={styles.labelRow}>
      {icon ? <Icon name={icon} size={size === 'cta' ? 18 : 16} color={textColor} /> : null}
      <Text
        variant={size === 'cta' ? 'card' : 'body'}
        color={textColor}
        style={stamped ? styles.stampedLabel : styles.ghostLabel}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Plate
      tone={TONE_FOR_KIND[kind]}
      border={kind === 'danger' ? 'soft' : undefined}
      onPress={onPress}
      disabled={disabled || loading}
      dimWhenDisabled={!honestDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={style}
      faceStyle={[
        styles.face,
        size === 'cta' ? styles.cta : styles.row,
        kind === 'danger' && styles.dangerFace,
        honestDisabled && disabledStyles.face,
      ]}
    >
      {content}
    </Plate>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    face: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.space.s4,
    },
    cta: { minHeight: theme.touch.cta },
    row: { minHeight: theme.touch.min },
    // border="soft" supplies the hairline weight; danger recolors it — the
    // same quiet-danger idiom as QuarantineBanner / Today's sync row.
    dangerFace: { borderColor: theme.color.danger },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s2,
    },
    stampedLabel: {
      fontFamily: theme.font.family.sansSemibold,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    ghostLabel: {
      fontFamily: theme.font.family.sansMedium,
    },
  });
