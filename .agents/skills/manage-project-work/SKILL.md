---
name: manage-project-work
description: Manage TeleSift work in GitHub Issues and its private Project. Use when the user says to save or capture an idea, add work to discovery or backlog, refine or prioritize an issue, make a ticket ready, break work into tickets, show or pull the most urgent ticket, release claimed work, send work to review, finish a ticket, inspect the queue, or set up the project workflow.
---

# Manage Project Work

Use GitHub Issues as the public work record and the private `TeleSift` GitHub Project as the queue. Run the deterministic helper instead of recreating `gh` commands:

```sh
node <skill-directory>/scripts/project.mjs <command> [options]
```

Resolve `<skill-directory>` to the directory containing this file. For Claude Code, `${CLAUDE_SKILL_DIR}` is available.

## Fixed workflow

- Status: `Discovery`, `Backlog`, `Ready`, `In progress`, `Review`, `Done`.
- Priority: `P0 Urgent`, `P1 High`, `P2 Normal`, `P3 Low`.
- Default new work to `P2 Normal` unless the user explicitly supplies urgency.
- Pull only open, unassigned, unblocked `Ready` issues. Rank priority first, then oldest issue number.
- Serialize pull operations. Several previously pulled issues may remain `In progress`.
- Do not classify work by agent versus human.

Run `setup` when the project, fields, or labels are missing. It is safe to repeat.

## Issue formats

Every issue uses one of two body formats, matching the issue forms in `.github/ISSUE_TEMPLATE/`. Use `### ` headings in exactly this order, since that's how GitHub renders issue forms.

**Discovery** (status `Discovery`): `Summary`, `Why it matters`, `Known context`, `Open questions`.

**Task** (status `Backlog` or `Ready`):

| Section | Contents |
| --- | --- |
| `Goal` | What the task delivers, in one or two sentences. |
| `Context` | Doc sections to read first, relevant existing code, and related issues and pull requests. |
| `Scope` | What to build, as bullets, including the decisions already made. |
| `Expected paths` | The paths the task is expected to change, and any shared contract it may change: ports, SQLite schema or migrations, app-api or telegram-service routes. |
| `Depends on` | Issues that must merge first, and anything needed from the maintainer. `None` if nothing. Link blocking issues as native GitHub dependencies too, because `next` and `pull` read those. |
| `Done when` | Checkable criteria (`- [ ]`). Always includes "`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass." |
| `Out of scope` | What the task does not cover. |

A sliced child issue starts its body with `Part of #<parent>.` above the sections.

Labels:

- `type:research`: delivers a sourced document in `docs/research/<issue>-<slug>.md`, and no product code.
- `type:spike`: a throwaway experiment that delivers findings in `docs/spikes/<issue>-<slug>.md`. The experiment code is not merged.
- `needs:user`: waiting on the maintainer for a review, input, or decision. `next` and `pull` skip these issues. Remove the label once the maintainer responds.

Task format rules:

1. Every new issue follows the format for its status. Captures use Discovery. Slices and issues moved to `Backlog` or `Ready` use Task.
2. Before working on a pulled issue, check that its body follows the Task format. If it doesn't, rewrite it into the format and publish it with `gh issue edit --body-file` before starting the work. This rewrite doesn't need approval. It records the bounds the agent works within, so it may only restructure: keep every existing requirement and decision, add nothing beyond what the issue, its comments, and the repository already establish, and sanitize it like any public issue. Post a comment noting the body was reformatted. If a section can't be filled without new decisions, the issue isn't decision-complete; follow the rule below about recommending a return to Discovery.

## Capture discovery

When the user says “save this to discovery” or equivalent:

1. Draft a short public issue in the Discovery format.
2. Remove secrets, private paths, internal URLs, real Telegram identifiers/content, and personal configuration.
3. Show the exact title, body, and priority. Do not publish yet.
4. After approval, save the body in a temporary file and run `capture --title ... --body-file ... --priority ...`.
5. Return the issue link and `Discovery` status.

The helper runs gitleaks before publishing. Never bypass a failed scan. A private Project does not make its repository issues private.

## Refine and prioritize

- Read the complete issue and comments before changing it.
- `Discovery` means material questions remain.
- `Backlog` means the work is decision-complete but deliberately deferred.
- `Ready` means scope and acceptance criteria are decision-complete and work may start.
- Moving an issue to `Backlog` or `Ready` requires a body in the Task format. Rewrite it first, with a preview.
- Preview material body rewrites, except the format-only rewrite in Task format rule 2. An explicit move or priority instruction authorizes only that field change.
- Use `move` and `priority` for field changes; use `sync` to repair a missing project item or partial update.

## Slice work

Before publishing slices, present numbered tracer-bullet tickets with titles and full Task-format bodies. Each slice must be independently verifiable and small enough for one fresh agent context.

After approval, write a temporary JSON plan and run `slice --file ...`. The helper creates child issues, links native sub-issues and dependencies, inherits the parent priority, sets children to `Ready`, and leaves the tracking parent in `Backlog`. Never create horizontal layer-only tickets unless the work is a mechanical wide change.

Ticket slicing is adapted from Matt Pocock’s MIT-licensed `to-tickets` workflow.

## Select and claim

- “Show the most urgent ticket” runs `next`; it is read-only.
- “Pull the most urgent ticket” runs `pull`; the phrase authorizes assignment to `@me` and transition to `In progress`.
- After pulling, read the issue and comments, and inspect the repository. Apply Task format rule 2, then begin the work in the same turn.
- If no issue qualifies, report an empty Ready queue. Do not substitute Discovery or Backlog work.
- If a pulled ticket is not actually decision-complete, stop and recommend returning it to Discovery; do not change it without approval.

## While working

- Work in a dedicated worktree on a branch named `<type>/<issue>-<slug>`, where `<type>` is the conventional commit type (for example `feat/50-channel-picker`).
- Post questions, assumptions, and decisions as comments on the issue, not as body rewrites. Add `needs:user` when waiting on the maintainer.
- Before changing a shared contract the issue doesn't name in `Expected paths`, ask in an issue comment, add `needs:user`, and wait. Other paths outside `Expected paths` are allowed when explained in the pull request.
- Open the pull request with `.github/pull_request_template.md`. Agents never merge; the maintainer reviews and merges.
- After the merge, record follow-up findings in GitHub: as a comment on an affected issue, or as a new Discovery capture.

## Finish or release

- `release` removes `@me` and returns the issue to `Ready`.
- `review` moves the issue to `Review` after attaching relevant commit or pull-request context.
- Before `done`, verify every acceptance criterion. `done` closes the issue and moves it to `Done`.
- If an operation partially succeeds, report the issue number and run `sync` rather than creating another issue.

## Clean up after merge

Once a PR merges (or its worktree's work is abandoned), remove the dedicated worktree per AGENTS.md — don't let completed worktrees accumulate. Order matters; later steps assume earlier ones succeeded.

1. Confirm the merge before removing anything: `gh pr view <number> --json state,mergedAt,mergeCommit`. Don't infer merge state from local branch position alone.
2. `git fetch origin --prune` to sync remote-tracking refs and pick up branches GitHub already deleted.
3. Remove the worktree:
   - If this session created it with `EnterWorktree({name})`, `ExitWorktree({action: "remove"})` handles it directly.
   - If it was created manually with `git worktree add`, or entered via `EnterWorktree({path})`, `ExitWorktree` will refuse — it only owns worktrees it created via `name`. Use `ExitWorktree({action: "keep"})` to return to the main checkout, then run `git worktree remove <path>` by hand from there. A worktree can't remove itself while it's the current directory.
4. Delete the local branch with `git branch -d <branch>` (safe delete) first. **This can fail on genuinely-merged work**: git's safe delete checks commit ancestry, not diff content, so if the commits were cherry-picked or rebased onto a different branch before merging (rather than the original branch merging as-is), the SHAs won't match and git won't recognize it as merged even though the code is identical. Verify with `git diff <branch> main` (should be empty) or by checking the PR's merge commit before deciding whether to force-delete with `-D` — never do that automatically; confirm with the user first.
5. Delete the remote branch if it's still there: don't assume GitHub auto-deletes merged branches — behavior is inconsistent even within one repo. Check `git branch -r`; if present, `git push origin --delete <branch>`.
6. Before treating a worktree as clean enough to remove, discard any diff that came only from a fresh dependency install in that worktree (e.g. `package-lock.json` drift from platform-specific optional deps resolving differently) rather than mistaking it for real uncommitted work — `git status`/`git diff` to check, `git checkout -- <file>` to discard install-only noise.

## Helper commands

Run `node <skill-directory>/scripts/project.mjs help` for exact options. The supported commands are `setup`, `inspect`, `capture`, `sync`, `move`, `priority`, `next`, `pull`, `slice`, `release`, `review`, and `done`.
