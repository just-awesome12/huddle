import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Montserrat, Lato } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-montserrat',
  display: 'swap',
});

const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-lato',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Huddle',
  description: 'Group-based idea sharing for events, activities, food, and places.',
};

/*
 * Set the theme class before paint to avoid a flash of the wrong theme.
 * Reads the persisted preference (cookie-mirrored localStorage) and
 * falls back to the OS setting. Kept inline + tiny; ThemeProvider takes
 * over for runtime changes.
 */
const noFlashScript = `(function(){try{var p=localStorage.getItem('huddle-theme');var d=p==='dark'||((!p||p==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${lato.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-content antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
