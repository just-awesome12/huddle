import { useMutation } from '@tanstack/react-query';
import { deleteAccount } from './account';
import type { HuddleClient } from './internal';

/**
 * Hook + re-exports over ./account (mobile). The caller signs out in the
 * mutation's onSuccess so the app returns to the auth stack.
 */

export {
  deleteAccount,
  SoleAdminError,
  AccountDeletionError,
  type SoleAdminGroup,
} from './account';

export function useDeleteAccount(client: HuddleClient) {
  return useMutation<void, Error, void>({
    mutationFn: () => deleteAccount(client),
  });
}
