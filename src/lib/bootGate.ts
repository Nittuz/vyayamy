/**
 * Boot gate for the root navigator.
 *
 * Custom fonts register at runtime (useFonts). React Native resolves a Text
 * node's fontFamily when it is laid out; an unregistered family silently
 * falls back to the system font and the node is never re-measured when the
 * font arrives later. So any screen laid out before registration keeps the
 * fallback for the life of the process (TestFlight build 7: the Login
 * wordmark rendered in the system font on a physical iPhone, never on the
 * simulator, where registration always wins the race).
 *
 * The navigator therefore mounts only once fonts are loaded — or once loading
 * has failed, because a fallback font beats an app stuck on the boot overlay.
 */
export function canMountNavigator(fontsLoaded: boolean, fontError: Error | null): boolean {
  return fontsLoaded || fontError != null;
}
