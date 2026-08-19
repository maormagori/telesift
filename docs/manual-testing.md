# Manual testing

Automated tests never touch real Telegram (see each process's test files). This
document covers the manual steps that do, using real credentials.

## telegram-service

Requires a real Telegram account. Nothing here is automatable in a public repo.

### 1. Get API credentials

Create an app at https://my.telegram.org/apps. This gives you `api_id` and
`api_hash`. Platform/URL fields are just metadata; they don't restrict the API.

### 2. Generate a session string

```
npm run generate-telegram-session
```

Prompts for `api_id`, `api_hash`, and your phone number, then walks you through
Telegram's login code and, if you have two-step verification enabled, your 2FA
password. On success it prints a session string — never anything else does.

Copy that string into `.env` as `TELEGRAM_SESSION`, alongside `TELEGRAM_API_ID`
and `TELEGRAM_API_HASH` from step 1. `.env` is gitignored; never commit it.

### 3. Start the service

```
npm run dev:telegram-service
```

Confirm the startup log shows `telegram-service listening` with
`adapter: teleproto`.

### 4. Exercise every endpoint

```
curl localhost:4001/status
curl localhost:4001/chats
```

Pick a real `chatId` from the `/chats` response (use the `id` field as-is —
it's the raw id `telegram-service` returns, not the `-100`-prefixed id some
Telegram clients display), then:

```
curl "localhost:4001/chats/<chatId>/messages?limit=20"
curl "localhost:4001/chats/<chatId>/messages/<messageId>"
curl "localhost:4001/chats/<chatId>/messages/<messageId>/media" -o out.bin
```

Confirm `out.bin`'s size matches the response's `Content-Length` and that it
plays/opens correctly, then delete it — it's real chat content, not a fixture.

### 5. Confirm the singleton lock

With step 3's process still running, run `npm run dev:telegram-service` again
in a second terminal. It must refuse to start and exit, logging that the lock
is already held.

## app

Requires `telegram-service` running from the steps above (real Telegram, so a
channel add can actually resolve). Automated tests cover the app-api protocol
against fake adapters (`src/protocols/app-api/server.test.ts`); this covers
the parts that only make sense against a real account and a real browser.

### 1. Provision an admin credential

```
npm run hash-admin-password
```

Prompts for a password twice and prints a `scrypt$<salt>$<hash>` string. Put
it in `.env` as `APP_ADMIN_PASSWORD_HASH`, along with `APP_ADMIN_USERNAME` and
a random `APP_SESSION_SECRET`. Never put a plaintext password in `.env`.

Running under `docker compose` instead of `npm run dev:app`? Double every
literal `$` as `$$` in the hash (`scrypt$$<salt>$$<hash>`) — Compose
interpolates `env_file` content, so a single `$` is read as the start of a
variable reference and silently dropped.

### 2. Start the app

```
npm run dev:app
npm run dev:app-web
```

`dev:app` is the Express/API process; `dev:app-web` is the Vite dev server,
proxying `/api` to it. Open the Vite dev server's printed URL in a browser.

### 3. Log in and exercise the UI

- Log in with the credential from step 1. Confirm a bad password is rejected
  and the session persists across a page reload.
- On the Channels screen, add a real channel/group visible to the Telegram
  account (username or numeric chat id). Confirm it resolves immediately and
  shows its title — this is the synchronous add-time resolution, not
  `ingestion-worker`'s poll loop.
- Add an identifier that isn't visible to the account. Confirm the add still
  succeeds but is reported unresolved, and doesn't block the request.
- With `ingestion-worker` also running (`npm run dev:ingestion-worker`),
  confirm the channel's sync progress (backfill/caught-up state, or an error)
  updates on the Channels screen as it syncs.
- Open a resolved channel's raw message view. Confirm messages render, media
  metadata (filename/size/type) shows for messages with attachments, and a
  media preview/download actually streams real bytes from Telegram.
- Check the Telegram status screen matches `telegram-service`'s real
  connection/account state.
- On the Dashboard, confirm it surfaces exactly what's broken (disconnected
  Telegram, unresolved/erroring channels, pending-review count, failed
  downloads) and nothing when everything's healthy.
- With a `pending_review` release seeded (via `extraction-worker`, or
  directly in SQLite for a quick check), open the Review queue, expand it,
  confirm the original Telegram caption/media renders next to the extracted
  fields, edit a field and save, then approve it and confirm it drops out of
  the queue and the nav badge updates.
- With `download-worker` running and a download in flight, confirm the
  Downloads screen's progress/state track the real transfer, and that
  pause/resume/cancel/retry actually change its `desiredState`.
- Log out. Confirm the session cookie is cleared and protected screens bounce
  back to the login page.

## Sonarr (Torznab + qBittorrent-compatible)

Requires a real or test Sonarr instance reachable from this host. Automated
tests cover the Torznab and qBittorrent-compatible protocol handlers against
fake dependencies (`src/protocols/torznab/server.test.ts`,
`src/protocols/qbittorrent/server.test.ts`); this covers the parts that only
make sense with a real Sonarr instance actually driving them.

### 1. Prerequisites

- `telegram-service` running against a real Telegram account — see the
  `telegram-service` section above; nothing here repeats those steps.
- `app` and all three workers (`ingestion-worker`, `extraction-worker`,
  `download-worker`) running. Either the local-dev path:

  ```
  npm run dev:app
  npm run dev:app-web
  npm run dev:ingestion-worker
  npm run dev:extraction-worker
  npm run dev:download-worker
  ```

  or `docker compose up`, using `docker-compose.yml` at the repo root.
- A real or test Sonarr instance reachable from this host. If you don't have
  one handy, `docker-compose.sonarr-test.yml` brings up a throwaway Sonarr
  on the same compose network as TeleSift — merge it in with
  `docker compose -f docker-compose.yml -f docker-compose.sonarr-test.yml up --build -d`.
  It reaches TeleSift at `http://app:4000` by service name and shares the
  same staging volume at the same container path, so steps 2-3 below need no
  Remote Path Mapping; just set an absolute `DOWNLOAD_STAGING_DIRECTORY`
  (e.g. `/app/data/staging`) in `.env` first, since the default relative
  value is a poor path to hand Sonarr.
- `TORZNAB_API_KEY` set in `.env`, or explicitly left blank if TeleSift is
  only reachable on a trusted internal network — see `.env.example`'s
  comment on that var for both options.

### 2. Add TeleSift as a Torznab indexer

In Sonarr: `Settings > Indexers > Add > Torznab`.

- URL: `http://<host>:<APP_PORT>/torznab/api` (substitute the actual host
  and your configured `APP_PORT`, default `4000`).
- API Key: the value of `TORZNAB_API_KEY` from `.env` (leave blank if you
  left it unset there).
- Confirm Sonarr's "Test" succeeds — it sends a `t=caps` request and should
  report TV title/query, season, and episode search support.

Alternatively, add TeleSift as a Torznab indexer in Prowlarr and sync it to
Sonarr from there. Either way, Prowlarr only manages the indexer — it never
downloads — so the qBittorrent-compatible download client in the next step
is always configured directly in Sonarr, regardless of which indexer path
you used.

### 3. Add the qBittorrent-compatible download client

In Sonarr: `Settings > Download Clients > Add > qBittorrent`.

- Host: `<host>`, reachable from Sonarr (`APP_HOST` in `.env` controls what
  `app` binds to, not what Sonarr dials).
- Port: your configured `APP_PORT` (default `4000`).
- Leave URL Base unset (it's behind Sonarr's "Advanced Settings" toggle on
  this form, easy to miss): `app/main.ts` mounts the qBittorrent-compatible
  server at the app's root, matching real qBittorrent's own lack of a
  configurable base path, so Host/Port alone is enough — no need to find
  that field at all.
- Username/Password: leave blank. TeleSift's auth/login endpoint always
  succeeds; real Prowlarr/Sonarr API-key authentication for this endpoint is
  a known unresolved item, not something to work around here.
- Confirm Sonarr's "Test" button succeeds — it calls the qBittorrent-compatible
  auth/login endpoint under the hood.

### 4. Happy path: search, grab, download, import

This is the actual v1 MVP success criterion from `AGENTS.md`: "In Sonarr
interactive search, the user selects an episode result whose source is
Telegram; the service downloads the correct video, reports progress through
the download-client API, and Sonarr imports it."

- In Sonarr, run an interactive search for a series/episode you know exists
  in your ingested Telegram channels.
- Confirm a Telegram-sourced result appears, with a release title of the
  form `Series.Title.SXXEYY.<resolution>.Telegram` (e.g.
  `Fauda.S04E03.1080p.Telegram`).
- Grab it.
- Confirm Sonarr's download queue tracks progress through to completion —
  Sonarr polls the qBittorrent-compatible `/torrents/info` endpoint under
  the hood.
- Confirm Sonarr successfully imports the completed file from
  `DOWNLOAD_STAGING_DIRECTORY` into its managed library.

### 5. Failed/unavailable release

- Grab a release whose underlying Telegram message or media has since been
  deleted (or deliberately pick one you know is gone).
- Confirm the download surfaces as Sonarr's error/failed state — this
  matches `toQbittorrentState`'s `"error"` mapping for a failed download.
- The underlying media-unavailable handling (marking the asset unavailable,
  failing the download with `media_unavailable`) is already covered by
  `process-download-claim.integration.test.ts`'s media-unavailable case;
  this step is just observing that end to end once, for real, not
  re-deriving the logic.

### 6. Paused/cancelled download

- Pause an in-flight download from Sonarr's queue UI, or from TeleSift's own
  `app` Downloads page (a real screen —
  `src/processes/app/web/src/pages/Downloads.tsx` — with pause/resume/cancel
  controls).
- Confirm the download reports `pausedDL` and stops progressing.
- Cancel/remove it. Confirm it disappears from Sonarr's queue and from
  `/torrents/info`.

Automated coverage of the full synthetic flow (ingestion through a staged
completed download) lives in `src/e2e/sonarr-workflow.e2e.test.ts` and the
individual protocol test files (`src/protocols/torznab/server.test.ts`,
`src/protocols/qbittorrent/server.test.ts`) — this section only covers what
genuinely requires a real Sonarr instance.
