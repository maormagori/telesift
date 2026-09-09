# TeleSift

TeleSift is a self-hosted service that turns video files shared in authorized Telegram chats into reviewed, searchable TV episode releases for media clients. TV episodes are the current focus; movie support is planned for the future.

It signs in through a dedicated Telegram user account, indexes channels already visible to that account, extracts TV episode metadata from message context, and exposes approved releases through Torznab and a qBittorrent-compatible download API. Sonarr can search those releases, ask TeleSift to fetch the selected Telegram file, track progress, and import it from a staging directory.

> **Status: pre-alpha.** The core Telegram-to-Sonarr pipeline and operator UI are implemented and testable, but TeleSift is not production-ready. Series identity can still produce unsafe matches ([#51](https://github.com/maormagori/telesift/issues/51), [#54](https://github.com/maormagori/telesift/issues/54)), and Sonarr cannot reliably find non-English releases until cross-language identity resolution is implemented ([#55](https://github.com/maormagori/telesift/issues/55)).

Use TeleSift only with sources and content you are authorized to access.

## What exists today

- Telegram user-account access through MTProto.
- Durable backfill and polling into SQLite.
- Context grouping and deterministic plus local-LLM metadata extraction.
- Human review, correction, release search, and download controls in an authenticated UI.
- Torznab TV search for Sonarr or Prowlarr.
- The qBittorrent API subset Sonarr uses to grab and track a Telegram download.
- A multi-process Docker deployment from one codebase and image.
- Synthetic automated coverage plus a manual real-account/Sonarr acceptance path.

The current release supports single TV episodes from direct Telegram video/document media. Movies, packs, archives, anime numbering, Stremio, other message providers, and a hosted edition are future work.

## Documentation

- [Product](docs/product.md) — purpose, users, behavior, scope, and product rules.
- [Architecture](docs/architecture.md) — implemented processes, modules, data flow, and boundaries.
- [Glossary](docs/glossary.md) — project terminology and state names.
- [Roadmap](ROADMAP.md) — committed direction and ideas still under exploration.
- [Contributing](CONTRIBUTING.md) — current contributor workflow and repository safety rules.
- [Testing](docs/testing.md) — automated and manual verification paths.
- [Manual testing](docs/manual-testing.md) — checks that use real Telegram or Sonarr instances.

GitHub Issues are the public work record. The maintainer's GitHub Project is a private planning queue, so contributors should coordinate through an issue before starting substantial work.

Licensed under the [MIT License](LICENSE).
