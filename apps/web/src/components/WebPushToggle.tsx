'use client';

import { useEffect, useState } from 'react';
import { saveWebPushSubscriptionAction, removeWebPushSubscriptionAction } from '@/actions/web-push';
import { Button } from './Button';

// Referenced statically so Next inlines it into the client bundle (lesson 19).
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

type State = 'loading' | 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

/** Convert a base64url VAPID key to the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Account-page control to enable/disable web push (Phase 15). Registers
 * the service worker, asks permission, subscribes via the Push API, and
 * persists the subscription via a Server Action. Web-only; degrades
 * gracefully where the browser or config doesn't support it.
 */
export function WebPushToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window;
    if (!supported) return setState('unsupported');
    if (!VAPID_PUBLIC_KEY) return setState('unconfigured');
    if (Notification.permission === 'denied') return setState('denied');

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setState('off');
        return;
      }
      const res = await saveWebPushSubscriptionAction({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      setState(res.ok ? 'on' : 'off');
    } catch {
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removeWebPushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      // leave state as-is
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="webpush-toggle" data-state={state}>
      {state === 'loading' && <p className="text-sm text-muted">Checking notification support…</p>}
      {state === 'unsupported' && (
        <p className="text-sm text-muted">This browser doesn’t support web notifications.</p>
      )}
      {state === 'unconfigured' && (
        <p className="text-sm text-muted">Web notifications aren’t configured for this site.</p>
      )}
      {state === 'denied' && (
        <p className="text-sm text-muted">
          Notifications are blocked. Allow them in your browser’s site settings to turn them on.
        </p>
      )}
      {(state === 'on' || state === 'off') && (
        <div className="flex items-center gap-3">
          {state === 'on' ? (
            <>
              <span className="text-sm font-medium text-content">
                Browser notifications are on.
              </span>
              <Button type="button" variant="secondary" loading={busy} onClick={disable}>
                Turn off
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted">
                Get notified in this browser when something happens in your groups.
              </span>
              <Button type="button" loading={busy} onClick={enable}>
                Enable notifications
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
