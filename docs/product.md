# Product

This document defines TeleSift's current product contract. The [roadmap](../ROADMAP.md) owns future direction; the [architecture](architecture.md) describes how the current implementation works.

TeleSift will be renamed to **Sift**. Until that separate rename is complete, current code, configuration, and repository paths continue to use **TeleSift**.

## Vision

Sift should let people use video files they are authorized to access in messaging channels through the media clients they already use. The current product recognizes single TV episodes; movie recognition, search, and delivery are planned for the future.

The self-hosted edition is for technically capable users who run a home server and manage their own source accounts, channels, storage, and media clients. The intended experience is:

1. Connect a supported messaging account.
2. Choose channels already available to that account.
3. Let Sift index messages, understand media context, and flag uncertainty.
4. Review or correct uncertain releases in Sift's UI.
5. Search and consume approved media primarily through Sonarr or Stremio.

Sift's UI is the operating and diagnostic surface. It does not replace the media clients that organize or play the user's library.

Sift Pro is the planned hosted edition for people who do not want to operate a server. It should remove infrastructure work: the user connects a supported account, selects channels, and receives endpoints usable by Sonarr or Stremio. Its tenant, security, billing, legal, and platform-policy design remains separate future work.

## Current goal

The first release focuses on one concrete path:

> In Sonarr interactive search, a user selects a TV episode sourced from Telegram; TeleSift downloads the correct video, reports progress through its download-client API, and Sonarr imports it.

The mechanics of search, grab, transfer, tracking, and staging have been exercised end to end. The release goal is not complete because series identity is not trustworthy enough and Sonarr's English title may not match aliases extracted from non-English Telegram posts.

Precision matters more than recall. Hiding an uncertain release is preferable to importing the wrong episode.

## Current scope

- One dedicated Telegram user account authenticated through MTProto, not the Bot API.
- Channels and groups already visible to that account.
- Backfill plus fixed-interval polling.
- Direct Telegram video and document media.
- One video represents one TV episode.
- Hebrew and English context.
- Deterministic parsing plus a configurable local OpenAI-compatible LLM endpoint.
- SQLite storage on one host.
- Sonarr interactive/manual search through Torznab.
- Optional Prowlarr management of the Torznab indexer.
- A qBittorrent-compatible facade for Sonarr download control.
- A configurable staging directory from which Sonarr imports.
- A single authenticated operator UI.

## Outside the current release

- Finding, crawling, or joining new channels.
- Discord or another messaging provider.
- Stremio, Radarr, movies, season packs, archives, multi-episode files, or anime numbering.
- Automatic RSS-style Sonarr monitoring.
- Direct writes into Sonarr's database or library.
- A hosted multi-tenant service.
- Sharing one user's indexed sources with another user.

These exclusions describe the current release, not permanent product limits. See the roadmap for direction.

## Product rules

### Authorized sources only

Sift indexes only channels the connected account is authorized to access. It must not discover, join, or broaden access to sources on the user's behalf. Credentials, private content, and deployment details never belong in the public repository.

### Evidence is retained

Text-only messages are not releases, but they may explain nearby media. Store the source messages, media facts, context associations, extraction history, canonical release, and manual revisions separately so an operator can inspect why a result exists.

### Context grouping does not interpret media

A context group answers which messages could describe a target video. Strong signals include replies, media groups, forum topics, nearby text, order, and time distance. Extraction interprets the bounded group afterward.

A self-contained caption or filename can be processed immediately. Incomplete media waits for a quiet period so a following message can arrive. The extractor may request a small bounded expansion of already-stored context.

### The LLM is a bounded extractor

The application sends structured message context and media facts to a local OpenAI-compatible endpoint. The model returns schema-validated candidate metadata, ambiguities, and a recommended state. It receives no tools and cannot read Telegram, write records, change settings, or start downloads.

Telegram text is untrusted input, not instructions to the model. Video bytes and unbounded history are never sent to the LLM.

### The application decides visibility

The model cannot verify its own answer. A release may be auto-approved only when the application confirms all required signals: TV classification, an `index` recommendation, no ambiguities, agreement between deterministic facts and extracted season and episode, and a trustworthy series match. A series match is trustworthy only when the observed title is grounded -- found verbatim in the message text or filename, not merely asserted by the model -- before it is used to match or create a series. Resolution is derived deterministically from the video's own dimensions, not extracted by the model, so it plays no part in this cross-check.

Anything short of that enters `pending_review` and stays hidden from Sonarr. Manual edits and decisions create immutable revisions. Later automatic extraction must not overwrite manually verified data without an explicit operator action.

The current series-verification gate does not fully enforce this rule; [#51](https://github.com/maormagori/telesift/issues/51) tracks the correction.

### Search output is deterministic

Series and aliases are separate from releases. Search matches normalized aliases plus season and episode, then generates a stable title such as `Series.Title.S04E03.1080p.Telegram`. The LLM never generates Torznab or qBittorrent protocol output.

External series identity is now required direction because title-only matching cannot reliably bridge Hebrew Telegram posts and the English title Sonarr sends. [#54](https://github.com/maormagori/telesift/issues/54) and [#55](https://github.com/maormagori/telesift/issues/55) own that work.

### Availability is verified on grab

TeleSift preserves last-known availability instead of repeatedly polling every historical asset. It processes observed deletions and overlapping recent scans. Before a grab, it refetches the source message and media. A failed check marks the asset unavailable, fails the download, and hides the release from later searches.

### Sonarr owns the library

TeleSift downloads into a staging directory visible to both services. Sonarr performs the final import into its managed TV library. TeleSift never downloads directly into that library.

## Current security posture

- Telegram API credentials and the reusable session are provisioned through environment variables.
- Only `telegram-service` code reads or uses Telegram credentials and owns the live client.
- The reference Compose deployment currently loads one shared `.env` into every container, so secret delivery is broader than the intended process boundary.
- The UI uses one environment-provisioned administrator credential and a signed session cookie.
- Torznab supports an optional API key.
- The qBittorrent-compatible login endpoint currently accepts every login; external-client authentication remains unfinished.
- Secrets, login codes, real message content, private identifiers, and personal deployment configuration must never be logged or committed.

Do not expose the pre-alpha service directly to the public internet.
