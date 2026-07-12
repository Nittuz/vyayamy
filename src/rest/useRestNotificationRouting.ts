import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * Route a tapped "Rest complete" notification back into the workout, including
 * when the tap cold-starts the app — otherwise the user is stranded on whatever
 * screen launched (#159).
 */
export function useRestNotificationRouting(): void {
  useEffect(() => {
    const toWorkout = (response: Notifications.NotificationResponse | null) => {
      const category = response?.notification.request.content.categoryIdentifier;
      if (category === 'rest-timer') router.navigate('/workout/active');
    };
    const sub = Notifications.addNotificationResponseReceivedListener(toWorkout);
    void Notifications.getLastNotificationResponseAsync().then(toWorkout);
    return () => sub.remove();
  }, []);
}
