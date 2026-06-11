import * as Notifications from 'expo-notifications';

import { deriveRestAlertStatus, type RestAlertStatus } from './notificationStatus';

const REST_CATEGORY = 'rest-timer';

// Register the foreground presentation handler at MODULE SCOPE (i.e. app start),
// not lazily after the first permission grant, so a notification that fires while
// the app is foregrounded is actually presented (#163).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function normalize(settings: Notifications.NotificationPermissionsStatus): {
  granted: boolean;
  provisional: boolean;
  canAskAgain: boolean;
} {
  const provisional = settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  return {
    granted: Boolean(settings.granted),
    provisional,
    canAskAgain: settings.canAskAgain !== false,
  };
}

/** Current rest-alert permission state, for the UI to surface (#158). */
export async function getRestAlertStatus(): Promise<RestAlertStatus> {
  try {
    return deriveRestAlertStatus(normalize(await Notifications.getPermissionsAsync()));
  } catch {
    return 'undetermined';
  }
}

/**
 * Explicitly prompt for notification permission — call from a deliberate moment
 * (a Profile row, or just before the first rest of a workout), NOT lazily from
 * scheduleRestDone. Crucially this does NOT pass allowProvisional, so iOS shows
 * a real prompt and a granted alert is delivered prominently rather than silently
 * (#157). Returns the resulting status.
 */
export async function primeRestAlerts(): Promise<RestAlertStatus> {
  try {
    const current = normalize(await Notifications.getPermissionsAsync());
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return deriveRestAlertStatus(normalize(asked));
  } catch {
    return 'undetermined';
  }
}

/**
 * Schedule a local notification to fire after `seconds`. Does NOT request
 * permission (priming is a separate, deliberate step). Returns the id, or null
 * if alerts aren't authorized. Permission is checked fresh every time so a
 * mid-session revocation is respected (#162).
 */
export async function scheduleRestDone(seconds: number): Promise<string | null> {
  if (seconds <= 0) return null;
  try {
    const status = deriveRestAlertStatus(normalize(await Notifications.getPermissionsAsync()));
    if (status === 'denied' || status === 'undetermined') return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: 'Time for the next set.',
        categoryIdentifier: REST_CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
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
