'use client';

import type { GroupVisibility } from '@huddle/validation';
import { FormField } from './FormField';

export interface GroupFieldDefaults {
  description?: string | null;
  location?: string | null;
  tags?: string[];
  visibility?: GroupVisibility;
}

/**
 * Shared description / location / tags / visibility inputs for the create
 * and edit group forms. Names match the Server Action's parseGroupForm.
 */
export function GroupFormFields({
  defaults = {},
  errors,
}: {
  defaults?: GroupFieldDefaults;
  errors?: Record<string, string[] | undefined>;
}) {
  const visibility = defaults.visibility ?? 'invite_only';

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="field-description" className="text-sm font-medium text-content">
          Description
        </label>
        <textarea
          id="field-description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={defaults.description ?? ''}
          placeholder="What's this group about?"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
        />
        {errors?.description?.[0] && (
          <p className="text-xs text-red-600" role="alert">
            {errors.description[0]}
          </p>
        )}
      </div>

      <FormField
        label="Location"
        name="location"
        maxLength={120}
        defaultValue={defaults.location ?? ''}
        hint="Optional — e.g. Austin, TX"
        error={errors?.location?.[0]}
      />

      <FormField
        label="Tags"
        name="tags"
        defaultValue={(defaults.tags ?? []).join(', ')}
        hint="Comma-separated, up to 8 (e.g. food, hiking, board games)"
        error={errors?.tags?.[0]}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-content">Visibility</legend>
        <label className="flex items-start gap-2 text-sm text-content">
          <input
            type="radio"
            name="visibility"
            value="invite_only"
            defaultChecked={visibility === 'invite_only'}
            className="mt-1 h-4 w-4 border-line text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="font-medium">Invite-only</span> — people join by invite link or
            username.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-content">
          <input
            type="radio"
            name="visibility"
            value="public"
            defaultChecked={visibility === 'public'}
            className="mt-1 h-4 w-4 border-line text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="font-medium">Public</span> — discoverable in search; people can request
            to join.
          </span>
        </label>
      </fieldset>
    </>
  );
}
