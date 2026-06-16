import Link from 'next/link';
import { CreateGroupForm } from '@/components/CreateGroupForm';

export default function NewGroupPage() {
  return (
    <div className="mx-auto max-w-md">
      <Link href="/groups" className="text-sm text-muted hover:text-content">
        &larr; Back to groups
      </Link>
      <h2 className="mt-4 text-xl font-medium">Create a group</h2>
      <p className="mt-1 text-sm text-muted">
        You&apos;ll be the admin. You can invite people once it exists.
      </p>
      <div className="mt-6">
        <CreateGroupForm />
      </div>
    </div>
  );
}
