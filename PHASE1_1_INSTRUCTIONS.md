# Phase 1.1 — Application instructions

This first slice of Phase 1 adds:

- 2 SQL migrations (`extensions`, `profiles`)
- 1 pgTAP test file (19 assertions covering structure, constraints, triggers, and every RLS policy with both positive and negative cases)

Before applying it, you need a working local Postgres via the Supabase CLI (Docker-based). One-time prerequisites first.

---

## Prerequisites (one-time setup)

### A. Docker Desktop

Required to run the local Supabase stack. **If you already have Docker Desktop running on Windows, skip to step B.**

1. Confirm WSL2 is installed and enabled. In **PowerShell as Administrator**:

   ```powershell
   wsl --status
   ```

   If you see "WSL 2" listed as the default, you're set. If not:

   ```powershell
   wsl --install
   ```

   You may need to reboot.

2. Install Docker Desktop from <https://www.docker.com/products/docker-desktop/>. During install, leave "Use WSL 2 instead of Hyper-V" enabled (the default).

3. Launch Docker Desktop after install. Wait for the green "Engine running" indicator in the system tray.

4. Verify from Git Bash:

   ```bash
   docker --version    # 24.x or newer
   docker ps           # should print an empty table, not an error
   ```

   If `docker ps` errors with "Cannot connect to the Docker daemon", Docker Desktop isn't running. Start it and wait for it to fully boot.

### B. Supabase CLI

The CLI manages local stack lifecycle, migrations, and tests.

**Recommended installation on Windows: Scoop**

```bash
# In PowerShell (not Git Bash) — one-time installer setup:
iwr -useb get.scoop.sh | iex

# Then in Git Bash:
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Alternative: direct download**

If Scoop isn't an option, grab the latest Windows binary from:
<https://github.com/supabase/cli/releases>

Download `supabase_windows_amd64.tar.gz`, extract it, and place `supabase.exe` somewhere on your PATH (e.g., `C:\Tools\supabase.exe`).

**Verify:**

```bash
supabase --version    # 1.x or newer
```

---

## Step 1 — Apply the new files to your project

Extract this fix bundle over `C:\Temp\huddle`. The two new migrations and the new test file should land at:

```
supabase/migrations/20260513170000_initial_extensions.sql
supabase/migrations/20260513170100_profiles.sql
supabase/tests/profiles.sql
```

Plus an updated `docs/ARCHITECTURE.md` (data model section added).

## Step 2 — Start the local Supabase stack

First run downloads ~2 GB of Docker images; subsequent runs are seconds.

```bash
cd C:\Temp\huddle
supabase start
```

When it finishes, it prints local URLs. Save these:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: <copy this>
service_role key: <copy this>
```

The anon and service-role keys are local-only — they don't unlock your hosted Supabase project. Drop them into `.env.local` for now (Phase 2 will use them).

## Step 3 — Apply the migrations

`supabase start` applies migrations automatically on first run. After that, when you add or change a migration:

```bash
supabase db reset
```

This wipes and re-creates the local DB from migrations + seed. **For local dev only — never run this against a hosted project.** Expect this command to take ~5 seconds.

## Step 4 — Open Studio and eyeball the schema

Open <http://127.0.0.1:54323> in your browser. Navigate to **Table Editor** in the left sidebar. You should see:

- `public.profiles` with the 6 expected columns

Click the **Authentication** tab → **Users**. Create a test user via the "Add user" button. Then go back to Table Editor → `profiles`. A row should have been auto-created by the `handle_new_user` trigger with a `u_<12hex>` placeholder username.

## Step 5 — Run the pgTAP test suite

```bash
supabase test db
```

Expected output:

```
profiles.sql ............................ ok
All tests successful.
Files=1, Tests=19,  ...
```

If any test fails, paste the **full** output. RLS failures are the highest-priority bug class and we'll fix them before adding the next table.

## Step 6 — Stop the stack when you're done

```bash
supabase stop
```

To preserve your data between sessions, use `supabase stop --backup` (default). To wipe state, use `supabase stop --no-backup`.

---

## Phase 1.1 verification checklist

- [ ] Docker Desktop is installed and running
- [ ] Supabase CLI is installed; `supabase --version` works
- [ ] `supabase start` succeeds and prints API/DB/Studio URLs
- [ ] Studio shows the `public.profiles` table with correct columns
- [ ] Creating an auth user in Studio causes a profile row to appear
- [ ] `supabase test db` exits 0 with `Files=1, Tests=19, all ok`

Once all six are checked, reply with **"Phase 1.1 verified, continue"** and I'll generate Phase 1.2 (`groups` + helper functions).

---

## If something fails

**`supabase start` hangs or errors on Docker pull:**
- First-run image pull can take 5–10 minutes on slow connections
- If it dies, run `docker system prune` then retry
- If Docker Desktop crashes, restart it and retry

**Migration error on `supabase db reset`:**
- The error message names the offending file. Paste the full output and I'll diagnose.
- Common cause on Windows: line-ending corruption. Ensure your `.gitattributes` from earlier is committed and SQL files are LF.

**pgTAP test failures:**
- The failure output names which test number failed, with the assertion message
- Paste verbatim — RLS bugs are easy to misread without exact output

**Studio shows the table but no profile is created on user signup:**
- Trigger likely failed silently. In Studio → SQL Editor: `select * from public.handle_new_user_log` (won't exist; just confirms structure)
- Real check: `select tgname from pg_trigger where tgname = 'on_auth_user_created';` — should return one row
- If missing, the migration didn't run — `supabase db reset` again
