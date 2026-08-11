#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const PROJECT_TITLE = "TeleSift";
export const STATUSES = [
  { name: "Discovery", color: "GRAY", description: "Needs product or technical decisions" },
  { name: "Backlog", color: "BLUE", description: "Defined but deliberately deferred" },
  { name: "Ready", color: "GREEN", description: "Decision-complete and eligible to start" },
  { name: "In progress", color: "YELLOW", description: "Claimed and being worked" },
  { name: "Review", color: "PURPLE", description: "Awaiting verification or review" },
  { name: "Done", color: "GREEN", description: "Acceptance criteria verified" },
];
export const PRIORITIES = [
  { name: "P0 Urgent", color: "RED", description: "Immediate attention" },
  { name: "P1 High", color: "ORANGE", description: "High priority" },
  { name: "P2 Normal", color: "YELLOW", description: "Default priority" },
  { name: "P3 Low", color: "GRAY", description: "Low priority" },
];

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(SKILL_DIR, "../../..");

function fail(message) {
  throw new Error(message);
}

function run(program, args, { input, allowFailure = false, cwd = REPO_ROOT } = {}) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    input,
    env: process.env,
  });
  if (result.error) fail(`${program} failed: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    fail((result.stderr || result.stdout || `${program} exited ${result.status}`).trim());
  }
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function gh(args, options) {
  return run("gh", args, options);
}

function ghJson(args, options) {
  const output = gh(args, options).stdout;
  return output ? JSON.parse(output) : null;
}

function graphql(query, variables = {}) {
  return ghJson(["api", "graphql", "--input", "-"], {
    input: JSON.stringify({ query, variables }),
  });
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) options[key] = true;
    else {
      options[key] = value;
      index += 1;
    }
  }
  return { command, options };
}

function required(options, name) {
  const value = options[name];
  if (!value || value === true) fail(`Missing --${name}`);
  return value;
}

function issueNumber(options) {
  const value = Number(required(options, "issue"));
  if (!Number.isInteger(value) || value < 1) fail("--issue must be a positive integer");
  return value;
}

function namedOption(field, name) {
  const option = field.options?.find((candidate) => candidate.name === name);
  if (!option) fail(`Project field ${field.name} is missing option ${name}`);
  return option;
}

export function normalizePriority(value = "P2 Normal") {
  const exact = PRIORITIES.find(({ name }) => name === value);
  if (exact) return exact.name;
  const shorthand = String(value).toUpperCase();
  const match = PRIORITIES.find(({ name }) => name.startsWith(`${shorthand} `));
  if (!match) fail(`Invalid priority: ${value}`);
  return match.name;
}

export function normalizeStatus(value) {
  const match = STATUSES.find(({ name }) => name.toLowerCase() === String(value).toLowerCase());
  if (!match) fail(`Invalid status: ${value}`);
  return match.name;
}

export function selectNext(items) {
  const ranks = new Map(PRIORITIES.map(({ name }, index) => [name, index]));
  return items
    .filter((item) => item.status === "Ready")
    .filter((item) => item.state === "OPEN")
    .filter((item) => item.assignees.length === 0)
    .filter((item) => item.blockedBy === 0)
    .sort((left, right) => {
      const priority = (ranks.get(left.priority) ?? PRIORITIES.length) - (ranks.get(right.priority) ?? PRIORITIES.length);
      return priority || left.number - right.number;
    })[0] ?? null;
}

export function operationMarker(operationId) {
  return `<!-- telesift-work-id:${operationId} -->`;
}

export function findIssueByOperationId(issues, operationId) {
  const marker = operationMarker(operationId);
  return issues.find((issue) => issue.body?.includes(marker)) ?? null;
}

export function requiredProjectUpdates(item, { status, priority }) {
  return {
    status: status && item.status !== status ? status : null,
    priority: priority && item.priority !== priority ? priority : null,
  };
}

export function withPullLock(action, lockPath = path.join(REPO_ROOT, ".git", "telesift-project-pull.lock")) {
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST") fail("Another agent is pulling a ticket; retry after it finishes");
    throw error;
  }
  try {
    return action();
  } finally {
    closeSync(descriptor);
    unlinkSync(lockPath);
  }
}

function repoContext() {
  const repo = ghJson(["repo", "view", "--json", "name,nameWithOwner,owner,url"]);
  return { ...repo, ownerLogin: repo.owner.login };
}

function listProjects(owner) {
  return ghJson(["project", "list", "--owner", owner, "--limit", "100", "--format", "json"]).projects;
}

function findProject(owner) {
  return listProjects(owner).find((project) => project.title === PROJECT_TITLE && !project.closed) ?? null;
}

function fieldList(project, owner) {
  return ghJson([
    "project", "field-list", String(project.number), "--owner", owner,
    "--limit", "100", "--format", "json",
  ]).fields;
}

function updateSelectField(field, definitions) {
  const existing = new Map((field.options ?? []).map((option) => [option.name, option.id]));
  const singleSelectOptions = definitions.map((definition) => ({
    ...(existing.has(definition.name) ? { id: existing.get(definition.name) } : {}),
    ...definition,
  }));
  graphql(
    `mutation($input: UpdateProjectV2FieldInput!) {
      updateProjectV2Field(input: $input) {
        projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } }
      }
    }`,
    { input: { fieldId: field.id, name: field.name, singleSelectOptions } },
  );
}

function projectDetails(projectId) {
  return graphql(
    `query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          repositories(first: 100) { nodes { nameWithOwner } }
          views(first: 100) { nodes { id name layout } }
        }
      }
    }`,
    { id: projectId },
  ).data.node;
}

function ensureProjectSetup() {
  const repo = repoContext();
  let project = findProject(repo.ownerLogin);
  if (!project) {
    project = ghJson([
      "project", "create", "--owner", repo.ownerLogin, "--title", PROJECT_TITLE, "--format", "json",
    ]);
  }
  gh(["project", "edit", String(project.number), "--owner", repo.ownerLogin, "--visibility", "PRIVATE"]);

  let details = projectDetails(project.id);
  if (!details.repositories.nodes.some(({ nameWithOwner }) => nameWithOwner === repo.nameWithOwner)) {
    gh(["project", "link", String(project.number), "--owner", repo.ownerLogin, "--repo", repo.name]);
  }

  let fields = fieldList(project, repo.ownerLogin);
  const status = fields.find((field) => field.name === "Status");
  if (!status) fail("GitHub Project has no Status field");
  updateSelectField(status, STATUSES);

  let priority = fields.find((field) => field.name === "Priority");
  if (!priority) {
    gh([
      "project", "field-create", String(project.number), "--owner", repo.ownerLogin,
      "--name", "Priority", "--data-type", "SINGLE_SELECT",
      "--single-select-options", PRIORITIES.map(({ name }) => name).join(","), "--format", "json",
    ]);
    fields = fieldList(project, repo.ownerLogin);
    priority = fields.find((field) => field.name === "Priority");
  }
  updateSelectField(priority, PRIORITIES);

  fields = fieldList(project, repo.ownerLogin);
  details = projectDetails(project.id);
  if (!details.views.nodes.some((view) => view.name === "Board" && view.layout === "BOARD_LAYOUT")) {
    const visibleFieldIds = fields
      .filter((field) => ["Status", "Priority"].includes(field.name))
      .map((field) => field.id);
    graphql(
      `mutation($input: CreateProjectV2ViewInput!) {
        createProjectV2View(input: $input) { projectV2View { id name layout } }
      }`,
      { input: { projectId: project.id, name: "Board", layout: "BOARD_LAYOUT", configuration: { visibleFieldIds } } },
    );
  }
  return projectContext();
}

function projectContext() {
  const repo = repoContext();
  const project = findProject(repo.ownerLogin);
  if (!project) fail(`Project ${PROJECT_TITLE} is missing; run setup`);
  const fields = fieldList(project, repo.ownerLogin);
  const status = fields.find((field) => field.name === "Status");
  const priority = fields.find((field) => field.name === "Priority");
  if (!status || !priority) fail("Project fields are missing; run setup");
  return { repo, project, status, priority };
}

function projectItems(context) {
  const result = ghJson([
    "project", "item-list", String(context.project.number), "--owner", context.repo.ownerLogin,
    "--limit", "1000", "--format", "json",
  ]);
  return result.items;
}

function issueView(context, number) {
  return ghJson([
    "issue", "view", String(number), "--repo", context.repo.nameWithOwner,
    "--json", "number,title,body,state,assignees,url,createdAt,labels",
  ]);
}

function findItem(context, number) {
  return projectItems(context).find((item) => item.content?.number === number && item.content?.repository === context.repo.nameWithOwner) ?? null;
}

function sleepMs(ms) {
  spawnSync("sleep", [(ms / 1000).toString()]);
}

const ITEM_ADD_PROPAGATION_RETRIES = 5;

function ensureItem(context, issue) {
  const existing = findItem(context, issue.number);
  if (existing) return existing;
  ghJson([
    "project", "item-add", String(context.project.number), "--owner", context.repo.ownerLogin,
    "--url", issue.url, "--format", "json",
  ]);
  // `item-add` and the `item-list` read below hit different GitHub endpoints, and the
  // new item isn't always visible to item-list immediately after item-add returns.
  for (let attempt = 1; attempt <= ITEM_ADD_PROPAGATION_RETRIES; attempt++) {
    const created = findItem(context, issue.number);
    if (created) return created;
    if (attempt < ITEM_ADD_PROPAGATION_RETRIES) sleepMs(attempt * 500);
  }
  fail(`Issue #${issue.number} was added but its project item could not be found`);
}

function setSelectValue(context, item, field, optionName) {
  const option = namedOption(field, optionName);
  gh([
    "project", "item-edit", "--id", item.id, "--project-id", context.project.id,
    "--field-id", field.id, "--single-select-option-id", option.id,
  ]);
}

function syncIssue(context, number, { status, priority } = {}) {
  const issue = issueView(context, number);
  const item = ensureItem(context, issue);
  const updates = requiredProjectUpdates(item, {
    status: status ? normalizeStatus(status) : null,
    priority: priority ? normalizePriority(priority) : null,
  });
  if (updates.status) setSelectValue(context, item, context.status, updates.status);
  if (updates.priority) setSelectValue(context, item, context.priority, updates.priority);
  return { issue, item: findItem(context, number) };
}

function scanPublicText(text) {
  run("gitleaks", ["stdin", "--config", path.join(REPO_ROOT, ".gitleaks.toml"), "--redact", "--no-banner"], { input: text });
}

function allIssues(context) {
  return ghJson([
    "issue", "list", "--repo", context.repo.nameWithOwner, "--state", "all", "--limit", "1000",
    "--json", "number,title,body,state,url,createdAt",
  ]);
}

function createOrFindIssue(context, { title, body, operationId }) {
  const marker = operationMarker(operationId);
  const existing = findIssueByOperationId(allIssues(context), operationId);
  if (existing) return { issue: issueView(context, existing.number), created: false };
  const fullBody = `${body.trim()}\n\n${marker}\n`;
  scanPublicText(`${title}\n\n${fullBody}`);
  const url = gh([
    "issue", "create", "--repo", context.repo.nameWithOwner,
    "--title", title, "--body", fullBody,
  ]).stdout;
  const number = Number(url.split("/").pop());
  return { issue: issueView(context, number), created: true };
}

function issueDetails(context, number) {
  return ghJson(["api", `repos/${context.repo.nameWithOwner}/issues/${number}`]);
}

function normalizedItems(context) {
  return projectItems(context)
    .filter((item) => item.content?.type === "Issue")
    .filter((item) => item.content?.repository === context.repo.nameWithOwner)
    .map((item) => {
      const details = issueDetails(context, item.content.number);
      return {
        itemId: item.id,
        number: item.content.number,
        title: item.content.title,
        url: item.content.url,
        state: details.state.toUpperCase(),
        status: item.status,
        priority: item.priority,
        assignees: item.assignees ?? [],
        blockedBy: Number(details.issue_dependencies_summary?.blocked_by ?? 0),
      };
    });
}

function nextIssue(context) {
  return selectNext(normalizedItems(context));
}

function addDependency(context, childNumber, blockerNumber) {
  const blocker = ghJson(["api", `repos/${context.repo.nameWithOwner}/issues/${blockerNumber}`]);
  const current = ghJson(["api", `repos/${context.repo.nameWithOwner}/issues/${childNumber}/dependencies/blocked_by`]);
  if (current.some((issue) => issue.id === blocker.id)) return;
  gh([
    "api", "--method", "POST",
    `repos/${context.repo.nameWithOwner}/issues/${childNumber}/dependencies/blocked_by`,
    "-F", `issue_id=${blocker.id}`,
  ]);
}

function addSubIssue(context, parentNumber, childNumber) {
  const child = ghJson(["api", `repos/${context.repo.nameWithOwner}/issues/${childNumber}`]);
  const current = ghJson(["api", `repos/${context.repo.nameWithOwner}/issues/${parentNumber}/sub_issues`]);
  if (current.some((issue) => issue.id === child.id)) return;
  gh([
    "api", "--method", "POST",
    `repos/${context.repo.nameWithOwner}/issues/${parentNumber}/sub_issues`,
    "-F", `sub_issue_id=${child.id}`,
  ]);
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  process.stdout.write(`manage-project-work commands:
  setup
  inspect
  capture --title TITLE --body-file FILE [--priority P0|P1|P2|P3] [--operation-id UUID]
  sync --issue N [--status STATUS] [--priority PRIORITY]
  move --issue N --status STATUS
  priority --issue N --priority PRIORITY
  next
  pull
  slice --file PLAN.json
  release --issue N
  review --issue N
  done --issue N
`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "help") return help();
  if (command === "setup") {
    const context = ensureProjectSetup();
    return output({ project: context.project, statuses: STATUSES.map(({ name }) => name), priorities: PRIORITIES.map(({ name }) => name) });
  }

  const context = projectContext();
  if (command === "inspect") {
    return output({ repo: context.repo.nameWithOwner, project: context.project, items: normalizedItems(context) });
  }
  if (command === "capture") {
    const title = required(options, "title");
    const body = readFileSync(path.resolve(required(options, "body-file")), "utf8");
    const priority = normalizePriority(options.priority ?? "P2 Normal");
    const operationId = options["operation-id"] || randomUUID();
    const result = createOrFindIssue(context, { title, body, operationId });
    try {
      syncIssue(context, result.issue.number, { status: "Discovery", priority });
    } catch (error) {
      fail(`Issue #${result.issue.number} exists but project sync failed: ${error.message}. Run sync --issue ${result.issue.number} --status Discovery --priority '${priority}'`);
    }
    return output({ ...result, operationId, status: "Discovery", priority });
  }
  if (command === "sync") {
    const number = issueNumber(options);
    const result = syncIssue(context, number, { status: options.status, priority: options.priority });
    return output(result);
  }
  if (command === "move") {
    return output(syncIssue(context, issueNumber(options), { status: required(options, "status") }));
  }
  if (command === "priority") {
    return output(syncIssue(context, issueNumber(options), { priority: required(options, "priority") }));
  }
  if (command === "next") return output({ issue: nextIssue(context) });
  if (command === "pull") {
    return withPullLock(() => {
      const candidate = nextIssue(context);
      if (!candidate) return output({ issue: null });
      gh(["issue", "edit", String(candidate.number), "--repo", context.repo.nameWithOwner, "--add-assignee", "@me"]);
      try {
        syncIssue(context, candidate.number, { status: "In progress" });
      } catch (error) {
        fail(`Issue #${candidate.number} is assigned but its status update failed: ${error.message}. Run sync --issue ${candidate.number} --status 'In progress'`);
      }
      return output({ issue: issueView(context, candidate.number), status: "In progress" });
    });
  }
  if (command === "release") {
    const number = issueNumber(options);
    gh(["issue", "edit", String(number), "--repo", context.repo.nameWithOwner, "--remove-assignee", "@me"]);
    return output(syncIssue(context, number, { status: "Ready" }));
  }
  if (command === "review") return output(syncIssue(context, issueNumber(options), { status: "Review" }));
  if (command === "done") {
    const number = issueNumber(options);
    syncIssue(context, number, { status: "Done" });
    gh(["issue", "close", String(number), "--repo", context.repo.nameWithOwner]);
    return output({ issue: issueView(context, number), status: "Done" });
  }
  if (command === "slice") {
    const plan = JSON.parse(readFileSync(path.resolve(required(options, "file")), "utf8"));
    const parent = Number(plan.parent);
    if (!Number.isInteger(parent) || parent < 1 || !Array.isArray(plan.tickets) || plan.tickets.length === 0) {
      fail("Slice plan requires parent and a non-empty tickets array");
    }
    const parentItem = findItem(context, parent);
    const parentPriority = parentItem?.priority || "P2 Normal";
    const created = new Map();
    for (const [index, ticket] of plan.tickets.entries()) {
      if (!ticket.key || !ticket.title || !ticket.body) fail(`Invalid ticket at index ${index}`);
      const operationId = `slice-${parent}-${ticket.key}`;
      const result = createOrFindIssue(context, { title: ticket.title, body: ticket.body, operationId });
      syncIssue(context, result.issue.number, { status: "Ready", priority: parentPriority });
      addSubIssue(context, parent, result.issue.number);
      created.set(ticket.key, result.issue);
    }
    for (const ticket of plan.tickets) {
      for (const blockerKey of ticket.blockedBy ?? []) {
        const child = created.get(ticket.key);
        const blocker = created.get(blockerKey);
        if (!blocker) fail(`Unknown blocker key ${blockerKey}`);
        addDependency(context, child.number, blocker.number);
      }
    }
    syncIssue(context, parent, { status: "Backlog" });
    return output({ parent, tickets: [...created.entries()].map(([key, issue]) => ({ key, number: issue.number, url: issue.url })) });
  }
  fail(`Unknown command: ${command}`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
