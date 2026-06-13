'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import imageCompression from 'browser-image-compression';
import type { IdeaCategory } from '@huddle/validation';
import { createIdeaAction, updateIdeaAction } from '@/actions/ideas';
import { EMPTY_IDEA_STATE } from '@/actions/ideas-state';
import { CATEGORY_LABELS } from './IdeaBadges';
import { Button } from './Button';
import { FormField } from './FormField';

interface IdeaFormProps {
  groupId: string;
  /** When set, the form edits an existing idea instead of creating. */
  idea?: {
    id: string;
    title: string;
    description: string | null;
    category: IdeaCategory;
    link: string | null;
    photoPath: string | null;
  };
  /** Signed URL for the current photo (edit mode only). */
  currentPhotoUrl?: string | null;
}

const inputClasses =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-1';

/**
 * Shared create/edit form. Category is a native <select>, description a
 * <textarea> — FormField only wraps <input>, and these two are not worth
 * generalising it for yet.
 */
export function IdeaForm({ groupId, idea, currentPhotoUrl }: IdeaFormProps) {
  const isEdit = !!idea;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateIdeaAction : createIdeaAction,
    EMPTY_IDEA_STATE,
  );
  const [compressing, setCompressing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  /**
   * Compress in the browser BEFORE submit (max ~1MB, 1920px long edge)
   * and swap the compressed file back into the input via DataTransfer,
   * so the plain form action submits the small file. Keeps the Server
   * Action body well under the 4mb limit.
   */
  const onPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setPhotoError(null);
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Use a JPEG, PNG, or WebP image.');
      input.value = '';
      return;
    }

    setCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      const swapped = new File([compressed], file.name, { type: compressed.type });
      const dt = new DataTransfer();
      dt.items.add(swapped);
      input.files = dt.files;
    } catch {
      setPhotoError('Could not process that image. Try a different one.');
      input.value = '';
    } finally {
      setCompressing(false);
    }
  };

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="groupId" value={groupId} />
      {isEdit && <input type="hidden" name="ideaId" value={idea.id} />}

      <FormField
        label="Title"
        name="title"
        required
        maxLength={200}
        defaultValue={idea?.title ?? ''}
        error={state.fieldErrors?.title?.[0]}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="field-category" className="text-sm font-medium text-slate-700">
          Category
        </label>
        <select
          id="field-category"
          name="category"
          required
          defaultValue={idea?.category ?? 'food'}
          className={inputClasses}
        >
          {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.category?.[0] && (
          <p className="text-xs text-red-600" role="alert">
            {state.fieldErrors.category[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="field-description" className="text-sm font-medium text-slate-700">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="field-description"
          name="description"
          rows={4}
          maxLength={4000}
          defaultValue={idea?.description ?? ''}
          className={inputClasses}
        />
        {state.fieldErrors?.description?.[0] && (
          <p className="text-xs text-red-600" role="alert">
            {state.fieldErrors.description[0]}
          </p>
        )}
      </div>

      <FormField
        label="Link (optional)"
        name="link"
        type="url"
        placeholder="https://…"
        maxLength={2048}
        defaultValue={idea?.link ?? ''}
        hint="A menu, event page, map pin — anything useful."
        error={state.fieldErrors?.link?.[0]}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="field-photo" className="text-sm font-medium text-slate-700">
          Photo <span className="font-normal text-slate-400">(optional)</span>
        </label>
        {isEdit && currentPhotoUrl && (
          <div className="mb-1 flex items-center gap-3">
            <img
              src={currentPhotoUrl}
              alt="Current photo"
              className="h-16 w-16 rounded-md border border-slate-200 object-cover"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="removePhoto" value="1" />
              Remove current photo
            </label>
          </div>
        )}
        <input
          id="field-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPhotoChange}
          className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="text-xs text-slate-500">
          {compressing ? 'Compressing…' : 'Compressed in your browser before upload.'}
        </p>
        {photoError && (
          <p className="text-xs text-red-600" role="alert">
            {photoError}
          </p>
        )}
      </div>

      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}

      <div>
        <Button type="submit" loading={pending} disabled={compressing}>
          {isEdit ? 'Save idea' : 'Add idea'}
        </Button>
      </div>
    </form>
  );
}
