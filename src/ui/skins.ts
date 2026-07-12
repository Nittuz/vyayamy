/**
 * Skin registry — collapsed to the single Forged Iron identity.
 *
 * The multi-skin system (Forge/Iron/Ember/Chalk) was retired with the Forged
 * Iron redesign: one confident look beats four muted variants. Only the shape
 * `buildTheme` needs survives — the id type, the default, and the palette
 * lookup. Persistence, coercion, and the picker metadata are gone (#39,
 * speculative generality).
 */
import { darkPalette, lightPalette, type PaletteTokens } from './colors';

export type SkinId = 'forge';

export const DEFAULT_SKIN: SkinId = 'forge';

export const skins: Record<SkinId, { dark: PaletteTokens; light: PaletteTokens }> = {
  forge: { dark: darkPalette, light: lightPalette },
};
