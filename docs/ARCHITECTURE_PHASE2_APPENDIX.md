# Architecture — Phase 2 Appendix: Authentication

> This document appends to `docs/ARCHITECTURE.md`. Paste its contents at the
> end of that file (or keep it as a linked sub-document). It captures the
> complete authentication design delivered across Phase 2 (sub-phases
> 2.1–2.6), the decision log entries D26–D42, and the environment-specific
> gotchas encountered during the mobile build.

---

## 1. Authentication overview

Huddle authenticates users with Supabase Auth (GoTrue) using two methods:

- **Email + password** — available on web and mobile
- **Google OAuth** — available on web and mobile (Apple OAuth deferred to a later phase)

The same Supabase project backs both the web app (Next.js) and the mobile app
(Expo / React Native). Validation rules, error mapping, and the Supabase client
factories are shared through workspace packages so the two front-ends behave
identically wherever possible.

### Shared packages involved

| Package              | Role in auth                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@huddle/validation` | Zod schemas for sign-up, sign-in, onboarding. Single source of truth for field rules (username pattern, password length, etc.) used by both apps.                            |
| `@huddle/api-client` | Supabase client factories (browser, server, service-role, native), error mapping (`mapSupabaseError`), and the Turnstile verifier. Apps never import `@supabase/*` directly. |
| `@huddle/types`      | The generated `Database` type that parameterises every Supabase client.                                                                                                      |

---

## 2. Web auth data flow

The web app uses Next.js Server Actions for all auth mutations. The browser
never talks to Supabase Auth directly for sign-in/sign-up; it posts to a Server
Action, which runs the Supabase call server-side and sets the session cookie on
the response.

### 2.1 Email/password sign-up (web)

```
Browser (SignUpForm, client component)
  │  user fills email/password/username/displayName
  │  TurnstileWidget produces a token (or dummy token in test mode)
  ▼
Server Action: signUpAction  ('use server')
  │  1. Validate with signUpSchema
  │  2. Verify Turnstile token (skipped in test mode w/ test secret)
  │  3. supabase.auth.signUp(...)  → creates auth.users row
  │     (handle_new_user trigger creates profiles row w/ placeholder username)
  │  4. supabase.from('profiles').update({ username, display_name })
  │     → finalises the profile so onboarding is skipped
  │  5. redirect('/')
  ▼
Proxy (proxy.ts) runs on the redirect
  │  session cookie present, username is real → allow through to (app)
  ▼
App shell  "You're signed in."
```

### 2.2 Email/password sign-in (web)

```
Browser (SignInForm) → signInAction → supabase.auth.signInWithPassword
  → cookie set → redirect('/') → proxy allows → app shell
```

### 2.3 Google OAuth (web)

```
Browser → signInWithGoogleAction → supabase.auth.signInWithOAuth({ google })
  → redirect to accounts.google.com
  → user consents
  → Google redirects to /auth/callback?code=...
  → callback route: exchangeCodeForSession(code) → cookie set
  → redirect to /
  → proxy checks profile.username:
       placeholder  → redirect to /onboarding
       real         → allow to app shell
```

### 2.4 The proxy (formerly middleware)

`apps/web/src/proxy.ts` runs on every non-static request. Three jobs:

1. Refresh the auth cookie.
2. Redirect unauthenticated users away from `(app)` routes to `/sign-in`, and
   authenticated users away from `/sign-in` and `/sign-up` to `/`.
3. Gate onboarding: if a signed-in user's `profiles.username` matches the
   placeholder pattern `u_<12hex>`, force them to `/onboarding` until they pick
   a real username.

The `/auth/*` paths (OAuth callback, error page) are public so the OAuth round
trip can complete in any auth state.

---

## 3. Mobile auth data flow

The mobile app has no server in front of requests, so it cannot use the Server
Action / proxy pattern. Instead:

- Auth mutations call Supabase **directly from client code** (the screen's
  submit handler).
- Auth **state** lives in a React Context provider (`AuthProvider`) mounted at
  the root layout.
- **Navigation gating** is done in `app/_layout.tsx` (`GatedStack`) by reading
  the context and using Expo Router `<Redirect>` — the mobile equivalent of the
  web proxy.

### 3.1 AuthProvider

```
App launch
  │
  ▼
AuthProvider
  │  getSession() → set session
  │  if session: fetch profiles.username → set username
  │  onAuthStateChange subscription keeps both in sync
  ▼
Exposes: { session, username, loading, needsOnboarding, refreshProfile }
         needsOnboarding = signed-in AND (username null OR placeholder)
```

### 3.2 GatedStack (navigation gate)

```
loading              → spinner
!session & !(auth)   → Redirect /sign-in
session & needsOnboarding & !on onboarding → Redirect /onboarding
session & !needsOnboarding & on (auth)     → Redirect /
otherwise            → render the Stack
```

### 3.3 Email/password (mobile)

```
SignUpScreen → validate (signUpSchema, dummy turnstile token) →
  supabase.auth.signUp → profiles.update(username, display_name)
  → AuthProvider picks up session → GatedStack routes to app
```

No Turnstile widget on mobile — Cloudflare publishes no React Native widget, and
bot signup from a packaged app is meaningfully harder than from a web URL. We
rely on Supabase's built-in rate limiting and (in production) email
confirmation.

### 3.4 Google OAuth (mobile)

```
GoogleSignInButton
  │  redirectTo = Linking.createURL('/auth-callback')  → huddle://auth-callback
  │  supabase.auth.signInWithOAuth({ google, redirectTo, skipBrowserRedirect })
  │  WebBrowser.openAuthSessionAsync(url, redirectTo)
  │  → system browser, Google consent
  │  → redirect to huddle://auth-callback#access_token=...&refresh_token=...
  │  parse tokens from URL fragment
  │  supabase.auth.setSession({ access_token, refresh_token })
  ▼
AuthProvider picks up session → GatedStack routes (onboarding or app)
```

Requires the `huddle://` scheme registered in `app.json` and
`huddle://**` present in Supabase `additional_redirect_urls`.

### 3.5 Token storage (mobile)

`apps/mobile/src/lib/supabase.ts` injects a platform-aware storage adapter into
`createNativeSupabaseClient`:

- **iOS / Android** → `expo-secure-store` (OS keychain / keystore)
- **Web preview** → `localStorage` (SecureStore is native-only and throws in a
  browser)

---

## 4. Decision log D26–D42

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D26 | Web auth uses Next.js Server Actions, not client-side Supabase calls. Keeps tokens server-set and avoids exposing logic to the client.                                                                                                                                                                                                                                                                                                            |
| D27 | Forms use React `useActionState` for pending/error state.                                                                                                                                                                                                                                                                                                                                                                                         |
| D28 | In-house UI kit (Button, FormField) rather than adopting shadcn/ui yet. Revisit when component needs grow.                                                                                                                                                                                                                                                                                                                                        |
| D29 | `'use server'` files export only async functions. Shared types/constants live in a sibling `*-state.ts` file.                                                                                                                                                                                                                                                                                                                                     |
| D30 | Local dev has email confirmation off (`enable_confirmations=false`), so sign-up auto-creates a session. Production will enable confirmation.                                                                                                                                                                                                                                                                                                      |
| D31 | `handle_new_user` trigger creates a `profiles` row with a placeholder username `u_<12hex>` at signup; the app finalises it.                                                                                                                                                                                                                                                                                                                       |
| D32 | Onboarding is gated at the proxy (web) / GatedStack (mobile) by detecting the placeholder username. Single source of truth.                                                                                                                                                                                                                                                                                                                       |
| D33 | Email-signup users bypass onboarding because the server action / submit handler writes their chosen username immediately after signup. Onboarding is effectively OAuth-only.                                                                                                                                                                                                                                                                      |
| D34 | Turnstile widget uses "managed" mode (Cloudflare decides challenge vs invisible).                                                                                                                                                                                                                                                                                                                                                                 |
| D35 | Local dev uses Cloudflare's documented always-pass test keys so no real Cloudflare account is needed to run.                                                                                                                                                                                                                                                                                                                                      |
| D36 | The Turnstile verifier lives in `@huddle/api-client` (`turnstile.ts`) — the package is the seam between apps and external services.                                                                                                                                                                                                                                                                                                               |
| D37 | Turnstile test mode requires BOTH `NEXT_PUBLIC_TURNSTILE_TEST_MODE=true` AND the configured secret being the documented Cloudflare test secret. Either alone is insufficient; production has neither. The client widget skips the Cloudflare challenge and the server skips verification. Note: Cloudflare's test secret only accepts tokens issued by the matching test site key — cross-pairing real and test keys fails verification silently. |
| D38 | Phase 9 will add a startup assertion that refuses to boot in production if test mode is on, so a misconfigured deploy fails fast rather than letting bots through.                                                                                                                                                                                                                                                                                |
| D39 | Mobile auth state lives in a single React Context provider at the root layout. Every screen reads from it; nothing duplicates the session check.                                                                                                                                                                                                                                                                                                  |
| D40 | Mobile navigation uses Expo Router (file-based), mirroring the Next.js App Router mental model.                                                                                                                                                                                                                                                                                                                                                   |
| D41 | Mobile auth errors are shown inline (no toasts/modals), matching web.                                                                                                                                                                                                                                                                                                                                                                             |
| D42 | Google OAuth on mobile uses `expo-auth-session` + `WebBrowser.openAuthSessionAsync` + manual `setSession`, not the older google-auth-session library or the native SDK. The native SDK (`react-native-google-signin`) is more robust on Android but needs a custom dev build; revisit in a later phase if OAuth UX needs improvement.                                                                                                             |

---

## 5. Mobile environment gotchas (Phase 2.6)

The mobile build required five fix iterations, all environment/config issues
rather than auth-logic bugs. Captured here so future mobile work doesn't repeat
them.

1. **Leftover Expo scaffold files.** `create-expo-app` generated a starter
   `app/(tabs)/` navigator plus `modal.tsx`, `+not-found.tsx`, and root-level
   `components/`/`constants/` dirs that imported files our structure doesn't
   have. The phase overlay added new routes alongside them without removing the
   demos, so typecheck failed on the stale imports. **Lesson:** audit and delete
   scaffold demo files when first touching an app directory.

2. **Expo SDK 55 unified versioning.** SDK 55 changed convention so every Expo
   package shares the SDK's major version (`expo-router` is `~55.0.x`, not
   `~5.0.0`). Hand-written old-style version ranges installed a mismatched tree;
   `@expo/router-server@55` tried to import a module path that only exists in
   `expo-router@6`/`55`, throwing `Cannot find module 'expo-router/internal/routing'`.
   **Lesson:** use `expo install` / `expo install --fix` rather than
   hand-writing Expo version ranges; never assume versioning conventions are
   stable across SDKs.

3. **app.json asset references.** The shipped `app.json` referenced
   `./assets/icon.png` etc. that didn't exist, so Metro refused to bundle.
   **Lesson:** don't reference asset files that aren't present; let Expo use
   defaults during development and add branded assets at launch prep.

4. **SecureStore is native-only.** `expo-secure-store` throws
   `getValueWithKeyAsync is not a function` on web. The original mobile client
   hardwired SecureStore, which broke the web preview. Fixed with a
   platform-aware storage adapter (SecureStore native, localStorage web).
   **Lesson:** native-only modules need a web fallback if web preview is a
   supported test path.

5. **TS2742 in pnpm workspace.** Every exported React component triggered
   `TS2742 ... cannot be named without a reference to .pnpm/@types+react`.
   This is a documented pnpm + TypeScript interaction that fires when
   declaration emit is on. Fixed by setting `declaration: false` (mobile is an
   app, not a library, so it never emits declarations) plus pinning `react`
   resolution and guarding `composite: false`. **Lesson:** app tsconfigs in a
   pnpm monorepo should disable declaration emit to avoid portable-type-name
   errors.

### Meta-lesson

Every one of these surfaced only on the user's machine because the build
environment can't replicate the real pnpm workspace + Expo toolchain. The
common root cause was generating framework-specific code from memory rather
than checking the framework's current behaviour first. Going forward: web-search
current framework behaviour (Expo SDK versions, native-module web support,
pnpm/TypeScript interactions) BEFORE generating, prefer framework install tools
over hand-written versions, and ship smaller slices.

### Verified vs. deferred (mobile)

**Verified working** (web preview, Expo SDK 55):

- App loads to sign-in (Test A)
- Email/password sign-up → lands on app shell, onboarding skipped (Test B)
- Sign-out → returns to sign-in (Test C)
- Sign-in with existing credentials → app shell (Test D)

These exercise the AuthProvider, GatedStack navigation gate, the shared
`@huddle/validation` schemas, the platform-aware Supabase client (localStorage
on web preview), and the profile-finalisation path — i.e. the whole auth core
minus native-only pieces.

**Verified by code review only, not yet on a device:**

- Native Google OAuth and the `huddle://` deep-link round-trip. Expo Go was
  pinned to SDK 54 during the SDK 55 rollout, and the web preview can't exercise
  native deep links (the `huddle://` scheme is native-only). Full verification is
  deferred to whenever an emulator or custom dev build is set up — a reasonable
  Phase 10 item, since that also needs developer-account / build infrastructure.
- SecureStore token persistence on a real device (the web preview path uses the
  localStorage fallback, so the native keychain/keystore branch is unexercised).

**Not started:**

- Mobile E2E (Maestro) — deferred to Phase 9 per the roadmap.

---

## 6. Environment variable reference (Phase 2)

### apps/web/.env.local

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_TURNSTILE_TEST_MODE=true
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA      # test pair
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA     # test pair
```

Production swaps the test Turnstile pair for the real Cloudflare keys and unsets
`NEXT_PUBLIC_TURNSTILE_TEST_MODE`.

### apps/mobile/.env.local

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321   # web preview / iOS sim
                                                  # use 10.0.2.2 for Android emulator
                                                  # use LAN IP for physical device
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
```

### supabase/config.toml (auth-relevant)

```
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = [
  "http://localhost:3000/**",
  "http://127.0.0.1:3000/**",
  "huddle://**"
]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"   # must be explicit on current CLI
```

Note the explicit `redirect_uri`: leaving it `""` broke on the current Supabase
CLI (a regression where empty string is treated as missing, producing
"Unsupported provider: missing redirect URI").
