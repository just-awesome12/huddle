import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
