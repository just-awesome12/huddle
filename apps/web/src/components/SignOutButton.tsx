import { signOutAction } from '@/actions/auth';
import { Button } from './Button';

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
