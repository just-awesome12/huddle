import { redirect } from 'next/navigation';

/**
 * The app shell home. Groups are the top-level navigation unit
 * (Phase 3), so the home route simply forwards there.
 */
export default function HomePage() {
  redirect('/groups');
}
