import { useEffect } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import {
  configureNotificationHandler,
  registerForPush,
  addNotificationResponseListener,
  getInitialNotificationPath,
} from '@/lib/notifications';

// Configure foreground display once at module load (no-op on web).
configureNotificationHandler();

/**
 * Headless manager mounted inside the signed-in app:
 *   - registers this device for push once a session exists
 *   - routes notification taps (and cold-start launches) to the deep
 *     link carried in the notification's `data.path`
 */
export function NotificationsManager() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  useEffect(() => {
    if (userId) void registerForPush();
  }, [userId]);

  useEffect(() => {
    const unsubscribe = addNotificationResponseListener((path) => {
      router.push(path as Href);
    });
    void getInitialNotificationPath().then((path) => {
      if (path) router.push(path as Href);
    });
    return unsubscribe;
  }, [router]);

  return null;
}
