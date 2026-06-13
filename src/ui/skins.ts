/**
 * Skin registry — collapsed to the single Forged Iron identity.
 *
 * The multi-skin system (Forge/Iron/Ember/Chalk) was retired with the Forged
 * Iron redesign: one confident look beats four muted variants. The registry
 * shape survives so `useTheme`/`SkinContext` and persistence keep working —
 * `coerceSkin` maps any legacy stored id ('iron', 'ember', 'chalk') onto the
 * default, so existing installs migrate silently on first launch.
 */
import { darkPalette, lightPalette, type PaletteTokens } from './colors';

export type SkinId = 'forge';
export const SKIN_IDS: SkinId[] = ['forge'];

export const SKIN_META: Record<SkinId, { name: string; blurb: string }> = {
  forge: { name: 'Forged Iron', blurb: 'Iron black, bone ink, ember accent' },
};

export const DEFAULT_SKIN: SkinId = 'forge';

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && (SKIN_IDS as string[]).includes(v);
}

/** Coerce an unknown persisted value into a valid skin id, falling back to the default. */
export function coerceSkin(stored: unknown): SkinId {
  return isSkinId(stored) ? stored : DEFAULT_SKIN;
}

export const skins: Record<SkinId, { dark: PaletteTokens; light: PaletteTokens }> = {
  forge: { dark: darkPalette, light: lightPalette },
};
