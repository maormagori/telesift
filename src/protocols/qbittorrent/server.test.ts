import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteDownloadRepository } from "../../adapters/sqlite/download-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../adapters/sqlite/migrate.js";
import { createSqliteReleaseRepository } from "../../adapters/sqlite/release-repository.js";
import type { DB } from "../../adapters/sqlite/schema.js";
import { releaseIdToBtih, releaseIdToMagnetUri } from "../../modules/catalog/domain/release-magnet.js";
import { createDownloadControls } from "../../modules/downloads/application/download-controls.js";
import { createGrabRelease } from "../../modules/downloads/application/grab-release.js";
import type { DownloadRepository } from "../../modules/downloads/ports/download-repository.js";
import { createQbittorrentServer } from "./server.js";

function seedRelease(db: BetterSqlite3.Database, telegramMessageId: number, displayTitle = "Show.S01E01"): number {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100123', 'Chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run();
  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES ('-100123', ?, 1, 'fp', 1, 1) RETURNING id",
    )
    .get(telegramMessageId) as { id: number };
  const mediaAsset = db
    .prepare("INSERT INTO media_assets (message_id, created_at, updated_at) VALUES (?, 1, 1) RETURNING id")
    .get(message.id) as { id: number };
  const group = db
    .prepare(
      "INSERT INTO context_groups (media_asset_id, status, input_fingerprint, created_at, updated_at) VALUES (?, 'closed', 'ctx-fp', 1, 1) RETURNING id",
    )
    .get(mediaAsset.id) as { id: number };
  const run = db
    .prepare(
      "INSERT INTO extraction_runs (context_group_id, input_fingerprint, pipeline_version, prompt_version, model_version, status, is_tv_episode, result_json, created_at) VALUES (?, 'fp', 'p1', 'pr1', 'm1', 'succeeded', 1, '{}', 1) RETURNING id",
    )
    .get(group.id) as { id: number };
  const release = db
    .prepare(
      "INSERT INTO releases (media_asset_id, extraction_run_id, display_title, created_at, updated_at) VALUES (?, ?, ?, 1, 1) RETURNING id",
    )
    .get(mediaAsset.id, run.id, displayTitle) as { id: number };
  return release.id;
}

interface TorrentInfo {
  hash: string;
  name: string;
  state: string;
}

async function fetchTorrentsInfo(baseUrl: string, category?: string): Promise<TorrentInfo[]> {
  const query = category ? `?category=${category}` : "";
  const res = await fetch(`${baseUrl}/torrents/info${query}`);
  return (await res.json()) as TorrentInfo[];
}

async function addTorrent(baseUrl: string, params: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/torrents/add`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

describe("qbittorrent server", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let downloadRepo: DownloadRepository;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-qbittorrent-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);

    const releaseRepo = createSqliteReleaseRepository(kysely);
    downloadRepo = createSqliteDownloadRepository(kysely);
    const grabRelease = createGrabRelease({ releaseRepo, downloadRepo });
    const downloadControls = createDownloadControls({ releaseRepo, downloadRepo });

    const app = createQbittorrentServer({ releaseRepo, downloadRepo, grabRelease, downloadControls, stagingDirectory: "/staging" });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}/api/v2`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("POST /auth/login always succeeds (auth is stubbed for v1)", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Ok.");
  });

  it("GET /app/version and /app/webapiVersion report qBittorrent-compatible values", async () => {
    expect(await (await fetch(`${baseUrl}/app/version`)).text()).toBe("v4.3.3");
    expect(await (await fetch(`${baseUrl}/app/webapiVersion`)).text()).toBe("2.0");
  });

  it("GET /app/preferences reports the staging directory as save_path/temp_path", async () => {
    const body = await (await fetch(`${baseUrl}/app/preferences`)).json();
    expect(body).toEqual({ save_path: "/staging", temp_path: "/staging", dht: false });
  });

  it("POST /torrents/add grabs a release and GET /torrents/info reports it as downloading", async () => {
    const releaseId = seedRelease(db, 1, "Fauda.S04E03.1080p.Telegram");
    const addRes = await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseId) });

    expect(addRes.status).toBe(200);
    expect(await addRes.text()).toBe("Ok.");

    const torrents = await fetchTorrentsInfo(baseUrl);
    expect(torrents).toHaveLength(1);
    expect(torrents[0]).toMatchObject({
      hash: releaseIdToBtih(releaseId),
      name: "Fauda.S04E03.1080p.Telegram",
      state: "downloading",
    });
  });

  it("regression: paused='false' (the string) must not pause the download", async () => {
    const releaseId = seedRelease(db, 1);
    await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseId), paused: "false" });

    const torrents = await fetchTorrentsInfo(baseUrl);
    expect(torrents[0]?.state).toBe("downloading");
  });

  it("paused='true' records a pause request for the download-worker to reconcile", async () => {
    // The protocol layer only ever writes desiredState (AGENTS.md: only the
    // worker changes observedState) — so /torrents/info still reports
    // "downloading" until a download-worker claims and reconciles the
    // request. That reconciliation itself is covered by
    // process-download-claim.test.ts's "pauses immediately when desiredState
    // is paused" case; this test only checks the request was recorded.
    const releaseId = seedRelease(db, 1);
    await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseId), paused: "true" });

    const download = await downloadRepo.findLatestByClientHash(releaseIdToBtih(releaseId));
    expect(download?.desiredState).toBe("paused");
    expect(download?.observedState).toBe("queued");

    const torrents = await fetchTorrentsInfo(baseUrl);
    expect(torrents[0]?.state).toBe("downloading");
  });

  it("POST /torrents/add for an unknown release returns 404", async () => {
    const res = await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(999) });
    expect(res.status).toBe(404);
  });

  it("POST /torrents/add with no urls returns 400", async () => {
    const res = await addTorrent(baseUrl, {});
    expect(res.status).toBe(400);
  });

  it("GET /torrents/properties and /torrents/files resolve by client hash, 404 when unknown", async () => {
    const releaseId = seedRelease(db, 1);
    await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseId) });
    const hash = releaseIdToBtih(releaseId);

    const props = await fetch(`${baseUrl}/torrents/properties?hash=${hash}`);
    expect(props.status).toBe(200);

    const files = await fetch(`${baseUrl}/torrents/files?hash=${hash}`);
    expect(files.status).toBe(200);
    expect(await files.json()).toHaveLength(1);

    expect((await fetch(`${baseUrl}/torrents/properties?hash=does-not-exist`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/torrents/files?hash=does-not-exist`)).status).toBe(404);
  });

  it("POST /torrents/delete records a cancel request for the download-worker to reconcile", async () => {
    // Same asynchronous handoff as the pause case above: /torrents/info won't
    // drop the entry until a download-worker reconciles desiredState into
    // observedState="canceled".
    const releaseId = seedRelease(db, 1);
    await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseId) });
    const hash = releaseIdToBtih(releaseId);

    const deleteRes = await fetch(`${baseUrl}/torrents/delete`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ hashes: hash }),
    });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.text()).toBe("Ok.");

    const download = await downloadRepo.findLatestByClientHash(hash);
    expect(download?.desiredState).toBe("canceled");
  });

  it("GET /torrents/info?category= filters by category", async () => {
    const releaseA = seedRelease(db, 1, "A");
    const releaseB = seedRelease(db, 2, "B");
    await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseA), category: "tv" });
    await addTorrent(baseUrl, { urls: releaseIdToMagnetUri(releaseB), category: "movies" });

    const tv = await fetchTorrentsInfo(baseUrl, "tv");
    expect(tv).toHaveLength(1);
    expect(tv[0]?.name).toBe("A");
  });
});
