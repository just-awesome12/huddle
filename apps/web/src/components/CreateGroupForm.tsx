'use client';

import { useActionState } from 'react';
import { createGroupAction } from '@/actions/groups';
import { EMPTY_GROUP_STATE } from '@/actions/groups-state';
import { Button } from './Button';
import { FormField } from './FormField';

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, EMPTY_GROUP_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <FormField
        label="Group name"
        name="name"
        required
        maxLength={80}
        hint="Up to 80 characters. You can rename it later."
        error={state.fieldErrors?.name?.[0]}
      />
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Create group
      </Button>
    </form>
  );
}
