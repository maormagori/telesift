#!/usr/bin/env node
// Runs this worktree's isolated development stack (docker-compose.yml plus
// docker-compose.dev.yml) under a Compose project named after the worktree.
//
//   node scripts/stack.mjs up [--real|--own-telegram] [compose up args]
//                                                    build, start, wait for health, start watching
//   node scripts/stack.mjs down [compose down args]  stop watching and remove containers (-v: volumes too)
//   node scripts/stack.mjs logs [compose logs args]  follow service logs
//   node scripts/stack.mjs url                       print the Vite UI address
//   node scripts/stack.mjs shared-up [--sonarr] [compose up args]
//                                                    build and start the host-wide shared stack
//   node scripts/stack.mjs shared-down [compose down args]
//                                                    stop the shared stack (-v: volumes too)
//   node scripts/stack.mjs shared-restore [--sonarr] [compose up args]
//                                                    remove a worktree's own telegram-service and
//                                                    start the shared one again
//
// Fake mode (the default) runs the worktree's own telegram-service with the fake adapter.
// `--real` adds docker-compose.real.yml: the worktree runs no telegram-service and uses
// the shared one from docker-compose.shared.yml, which must already be running.
// `--own-telegram` is real mode plus docker-compose.own-telegram.yml: it removes the shared
// telegram-service and runs this worktree's in its place, under the same container name.
// `shared-restore` undoes that from any checkout.
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
// Fixed in docker-compose.shared.yml.
const SHARED_PROJECT = "telesift-shared";
const SHARED_TELEGRAM_CONTAINER = "telesift-telegram-service";

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

function composeArgs({ real = false, ownTelegram = false } = {}) {
  const args = [
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
  if (real || ownTelegram) args.push("-f", path.join(worktreeRoot, "docker-compose.real.yml"));
  if (ownTelegram) args.push("-f", path.join(worktreeRoot, "docker-compose.own-telegram.yml"));
  return args;
}

function sharedComposeArgs() {
  return [
    "compose",
    "--project-directory",
    worktreeRoot,
    "-f",
    path.join(worktreeRoot, "docker-compose.shared.yml"),
    "--profile",
    "sonarr",
  ];
}

function run(args) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(args, options) {
  run([...composeArgs(options), ...args]);
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

function startWatcher(options) {
  const log = openSync(watchLogFile, "w");
  const watcher = spawn("docker", [...composeArgs(options), "watch", "--no-up"], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  writeFileSync(watchPidFile, String(watcher.pid));
  watcher.unref();
}

function sharedTelegramRunning() {
  const result = spawnSync("docker", ["container", "inspect", "--format", "{{.State.Running}}", SHARED_TELEGRAM_CONTAINER], {
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

// The Compose project that owns the container named telesift-telegram-service: the shared
// stack, a worktree running --own-telegram, or undefined when there is none.
function telegramHolder() {
  const result = spawnSync(
    "docker",
    ["container", "inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', SHARED_TELEGRAM_CONTAINER],
    { encoding: "utf8" },
  );
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function up(extraArgs) {
  const ownTelegram = extraArgs.includes("--own-telegram");
  const real = ownTelegram || extraArgs.includes("--real");
  const composeUpArgs = extraArgs.filter((arg) => arg !== "--real" && arg !== "--own-telegram");
  const options = { real, ownTelegram };
  if (ownTelegram) {
    const holder = telegramHolder();
    if (holder !== undefined && holder !== SHARED_PROJECT && holder !== projectName()) {
      console.error(`${SHARED_TELEGRAM_CONTAINER} is already held by the worktree stack ${holder}.`);
      console.error("Run `npm run stack:shared:restore` to remove it and start the shared one again, then retry.");
      process.exit(1);
    }
    // Docker refuses a second container with the fixed name, so the shared one goes first.
    if (holder === SHARED_PROJECT) run([...sharedComposeArgs(), "rm", "--stop", "--force", "telegram-service"]);
  } else if (real && !sharedTelegramRunning()) {
    console.error(`Real mode uses the shared ${SHARED_TELEGRAM_CONTAINER}, which is not running.`);
    console.error("Start it from your primary checkout with `npm run stack:shared:up`, then retry.");
    process.exit(1);
  }
  stopWatcher();
  compose(["up", "--build", "--detach", "--wait", ...composeUpArgs], options);
  startWatcher(options);
  const mode = ownTelegram ? "own-telegram" : real ? "real" : "fake";
  console.log(`Stack ${projectName()} is up in ${mode} mode. Watching src/ for changes (log: ${watchLogFile}).`);
  if (ownTelegram) {
    console.log(`This worktree's telegram-service now runs as ${SHARED_TELEGRAM_CONTAINER} for every real-mode worktree.`);
    console.log("Run `npm run stack:shared:restore` to bring back the shared one.");
  }
  if (real) {
    // Every real-mode worktree's app answers to the "app" alias on the shared network, so
    // the shared test Sonarr addresses this one by its container name.
    console.log(`The shared test Sonarr reaches this app at host ${projectName()}-app-1, port APP_PORT (default 4000).`);
  }
  url();
}

function down(extraArgs) {
  const heldTelegram = telegramHolder() === projectName();
  stopWatcher();
  compose(["down", ...extraArgs]);
  if (heldTelegram) {
    console.log(`Removed this worktree's ${SHARED_TELEGRAM_CONTAINER}; no telegram-service is running now.`);
    console.log("Run `npm run stack:shared:restore` to start the shared one again.");
  }
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

function sharedUp(extraArgs) {
  const sonarr = extraArgs.includes("--sonarr");
  const composeUpArgs = extraArgs.filter((arg) => arg !== "--sonarr");
  // The sonarr profile stays enabled so Compose always creates the shared staging volume
  // that real-mode worktrees mount; without --sonarr, Sonarr itself runs zero replicas.
  const scale = sonarr ? [] : ["--scale", "sonarr=0"];
  run([...sharedComposeArgs(), "up", "--build", "--detach", "--wait", ...scale, ...composeUpArgs]);
  console.log(`Shared stack ${SHARED_PROJECT} is up${sonarr ? " with the test Sonarr at http://127.0.0.1:8989" : ""}.`);
}

function sharedDown(extraArgs) {
  run([...sharedComposeArgs(), "down", ...extraArgs]);
}

function sharedRestore(extraArgs) {
  const holder = telegramHolder();
  if (holder !== undefined && holder !== SHARED_PROJECT) {
    // A graceful stop releases the singleton lock; a forced removal would leave it fresh
    // and the shared telegram-service would refuse to start.
    run(["container", "stop", SHARED_TELEGRAM_CONTAINER]);
    run(["container", "rm", SHARED_TELEGRAM_CONTAINER]);
    console.log(`Removed the ${SHARED_TELEGRAM_CONTAINER} held by the worktree stack ${holder}.`);
    console.log("Re-run `npm run stack:up -- --real` in that worktree if it should keep running.");
  }
  console.log("Starting the shared telegram-service from this checkout, as `npm run stack:shared:up` does.");
  sharedUp(extraArgs);
}

const commands = {
  up,
  down,
  logs,
  url,
  "shared-up": sharedUp,
  "shared-down": sharedDown,
  "shared-restore": sharedRestore,
};
const [command, ...extraArgs] = process.argv.slice(2);

if (!Object.hasOwn(commands, command)) {
  console.error(`Usage: node scripts/stack.mjs <${Object.keys(commands).join("|")}> [args]`);
  process.exit(1);
}

commands[command](extraArgs);
