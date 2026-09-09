# Contributing

TeleSift is pre-alpha. Contributions are welcome, but interfaces and workflows are still changing. This guide is the current safe baseline; contributor governance and conventions may be expanded in a dedicated follow-up.

Start with the [product contract](docs/product.md), [architecture](docs/architecture.md), and [roadmap](ROADMAP.md). The [glossary](docs/glossary.md) defines project terms.

## Before starting work

GitHub Issues are the public work record. The maintainer also uses a private GitHub Project for prioritization, but contributors do not need access to it.

1. Find an open issue or open a focused issue describing the problem and desired outcome.
2. Comment before starting substantial work and wait for maintainer confirmation that the scope is useful and ready.
3. Keep one pull request focused on one approved issue or tightly related change.
4. Never include private Telegram data or personal deployment details in an issue, discussion, commit, test, screenshot, or pull request.

Small typo or clearly local documentation fixes may go directly to a pull request. Architectural changes, new dependencies, protocol expansion, schema changes, and new product behavior should always be discussed first.

## Repository setup

Requirements:

- Node.js 22.5 or newer.
- npm.
- [gitleaks](https://github.com/gitleaks/gitleaks#installing) before committing or pushing.

Fork the repository, clone your fork, and create a descriptive topic branch. Then:

```sh
npm ci
git config core.hooksPath .githooks
npm test
npm run typecheck
npm run lint
npm run build
```

The automated suite uses synthetic data and does not need Telegram credentials, a real LLM, or Sonarr. See [Testing](docs/testing.md) for the test layers and optional runtime setup.

Do not commit `.env`, database files, generated sessions, downloaded media, logs containing private data, or analysis based on real messages.

## Making changes

- Follow the module and dependency boundaries in [Architecture](docs/architecture.md).
- Put business rules in the owning domain/application module, not process entrypoints or protocol handlers.
- Reuse existing ports, adapters, components, and test patterns before adding new abstractions.
- Keep changes narrow. Do not include opportunistic cleanup unrelated to the issue.
- Add or update tests at the lowest useful boundary.
- Update the canonical documentation when behavior, configuration, architecture, workflow, or roadmap commitments change.
- Use synthetic identifiers, titles, messages, filenames, and media facts in public artifacts.

If a change appears to require real private data, stop and ask for a sanitized fixture or a local-only validation approach.

## Verification

Before opening a pull request, run:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Run relevant manual checks when the behavior crosses a real Telegram, Sonarr, filesystem, or browser boundary. Never publish the credentials, source content, or output files used for those checks.

Inspect the complete diff and staged files before committing. The tracked hooks require gitleaks and scan staged changes before a commit and outgoing history before a push. A clean scan does not replace manual privacy review.

## Pull requests

A pull request should:

- Link the issue it addresses.
- Explain the user-visible outcome and any important design choice.
- State which automated and manual checks ran.
- Call out migrations, configuration changes, compatibility impact, or known follow-up work.
- Avoid unrelated formatting or generated-file churn.
- Keep private evidence out of the description, comments, logs, and attachments.

Draft pull requests are welcome when early feedback would prevent wasted work. Respond to review by updating the existing pull request rather than opening replacements.

The maintainer decides scope, roadmap fit, and merge timing. An accepted contribution may still need changes to preserve product, architecture, compatibility, or privacy rules.

## Security and sensitive reports

Do not open a public issue containing a credential, session, private source identifier, non-public message, or exploitable deployment detail. A dedicated security-reporting policy has not yet been published. If no private contact channel is available, open a public issue asking only for private disclosure instructions and omit every technical or sensitive detail.
