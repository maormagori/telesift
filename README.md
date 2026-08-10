# TeleSift

TeleSift is a planned self-hosted service that indexes media already visible to a dedicated Telegram user account and makes authorized media available to external media clients.

The first milestone targets TV episodes through Sonarr and Prowlarr using Torznab and a minimal qBittorrent-compatible download API. The project name and core boundary are intentionally independent of the Arr stack so other consumer protocols can be added when there is a proven need.

## Status

TeleSift is in product and architecture discovery. It is not yet usable and has no application runtime.

The current design calls for a TypeScript modular monolith with separate app, Telegram connection, ingestion, extraction, and download process roles; SQLite-backed durable work; an authenticated operator UI; and a configurable OpenAI-compatible local LLM endpoint.

## Responsible use

Use TeleSift only with sources and content you are authorized to access. It does not discover or join Telegram channels and is not intended to bypass access controls.

This repository is public. Never submit credentials, Telegram sessions, real chat or message data, private paths, internal URLs, or personal deployment configuration. Use synthetic examples and review every change for private information before committing or pushing.

## Local secret checks

[Install gitleaks](https://github.com/gitleaks/gitleaks#installing), then enable the tracked Git hooks once per clone:

```sh
git config core.hooksPath .githooks
```

The pre-commit hook scans staged content. The pre-push hook scans repository history. Both stop when gitleaks is unavailable. Secret scanning cannot identify every kind of private information, so manual review remains required.

## License

TeleSift is licensed under the [MIT License](LICENSE).
