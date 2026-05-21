import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Huddle</h1>
        {children}
      </div>
    </div>
  );
}
