'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile widget.
 *
 * Renders Cloudflare's challenge widget and exposes the returned token
 * through a hidden form input named `turnstileToken`. The surrounding
 * form picks that up via formData.get('turnstileToken').
 *
 * The widget itself is rendered by a script Cloudflare hosts. We load
 * that script once per page and then call window.turnstile.render to
 * mount it into our div.
 *
 * In dev (when NEXT_PUBLIC_TURNSTILE_SITE_KEY is a test key), the
 * widget shows a small "Testing" badge and produces a token that
 * Cloudflare's siteverify accepts unconditionally.
 *
 * TEST-MODE BYPASS: when NEXT_PUBLIC_TURNSTILE_TEST_MODE=true is set,
 * we skip the Cloudflare widget entirely and populate the hidden input
 * with a dummy token. This unblocks E2E tests where headless Chromium
 * either can't fetch Cloudflare's script in a reasonable time or where
 * Cloudflare refuses to issue a token because it detects automation.
 * The server-side verifier still runs against Cloudflare's test secret,
 * which accepts any token, so the full verification code path is
 * exercised — just without the widget rendering.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          appearance?: 'always' | 'execute' | 'interaction-only';
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TEST_MODE_TOKEN = 'test-mode-bypass';

interface TurnstileWidgetProps {
  /** Cloudflare site key. Pass NEXT_PUBLIC_TURNSTILE_SITE_KEY from env. */
  siteKey: string;
}

export function TurnstileWidget({ siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const testMode = process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE === 'true';
  const [token, setToken] = useState<string>(testMode ? TEST_MODE_TOKEN : '');

  useEffect(() => {
    // Test mode short-circuits the widget completely. The hidden input
    // already has TEST_MODE_TOKEN from the useState initialiser, which
    // the server-side verifier will accept under the test secret.
    if (testMode) return;

    // Load the Cloudflare script if it isn't already loaded. The
    // script is idempotent — Cloudflare's API tolerates duplicate
    // loads but doesn't re-run on every mount, so we guard manually.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!existing) {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile || !containerRef.current) {
        setTimeout(tryRender, 100);
        return;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (t) => setToken(t),
        'error-callback': () => setToken(''),
        'expired-callback': () => setToken(''),
        appearance: 'always',
      });
    };
    tryRender();

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Already removed or never mounted; ignore.
        }
      }
    };
  }, [siteKey, testMode]);

  return (
    <div>
      <div ref={containerRef} data-testid="turnstile-container">
        {testMode && (
          <p className="text-xs text-faint" data-testid="turnstile-test-mode">
            Turnstile test mode active (dev / E2E only).
          </p>
        )}
      </div>
      <input
        type="hidden"
        name="turnstileToken"
        value={token}
        data-testid="turnstile-token-input"
      />
    </div>
  );
}
