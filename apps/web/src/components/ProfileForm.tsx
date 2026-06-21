'use client';

import { useActionState, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { updateProfileAction } from '@/actions/profile';
import { EMPTY_GROUP_STATE } from '@/actions/groups-state';
import { Button } from './Button';
import { FormField } from './FormField';
import { personColor } from '@/lib/group-visuals';

export function ProfileForm({
  userId,
  displayName,
  bio,
  avatarUrl,
}: {
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, EMPTY_GROUP_STATE);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [compressing, setCompressing] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const onPickFile = async () => {
    const input = fileRef.current;
    const file = input?.files?.[0];
    setImgError(null);
    if (!input || !file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImgError('Use a JPEG, PNG, or WebP image.');
      input.value = '';
      return;
    }
    setCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 256,
        useWebWorker: true,
      });
      const swapped = new File([compressed], file.name, { type: compressed.type });
      const dt = new DataTransfer();
      dt.items.add(swapped);
      input.files = dt.files;
      setPreview(URL.createObjectURL(swapped));
    } catch {
      setImgError('Could not process that image. Try another.');
      input.value = '';
    } finally {
      setCompressing(false);
    }
  };

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt="Your avatar"
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-xl font-extrabold text-white"
            style={{ background: personColor(userId) }}
          >
            {(displayName[0] ?? '?').toUpperCase()}
          </span>
        )}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="avatar"
            className="inline-flex cursor-pointer items-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-content transition-colors hover:bg-surface-2"
          >
            {compressing ? 'Processing…' : 'Change photo'}
          </label>
          <input
            ref={fileRef}
            id="avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickFile}
            className="sr-only"
          />
          {imgError && (
            <p className="text-xs text-red-600" role="alert">
              {imgError}
            </p>
          )}
        </div>
      </div>

      <FormField
        label="Display name"
        name="displayName"
        required
        maxLength={60}
        defaultValue={displayName}
        error={state.fieldErrors?.displayName?.[0]}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="field-bio" className="text-sm font-medium text-content">
          Bio
        </label>
        <textarea
          id="field-bio"
          name="bio"
          rows={2}
          maxLength={160}
          defaultValue={bio ?? ''}
          placeholder="A line about you (optional)"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
        {state.fieldErrors?.bio?.[0] && (
          <p className="text-xs text-red-600" role="alert">
            {state.fieldErrors.bio[0]}
          </p>
        )}
      </div>

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
      <Button type="submit" loading={pending || compressing}>
        Save profile
      </Button>
    </form>
  );
}
