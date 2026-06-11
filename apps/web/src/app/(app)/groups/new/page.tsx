import Link from 'next/link';
import { CreateGroupForm } from '@/components/CreateGroupForm';

export default function NewGroupPage() {
  return (
    <div className="mx-auto max-w-md">
      <Link href="/groups" className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back to groups
      </Link>
      <h2 className="mt-4 text-xl font-medium">Create a group</h2>
      <p className="mt-1 text-sm text-slate-500">
        You&apos;ll be the admin. You can invite people once it exists.
      </p>
      <div className="mt-6">
        <CreateGroupForm />
      </div>
    </div>
  );
}
