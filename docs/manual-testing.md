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
- Log out. Confirm the session cookie is cleared and protected screens bounce
  back to the login page.
