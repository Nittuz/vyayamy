import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { brand, colors, font } from './theme';

type LogoVariant = 'brand' | 'light' | 'dark';

interface LogoProps {
  size?: number;
  variant?: LogoVariant;
  showWordmark?: boolean;
}

const VIEWBOX_W = 100;
const VIEWBOX_H = 60;

const variantColors: Record<LogoVariant, { mark: string; text: string }> = {
  brand: { mark: brand.saffron, text: brand.stone },
  light: { mark: '#FFFFFF', text: '#FFFFFF' },
  dark: { mark: brand.stone, text: brand.stone },
};

export function DumbbellMark({ size = 40, color = brand.saffron }: { size?: number; color?: string }) {
  const h = size;
  const w = (VIEWBOX_W / VIEWBOX_H) * h;

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}>
      <Rect x={0} y={22} width={100} height={16} rx={8} fill={color} />
      <Rect x={0} y={0} width={24} height={60} rx={6} fill={color} />
      <Rect x={76} y={0} width={24} height={60} rx={6} fill={color} />
    </Svg>
  );
}

export function Logo({ size = 40, variant = 'brand', showWordmark = true }: LogoProps) {
  const { mark, text } = variantColors[variant];

  return (
    <View style={styles.container}>
      <DumbbellMark size={size} color={mark} />
      {showWordmark && (
        <Text style={[styles.wordmark, { color: text, fontSize: size * 0.6 }]}>
          {brand.name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
  },
});
