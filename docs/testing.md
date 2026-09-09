# Testing

TeleSift separates deterministic automated checks from manual tests that require private accounts or external applications. Automated tests must never contact real Telegram, send real messages to an LLM, or include private source data.

This is the current test entrypoint. A later dedicated session may refine coverage policy and contributor expectations without changing the privacy boundary below.

## Required checks

Install the locked dependencies first:

```sh
npm ci
```

Run the same checks as CI:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs Vitest once. `npm run build` compiles the TypeScript processes and builds the React application.

## Test layers

### Domain and application tests

Unit tests cover behavior without infrastructure: message fingerprints, deterministic parsing, context grouping, series matching, review decisions, display titles, search behavior, download state mapping, and application use cases.

Add tests near the source as `*.test.ts`. Prefer explicit synthetic inputs and observable outputs over tests coupled to private examples or implementation details.

### Adapter integration tests

SQLite repository and migration tests use real temporary SQLite databases. They cover schema changes, uniqueness, transactions, claiming, lease recovery, persistence, and query behavior.

Telegram, LLM, filesystem, and HTTP client adapters use fakes or controlled local resources. Network calls must be stubbed. A test failure must not depend on an account, a public service, or the contributor's machine state.

### Protocol contract tests

Contract tests exercise the internal Telegram API, app API, Torznab XML, and qBittorrent-compatible routes against fake dependencies. They should verify status codes, validation, authentication behavior, response shapes, compatibility mappings, and errors visible to consumers.

Protocol handlers translate contracts; their tests should not recreate domain rules already covered by a module test.

### Synthetic end-to-end test

`src/e2e/sonarr-workflow.e2e.test.ts` covers the core flow from synthetic Telegram ingestion through extraction, approval/search, grab, and a staged completed download. It validates module integration without connecting to Telegram or Sonarr.

Extend this test when a change affects the full product path and cannot be proven by a narrower contract or integration test.

### Credentialed manual tests

[Manual testing](manual-testing.md) covers behavior that requires a real Telegram account, browser, or Sonarr instance. It is intentionally separate because its inputs and output may be private.

Run only the sections relevant to the change. Keep `.env`, session strings, Telegram identifiers, captions, filenames, downloaded media, screenshots, Sonarr logs, and local paths out of commits and public discussions. Summarize a successful check without copying private evidence.

## Safe fixtures

- Invent chat, channel, series, message, and file data.
- Do not lightly edit real text and call it sanitized; create a synthetic example with the same structural property.
- Use obviously fake credentials and non-routable/example URLs.
- Keep local analysis of real extraction outcomes in ignored files only.
- Never snapshot full environment variables or logs that may contain sessions, API keys, cookies, or private identifiers.

When a bug can only be reproduced from real data, reduce it locally to the smallest synthetic shape that preserves the failure before committing a regression test.

## Choosing the test boundary

- Pure rule or state transition: unit test.
- Repository, migration, lease, or transaction behavior: SQLite integration test.
- HTTP/XML compatibility: protocol contract test.
- Wiring across the Telegram-to-Sonarr path: synthetic end-to-end test.
- Real account, client application, media bytes, or browser behavior: manual test.

Use the lowest boundary that proves the behavior, then add a wider regression only when integration itself caused the defect.

## Documentation-only changes

For documentation changes, still run the standard checks after a clean install. Also verify:

- Relative links and referenced files exist.
- Commands and configuration names match `package.json` and `.env.example`.
- Architecture and state names match source types and migrations.
- Current behavior and future direction are not presented as the same thing.
- No private information appears in examples or history.
