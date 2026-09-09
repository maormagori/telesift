# Roadmap

TeleSift is becoming **Sift**: a service that turns authorized media from messaging channels into reviewed releases consumable through Sonarr and Stremio.

This roadmap describes outcomes, not dates. It is intentionally not a copy of the issue backlog. GitHub Issues hold scoped work and current priority; this document explains why that work matters and where the product is going.

The labels below matter:

- **Current** — implemented now, though still pre-alpha.
- **Committed direction** — part of the intended product, without a promised date or settled design.
- **Exploration** — an idea that must prove feasible, safe, and useful before becoming a commitment.

## Current foundation: Telegram-to-Sonarr pre-alpha

The original seven implementation milestones are complete. TeleSift can ingest Telegram messages, group context, extract episode metadata, hold uncertain results for review, expose approved releases over Torznab, accept a Sonarr grab through its qBittorrent-compatible API, download the Telegram file, and stage it for import.

This is a working foundation, not a release-ready product. Real-account testing found correctness, identity, security, and operator-experience gaps that synthetic happy paths did not reveal.

## Horizon 1: Make the core trustworthy

**Outcome:** a normal Sonarr search can find the intended release across languages, and no unverified or corrupted series identity reaches Sonarr automatically.

Work in this horizon centers on:

- Repairing inconsistent, invalid, and duplicate series identities found in real data.
- Making human verification of a series meaningful to the automatic approval gate.
- Resolving series through a stable external identity and importing useful translated aliases, so Sonarr's title and Telegram's title meet at the same series.
- Rechecking already-materialized releases affected by unsafe identity behavior.
- Completing Telegram edit, deletion, forum-topic, availability, and singleton guarantees where implementation still falls short of the product rules.
- Improving extraction retries and calibration using sanitized evidence rather than loosening the review gate.

The principal tracked blockers are [#51](https://github.com/maormagori/telesift/issues/51), [#54](https://github.com/maormagori/telesift/issues/54), and [#55](https://github.com/maormagori/telesift/issues/55).

## Horizon 2: Ship a dependable self-hosted product

**Outcome:** a home-server operator can install Sift, connect Telegram, choose sources, understand what it is doing, recover from failures, and keep it running without reading the database or source code.

### Setup and operation

- Reduce credential and Telegram-session setup friction while keeping session material under operator control.
- Provide clear deployment, upgrade, migration, backup, health-check, and recovery guidance.
- Let operators browse visible chats, configure per-channel backfill limits, trigger syncs, and understand progress and errors.
- Estimate expensive backfill and extraction work before it starts.
- Add authentication appropriate for every externally consumed endpoint; remove the permissive qBittorrent login placeholder.
- Deliver Telegram secrets only to the process that owns the Telegram connection.

### Review and diagnosis

- Explain how context, deterministic parsing, LLM output, series matching, and approval gates produced each release.
- Surface failed jobs, worker activity, stale channels, unavailable media, and actionable errors.
- Allow safe edits to approved releases and add series/alias repair operations such as merge and split.
- Improve download visibility with useful transfer rate, ETA, retry, and history information.
- Keep manual changes auditable and protected from later automatic work.

### Product readiness

- Define retention for messages that no longer contribute useful evidence.
- Test migrations, process composition, lease recovery, protocol compatibility, and upgrades on clean installations.
- Publish a supported configuration contract and a clear release gate.
- Keep SQLite and a single-host topology until measured usage proves they are inadequate.

## Horizon 3: Reach users through Sonarr and Stremio

**Outcome:** approved media is usable through the client's preferred experience rather than requiring Sift's own search UI.

Sonarr remains the first complete consumer. Sift should finish title/identity compatibility, protocol authentication, queue behavior, and staging semantics before broadening that surface.

Stremio is committed product direction, but its integration still needs design. That work must decide which addon resources Sift exposes, how identifiers map to releases, whether playback streams from the source or from staged storage, and what seeking, ranges, caching, concurrency, and authentication require.

Movie and Radarr support may follow once the TV model is reliable. It must introduce movie identity, release year, categories, and review rules without weakening the episode path.

Sift's UI remains the place to configure sources, review uncertain data, correct the catalog, simulate searches, and diagnose failures. Sonarr and Stremio remain the primary discovery and consumption surfaces.

## Horizon 4: Prepare for more than one messaging provider

**Outcome:** Telegram-specific transport can eventually sit behind provider-neutral source, conversation, message, attachment, availability, and transfer contracts without erasing real provider differences.

This is committed architectural direction, not permission to build a generic framework ahead of need. Abstraction should be introduced from concrete second-provider requirements, preserve Telegram behavior, and keep provider-specific identifiers and capabilities explicit.

Telegram is the only committed provider today. Discord is a possible future provider, not a promised roadmap feature. It requires its own discovery work covering supported authentication, bot installation, permissions, message-content access, history, attachment transfer, rate limits, platform policy, and differences from Telegram user-account access. Sift will not automate normal Discord user accounts or assume that Telegram's account model transfers to another platform.

## Horizon 5: Deliver Sift Pro

**Outcome:** a user without a home server can connect a supported source, choose channels, and receive managed endpoints for Sonarr or Stremio without operating Sift infrastructure.

Sift Pro is a committed destination and a distinct hosted edition alongside the open-source self-hosted product. Its smallest useful experience should remove deployment, database, workers, storage, upgrades, and monitoring from the customer.

Before implementation, its dedicated design must settle:

- Customer, user, tenant, organization, and subscription boundaries.
- Per-tenant source credentials, sessions, messages, catalog, media, downloads, and encryption.
- Isolation across application work, queues, storage, logs, support access, and backups.
- Hosted Sonarr/Torznab, qBittorrent-compatible, and Stremio endpoint authentication.
- Download and streaming cost, quotas, retention, abuse controls, and billing dimensions.
- Source-platform terms, user authorization, content rights, privacy obligations, and account lifecycle.
- A path that shares the proven Sift domain without forcing self-hosted users into SaaS architecture.

Issue [#47](https://github.com/maormagori/telesift/issues/47) owns that product and architecture design.

## Exploration: a shared Sift Pro index

Sift Pro may eventually become more than isolated hosted deployments. One possible differentiator is a cross-customer index: media observed in opted-in sources could be enriched once and become discoverable to other eligible users.

This is only an idea. It must not be encoded into today's data model, provider boundary, or permission model. A dedicated investigation must determine whether it is technically and economically useful and whether it can be operated lawfully and responsibly.

At minimum, that investigation must separate metadata discovery from access to media, define who can publish a source, make private sources private by default, require meaningful consent, preserve revocation and deletion, prevent one tenant's credentials from granting another tenant access, and address platform rules, content rights, privacy, abuse, moderation, provenance, regional constraints, storage, and bandwidth.

Until those questions are answered, Sift Pro remains tenant-isolated and the shared index is not a committed capability.

## Guardrails across every horizon

- Index only sources and content the operator or customer is authorized to access.
- Prefer correct, explainable results over a larger unreviewed catalog.
- Keep ingestion evidence, model output, canonical data, and human corrections distinguishable.
- Use provider APIs and authentication models allowed by each platform.
- Keep protocol translation outside domain rules.
- Never let Sift write directly into a media client's internal database or managed library.
- Change storage and deployment architecture because measured needs demand it, not because a later product might.
