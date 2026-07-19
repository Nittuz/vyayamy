/**
 * Button — the Blacktop action primitive, built on Plate.
 *
 * `primary` is the volt plate (the one "act now" fill), `secondary` a panel,
 * `ghost` flat text for tertiary actions, `danger` a ghost-destructive row
 * (danger text, no fill — destructive actions are quiet, not loud).
 * Labels are uppercase stamped type on primary/secondary; ghost and danger
 * stay sentence-case.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Icon, type IconName } from './icons';
import { Plate } from './Plate';
import type { PlateTone } from './plateStyles';
import { Text } from './Text';
import { useTheme, type Theme } from './useTheme';

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';
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

  const textColor =
    kind === 'primary'
      ? theme.color.onAccent
      : kind === 'danger'
        ? theme.color.danger
        : theme.color.ink;

  const stamped = kind === 'primary' || kind === 'secondary';

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
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={style}
      faceStyle={[styles.face, size === 'cta' ? styles.cta : styles.row]}
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
