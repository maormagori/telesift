import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteChannelRepository } from "../../adapters/sqlite/channel-repository.js";
import { createSqliteChatSyncStateRepository } from "../../adapters/sqlite/chat-sync-state-repository.js";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteDownloadRepository } from "../../adapters/sqlite/download-repository.js";
import { createSqliteMediaAssetRepository } from "../../adapters/sqlite/media-asset-repository.js";
import { createSqliteMessageRepository } from "../../adapters/sqlite/message-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../adapters/sqlite/migrate.js";
import { createSqliteReleaseRepository } from "../../adapters/sqlite/release-repository.js";
import { createSqliteReleaseRevisionRepository } from "../../adapters/sqlite/release-revision-repository.js";
import { createSqliteReleaseSearchRepository } from "../../adapters/sqlite/release-search-repository.js";
import { createSqliteSeriesAliasRepository } from "../../adapters/sqlite/series-alias-repository.js";
import type { DB } from "../../adapters/sqlite/schema.js";
import { createSqliteSeriesRepository } from "../../adapters/sqlite/series-repository.js";
import { createSqliteTelegramChatRepository } from "../../adapters/sqlite/telegram-chat-repository.js";
import { createFakeTelegramAccessAdapter } from "../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import type { FakeChatFixture } from "../../adapters/telegram-fake/fixtures.js";
import { createAppAuthUseCases } from "../../modules/app-auth/application/use-cases.js";
import { createDownloadControls } from "../../modules/downloads/application/download-controls.js";
import { createDownloadQueueUseCases } from "../../modules/downloads/application/download-queue.js";
import { createChannelResolver } from "../../modules/ingestion/application/channel-resolution.js";
import { createMessageInspectionUseCases } from "../../modules/ingestion/application/message-inspection.js";
import { createChannelStatusUseCases, createIngestionUseCases } from "../../modules/ingestion/application/use-cases.js";
import { createReviewQueueUseCases } from "../../modules/review/application/review-queue.js";
import { createReviewUseCases } from "../../modules/review/application/review-use-cases.js";
import { createSearchReleasesUseCase } from "../../modules/search/application/search-releases.js";
import { createTelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import { createAppApiServer } from "./server.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function makeFixture(chatId: string, username: string | null = null): FakeChatFixture {
  return {
    chat: { id: chatId, title: `Chat ${chatId}`, type: "channel", username },
    messages: [
      { chatId, messageId: 1, date: 1_700_000_000, text: "first message", replyToMessageId: null, mediaGroupId: null, media: null },
    ],
    media: {},
  };
}

const ADMIN_PASSWORD = "correct horse battery staple";

function seedReleaseSource(db: BetterSqlite3.Database, telegramMessageId: number): { mediaAssetId: number; extractionRunId: number } {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100999', 'Seed chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run();
  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, text, source_date, fingerprint, created_at, updated_at) VALUES ('-100999', ?, 'Fauda S04E03', 1, 'fp', 1, 1) RETURNING id",
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
  return { mediaAssetId: mediaAsset.id, extractionRunId: run.id };
}

describe("app-api server", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let server: Server | null;
  let baseUrl: string;
  let releaseRepo: ReturnType<typeof createSqliteReleaseRepository>;
  let seriesRepo: ReturnType<typeof createSqliteSeriesRepository>;
  let downloadRepo: ReturnType<typeof createSqliteDownloadRepository>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-app-api-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    server = null;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  async function startServer(fixtures: FakeChatFixture[] = [makeFixture("1001")]): Promise<void> {
    const channelRepo = createSqliteChannelRepository(kysely);
    const chatSyncStateRepo = createSqliteChatSyncStateRepository(kysely);
    const telegramChatRepo = createSqliteTelegramChatRepository(kysely);
    const messageRepo = createSqliteMessageRepository(kysely);
    const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
    releaseRepo = createSqliteReleaseRepository(kysely);
    const releaseRevisionRepo = createSqliteReleaseRevisionRepository(kysely);
    seriesRepo = createSqliteSeriesRepository(kysely);
    downloadRepo = createSqliteDownloadRepository(kysely);
    const telegramAccess = createTelegramAccessUseCases(createFakeTelegramAccessAdapter(fixtures));
    const resolver = createChannelResolver({ telegramAccess: createFakeTelegramAccessAdapter(fixtures), telegramChatRepo });

    const app = createAppApiServer(
      {
        appAuth: createAppAuthUseCases({ username: "operator", passwordHash: hashPassword(ADMIN_PASSWORD) }),
        telegramAccess,
        ingestion: createIngestionUseCases(channelRepo),
        channelStatus: createChannelStatusUseCases({ channelRepo, chatSyncStateRepo, resolver }),
        messageInspection: createMessageInspectionUseCases({ messageRepo, mediaAssetRepo }),
        seriesRepo,
        reviewQueue: createReviewQueueUseCases({ releaseRepo, releaseRevisionRepo, mediaAssetRepo, messageRepo, seriesRepo }),
        review: createReviewUseCases({ releaseRepo, releaseRevisionRepo, seriesRepo }),
        downloadQueue: createDownloadQueueUseCases({ downloadRepo, releaseRepo }),
        downloadControls: createDownloadControls({ releaseRepo, downloadRepo }),
        search: createSearchReleasesUseCase({
          seriesAliasRepo: createSqliteSeriesAliasRepository(kysely),
          releaseSearchRepo: createSqliteReleaseSearchRepository(kysely),
          seriesMatchThreshold: 0.85,
        }),
      },
      { secret: "test-secret", cookieSecure: false },
    );
    const listening = app.listen(0);
    server = listening;
    await new Promise<void>((resolve) => listening.once("listening", resolve));
    const address = listening.address();
    if (!address || typeof address === "string") throw new Error("expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function login(): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "operator", password: ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("expected a set-cookie header");
    return setCookie.split(";")[0]!;
  }

  it("rejects protected routes without a session", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/channels`);
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong password", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "operator", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("logs in, reaches protected routes, then logs out and loses access", async () => {
    await startServer();
    const cookie = await login();

    const sessionRes = await fetch(`${baseUrl}/auth/session`, { headers: { Cookie: cookie } });
    expect(sessionRes.status).toBe(200);
    expect(await sessionRes.json()).toEqual({ username: "operator" });

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
    expect(logoutRes.status).toBe(204);

    const afterLogout = await fetch(`${baseUrl}/channels`, { headers: { Cookie: cookie } });
    expect(afterLogout.status).toBe(401);
  });

  it("GET /telegram/status proxies telegram-service's connection status", async () => {
    await startServer();
    const cookie = await login();

    const res = await fetch(`${baseUrl}/telegram/status`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connected: true });
  });

  it("adds a channel and resolves it synchronously when visible to the account", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resolution: unknown };
    expect(body.resolution).toMatchObject({ status: "resolved", chat: { telegramId: "1001" } });
  });

  it("adds a channel that isn't visible yet without failing the request", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "9999" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resolution: unknown };
    expect(body.resolution).toEqual({ status: "unresolved" });
  });

  it("lists channels with resolved status", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();
    await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });

    const res = await fetch(`${baseUrl}/channels`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ chat: unknown }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.chat).toMatchObject({ telegramId: "1001" });
  });

  it("enables and disables a channel", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();
    await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });

    const disableRes = await fetch(`${baseUrl}/channels/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: { type: "telegram_id", value: "1001" } }),
    });
    expect(disableRes.status).toBe(200);
    const disabled = (await disableRes.json()) as { enabled: boolean };
    expect(disabled.enabled).toBe(false);

    const enableRes = await fetch(`${baseUrl}/channels/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: { type: "telegram_id", value: "1001" } }),
    });
    expect(enableRes.status).toBe(200);
    const enabled = (await enableRes.json()) as { enabled: boolean };
    expect(enabled.enabled).toBe(true);
  });

  it("returns 404 when enabling an unknown channel", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/channels/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: { type: "telegram_id", value: "does-not-exist" } }),
    });
    expect(res.status).toBe(404);
  });

  it("lists raw messages for a resolved chat", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();
    await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });
    await createSqliteMessageRepository(kysely).upsertMessage({
      chatId: "1001",
      telegramMessageId: 1,
      text: "hello",
      replyToMessageId: null,
      mediaGroupId: null,
      sourceDate: 1000,
      sourceEditedAt: null,
      media: null,
      now: 1000,
    });

    const res = await fetch(`${baseUrl}/chats/1001/messages`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([{ message: expect.objectContaining({ telegramMessageId: 1 }), media: null }]);
  });

  it("lists pending-review releases, fetches detail, then approves one", async () => {
    await startServer([]);
    const cookie = await login();
    const { mediaAssetId, extractionRunId } = seedReleaseSource(db, 1);
    const created = await releaseRepo.create({
      mediaAssetId,
      fields: {
        seriesId: null,
        extractionRunId,
        season: 4,
        episode: 3,
        resolution: "1080p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Fauda.S04E03.1080p.Telegram",
        reviewState: "pending_review",
        manuallyVerified: false,
        manuallyVerifiedAt: null,
      },
      now: 1000,
    });

    const listRes = await fetch(`${baseUrl}/releases`, { headers: { Cookie: cookie } });
    expect(listRes.status).toBe(200);
    expect(((await listRes.json()) as Array<{ id: number }>).map((r) => r.id)).toEqual([created.id]);

    const detailRes = await fetch(`${baseUrl}/releases/${created.id}`, { headers: { Cookie: cookie } });
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { release: { id: number }; source: { message: { text: string } } };
    expect(detail.release.id).toBe(created.id);
    expect(detail.source.message.text).toBe("Fauda S04E03");

    const approveRes = await fetch(`${baseUrl}/releases/${created.id}/approve`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(approveRes.status).toBe(200);
    const approved = (await approveRes.json()) as { reviewState: string };
    expect(approved.reviewState).toBe("approved");

    const afterApprove = await fetch(`${baseUrl}/releases`, { headers: { Cookie: cookie } });
    expect(await afterApprove.json()).toEqual([]);
  });

  it("returns 404 for an unknown release id", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/releases/999`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it("edits a release, reassigning it to a series found via search", async () => {
    await startServer([]);
    const cookie = await login();
    const { mediaAssetId, extractionRunId } = seedReleaseSource(db, 1);
    const created = await releaseRepo.create({
      mediaAssetId,
      fields: {
        seriesId: null,
        extractionRunId,
        season: 4,
        episode: 3,
        resolution: "1080p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Unknown.S04E03.1080p.Telegram",
        reviewState: "pending_review",
        manuallyVerified: false,
        manuallyVerifiedAt: null,
      },
      now: 1000,
    });
    const series = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 1000 });

    const searchRes = await fetch(`${baseUrl}/series?search=faud`, { headers: { Cookie: cookie } });
    expect(searchRes.status).toBe(200);
    expect(await searchRes.json()).toEqual([series]);

    const editRes = await fetch(`${baseUrl}/releases/${created.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ seriesId: series.id }),
    });
    expect(editRes.status).toBe(200);
    const edited = (await editRes.json()) as { displayTitle: string };
    expect(edited.displayTitle).toBe("Fauda.S04E03.1080p.Telegram");

    const detailRes = await fetch(`${baseUrl}/releases/${created.id}`, { headers: { Cookie: cookie } });
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { seriesTitle: string | null };
    expect(detail.seriesTitle).toBe("Fauda");
  });

  it("monitors and controls a download", async () => {
    await startServer([]);
    const cookie = await login();
    const { mediaAssetId, extractionRunId } = seedReleaseSource(db, 1);
    const release = await releaseRepo.create({
      mediaAssetId,
      fields: {
        seriesId: null,
        extractionRunId,
        season: 4,
        episode: 3,
        resolution: "1080p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Fauda.S04E03.1080p.Telegram",
        reviewState: "approved",
        manuallyVerified: true,
        manuallyVerifiedAt: 1000,
      },
      now: 1000,
    });
    const download = await downloadRepo.create({ releaseId: release.id, category: null, now: 1000 });

    const listRes = await fetch(`${baseUrl}/downloads`, { headers: { Cookie: cookie } });
    expect(listRes.status).toBe(200);
    const rows = (await listRes.json()) as Array<{ download: { id: number }; release: { displayTitle: string } }>;
    expect(rows).toEqual([{ download: expect.objectContaining({ id: download.id }), release: expect.objectContaining({ displayTitle: "Fauda.S04E03.1080p.Telegram" }) }]);

    const pauseRes = await fetch(`${baseUrl}/downloads/${download.id}/pause`, { method: "POST", headers: { Cookie: cookie } });
    expect(pauseRes.status).toBe(200);
    expect(((await pauseRes.json()) as { desiredState: string }).desiredState).toBe("paused");

    const resumeRes = await fetch(`${baseUrl}/downloads/${download.id}/resume`, { method: "POST", headers: { Cookie: cookie } });
    expect(resumeRes.status).toBe(200);
    expect(((await resumeRes.json()) as { desiredState: string }).desiredState).toBe("queued");

    const cancelRes = await fetch(`${baseUrl}/downloads/${download.id}/cancel`, { method: "POST", headers: { Cookie: cookie } });
    expect(cancelRes.status).toBe(200);
    expect(((await cancelRes.json()) as { desiredState: string }).desiredState).toBe("canceled");

    // Retrying re-creates the download only once the worker has actually observed a
    // terminal outcome — a bare operator "cancel" only sets desiredState, so simulate
    // the worker reconciling that into observedState=canceled before retrying.
    db.prepare("UPDATE downloads SET observed_state = 'canceled' WHERE id = ?").run(download.id);

    const retryRes = await fetch(`${baseUrl}/downloads/${release.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(retryRes.status).toBe(201);
    const retried = (await retryRes.json()) as { id: number; releaseId: number; desiredState: string };
    expect(retried.id).not.toBe(download.id);
    expect(retried.releaseId).toBe(release.id);
    expect(retried.desiredState).toBe("queued");
  });

  it("returns 404 pausing an unknown download", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/downloads/999/pause`, { method: "POST", headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it("GET /search requires a session", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/search?q=Fauda`);
    expect(res.status).toBe(401);
  });

  it("GET /search matches against series aliases and includes a magnet uri", async () => {
    await startServer([]);
    const cookie = await login();
    const series = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 1000 });
    await createSqliteSeriesAliasRepository(kysely).create({
      seriesId: series.id,
      aliasNormalized: "fauda",
      aliasOriginal: "Fauda",
      language: "en",
      source: "manual",
      now: 1000,
    });
    const { mediaAssetId, extractionRunId } = seedReleaseSource(db, 1);
    const release = await releaseRepo.create({
      mediaAssetId,
      fields: {
        seriesId: series.id,
        extractionRunId,
        season: 4,
        episode: 3,
        resolution: "1080p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Fauda.S04E03.1080p.Telegram",
        reviewState: "approved",
        manuallyVerified: true,
        manuallyVerifiedAt: 1000,
      },
      now: 1000,
    });

    const res = await fetch(`${baseUrl}/search?q=Fauda`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ release: { id: number }; magnetUri: string }>; total: number; matchedSeriesIds: number[] };
    expect(body.matchedSeriesIds).toEqual([series.id]);
    expect(body.total).toBe(1);
    expect(body.items[0]?.release.id).toBe(release.id);
    expect(body.items[0]?.magnetUri).toContain("magnet:?xt=urn:btih:");
  });

  it("GET /search returns zero results with an empty matchedSeriesIds for an unknown title", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/search?q=Some+Unknown+Show`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0, matchedSeriesIds: [] });
  });
});
