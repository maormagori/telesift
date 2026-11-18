#!/usr/bin/env node
// Runs this worktree's isolated development stack (docker-compose.yml plus
// docker-compose.dev.yml) under a Compose project named after the worktree.
//
//   node scripts/stack.mjs up [compose up args]      build, start, wait for health, start watching
//   node scripts/stack.mjs down [compose down args]  stop watching and remove containers (-v: volumes too)
//   node scripts/stack.mjs logs [compose logs args]  follow service logs
//   node scripts/stack.mjs url                       print the Vite UI address
//
// `up` returns once the stack is healthy. File watching keeps running in a detached
// `docker compose watch --no-up` process whose PID and output live in this worktree's
// git directory; `down` stops it.

import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const UI_SERVICE = "app-web";
const UI_CONTAINER_PORT = 5173;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const worktreeRoot = git("rev-parse", "--show-toplevel");

// Compose project names allow lowercase letters, digits, "-" and "_", starting with a
// letter or digit. The path hash keeps two worktrees with the same directory name apart.
function projectName() {
  const base = path
    .basename(worktreeRoot)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  const hash = createHash("sha256").update(worktreeRoot).digest("hex").slice(0, 6);
  return `telesift-${base}-${hash}`;
}

function composeArgs() {
  return [
    "compose",
    "--project-name",
    projectName(),
    "--project-directory",
    worktreeRoot,
    "-f",
    path.join(worktreeRoot, "docker-compose.yml"),
    "-f",
    path.join(worktreeRoot, "docker-compose.dev.yml"),
  ];
}

function compose(args) {
  const result = spawnSync("docker", [...composeArgs(), ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Per-worktree paths inside the git directory, so they are never tracked or shared.
const watchPidFile = path.resolve(worktreeRoot, git("rev-parse", "--git-path", "telesift-stack-watch.pid"));
const watchLogFile = path.resolve(worktreeRoot, git("rev-parse", "--git-path", "telesift-stack-watch.log"));

function stopWatcher() {
  if (!existsSync(watchPidFile)) return;
  const pid = Number(readFileSync(watchPidFile, "utf8"));
  try {
    process.kill(pid);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  rmSync(watchPidFile);
}

function startWatcher() {
  const log = openSync(watchLogFile, "w");
  const watcher = spawn("docker", [...composeArgs(), "watch", "--no-up"], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  writeFileSync(watchPidFile, String(watcher.pid));
  watcher.unref();
}

function up(extraArgs) {
  stopWatcher();
  compose(["up", "--build", "--detach", "--wait", ...extraArgs]);
  startWatcher();
  console.log(`Stack ${projectName()} is up. Watching src/ for changes (log: ${watchLogFile}).`);
  url();
}

function down(extraArgs) {
  stopWatcher();
  compose(["down", ...extraArgs]);
}

function logs(extraArgs) {
  compose(["logs", "--follow", ...extraArgs]);
}

function url() {
  const mapping = execFileSync("docker", [...composeArgs(), "port", UI_SERVICE, String(UI_CONTAINER_PORT)], {
    encoding: "utf8",
  }).trim();
  // docker-compose.dev.yml binds app-web to loopback, so the mapping is "127.0.0.1:<port>".
  console.log(`http://${mapping}`);
}

const commands = { up, down, logs, url };
const [command, ...extraArgs] = process.argv.slice(2);

if (!Object.hasOwn(commands, command)) {
  console.error(`Usage: node scripts/stack.mjs <${Object.keys(commands).join("|")}> [args]`);
  process.exit(1);
}

commands[command](extraArgs);
