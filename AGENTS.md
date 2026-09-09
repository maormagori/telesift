# TeleSift agent instructions

Read the public documentation before planning or changing the project. Do not duplicate its product or architecture content here.

## Documentation map

Use these sources in order:

- [README.md](README.md) — current status and documentation entrypoint.
- [docs/product.md](docs/product.md) — product contract, scope, and safety rules.
- [docs/architecture.md](docs/architecture.md) — implemented architecture and boundaries.
- [docs/glossary.md](docs/glossary.md) — canonical terminology and states.
- [ROADMAP.md](ROADMAP.md) — committed direction and exploratory ideas.
- [CONTRIBUTING.md](CONTRIBUTING.md) — contributor workflow.
- [docs/testing.md](docs/testing.md) — automated and manual test boundaries.
- [docs/manual-testing.md](docs/manual-testing.md) — credentialed integration checks.

When implementation and documentation disagree, inspect the code and recent issue history, then correct the canonical document in the same change. Do not preserve a stale statement for historical context.

## Public repository safety

Every tracked file, commit, branch, tag, issue, pull request, release, and GitHub attachment is public.

- Never commit or publish Telegram API credentials, sessions, login codes, passwords, tokens, private keys, real private chat/channel/message IDs, non-public usernames, message text, media filenames, private filesystem paths, internal hosts/URLs, or personal deployment configuration.
- Use synthetic placeholders in examples, fixtures, tests, logs, screenshots, and bug reports. Redact incidental private details before creating artifacts.
- If work requires real private data, stop and request a sanitized fixture or a local-only validation method.
- Design for the general self-hosted project, not one operator's hardware, language mix, channel layout, filesystem, network, or media-client setup.
- Represent operator-specific needs as configuration or general domain behavior. Keep actual deployment values outside the repository.

Install gitleaks and enable hooks in every clone:

```sh
git config core.hooksPath .githooks
```

Before every commit, inspect all staged content and run the pre-commit hook. Before every push, inspect outgoing commits and run the pre-push hook. A clean scan does not replace manual privacy review.

## Work tracking

GitHub Issues are the public work record; the private `TeleSift` GitHub Project is the queue. Use `.agents/skills/manage-project-work` to capture, refine, prioritize, pull, transition, slice, or finish work.

- Never publish an issue or material issue-body rewrite without the user's approval of its sanitized preview.
- Do not infer priority; use `P2 Normal` unless the user chooses another value.
- Respect the workflow states defined by the skill.

## Working rules

- Do all agent implementation in a dedicated Git worktree, never the primary checkout.
- Remove an agent worktree after its work is merged or abandoned.
- Before non-trivial design or implementation, research similar problems, maintained libraries, and official platform/protocol guidance. Prefer a suitable maintained library over equivalent custom code.
- For GitHub URLs and repository data, use `gh` rather than web scraping.
- Prefer `rg` for local search.
- Reuse existing code and keep changes targeted.
- Do not add unrelated features, files, or documentation.
- Do not create documentation unless the user asks for it or the code change makes an existing canonical document inaccurate.
- Before adding defensive behavior not already required by the product contract, explain the concrete failure or security motivation and get approval.
- When changing code, inspect related paths and documentation for consistency.
- Current year: 2026.

## Architecture discipline

Follow [docs/architecture.md](docs/architecture.md). In particular:

- Keep domain code free of infrastructure imports.
- Put workflows and transaction boundaries in application use cases.
- Keep process entrypoints as composition roots and loop owners.
- Keep protocol handlers limited to contract translation.
- Define ports in the module that needs the capability.
- Use SQLite for durable cross-process handoffs; do not introduce an in-memory cross-process event bus.
- Keep Telegram transport inside `telegram-service`; other roles use the internal client adapter.
- Do not hold SQLite write transactions across Telegram transfers or LLM calls.

## Verification

Use [docs/testing.md](docs/testing.md) to select relevant tests. Before handoff, inspect the final diff and run the checks proportional to the change. The default full set is:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Report any check that could not run and the exact reason. Never claim success from stale dependencies or a different worktree.
