import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup, fetchGroupMembers } from '@huddle/api-client/groups';
import { fetchGroupPosts, type PostWithAuthor } from '@huddle/api-client/posts';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { PostComposer } from '@/components/PostComposer';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { deletePostAction } from '@/actions/posts';
import { personColor } from '@/lib/group-visuals';

/** Compact relative time ("just now", "5m ago", "3d ago", then a date). */
function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function GroupWallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let group;
  let members;
  let posts: PostWithAuthor[];
  try {
    group = await fetchGroup(supabase, id);
    members = await fetchGroupMembers(supabase, id);
    posts = await fetchGroupPosts(supabase, id);
  } catch {
    notFound();
  }

  // Public-group rows are visible to non-members, but the wall is for
  // members only — bounce them to discovery (redirect throws, so keep it
  // out of the try above).
  const myMembership = members.find((m) => m.userId === user.id);
  if (!myMembership) redirect('/discover');
  const isAdmin = myMembership.role === 'admin';

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to {group.name}
      </Link>

      <h2 className="mt-4 font-display text-xl font-extrabold text-content">Wall</h2>
      <p className="mt-1 text-sm text-muted">A spot for whatever&rsquo;s on your mind.</p>

      <div className="mt-5">
        <PostComposer groupId={id} />
      </div>

      <ul className="mt-6 flex flex-col gap-3" data-testid="wall-posts">
        {posts.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            No posts yet. Start the conversation.
          </li>
        ) : (
          posts.map((post) => {
            const canDelete = post.author?.id === user.id || isAdmin;
            const name = post.author?.display_name ?? 'Former member';
            return (
              <li
                key={post.id}
                className="rounded-2xl border border-line bg-surface p-4"
                data-testid="wall-post"
              >
                <div className="flex items-center gap-2.5">
                  {post.author?.avatar_url ? (
                    <img
                      src={post.author.avatar_url}
                      alt=""
                      aria-hidden
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white"
                      style={{ background: personColor(post.author?.id ?? post.id) }}
                    >
                      {(name[0] ?? '?').toUpperCase()}
                    </span>
                  )}
                  <span className="font-display text-sm font-extrabold text-content">{name}</span>
                  <span className="text-xs text-muted">{timeAgo(post.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-content">
                  {post.body}
                </p>
                {canDelete && (
                  <div className="mt-2">
                    <ConfirmActionForm
                      action={deletePostAction}
                      fields={{ groupId: id, postId: post.id }}
                      buttonLabel="Delete"
                      confirmPrompt="Delete this post?"
                      confirmLabel="Delete"
                      variant="secondary"
                    />
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
