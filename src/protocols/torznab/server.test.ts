import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../adapters/sqlite/migrate.js";
import { createSqliteReleaseSearchRepository } from "../../adapters/sqlite/release-search-repository.js";
import { createSqliteSeriesAliasRepository } from "../../adapters/sqlite/series-alias-repository.js";
import type { DB } from "../../adapters/sqlite/schema.js";
import { releaseIdToMagnetUri } from "../../modules/catalog/domain/release-magnet.js";
import { normalizeAliasText } from "../../modules/catalog/domain/series-matching.js";
import { createSearchReleasesUseCase } from "../../modules/search/application/search-releases.js";
import { createTorznabServer } from "./server.js";
import { escapeXml } from "./xml.js";

interface SeedOptions {
  telegramMessageId: number;
  seriesId: number;
  alias: string;
  season?: number | null;
  episode?: number | null;
  reviewState?: "pending_review" | "approved" | "rejected";
  displayTitle?: string;
}

function seedSeriesAndRelease(db: BetterSqlite3.Database, options: SeedOptions): number {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100123', 'Chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run();
  db.prepare("INSERT INTO series (id, canonical_title, created_at, updated_at) VALUES (?, ?, 1, 1) ON CONFLICT DO NOTHING").run(
    options.seriesId,
    options.alias,
  );
  db.prepare(
    "INSERT INTO series_aliases (series_id, alias_normalized, alias_original, source, created_at) VALUES (?, ?, ?, 'manual', 1) ON CONFLICT DO NOTHING",
  ).run(options.seriesId, normalizeAliasText(options.alias), options.alias);

  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES ('-100123', ?, 1, 'fp', 1, 1) RETURNING id",
    )
    .get(options.telegramMessageId) as { id: number };
  const mediaAsset = db
    .prepare("INSERT INTO media_assets (message_id, size_bytes, availability, created_at, updated_at) VALUES (?, 987654, 'available', 1, 1) RETURNING id")
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
      "INSERT INTO releases (media_asset_id, series_id, extraction_run_id, season, episode, display_title, review_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1) RETURNING id",
    )
    .get(
      mediaAsset.id,
      options.seriesId,
      run.id,
      options.season ?? 4,
      options.episode ?? 3,
      options.displayTitle ?? `${options.alias}.S04E03.1080p.Telegram`,
      options.reviewState ?? "approved",
    ) as { id: number };
  return release.id;
}

describe("torznab server", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let server: Server;
  let baseUrl: string;

  async function start(apiKey: string | null): Promise<void> {
    const seriesAliasRepo = createSqliteSeriesAliasRepository(kysely);
    const releaseSearchRepo = createSqliteReleaseSearchRepository(kysely);
    const searchReleases = createSearchReleasesUseCase({ seriesAliasRepo, releaseSearchRepo, seriesMatchThreshold: 0.85 });

    const app = createTorznabServer({ searchReleases, apiKey });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected an AddressInfo");
    // createTorznabServer mounts "/api" on its own Express app (see server.ts) — the
    // "/torznab" prefix is only added when main.ts mounts this whole app under it.
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-torznab-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("t=caps advertises tv-search without requiring an api key when none is configured", async () => {
    await start(null);
    const res = await fetch(`${baseUrl}/api?t=caps`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("tv-search");
  });

  it("t=tvsearch returns approved releases matching the query, with a working magnet link", async () => {
    await start(null);
    const releaseId = seedSeriesAndRelease(db, { telegramMessageId: 1, seriesId: 1, alias: "Fauda" });

    const res = await fetch(`${baseUrl}/api?t=tvsearch&q=Fauda&season=4&ep=3`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain(`telesift:release:${releaseId}`);
    expect(body).toContain(escapeXml(releaseIdToMagnetUri(releaseId)));
    expect(body).toContain('<newznab:attr name="size" value="987654" />');
  });

  it("excludes pending_review releases from search results", async () => {
    await start(null);
    seedSeriesAndRelease(db, { telegramMessageId: 1, seriesId: 1, alias: "Fauda", reviewState: "pending_review" });

    const res = await fetch(`${baseUrl}/api?t=tvsearch&q=Fauda`);
    const body = await res.text();

    expect(body).toContain('total="0"');
  });

  it("returns zero results for a query matching no local series", async () => {
    await start(null);
    seedSeriesAndRelease(db, { telegramMessageId: 1, seriesId: 1, alias: "Fauda" });

    const res = await fetch(`${baseUrl}/api?t=tvsearch&q=Some+Unknown+Show`);
    const body = await res.text();

    expect(body).toContain('total="0"');
  });

  it("filters by season and episode", async () => {
    await start(null);
    const match = seedSeriesAndRelease(db, { telegramMessageId: 1, seriesId: 1, alias: "Fauda", season: 4, episode: 3 });
    seedSeriesAndRelease(db, { telegramMessageId: 2, seriesId: 1, alias: "Fauda", season: 4, episode: 4 });

    const res = await fetch(`${baseUrl}/api?t=tvsearch&q=Fauda&season=4&ep=3`);
    const body = await res.text();

    expect(body).toContain(`telesift:release:${match}`);
    expect(body).toContain('total="1"');
  });

  it("supports paging via offset/limit", async () => {
    await start(null);
    seedSeriesAndRelease(db, { telegramMessageId: 1, seriesId: 1, alias: "Fauda" });
    seedSeriesAndRelease(db, { telegramMessageId: 2, seriesId: 1, alias: "Fauda", episode: 4 });

    const res = await fetch(`${baseUrl}/api?t=tvsearch&q=Fauda&offset=1&limit=1`);
    const body = await res.text();

    expect(body).toContain('<newznab:response offset="1" total="2" />');
  });

  it("XML-escapes a title containing reserved characters", async () => {
    await start(null);
    seedSeriesAndRelease(db, { telegramMessageId: 1, seriesId: 1, alias: "Show & Tell", displayTitle: "Show.&.Tell.S01E01" });

    const res = await fetch(`${baseUrl}/api?t=tvsearch&q=${encodeURIComponent("Show & Tell")}`);
    const body = await res.text();

    expect(body).toContain("Show.&amp;.Tell.S01E01");
  });

  it("enforces the api key when configured", async () => {
    await start("secret-key");

    const missing = await fetch(`${baseUrl}/api?t=caps`);
    expect(missing.status).toBe(401);
    expect(await missing.text()).toContain('code="100"');

    const wrong = await fetch(`${baseUrl}/api?t=caps&apikey=wrong`);
    expect(wrong.status).toBe(401);

    const correct = await fetch(`${baseUrl}/api?t=caps&apikey=secret-key`);
    expect(correct.status).toBe(200);
  });

  it("returns 400 for an unsupported t parameter", async () => {
    await start(null);
    const res = await fetch(`${baseUrl}/api?t=bogus`);
    expect(res.status).toBe(400);
  });
});
