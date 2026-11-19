# Development

This guide covers running TeleSift for development: one Docker Compose stack per checkout, a shared host-wide stack that holds the only real Telegram connection, and the commands that start, inspect, and remove them. It is the standard way to run end-to-end checks and previews. Unit tests and the other [required checks](testing.md#required-checks) run natively without Docker.

Every checkout, including each Git worktree, runs its own Compose project with its own database, volumes, network, and host ports, so several checkouts can run at once. A checkout runs in one of two modes:

- **Fake mode** (the default) runs the checkout's own `telegram-service` with the fake Telegram adapter. It needs no credentials and no configuration.
- **Real mode** runs no `telegram-service` in the checkout. The checkout uses the shared `telegram-service`, which holds the real Telegram connection. No container in the checkout receives Telegram credentials.

A checkout that changes `telegram-service` itself can run its own version in place of the shared one with `--own-telegram`.

## Prerequisites

- Node.js 22.5 or newer, and npm.
- Docker Engine 25 or newer with Docker Compose v2.24.4 or newer. Current Docker Desktop releases include both. The stack is built for a single local Docker host.
- A clone of the repository with its locked dependencies installed:

  ```sh
  npm ci
  ```

The stack scripts run on the host with Node.js. They need no dependencies of their own, but `npm run generate-telegram-session` does.

## Fake mode

Start the checkout's stack:

```sh
npm run stack:up
```

It builds the development image, starts every service, and returns once they are healthy. It then keeps watching `src/` in the background: an edit there reloads the affected services, and a change to `package.json` or `package-lock.json` rebuilds them. No `.env` is needed.

Print the address of the operator UI and open it:

```sh
npm run stack:url
```

Log in with the development login, username `admin` and password `telesift-dev`. Channels lists synthetic chats from the fake adapter. The extraction worker uses the fake LLM unless `LLM_*` is set in an optional `.env` in the checkout.

Follow the services' logs with `npm run stack:logs`. Extra arguments go to `docker compose logs`, for example `npm run stack:logs -- app`.

Things to know:

- The development login is committed to the repository and public. It exists only for local development stacks. Never reuse it in a deployment. Host ports bind to `127.0.0.1` for that reason.
- Docker assigns the host ports. A rebuild after a dependency change gives the UI a new port. `npm run stack:url` always prints the current one.
- `migrate` isn't watched. After adding a migration, run `npm run stack:up` again.
- The background watcher's log is in the checkout's Git directory. `stack:up` prints its path.

## Real mode with the shared stack

Real mode connects to Telegram through the shared stack, a host-wide Compose project named `telesift-shared`. Its `telegram-service` runs in a container named `telesift-telegram-service`. Docker refuses a second container with that name, so one host can run only one shared `telegram-service`.

Only one real `telegram-service` may connect per Telegram session. A second connection on the same session can invalidate it permanently. Never run another `telegram-service` on the same session alongside the shared stack, for example the reference `docker-compose.yml` deployment or `npm run dev:telegram-service`.

### First-time operator configuration

Operator configuration lives outside every checkout, in `$TELESIFT_CONFIG_DIR`. When that's unset, it defaults to `${XDG_CONFIG_HOME:-~/.config}/telesift`. It holds:

- `.env.telegram` (required): the Telegram credentials, in the format of [`.env.telegram.example`](../.env.telegram.example).
- `.env` (optional): non-secret settings for `telegram-service`. Its `TELEGRAM_ADAPTER` selects the adapter for the shared and owned `telegram-service`. It defaults to `teleproto`, the real one.

Only `telegram-service` receives these files. To create them:

1. Create an application at [my.telegram.org/apps](https://my.telegram.org/apps) to get an `api_id` and `api_hash`.
2. Generate a session string:

   ```sh
   npm run generate-telegram-session
   ```

   It prompts for the `api_id`, the `api_hash`, and the account's phone number, then for Telegram's login code and, when two-step verification is on, the password. It prints the session string, which grants full access to the account.
3. Create the configuration directory and the credentials file:

   ```sh
   mkdir -p ~/.config/telesift
   cp .env.telegram.example ~/.config/telesift/.env.telegram
   chmod 600 ~/.config/telesift/.env.telegram
   ```

   Set `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and `TELEGRAM_SESSION` in that file.

To keep the configuration somewhere else, create the files there and export `TELESIFT_CONFIG_DIR` in your shell profile. Every command that starts a `telegram-service` with the operator configuration (`stack:shared:up`, `stack:shared:restore`, and `stack:up -- --own-telegram`) reads it, and one run without it falls back to the default directory.

Keep Telegram credentials out of every checkout's `.env` when using the stack. In fake and real mode, a checkout's `.env` reaches that checkout's containers, so credentials there would reach them all. The credentials belong only in the operator configuration directory's `.env.telegram`.

### Start the shared stack and a real-mode checkout

From your primary checkout, start the shared stack:

```sh
npm run stack:shared:up
```

Run `stack:shared:up`, and later `stack:shared:restore`, only from the primary checkout. They build `telegram-service` from the checkout that runs them, and running either from another checkout replaces the shared service with that checkout's code.

Then, in the checkout you're working in:

```sh
npm run stack:up -- --real
npm run stack:url
```

Log in with the development login. The checkout has its own empty database, so add channels from the Channels screen. Every real-mode checkout shares the one Telegram connection but keeps its own data.

To switch a checkout between modes, run `npm run stack:down` first, then `stack:up` in the other mode. Without it, switching from fake to real mode leaves the checkout's fake `telegram-service` container running, unused.

## Changing telegram-service with --own-telegram

Real mode runs the shared `telegram-service`, built from the primary checkout. To run a branch's changes to `telegram-service` against the real account, run that checkout's version in place of the shared one:

```sh
npm run stack:up -- --own-telegram
```

It removes the shared `telegram-service` and starts this checkout's, with file watching, under the same container name, on the same network, and with the same lock volume. This checkout and every real-mode checkout then use it. It receives the operator configuration exactly as the shared one does. If another checkout already holds the container, the command fails and names that checkout's project.

To put the shared `telegram-service` back, run this from the primary checkout:

```sh
npm run stack:shared:restore
```

Things to know:

- After `stack:shared:restore`, the former holder checkout's file watcher is still running. In that checkout, run `npm run stack:up -- --real` to keep working in real mode, or `npm run stack:down`.
- A plain fake `npm run stack:up` from the holding checkout replaces its real `telegram-service` with a fake one, and no real service runs anymore. Run `stack:shared:restore` first.
- `npm run stack:down` in the holding checkout removes its `telegram-service` and leaves none running. Run `stack:shared:restore` afterwards.
- If `stack:up -- --own-telegram` fails after removing the shared service, nothing runs until `stack:shared:restore`.

## Sonarr testing with the shared profile

The shared stack includes a throwaway test Sonarr. Start it with the shared stack:

```sh
npm run stack:shared:up -- --sonarr
```

Its UI is at `http://127.0.0.1:8989`. In the checkout under test, run `npm run stack:up -- --real`. That command prints the host the test Sonarr uses to reach the checkout's app, `<project>-app-1` on port `4000`, on the shared network. Sonarr mounts the shared staging volume at the same path the checkout's app reports, `/staging/<project>`, so it needs no Remote Path Mapping. [Manual testing](manual-testing.md#sonarr-torznab--qbittorrent-compatible) covers configuring Sonarr and the checks to run.

## Cleanup

Stop a checkout's stack when its work is finished or abandoned:

```sh
npm run stack:down        # remove the containers and network, keep the database
npm run stack:down -- -v  # also remove the checkout's volumes and data
```

Stop the shared stack after every real-mode checkout is down. Docker can't remove the shared network while a checkout is still attached to it.

```sh
npm run stack:shared:down        # keep the lock, staging, and Sonarr volumes
npm run stack:shared:down -- -v  # remove them too
```

The shared staging volume holds every real-mode checkout's downloads, so `stack:down -- -v` in a checkout doesn't remove them. `stack:shared:down -- -v` does. The operator configuration directory is never removed by these commands.

## Calling the commands from worktree tools

Any worktree tool with setup and teardown hooks can give each worktree its own stack. Orca is one example. Run the commands from the worktree's root:

```sh
# setup
npm ci && npm run stack:up

# teardown
npm run stack:down -- -v
```

Use `npm ci` in setup, not `npm install`, so the lockfile stays unchanged. The Compose project name comes from the worktree's path, so the hooks need no per-worktree configuration. Setup starts fake mode. Switching a worktree to real mode is a deliberate step, not part of setup.

## Agents and automated checks

Coding agents and scripts often run each command in a fresh shell, and they usually have no access to the real account. These rules keep their checks away from the operator's Telegram session and the host's other stacks.

### Set the configuration directory on every command

An `export` doesn't carry over to the next command when each command runs in a new shell. A command that reads the operator configuration without `TELESIFT_CONFIG_DIR` falls back to the default directory, which on an operator's machine holds the real credentials. Set it on the same command line every time:

```sh
TELESIFT_CONFIG_DIR=/path/to/throwaway-config npm run stack:shared:up
```

This applies to `stack:shared:up`, `stack:shared:restore`, `stack:up -- --own-telegram`, and any `docker compose -f docker-compose.shared.yml` command.

### Check the shared stack and the switch without the real account

Use a throwaway configuration directory that selects the fake adapter and holds synthetic credentials:

```sh
mkdir -p /path/to/throwaway-config
printf 'TELEGRAM_ADAPTER=fake\n' > /path/to/throwaway-config/.env
printf 'TELEGRAM_API_ID=12345\nTELEGRAM_API_HASH=placeholder-hash\nTELEGRAM_SESSION=placeholder-session\n' \
  > /path/to/throwaway-config/.env.telegram
```

Before starting anything with it:

1. Confirm the resolved paths point into that directory:

   ```sh
   TELESIFT_CONFIG_DIR=/path/to/throwaway-config docker compose -f docker-compose.shared.yml config telegram-service
   ```

2. Run `docker ps -a --filter name=telesift-telegram-service`. If that container already exists, it may be the operator's real connection. Stop and ask instead of replacing it.

Delete the throwaway directory when the check is done. Leave checks against the real account to the operator.

### Touch only what you created

- Run `docker ps -a`, `docker volume ls`, and `docker network ls` before starting, and keep the output.
- Stop and remove only the containers, volumes, networks, and images your checks created. Never stop, remove, or prune other stacks, even stopped ones.
- When the checks are done, tear down with `npm run stack:down -- -v` and, if you started it, `npm run stack:shared:down -- -v`. Compare the listings with the ones you kept to confirm nothing of yours remains.

## Native processes without Docker

Each process can also run natively with `tsx watch`, for example `npm run dev:app` or `npm run dev:telegram-service`. Run `npm run dev:migrate` first. Native processes read one `.env` in the checkout, based on [`.env.example`](../.env.example), and each process loads all of it. Telegram credentials there reach every process, as `.env.example` describes.

Use native processes only to work on a single process against the fake adapters. For end-to-end checks and anything that uses real Telegram, use the stack: a native `telegram-service` has its own lock file in the checkout and can't see the shared stack's, so it would open a second connection on the same session.
