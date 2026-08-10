# TeleSift — Project Context

Read this file before planning or changing the project. It records the product discovery completed with the user so a new session can continue without repeating it.

## Public Repository Rules

This is a public open-source repository. Treat every tracked file, commit, branch, tag, issue, pull request, release, and GitHub attachment as public.

- Never commit or push secrets or private information. This includes Telegram API credentials and sessions, login codes, passwords, tokens, private keys, real chat/channel/message IDs, non-public usernames, message text, media filenames, private filesystem paths, internal hostnames or URLs, and personal deployment configuration.
- Use synthetic placeholders in examples, fixtures, tests, logs, screenshots, and bug reports. Do not copy production or personal data and redact incidental private details before adding artifacts.
- Before every commit, inspect all staged content and run the repository's gitleaks pre-commit hook. Before every push, inspect the outgoing commits and run the repository's gitleaks pre-push hook. A clean secret scan does not replace manual privacy review.
- Design for the general self-hosted project, not one operator's home stack, hardware, language mix, channel layout, filesystem, network, or preferred media client. Personal needs may motivate a feature, but defaults and interfaces must remain broadly usable and configurable.
- Do not add a one-user shortcut when the same result can be represented as configuration or a general domain behavior. Record truly deployment-specific values outside the repository.
- If a proposed change requires real private data to develop or verify, stop and request a sanitized fixture or a safe local-only validation method.

## Current Status

- Project name: `TeleSift`.
- Intended public GitHub repository: `maormagori/telesift`.
- Phase: product and architecture discovery.
- No application code exists yet.
- Next expected step: resolve the highest-impact loose ends, write a concise v1 specification, then create an implementation plan when the user asks.
- Do not scaffold or implement merely because this context exists. Confirm the next requested action with the user.

## Product Goal

Build a self-hosted service that:

1. Authenticates to Telegram with a dedicated **user account** through MTProto, not the Bot API.
2. Backfills and periodically polls channels already visible to that account.
3. Retains Telegram messages needed as evidence, including text-only messages surrounding media.
4. Identifies video messages and extracts normalized TV episode metadata from Hebrew and English context.
5. Stores extracted releases in a local search index.
6. Exposes a Torznab-compatible indexer to Prowlarr or directly to Sonarr.
7. Exposes the minimal qBittorrent-compatible API Sonarr needs to grab and track a Telegram download.
8. Downloads the selected Telegram video into a configurable staging directory that Sonarr can import from.
9. Provides a first-class authenticated UI for operating, searching, reviewing, correcting, and diagnosing the service independently of Sonarr.

Success for v1:

> In Sonarr interactive search, the user selects an episode result whose source is Telegram; the service downloads the correct video, reports progress through the download-client API, and Sonarr imports it.

Use only sources and content the user is authorized to access. The system is a general Telegram media integration; content discovery beyond already-visible channels is out of scope.

## Source Project and Project Direction

The project stems from [MuLarr](https://github.com/joecarl/mularr), an MIT-licensed TypeScript application that already demonstrates:

- GramJS Telegram user authentication, indexing, and downloads.
- SQLite-based Telegram message indexing.
- Torznab compatibility for the Arr ecosystem.
- A qBittorrent-compatible download-client facade.

Decision: create a new Telegram-only TypeScript service and selectively reuse suitable MIT-licensed MuLarr code with attribution. Do not strip MuLarr in place. MuLarr remains coupled to aMule, Gluetun, aMule categories/directories, and unrelated UI behavior.

## Scope

### v1 scope

- Sonarr and TV episodes only.
- Interactive/manual searches first.
- One video represents one episode.
- Direct Telegram video/document media.
- Hebrew and English captions/context.
- Channels/groups already visible to the Telegram user.
- Backfill plus ongoing fixed-interval polling.
- Local LLM through a configurable OpenAI-compatible endpoint.
- SQLite unless real scale proves it insufficient.
- Separate application, singleton Telegram service, ingestion-worker, extraction-worker, and download-worker processes from one TypeScript codebase and container image.
- Docker-friendly, but not coupled to a particular home-stack topology.

### Explicitly deferred or out of scope

- Discovering, crawling, joining, or expanding Telegram channels. A separate future project will own that.
- Radarr, Lidarr, or non-TV media.
- Season packs, archives, multi-episode files, and anime numbering.
- Automatic RSS-style Sonarr monitoring in the first milestone.
- Selecting the local LLM model or its hardware requirements; discuss that separately.
- Global Telegram search.
- Direct writes into Sonarr's internal database.

## System Boundary

```text
Dedicated Telegram user account
             |
             v
    singleton telegram-service
          |              |
          v              v
ingestion-worker   download-worker -> staging directory -> Sonarr import
          |              ^
          v              |
raw message store        |
          |              |
          v              |
context grouping         |
          |              |
          v              |
extraction-worker        |
          |              |
          v              |
    release index        |
          ^              |
          |              |
Prowlarr or Sonarr -- app (Torznab and qBittorrent-compatible APIs)
```

Prowlarr is optional. It manages the indexer but does not download. Sonarr talks directly to the qBittorrent-compatible endpoint and performs the final import.

Never download directly into Sonarr's managed TV library. Use a configurable staging/completed-download directory visible to both services.

## v1 Runtime Architecture

Run five long-running process roles from one TypeScript codebase and container image:

- `app`
  - Serves the authenticated UI and application APIs.
  - Exposes Torznab and the qBittorrent-compatible API.
  - Handles interactive requests and enqueues durable work; it does not perform backfills, extraction, or media downloads inline.
- `telegram-service`
  - Is the singleton owner of the GramJS `TelegramClient`, reusable MTProto session, and all Telegram connections.
  - Exposes a typed internal-only contract for connection/account status, chat and message retrieval, grab-time refetch, and media transfer.
  - Contains Telegram transport behavior only; it does not own ingestion, extraction, catalog, download-state, or Sonarr business rules.
  - Has no public host port and must refuse to connect when another live instance already owns the same session.
- `ingestion-worker`
  - Owns channel backfill, incremental polling, edit/deletion handling, recent overlap scans, and ingestion progress.
  - Reads Telegram through the internal `telegram-service` contract, writes raw messages and media facts, then schedules downstream context/extraction work.
- `extraction-worker`
  - Owns context grouping, deterministic parsing, local LLM calls, validation, series resolution, and canonical release updates.
  - Has independently configurable concurrency because local LLM capacity may be limited.
- `download-worker`
  - Uses `telegram-service` to verify availability and transfer Telegram media into the staging directory.
  - Owns durable download lifecycle, file handling, progress, pause/resume/cancel behavior, and errors exposed through the qBittorrent-compatible API.

Use SQLite tables as the durable coordination and job mechanism in v1. Jobs must be restart-safe, idempotent, transactionally claimed, and observable in the UI. Do not add Redis, RabbitMQ, or another broker without measured need. Run exactly one `telegram-service` instance and one instance of each worker role by default. Keep every process on the same host/filesystem while SQLite is in use.

The singleton Telegram owner prevents independent processes from opening parallel main connections with the same MTProto authorization, which can invalidate the session with `AUTH_KEY_DUPLICATED`. This follows the pattern demonstrated by MuLarr's shared in-process Telegram client and by Telegram daemon/IPC services; this project keeps the owner separate so ingestion and download lifecycle remain isolated workers.

The role split is a process and deployment boundary, not a set of independently versioned microservices. Roles share domain code, database schema, and release artifacts. A worker outage may delay its queue, but the UI and protocol APIs should remain available.

## v1 Code Architecture

Use a modular monolith with multiple process entrypoints: one TypeScript application, one database schema, one Docker image, and strict module boundaries. Do not split the roles into separate repositories or independently versioned services.

Target source layout:

```text
src/
  processes/
    app/
      main.ts
    telegram-service/
      main.ts
    ingestion-worker/
      main.ts
    extraction-worker/
      main.ts
    download-worker/
      main.ts
    migrate/
      main.ts

  modules/
    telegram-access/
      application/
      ports/
    ingestion/
      domain/
      application/
      ports/
    context/
      domain/
      application/
    extraction/
      domain/
      application/
      ports/
    catalog/
      domain/
      application/
    downloads/
      domain/
      application/
      ports/
    search/
      application/
    review/
      application/

  protocols/
    app-api/
    telegram-internal/
    torznab/
    qbittorrent/

  adapters/
    sqlite/
    telegram-gramjs/
    telegram-rpc-client/
    llm-openai-compatible/
    local-filesystem/

  platform/
    config/
    logging/
    time/
```

The UI may live under the `app` process or in a neighboring frontend directory according to the selected web framework. Do not let the UI framework define domain or worker structure.

Each process `main.ts` is a small composition root. It loads role-specific configuration, creates adapters, wires application use cases, starts the HTTP server, internal Telegram service, or worker loop, and owns shutdown. It contains no business rules. The `migrate` process applies schema migrations and exits before long-running roles start.

Dependency direction:

```text
processes -> modules
processes -> adapters
adapters  -> module ports
protocols -> application use cases
domain    -> no framework-specific code
```

Architecture rules:

- Domain code must not import SQLite, GramJS, HTTP, filesystem, or LLM SDK code.
- Application use cases own workflows and transaction boundaries.
- Ports are defined by the module that needs the capability; adapters implement them.
- Only `telegram-service` may compose the `telegram-gramjs` adapter or read Telegram credential environment variables. Other processes use `telegram-rpc-client` through module-owned ports.
- The `telegram-internal` protocol is private to the deployment and must expose bounded Telegram operations rather than domain workflows.
- Protocol handlers translate external requests and responses only. Torznab and qBittorrent handlers must not contain search, release, or download business rules.
- Worker entrypoints own claim loops, not the work itself. A claimed job calls an application use case that can be tested without starting a process loop.
- Long Telegram transfers and LLM calls run outside SQLite write transactions.
- Modules interact through application interfaces and explicit repositories rather than arbitrary writes to another module's tables.
- Do not use an in-memory event bus for cross-process work. SQLite is the durable handoff.
- Avoid catch-all `shared`, `common`, or `utils` modules. Put behavior in the domain that owns it.

Durable handoffs:

- The ingestion worker fetches bounded Telegram data through `telegram-service`, then atomically upserts source data and records media-processing work when relevant input changes.
- The extraction worker claims media-processing work, persists immutable extraction runs, and transactionally updates the current canonical release and revision when appropriate.
- A Sonarr grab atomically creates a download with `desired_state = queued` and returns promptly.
- The download worker claims the download, uses `telegram-service` for grab-time refetch and media bytes, and alone changes `observed_state` and progress. App requests for pause, resume, retry, or removal change `desired_state`; the worker reconciles `observed_state`.
- A worker claim must be short and transactional. Commit before external work, then persist its result. Leases allow work to resume after a process stops; fingerprints and unique source identities prevent duplicate effects.

Logical table ownership:

- `ingestion`: Telegram chats, chat sync state, messages, and media assets.
- `context` / `extraction`: media-processing jobs, context groups, context associations, and extraction runs.
- `catalog`: series, aliases, releases, and release revisions.
- `downloads`: download requests, transfer state, progress, and errors.
- `app`: invokes module commands for settings, review actions, and requested download state rather than bypassing module rules.

Testing boundaries:

- Unit-test deterministic parsing, grouping rules, normalization, and state transitions without infrastructure.
- Integration-test SQLite repositories, migrations, transactions, job claiming, lease recovery, and idempotency against real SQLite.
- Contract-test the internal Telegram API, Torznab XML, the qBittorrent-compatible API, and the LLM JSON schema.
- End-to-end test message ingestion through `telegram-service` to release creation and Sonarr grab through `telegram-service` to a staged completed file.

## Ingestion and Restart Safety

Backfill and incremental polling must be durable and idempotent.

- Use `(chat_id, telegram_message_id)` as the unique source identity.
- Persist separate per-chat cursors for:
  - Newest message seen by incremental polling.
  - Oldest message reached by backfill.
  - Backfill completion.
  - Recent overlap/rescan state.
- Refetching an overlapping window is expected. Upsert rather than duplicate.
- Store a content fingerprint so unchanged messages do not trigger downstream work.
- Persist source create/edit timestamps and a local deletion marker.
- Persist pending grouping/extraction work. Do not rely on process memory for recovery.
- An extraction input fingerprint plus pipeline/prompt version must prevent repeated LLM calls for identical work after restart.
- Backfill limits must eventually be configurable per channel: entire history, newer than a date, or maximum message count.

Text-only messages are ignored as release candidates, not discarded. They are required as possible evidence for neighboring media.

## Context Grouping

Context grouping answers:

> Which Telegram messages are plausible evidence about this target video?

Under the v1 assumption, prefer one context group per target media asset. A text message may participate in more than one group when it plausibly describes several nearby videos.

Candidate context, in descending strength:

1. Explicit Telegram reply relationships.
2. Telegram media-group/album membership.
3. Same forum topic.
4. Nearby text before and after the media.
5. Time distance and message order.
6. Channel title and username.
7. Optional user-configured channel hint.

Channel name and topic name are meaningful LLM context, but they are supporting evidence rather than proof.

Context grouping does not interpret series or episode metadata. It only records association candidates and their roles, such as `target`, `preceding`, `following`, `reply`, or `album_sibling`.

When relevant messages change, recompute the context input fingerprint and schedule another extraction. Keep earlier extraction runs for auditability.

### Context readiness

- A video with sufficient self-contained caption/filename may be extracted immediately.
- A video without sufficient metadata enters `pending_context` so a following message can arrive.
- Use a configurable quiet period only for incomplete context; do not impose a blanket delay on every video.
- The extractor may return a bounded `needs_more_context` request. Application code may expand stored context and retry once or a configured small number of times.
- Exact adjacency rules cannot be validated until real channel samples exist. The UI must expose the group and evidence so grouping mistakes are visible.

## Extraction Pipeline

For each ready context group:

1. Read Telegram/media facts deterministically: filename, MIME type, size, duration, width, height, caption, and explicit relationships.
2. Apply deterministic Hebrew/English patterns such as `S02E04`, `עונה 2`, `פרק 4`, and `1080p`.
3. Invoke the local LLM for unresolved interpretation.
4. Validate the returned JSON schema and evidence references.
5. Cross-check claims that can be proven mechanically, such as resolution versus video dimensions.
6. Resolve the observed series title against local canonical series and aliases.
7. Compute the application's final review/index decision. Do not let the LLM mark its own result verified.
8. Materialize or update the canonical release record.

Store raw source data, context associations, extraction history, and the current canonical release separately. This permits re-extraction after model/prompt changes without talking to Telegram again and prevents automatic work from overwriting a manually verified correction.

## LLM Contract

Treat the LLM as a pure structured extraction function, not an autonomous agent:

```text
bounded structured context -> local LLM -> structured candidate metadata
```

### Input

The application supplies:

- Channel title and username.
- Forum topic name when present.
- Optional user-configured channel hint.
- The target media message and Telegram identifiers.
- Filename, MIME type, size, duration, width, and height.
- A bounded ordered set of surrounding messages.
- Each message's relation and time/position relative to the target.
- Reply and media-group relationships.
- A short list of known local series candidates/aliases when available.
- v1 assumptions: one video equals one episode; season packs unsupported.

Do not send video bytes or unbounded channel history.

The permanent prompt must say that Telegram/channel text is untrusted data, not instructions. Motivation: a post could contain instruction-like text that must not change extraction behavior.

### Output

Require strict JSON containing candidate values, per-field confidence, and evidence:

- Whether the context describes the target media.
- Observed/original series title.
- Canonical English title candidate and matched local series ID when available.
- Season number or `null`.
- Episode number or `null`.
- Resolution, source, codec, and language only when supported by evidence.
- Evidence message IDs or channel/topic evidence per field.
- Ambiguities.
- Recommended state: `index`, `review`, `unresolved`, or `needs_more_context`.
- Optional bounded request for more stored context.

Do not request free-form chain-of-thought. A short ambiguity explanation is enough.

### No LLM tools in v1

The LLM receives no callable tools. Application code owns context retrieval, alias lookup, validation, database writes, Telegram access, and downloads.

If later evidence justifies tool use, consider only narrow read-only operations such as finding local series candidates or requesting bounded stored context. Never allow the model to write records, contact Telegram, start/delete downloads, change configuration, or verify itself.

## Review and Confidence Policy

Precision matters more than recall. A hidden result is less harmful than importing the wrong episode.

Initial calibration mode:

- Send every extraction to the UI review queue.
- Record accepted and corrected results.
- Keep low/incomplete results stored but hidden from Sonarr.
- Derive automatic-indexing thresholds only after measuring real labeled examples.
- Manual edits update the canonical release and create an immutable revision/audit record.
- Later extraction must not overwrite a manually verified record without explicit user action.

No real message samples are currently available. This is the largest remaining product risk.

## Series Identity and Sonarr Search

Sonarr maintains its own internal series and episode database. This service must not read or write it directly.

Sonarr's Torznab requests can include title/scene aliases, season, episode, and external identifiers depending on advertised capabilities. For v1:

- Advertise and support title/query, season, and episode search.
- Store canonical series separately from releases.
- Store Hebrew and English aliases.
- Search every normalized alias.
- Let the UI create, edit, merge, and split series/aliases.
- Do not require TVDB/TMDB/TVMaze/IMDb identifiers initially.
- Add external ID resolution only when there is a proven need and source.
- Generate the final Sonarr-readable release title deterministically, for example `Fauda.S04E03.1080p.Telegram`. The LLM does not generate protocol output.

## Availability Policy

Accepted policy: last known availability plus verification on grab.

- Process Telegram deletion events when observed.
- Periodically rescan a recent overlapping window for edits/deletions.
- Preserve older media at its last-known availability state rather than polling every asset constantly.
- Before any grab, refetch the Telegram message/document.
- A failed grab-time verification marks the asset unavailable and hides its release from future searches.
- Allow an optional low-rate historical availability audit.

Use availability states such as `available`, `unknown`, and `unavailable`, with `last_verified_at` and `unavailable_at`.

## Logical Data Model

### Ingestion domain

- `TELEGRAM_CHATS`
  - Channel identity, title/type, enabled state, timestamps.
- `CHAT_SYNC_STATE`
  - One-to-one with a chat.
  - Incremental cursor, backfill cursor/completion, recent scan, last error.
- `TELEGRAM_MESSAGES`
  - Unique `(chat_id, telegram_message_id)`.
  - Text, reply target, media-group ID, source timestamps, fingerprint, deletion marker.
- `MEDIA_ASSETS`
  - Zero-or-one per Telegram message in v1.
  - Stable document metadata, filename/MIME/size/dimensions/duration, availability.
  - Refetch by chat/message ID at download time; do not assume a stored Telegram file reference remains valid forever.

### Context and extraction domain

- `MEDIA_PROCESSING_JOBS`
  - Durable context-grouping and extraction work keyed by target media asset and input fingerprint.
  - State, eligibility/quiet-period time, claim lease, retry/error information, and timestamps.
- `CONTEXT_GROUPS`
  - State, input fingerprint, quiet-period deadline, timestamps.
- `CONTEXT_GROUP_MESSAGES`
  - Many-to-many join between groups and messages.
  - Role and relative order.
- `EXTRACTION_RUNS`
  - Immutable attempts tied to a context group.
  - Input fingerprint, pipeline/prompt/model version, status, confidence, result JSON, error.

### Canonical/search domain

- `SERIES`
  - Canonical title, original language, optional external IDs.
- `SERIES_ALIASES`
  - Many aliases per series, with normalized value, language, and source.
- `RELEASES`
  - At most one current canonical v1 release per media asset.
  - Series, extraction provenance, season, episode, quality, language, deterministic display title, review state, confidence, manual-verification state.
- `RELEASE_REVISIONS`
  - Immutable before/after audit entries for UI/automatic changes.
- `DOWNLOADS`
  - Multiple attempts per release.
  - Sonarr-facing client hash, `desired_state`, `observed_state`, progress, claim lease, staging path, errors, timestamps.

Key cardinalities:

```text
TELEGRAM_CHATS 1 ── 1 CHAT_SYNC_STATE
TELEGRAM_CHATS 1 ── * TELEGRAM_MESSAGES
TELEGRAM_MESSAGES 1 ── 0..1 MEDIA_ASSETS
MEDIA_ASSETS 1 ── * MEDIA_PROCESSING_JOBS
TELEGRAM_MESSAGES * ── * CONTEXT_GROUPS (through CONTEXT_GROUP_MESSAGES)
CONTEXT_GROUPS 1 ── * EXTRACTION_RUNS
MEDIA_ASSETS 1 ── 0..1 RELEASES
SERIES 1 ── * SERIES_ALIASES
SERIES 1 ── * RELEASES
RELEASES 1 ── * RELEASE_REVISIONS
RELEASES 1 ── * DOWNLOADS
```

The data model is provisional. The user explicitly expects gaps to emerge and wants to challenge it visually and conceptually before migrations are finalized.

## Required UI

Do not treat the UI as an afterthought. It requires authentication even on a local network.

Expected areas:

- Telegram connection, account, and operator-provisioned session status. The v1 UI does not perform Telegram login or session creation.
- Channel discovery, enable/disable, and per-channel backfill controls.
- Backfill and polling progress/errors.
- Raw message and context-group viewer.
- Target media technical details and availability.
- Extraction input/output inspection.
- Review queue.
- Canonical release editor with manual verification.
- Series and alias management, including merge/split behavior.
- Search simulator that accepts Sonarr-like title/season/episode parameters.
- Download queue, progress, retry, and errors.
- Settings, API authentication, and pipeline diagnostics.

The UI must make it easy to see whether an error originated from bad context grouping, extraction, series resolution, protocol mapping, or downloading.

## API and Protocol Work Still Required

### Torznab

Define and test:

- Capabilities response for TV title/query, season, and episode.
- Search-result mapping and XML.
- Stable GUID/download identifier.
- Deterministic release title.
- Category, quality, size, language, publish date, paging, and authentication.
- Prowlarr compatibility and direct Sonarr compatibility.

### qBittorrent-compatible subset

Determine the exact endpoints Sonarr uses for:

- Authentication.
- Add/grab.
- Transfer list/status/progress.
- Categories and save paths.
- Pause, resume, and delete.
- Completed state and import path.
- Removal after successful import.

Reuse MuLarr's proven mappings where suitable, but remove aMule assumptions.

## Security and Secrets

Accepted Telegram credential policy for v1:

- The operator provisions `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and `TELEGRAM_SESSION` through environment variables before startup.
- Only `telegram-service` receives those environment variables and owns the live Telegram client.
- The session is read-only application configuration. V1 does not create, rotate, persist, or encrypt Telegram session material inside SQLite or through the UI.
- The UI exposes connection, account, and session-validity status only. A separate session-generation/login command may be considered after v1.

Still decide:

- API-key authentication for Prowlarr/Sonarr.
- UI authentication and session implementation for this application's users.

Never log Telegram session strings, API secrets, login codes, passwords, or full sensitive configuration.

## Loose Ends

These remain unresolved and should be handled in future discovery/specification:

1. **Backfill cost controls**
   - Default per-channel history policy.
   - How the UI estimates raw ingestion and LLM workload before starting.
2. **Context boundary rules**
   - Default messages-before/messages-after count.
   - Maximum time gap.
   - Quiet period for uncaptioned media.
   - Boundaries between unrelated adjacent posts.
   - Cannot be validated without real samples.
3. **Extraction JSON schema**
   - Final required fields, enums, evidence format, and bounded more-context request.
4. **Confidence calibration**
   - Initial review-all mode is chosen; automatic threshold waits for real labeled data.
5. **Series resolution**
   - Alias normalization for Hebrew/English.
   - Duplicate/merge behavior.
   - Whether and when external IDs become necessary.
6. **Torznab contract details**
   - Exact capabilities and release field mapping.
7. **qBittorrent contract details**
   - Exact Sonarr-required API surface and completed-download semantics.
8. **UI interaction design**
   - Screen structure, review flow, context editing, series merge/split, and visual direction.
9. **Secrets/authentication**
   - UI authentication and Prowlarr/Sonarr API-key management.
   - Telegram credentials and session are operator-provisioned environment variables owned only by `telegram-service`; application-side session storage and login are resolved out of v1.
10. **Local LLM runtime/model**
    - Deliberately deferred to another conversation.
    - Keep the application adapter OpenAI-compatible and queue concurrency configurable.
11. **Real sample corpus**
    - Obtain sanitized Hebrew/English channel examples once available.
    - Use them to validate grouping and measure extractor precision.

## Working Rules for Future Sessions

- Continue from this document; do not restart discovery from zero.
- Ask targeted questions only when the answer changes architecture or product behavior.
- Validate theories against MuLarr, Telegram's official API documentation, and Sonarr's official source when relevant.
- For GitHub URLs, use `gh` rather than scraping.
- Prefer `rg` for local search.
- Reuse existing code where suitable and keep modifications targeted.
- Do not add unrelated features, files, or documentation.
- Before implementing defensive behavior, explain the concrete failure/security motivation and obtain user approval when the policy is not already settled here.
- When implementation begins, inspect related code paths for consistency and verify changes before handoff.
- Current year: 2026.
