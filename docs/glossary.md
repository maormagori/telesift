# Glossary

This glossary defines terms used in the current code and documentation. Exact state values mirror the current TypeScript domain types.

## Product and integrations

**TeleSift / Sift** — TeleSift is the current project name. Sift is the committed future name.

**Sift Pro** — planned hosted edition that removes self-hosting work. It is not implemented.

**Sonarr** — TV library manager that searches TeleSift through Torznab, requests downloads through the qBittorrent-compatible API, and imports completed files.

**Prowlarr** — optional indexer manager between TeleSift's Torznab endpoint and Sonarr. It does not download media.

**Stremio** — intended future consumption client. No Stremio addon exists today.

**Torznab** — XML indexer protocol used to advertise capabilities and return TV search results.

**qBittorrent-compatible API** — the small HTTP surface TeleSift emulates so Sonarr can add, poll, control, and remove Telegram-backed downloads. It is not a BitTorrent client and does not implement the full qBittorrent API.

**MTProto** — Telegram client protocol used by the dedicated user account. TeleSift does not use the Telegram Bot API.

## Sources and ingestion

**Configured channel** — operator-supplied Telegram username or numeric ID plus an enabled flag and a backfill policy. It may exist before Telegram successfully resolves it.

**Backfill policy** — per-channel choice, fixed when the channel is added, of whether to backfill existing history and how many of the newest messages to include. A channel without its own message limit uses `INGESTION_BACKFILL_MAX_MESSAGES`, or all retained history when that is unset.

**Telegram chat** — resolved Telegram channel, group, or user visible to the connected account. V1 is intended for channels and groups; only those are offered when picking a chat to add.

**Chat sync state** — durable cursors and status for incremental polling, backfill, recent rescans, and the latest ingestion error.

**Telegram message** — stored source text and relationships identified by `(chat_id, telegram_message_id)`. Text-only messages remain available as evidence.

**Media asset** — normalized metadata for the single attachment associated with a stored message in the current model: filename, MIME type, byte size, duration, dimensions, and availability.

**Source fingerprint** — hash of normalized message/media input. An unchanged fingerprint prevents overlap scans from scheduling duplicate work.

**Backfill** — ingesting a configured chat's existing history after it is added: a forward walk from a starting message set once by the backfill policy (the beginning of retained history, the newest N messages, or only new messages) up to the newest message.

**Incremental poll** — reading messages newer than the chat's durable newest-seen cursor.

**Overlap scan** — rereading a recent range so edits or deletions can be observed without scanning all historical media.

## Context and extraction

**Target** — media message whose episode metadata is being determined.

**Context group** — ordered set of stored messages considered plausible evidence for one target media asset.

**Context role** — why a message belongs to a group: `target`, `preceding`, `reply`, or `album_sibling`.

**Quiet period** — delay applied when a target lacks enough self-contained metadata and may need a following message. The deadline is stored on the context group.

**Media-processing job** — durable request to build/refresh context and extract metadata for an asset. States: `pending`, `processing`, `completed`, `failed`.

**Claim lease** — expiring ownership of a job or download by one worker. It permits recovery when a process stops after claiming work.

**Deterministic parse** — metadata derived mechanically from filename, caption, or media facts before an LLM is consulted.

**Extraction run** — immutable record of one extraction attempt, including its input fingerprint and pipeline, prompt, and model versions. States: `succeeded`, `failed`.

**LLM recommendation** — structured model output such as `index`, `review`, `unresolved`, or `needs_more_context`. It is evidence for the application decision, not the final review state.

**Cross-check** — application comparison between extracted claims and mechanically knowable facts, such as season/episode patterns or video dimensions.

## Catalog and review

**Series** — canonical local identity for a television series.

**Series alias** — normalized observed or alternate title used to match extraction and search text to a series.

**Release** — current canonical, searchable description of one media asset: series, season, episode, quality fields, display title, and review state.

**Release revision** — immutable audit record of an automatic or manual change to a release.

**Display title** — deterministic Sonarr-readable release name, for example `Series.Title.S04E03.1080p.Telegram`.

**Review state** — `pending_review`, `approved`, or `rejected`. Only approved releases are eligible for normal search.

**Manual verification** — operator approval or correction recorded separately from automatic extraction. Later automatic work must not silently overwrite it.

**Auto-index gate** — application policy that decides whether an extraction can become approved without operator review. The LLM cannot pass this gate by itself.

## Availability and downloads

**Availability** — last-known source state: `available`, `unknown`, or `unavailable`.

**Grab-time verification** — refetch of the Telegram message/media immediately before transfer. Failure marks the asset unavailable and prevents later search results.

**Download** — one transfer attempt for a release, identified to Sonarr by a stable client hash.

**Desired state** — operator/client request: `queued`, `paused`, or `canceled`.

**Observed state** — worker-reported lifecycle: `queued`, `verifying`, `downloading`, `paused`, `completed`, `failed`, or `canceled`.

**Staging directory** — filesystem location where TeleSift writes completed media for Sonarr to import. It must not be Sonarr's managed library.

## Runtime

**App** — process serving UI, application APIs, Torznab, and the qBittorrent-compatible API.

**Telegram service** — singleton process that owns the Telegram client/session and exposes bounded internal reads and media transfer.

**Ingestion worker** — process responsible for backfill, polling, source persistence, and scheduling media work.

**Extraction worker** — process responsible for context construction, parsing, LLM calls, validation, series resolution, and release materialization.

**Download worker** — process responsible for availability verification, transfer, staging, progress, and download state.

**Composition root** — small process `main.ts` that loads configuration and connects use cases to adapters.

**Port** — interface owned by a module describing a capability it needs.

**Adapter** — infrastructure implementation of a port, such as SQLite, Telegram, an OpenAI-compatible LLM, or the local filesystem.
