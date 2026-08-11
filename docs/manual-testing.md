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
