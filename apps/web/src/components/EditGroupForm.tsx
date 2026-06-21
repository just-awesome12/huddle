'use client';

import { useActionState } from 'react';
import { updateGroupAction } from '@/actions/groups';
import { EMPTY_GROUP_STATE } from '@/actions/groups-state';
import { Button } from './Button';
import { FormField } from './FormField';
import { GroupFormFields, type GroupFieldDefaults } from './GroupFormFields';
import { GroupIdentityFields } from './GroupIdentityFields';

export function EditGroupForm({
  groupId,
  name,
  defaults,
  storedEmoji,
  storedColor,
  coverUrl,
}: {
  groupId: string;
  name: string;
  defaults: GroupFieldDefaults;
  storedEmoji: string | null;
  storedColor: string | null;
  coverUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateGroupAction, EMPTY_GROUP_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="groupId" value={groupId} />
      <FormField
        label="Group name"
        name="name"
        required
        maxLength={80}
        defaultValue={name}
        error={state.fieldErrors?.name?.[0]}
      />
      <GroupFormFields defaults={defaults} errors={state.fieldErrors} />
      <GroupIdentityFields
        groupId={groupId}
        storedEmoji={storedEmoji}
        storedColor={storedColor}
        coverUrl={coverUrl}
      />
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      {state.success && (
        <p className="text-sm font-medium text-content" role="status">
          Saved.
        </p>
      )}
      <Button type="submit" loading={pending}>
        Save changes
      </Button>
    </form>
  );
}
