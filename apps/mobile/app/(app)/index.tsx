import { Redirect } from 'expo-router';

/**
 * The app home. Groups are the top-level navigation unit (Phase 3),
 * and the route shape mirrors the web app (/groups/...) so deep links
 * stay consistent across platforms (matters for Phase 4 invites).
 */
export default function HomeScreen() {
  return <Redirect href="/groups" />;
}
