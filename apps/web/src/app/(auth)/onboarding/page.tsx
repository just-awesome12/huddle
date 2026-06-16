import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { OnboardingForm } from '@/components/OnboardingForm';

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Suggest a display name from the OAuth metadata or pending fields
  // (set during email signup). Falls back to empty.
  const meta = user.user_metadata ?? {};
  const suggestedDisplayName =
    (typeof meta.pending_display_name === 'string' && meta.pending_display_name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Pick a username</h2>
        <p className="text-sm text-muted">
          One more step before you can start sharing ideas. Your username and
          display name appear in every group you join.
        </p>
      </div>
      <OnboardingForm suggestedDisplayName={suggestedDisplayName} />
    </div>
  );
}
