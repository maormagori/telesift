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

Run `setup` when the project or fields are missing. It is safe to repeat.

## Capture discovery

When the user says “save this to discovery” or equivalent:

1. Draft a short public issue with `Summary`, `Why it matters`, `Known context`, and `Open questions`.
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
- Preview material body rewrites. An explicit move or priority instruction authorizes only that field change.
- Use `move` and `priority` for field changes; use `sync` to repair a missing project item or partial update.

## Slice work

Before publishing slices, present numbered tracer-bullet tickets with titles, deliverables, acceptance criteria, and blockers. Each slice must be independently verifiable and small enough for one fresh agent context.

After approval, write a temporary JSON plan and run `slice --file ...`. The helper creates child issues, links native sub-issues and dependencies, inherits the parent priority, sets children to `Ready`, and leaves the tracking parent in `Backlog`. Never create horizontal layer-only tickets unless the work is a mechanical wide change.

Ticket slicing is adapted from Matt Pocock’s MIT-licensed `to-tickets` workflow.

## Select and claim

- “Show the most urgent ticket” runs `next`; it is read-only.
- “Pull the most urgent ticket” runs `pull`; the phrase authorizes assignment to `@me` and transition to `In progress`.
- After pulling, read the issue and comments, inspect the repository, and begin the work in the same turn.
- If no issue qualifies, report an empty Ready queue. Do not substitute Discovery or Backlog work.
- If a pulled ticket is not actually decision-complete, stop and recommend returning it to Discovery; do not change it without approval.

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
