'use client';

import { useActionState } from 'react';
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
  };
}

const inputClasses =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-1';

/**
 * Shared create/edit form. Category is a native <select>, description a
 * <textarea> — FormField only wraps <input>, and these two are not worth
 * generalising it for yet.
 */
export function IdeaForm({ groupId, idea }: IdeaFormProps) {
  const isEdit = !!idea;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateIdeaAction : createIdeaAction,
    EMPTY_IDEA_STATE,
  );

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

      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}

      <div>
        <Button type="submit" loading={pending}>
          {isEdit ? 'Save idea' : 'Add idea'}
        </Button>
      </div>
    </form>
  );
}
