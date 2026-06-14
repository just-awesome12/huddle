import { Stack } from 'expo-router';
import { RealtimeProvider } from '@/context/RealtimeContext';

export default function AppLayout() {
  // Wraps the signed-in app so realtime only runs when authenticated.
  return (
    <RealtimeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </RealtimeProvider>
  );
}
