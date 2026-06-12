import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupIdeas,
  fetchIdea,
  createIdea,
  updateIdea,
  updateIdeaStatus,
  deleteIdea,
  buildIdeaPhotoPath,
  isAllowedPhotoType,
  uploadIdeaPhoto,
  removeIdeaPhoto,
  getIdeaPhotoUrl,
  ideaQueryKeys,
} from '../src/ideas';

// -----------------------------------------------------------------------
// Minimal Supabase client mock factory
// -----------------------------------------------------------------------

function makeIdea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'idea-1',
    group_id: 'group-1',
    proposed_by: 'user-1',
    title: 'Taco night',
    description: null,
    category: 'food',
    link: null,
    photo_path: null,
    status: 'on_radar',
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
    proposer: { id: 'user-1', username: 'ann', display_name: 'Ann', avatar_url: null },
    ...overrides,
  };
}

function makeClient({
  user = { id: 'user-1' },
  queryData = null as unknown,
  queryError = null as unknown,
  storageError = null as unknown,
  signedUrl = 'https://signed.example/x',
} = {}) {
  const result = { data: queryData, error: queryError };
  const fromChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  const storageBucket = {
    upload: vi.fn().mockResolvedValue({ data: { path: 'p' }, error: storageError }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: storageError ? null : { signedUrl },
      error: storageError,
    }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(fromChain),
    storage: { from: vi.fn().mockReturnValue(storageBucket) },
    _chain: fromChain,
    _storage: storageBucket,
  };
}

// -----------------------------------------------------------------------
// ideaQueryKeys
// -----------------------------------------------------------------------

describe('ideaQueryKeys', () => {
  it('embeds filters in the list key so combos cache independently', () => {
    expect(ideaQueryKeys.forGroup('g1', { status: 'done' })).toEqual([
      'groups',
      'g1',
      'ideas',
      { status: 'done', category: null },
    ]);
  });

  it('allForGroup is a prefix of every filtered key', () => {
    expect(ideaQueryKeys.allForGroup('g1')).toEqual(['groups', 'g1', 'ideas']);
  });
});

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

describe('fetchGroupIdeas', () => {
  it('lists ideas for the group, newest first', async () => {
    const client = makeClient({ queryData: [makeIdea()] });
    const result = await fetchGroupIdeas(client as never, 'group-1');
    expect(result).toHaveLength(1);
    expect(client._chain.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(client._chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('applies status and category filters when given', async () => {
    const client = makeClient({ queryData: [] });
    await fetchGroupIdeas(client as never, 'group-1', {
      status: 'on_radar',
      category: 'food',
    });
    expect(client._chain.eq).toHaveBeenCalledWith('status', 'on_radar');
    expect(client._chain.eq).toHaveBeenCalledWith('category', 'food');
  });

  it('omits filter clauses when no filters are given', async () => {
    const client = makeClient({ queryData: [] });
    await fetchGroupIdeas(client as never, 'group-1');
    const eqCalls = client._chain.eq.mock.calls.map((c) => c[0]);
    expect(eqCalls).toEqual(['group_id']);
  });

  it('maps errors through the HuddleError taxonomy', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(fetchGroupIdeas(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('fetchIdea', () => {
  it('fetches a single idea with its proposer', async () => {
    const client = makeClient({ queryData: makeIdea() });
    const idea = await fetchIdea(client as never, 'idea-1');
    expect(idea.proposer?.username).toBe('ann');
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'idea-1');
  });
});

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

describe('createIdea', () => {
  it('inserts with proposed_by from the session', async () => {
    const client = makeClient({ queryData: makeIdea() });
    await createIdea(client as never, {
      groupId: 'group-1',
      title: 'Taco night',
      category: 'food',
    });
    expect(client._chain.insert).toHaveBeenCalledWith({
      group_id: 'group-1',
      proposed_by: 'user-1',
      title: 'Taco night',
      category: 'food',
      description: null,
      link: null,
    });
  });

  it('throws unauthorized when not signed in', async () => {
    const client = makeClient({ user: null as never });
    await expect(
      createIdea(client as never, { groupId: 'g', title: 't', category: 'food' }),
    ).rejects.toMatchObject({ huddle: { kind: 'unauthorized' } });
  });

  it('maps the title CHECK violation to validation', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '23514', message: 'ideas_title_length' },
    });
    await expect(
      createIdea(client as never, { groupId: 'g', title: ' ', category: 'food' }),
    ).rejects.toMatchObject({ huddle: { kind: 'validation' } });
  });
});

describe('updateIdea', () => {
  it('patches only the provided fields', async () => {
    const client = makeClient({ queryData: makeIdea({ title: 'New' }) });
    await updateIdea(client as never, 'idea-1', { title: 'New' });
    expect(client._chain.update).toHaveBeenCalledWith({ title: 'New' });
  });
});

describe('updateIdeaStatus', () => {
  it('updates just the status column', async () => {
    const client = makeClient({ queryData: makeIdea({ status: 'done' }) });
    const idea = await updateIdeaStatus(client as never, 'idea-1', 'done');
    expect(idea.status).toBe('done');
    expect(client._chain.update).toHaveBeenCalledWith({ status: 'done' });
  });
});

describe('deleteIdea', () => {
  it('deletes by id', async () => {
    const client = makeClient({ queryData: null });
    await expect(deleteIdea(client as never, 'idea-1')).resolves.toBeUndefined();
    expect(client._chain.delete).toHaveBeenCalled();
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'idea-1');
  });

  it('maps RLS denial (non-proposer non-admin) to unauthorized', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(deleteIdea(client as never, 'idea-1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });

  it('removes the storage photo after deleting the row', async () => {
    const client = makeClient({ queryData: null });
    await deleteIdea(client as never, 'idea-1', 'g/i/photo.jpg');
    expect(client._storage.remove).toHaveBeenCalledWith(['g/i/photo.jpg']);
  });

  it('does not touch storage when the row delete fails', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(
      deleteIdea(client as never, 'idea-1', 'g/i/photo.jpg'),
    ).rejects.toBeTruthy();
    expect(client._storage.remove).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Photos
// -----------------------------------------------------------------------

describe('buildIdeaPhotoPath / isAllowedPhotoType', () => {
  it('builds {group}/{idea}/{unique}.{ext} from the content type', () => {
    const path = buildIdeaPhotoPath('g1', 'i1', 'image/jpeg');
    expect(path).toMatch(/^g1\/i1\/[a-z0-9-]+\.jpg$/);
  });

  it('generates distinct names on repeated calls', () => {
    const a = buildIdeaPhotoPath('g', 'i', 'image/png');
    const b = buildIdeaPhotoPath('g', 'i', 'image/png');
    expect(a).not.toBe(b);
  });

  it('rejects content types the bucket disallows', () => {
    expect(() => buildIdeaPhotoPath('g', 'i', 'image/gif')).toThrow(/unsupported/);
    expect(isAllowedPhotoType('image/gif')).toBe(false);
    expect(isAllowedPhotoType('image/webp')).toBe(true);
  });
});

describe('uploadIdeaPhoto', () => {
  const params = {
    groupId: 'g1',
    ideaId: 'i1',
    data: new ArrayBuffer(8),
    contentType: 'image/jpeg',
  };

  it('uploads, points the row at the new path, returns it', async () => {
    const client = makeClient({ queryData: null });
    const path = await uploadIdeaPhoto(client as never, params);
    expect(path).toMatch(/^g1\/i1\//);
    expect(client._storage.upload).toHaveBeenCalledWith(path, params.data, {
      contentType: 'image/jpeg',
    });
    expect(client._chain.update).toHaveBeenCalledWith({ photo_path: path });
  });

  it('removes the previous photo after a successful swap', async () => {
    const client = makeClient({ queryData: null });
    await uploadIdeaPhoto(client as never, { ...params, previousPath: 'g1/i1/old.jpg' });
    expect(client._storage.remove).toHaveBeenCalledWith(['g1/i1/old.jpg']);
  });

  it('rolls back the uploaded object when the row update fails', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(uploadIdeaPhoto(client as never, params)).rejects.toBeTruthy();
    // remove called once — with the NEW path (rollback), not previousPath
    expect(client._storage.remove).toHaveBeenCalledTimes(1);
    const removed = client._storage.remove.mock.calls[0]![0] as string[];
    expect(removed[0]).toMatch(/^g1\/i1\//);
  });

  it('surfaces storage upload failures', async () => {
    const client = makeClient({
      storageError: { statusCode: '403', message: 'new row violates row-level security' },
    });
    await expect(uploadIdeaPhoto(client as never, params)).rejects.toBeTruthy();
    expect(client._chain.update).not.toHaveBeenCalled();
  });
});

describe('removeIdeaPhoto / getIdeaPhotoUrl', () => {
  it('clears the row pointer, then removes the object', async () => {
    const client = makeClient({ queryData: null });
    await removeIdeaPhoto(client as never, 'i1', 'g1/i1/x.jpg');
    expect(client._chain.update).toHaveBeenCalledWith({ photo_path: null });
    expect(client._storage.remove).toHaveBeenCalledWith(['g1/i1/x.jpg']);
  });

  it('returns a signed URL', async () => {
    const client = makeClient({ queryData: null, signedUrl: 'https://s/url' });
    await expect(getIdeaPhotoUrl(client as never, 'g1/i1/x.jpg')).resolves.toBe(
      'https://s/url',
    );
    expect(client._storage.createSignedUrl).toHaveBeenCalledWith('g1/i1/x.jpg', 3600);
  });
});
