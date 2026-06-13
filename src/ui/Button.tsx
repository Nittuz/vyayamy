/**
 * Button — the Forged Iron action primitive, built on Plate.
 *
 * `primary` is the ember plate (the stamped CTA), `secondary` a surface plate,
 * `danger` a filled danger plate, `ghost` flat text for tertiary actions.
 * Labels are uppercase stamped type on filled kinds; ghost stays sentence-case.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Icon, type IconName } from './icons';
import { Plate } from './Plate';
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
    kind === 'primary' || kind === 'danger'
      ? theme.color.onAccent
      : kind === 'ghost'
        ? theme.color.accent
        : theme.color.ink;

  const content = loading ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <View style={styles.labelRow}>
      {icon ? <Icon name={icon} size={size === 'cta' ? 18 : 16} color={textColor} /> : null}
      <Text
        variant={size === 'cta' ? 'card' : 'body'}
        color={textColor}
        style={kind === 'ghost' ? styles.ghostLabel : styles.stampedLabel}
      >
        {label}
      </Text>
    </View>
  );

  if (kind === 'ghost') {
    return (
      <Plate
        offset="none"
        tone="bg"
        border="none"
        radius="button"
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        style={style}
        faceStyle={[styles.face, styles.ghostFace, size === 'cta' ? styles.cta : styles.row]}
      >
        {content}
      </Plate>
    );
  }

  return (
    <Plate
      offset={size === 'cta' ? 'md' : 'sm'}
      tone={kind === 'primary' ? 'accent' : kind === 'danger' ? 'danger' : 'surface'}
      border="strong"
      radius="button"
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
    ghostFace: { backgroundColor: 'transparent' },
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
