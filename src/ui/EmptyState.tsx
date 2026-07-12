/**
 * EmptyState — the tier-1 (screen-level) empty composition, shared so it
 * cannot drift: BrandMark (small) + one display line (settleSlam entrance) +
 * optional meta sub-line + optional single CTA. Copy register: sentence case
 * with a period ("No workouts logged yet.").
 *
 * Tier-2 (inline) empties stay a single inkTertiary meta line at the call
 * site — they do not use this component.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from './BrandMark';
import { Button, type ButtonKind } from './Button';
import type { IconName } from './icons';
import { SettleSlam } from './SettleSlam';
import { Text } from './Text';
import { useTheme, type Theme } from './useTheme';

export interface EmptyStateCta {
  label: string;
  onPress: () => void;
  /** Defaults to primary (volt). Use secondary/ghost for non-act-now exits. */
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function EmptyState({
  title,
  hint,
  cta,
  icon = true,
}: {
  title: string;
  hint?: string;
  cta?: EmptyStateCta;
  icon?: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      {icon ? <BrandMark size={56} /> : null}
      <SettleSlam>
        <Text variant="display" color={theme.color.inkHero} style={styles.title}>
          {title}
        </Text>
      </SettleSlam>
      {hint ? (
        <Text variant="meta" color={theme.color.inkTertiary} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
      {cta ? (
        <Button
          label={cta.label}
          kind={cta.kind ?? 'primary'}
          size="cta"
          icon={cta.icon}
          loading={cta.loading}
          onPress={cta.onPress}
          accessibilityLabel={cta.accessibilityLabel}
          accessibilityHint={cta.accessibilityHint}
          style={styles.cta}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Stretch so the CTA runs the full padded width even inside centered
    // (alignItems: 'center') screen containers.
    wrap: { alignSelf: 'stretch', alignItems: 'center', gap: theme.space.s4 },
    title: { textAlign: 'center' },
    hint: { textAlign: 'center' },
    cta: { alignSelf: 'stretch', marginTop: theme.space.s2 },
  });
