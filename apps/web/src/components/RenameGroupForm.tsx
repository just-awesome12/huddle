'use client';

import { useActionState } from 'react';
import { renameGroupAction } from '@/actions/groups';
import { EMPTY_GROUP_STATE } from '@/actions/groups-state';
import { Button } from './Button';
import { FormField } from './FormField';

interface RenameGroupFormProps {
  groupId: string;
  currentName: string;
}

export function RenameGroupForm({ groupId, currentName }: RenameGroupFormProps) {
  const [state, formAction, pending] = useActionState(renameGroupAction, EMPTY_GROUP_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <FormField
        label="Group name"
        name="name"
        required
        maxLength={80}
        defaultValue={currentName}
        error={state.fieldErrors?.name?.[0]}
      />
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          Group renamed.
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          Save name
        </Button>
      </div>
    </form>
  );
}
