import { BrandMark } from './BrandMark';

/**
 * The FlexYug mark — the "loaded-bar" barbell (see BrandMark.tsx).
 * Kept under the historical name `FBarMark` so existing call sites (Today,
 * Login) don't need to change. `accent`/`ink` pass through to the mark.
 */
export function FBarMark({
  size = 40,
  accent,
  ink,
}: {
  size?: number;
  accent?: string;
  ink?: string;
}) {
  return <BrandMark size={size} accent={accent} ink={ink} />;
}
