/**
 * Casts a runtime string to expo-router's typed-route shape.
 *
 * expo-router auto-generates typed routes from `app/*` filenames, but
 * dynamic routes (e.g. `/history/[id]`) and routes added mid-session
 * don't always show up in the typed inference. Rather than sprinkling
 * `as never` casts everywhere, route through this helper so the cast
 * lives in one place and can be removed once typed routes stabilize.
 */
export function safeRoute(path: string): never {
  return path as never;
}
