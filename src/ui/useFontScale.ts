/**
 * Font-scale for inline-with-text icons only (arrows/chevrons sitting beside
 * scalable copy). Clamps to the same 1.5x metadata ceiling as the `strip`/
 * `label` text variants (textVariants.ts) so an icon can never outgrow the
 * text it sits next to — sweeping every icon in the app is explicitly out of
 * scope; this is for the inline-with-text cases only.
 *
 * `useWindowDimensions().fontScale` (not `PixelRatio.getFontScale()`) because
 * it re-renders when the OS text-size setting changes while the app is
 * foregrounded — `PixelRatio.getFontScale()` is a point-in-time read.
 */
import { useWindowDimensions } from 'react-native';

export function useFontScale(max = 1.5): number {
  const { fontScale } = useWindowDimensions();
  return Math.min(fontScale, max);
}
