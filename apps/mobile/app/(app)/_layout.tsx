import { Stack } from 'expo-router';
import { RealtimeProvider } from '@/context/RealtimeContext';
import { NotificationsManager } from '@/components/NotificationsManager';

export default function AppLayout() {
  // Wraps the signed-in app so realtime + push only run when authenticated.
  return (
    <RealtimeProvider>
      <NotificationsManager />
      <Stack screenOptions={{ headerShown: false }} />
    </RealtimeProvider>
  );
}
