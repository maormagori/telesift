# Manual testing

Automated tests never touch real Telegram (see each process's test files). This
document covers the manual steps that do, using real credentials.

See [Testing](testing.md) for the automated test layers and required commands.
Every check here runs on the standard development stack, in real mode; see
[Development](development.md) for its commands and modes.

## telegram-service

Requires a real Telegram account. Nothing here is automatable in a public repo.

### 1. Configure the credentials

Follow [Development: first-time operator configuration](development.md#first-time-operator-configuration).
It covers creating the API credentials, `npm run generate-telegram-session`,
and the operator configuration directory's `.env.telegram`. Keep the
credentials out of every checkout's `.env`.

### 2. Start the service

Make sure no other `telegram-service` uses the same Telegram session, then
start the shared stack from your primary checkout:

```
npm run stack:shared:up
```

To check a branch's changes to `telegram-service`, start the shared stack,
then run `npm run stack:up -- --own-telegram` in that branch's checkout, and
`npm run stack:shared:restore` from the primary checkout when done; see
[Development](development.md#changing-telegram-service-with---own-telegram).

Confirm the startup log shows `telegram-service listening` with
`adapter: teleproto`:

```
docker logs telesift-telegram-service
```

### 3. Exercise every endpoint

`telegram-service` has no published host port. Call it from a throwaway
container on the shared network:

```
tg() { local p=$1; shift; docker run --rm --network telesift-shared curlimages/curl:8.11.1 -sS "$@" "http://telesift-telegram-service:4001$p"; }
tg /status
tg /chats
```

Pick a real `chatId` from the `/chats` response (use the `id` field as-is —
it's the raw id `telegram-service` returns, not the `-100`-prefixed id some
Telegram clients display), then:

```
tg "/chats/<chatId>/messages?limit=20"
tg "/chats/<chatId>/latest-message-id"
tg "/chats/<chatId>/photo" > photo.jpg
tg "/chats/<chatId>/messages/<messageId>"
tg "/chats/<chatId>/messages/<messageId>/media" -D /dev/stderr > out.bin
```

Confirm `out.bin`'s size matches the `Content-Length` header printed for the
last request and that it plays/opens correctly, and that `photo.jpg` is the
chat's profile photo (a chat without one returns 404). Delete both — they're
real chat content, not fixtures.

### 4. Confirm the singleton lock

With the shared stack still running, start a second `telegram-service` on
the shared lock volume:

```
docker compose -f docker-compose.shared.yml run --rm telegram-service
```

It must refuse to start and exit, logging that the lock is already held. It
takes the lock before creating a Telegram client, so it never connects.

## app

Requires `telegram-service` running from the steps above (real Telegram, so a
channel add can actually resolve). Automated tests cover the app-api protocol
against fake adapters (`src/protocols/app-api/server.test.ts`); this covers
the parts that only make sense against a real account and a real browser.

### 1. Start the stack

In the checkout under test:

```
npm run stack:up -- --real
npm run stack:url
```

This runs `app`, the Vite UI server, and all three workers against the shared
`telegram-service`. Open the printed URL in a browser.

### 2. Admin credential

The stack uses the committed development login, `admin` / `telesift-dev`.
A deployment provisions its own instead: `npm run hash-admin-password`
prompts for a password twice and prints a `scrypt$<salt>$<hash>` string for
`APP_ADMIN_PASSWORD_HASH` in `.env`, along with `APP_ADMIN_USERNAME` and a
random `APP_SESSION_SECRET`. Never put a plaintext password in `.env`. Under
`docker compose`, double every literal `$` as `$$` in the hash
(`scrypt$$<salt>$$<hash>`) — Compose interpolates `env_file` content, so a
single `$` is read as the start of a variable reference and silently dropped.

### 3. Log in and exercise the UI

- Log in with the credential from step 2. Confirm a bad password is rejected
  and the session persists across a page reload.
- On the Channels screen, confirm the "Add a channel" list
  shows the account's channels and groups but no private chats, each with its
  profile photo (or its first letter when it has none). With an empty search
  it shows at most the 10 most recently active chats, noting how many more
  exist; typing part of a title or username filters it case-insensitively.
- Add a chat from that list. Confirm the configuration dialog opens, then add
  it with backfill enabled and a small message count (e.g. 20). Confirm it
  resolves immediately and shows its title — this is the synchronous add-time
  resolution, not `ingestion-worker`'s poll loop — and that the list now marks
  it "Added" with no Add button.
- Type a real channel/group's exact username or numeric chat id into the
  search. When no listed chat matches, confirm an "Add … by username or ID"
  button appears, that it opens the same configuration dialog, and add it with
  backfill unchecked.
- Add an identifier that isn't visible to the account. Confirm the add still
  succeeds but is reported unresolved, and doesn't block the request.
- With `ingestion-worker` running (the stack starts it),
  confirm the channel's sync progress (backfill/caught-up state, or an error)
  updates on the Channels screen as it syncs. Open the limited channel's
  message view and confirm it holds only its newest messages (up to the count
  you chose); confirm the backfill-disabled channel stays empty until a new
  message is posted, then picks that message up.
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
- With a download in flight, confirm the
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
- The test Sonarr from the shared stack, or another Sonarr instance that can
  reach the checkout's app. To use the test Sonarr, start the shared stack
  with it from your primary checkout, then the checkout under test in real
  mode:

  ```
  npm run stack:shared:up -- --sonarr
  npm run stack:up -- --real
  ```

  Sonarr's UI is at `http://127.0.0.1:8989`. It reaches the checkout's app on
  the shared network at the container name `stack:up` prints
  (`<project>-app-1`), so use that as `<host>` in steps 2-3. It mounts the
  same staging volume at the same container path (`/staging/<project>`) that
  the app reports, so no Remote Path Mapping is needed. See
  [Development](development.md#sonarr-testing-with-the-shared-profile).
- `TORZNAB_API_KEY` set in the checkout's `.env`, or explicitly left unset if
  TeleSift is only reachable on a trusted internal network — see
  `.env.example`'s comment on that var for both options. Run
  `npm run stack:up -- --real` again after changing `.env`.

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
  succeeds. Authentication for this compatibility endpoint is not implemented
  in the current pre-alpha.
- Confirm Sonarr's "Test" button succeeds — it calls the qBittorrent-compatible
  auth/login endpoint under the hood.

### 4. Happy path: search, grab, download, import

This exercises the [current release goal](product.md#current-goal): in Sonarr
interactive search, a user selects a TV episode sourced from
Telegram; TeleSift downloads the correct video, reports progress through its
download-client API, and Sonarr imports it.

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
