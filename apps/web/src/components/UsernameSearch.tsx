'use client';

import { useActionState, useEffect, useState } from 'react';
import type { ProfileSearchResult } from '@huddle/api-client/profiles';
import { createInviteAction } from '@/actions/invites';
import { EMPTY_INVITE_STATE } from '@/actions/invites-state';
import { Button } from './Button';
import { FormField } from './FormField';

interface UsernameSearchProps {
  groupId: string;
}

/**
 * Add-by-username: debounced prefix search against
 * /api/profiles/search, then one-click invite per result. The created
 * invite is addressed to that user (invited_user_id) — it shows up in
 * their "Invites for you" list and only they can accept it.
 */
export function UsernameSearch({ groupId }: UsernameSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q === '') {
      setResults([]);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.status === 429) {
          setSearchError('Searching too fast — wait a moment and try again.');
          setResults([]);
          return;
        }
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body = (await res.json()) as { results?: ProfileSearchResult[] };
        setResults(body.results ?? []);
      } catch {
        // Aborted or network error — keep prior state.
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label="Add by username"
        name="usernameSearch"
        autoComplete="off"
        placeholder="Start typing a username…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        hint="Invites the person directly — only their account can accept."
      />
      {searchError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {searchError}
        </p>
      )}
      {query.trim() !== '' && !searching && !searchError && results.length === 0 && (
        <p className="text-sm text-muted">No matching usernames.</p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="username-results">
          {results.map((profile) => (
            <SearchResultRow key={profile.id} groupId={groupId} profile={profile} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchResultRow({ groupId, profile }: { groupId: string; profile: ProfileSearchResult }) {
  const [state, formAction, pending] = useActionState(createInviteAction, EMPTY_INVITE_STATE);
  const invited = !!state.createdToken;

  return (
    <li className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-content">{profile.display_name}</span>
        <span className="text-xs text-muted">@{profile.username}</span>
      </div>
      <form action={formAction} className="flex flex-col items-end gap-1">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="invitedUserId" value={profile.id} />
        {invited ? (
          <span className="text-sm font-medium text-green-700">Invited ✓</span>
        ) : (
          <Button type="submit" variant="secondary" loading={pending}>
            Invite
          </Button>
        )}
        {state.formError && (
          <span className="text-xs text-red-600" role="alert">
            {state.formError}
          </span>
        )}
      </form>
    </li>
  );
}
