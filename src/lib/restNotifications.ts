import * as Notifications from 'expo-notifications';

const REST_CATEGORY = 'rest-timer';
let configured = false;

async function ensureConfigured(): Promise<boolean> {
  if (configured) return true;
  try {
    const settings = await Notifications.getPermissionsAsync();
    const granted =
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const ask = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false, provideAppNotificationSettings: false, allowProvisional: true },
      });
      if (!ask.granted && ask.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
        return false;
      }
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    configured = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedule a local notification to fire after `seconds` seconds.
 * Returns the notification id or null if not available (web, denied).
 */
export async function scheduleRestDone(seconds: number): Promise<string | null> {
  if (seconds <= 0) return null;
  const ok = await ensureConfigured();
  if (!ok) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: 'Time for the next set.',
        categoryIdentifier: REST_CATEGORY,
      },
      trigger: { seconds, repeats: false },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelRest(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // noop
  }
}
