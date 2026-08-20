import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsStagingAdapter } from "../adapters/local-filesystem/fs-staging-adapter.js";
import { createKyselyDb, openDatabase } from "../adapters/sqlite/connection.js";
import { createSqliteChannelRepository } from "../adapters/sqlite/channel-repository.js";
import { createSqliteChatSyncStateRepository } from "../adapters/sqlite/chat-sync-state-repository.js";
import { createSqliteContextGroupRepository } from "../adapters/sqlite/context-group-repository.js";
import { createSqliteDownloadRepository } from "../adapters/sqlite/download-repository.js";
import { createSqliteExtractionRunRepository } from "../adapters/sqlite/extraction-run-repository.js";
import { createSqliteMediaAssetRepository } from "../adapters/sqlite/media-asset-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../adapters/sqlite/migrate.js";
import { createSqliteMessageRepository } from "../adapters/sqlite/message-repository.js";
import { createSqliteReleaseRepository } from "../adapters/sqlite/release-repository.js";
import { createSqliteReleaseRevisionRepository } from "../adapters/sqlite/release-revision-repository.js";
import { createSqliteReleaseSearchRepository } from "../adapters/sqlite/release-search-repository.js";
import type { DB } from "../adapters/sqlite/schema.js";
import { createSqliteSeriesAliasRepository } from "../adapters/sqlite/series-alias-repository.js";
import { createSqliteSeriesRepository } from "../adapters/sqlite/series-repository.js";
import { createSqliteTelegramChatRepository } from "../adapters/sqlite/telegram-chat-repository.js";
import { createFakeLlmExtractor } from "../adapters/llm-fake/fake-llm-extractor.js";
import { CONFIDENT_EPISODE_RESULT } from "../adapters/llm-fake/fixtures.js";
import { createFakeTelegramAccessAdapter } from "../adapters/telegram-fake/fake-telegram-access-adapter.js";
import type { FakeChatFixture } from "../adapters/telegram-fake/fixtures.js";
import { createHttpTelegramAccessAdapter } from "../adapters/telegram-rpc-client/http-telegram-access-adapter.js";
import { createMaterializeRelease } from "../modules/catalog/application/materialize-release.js";
import { releaseIdToMagnetUri } from "../modules/catalog/domain/release-magnet.js";
import { createBuildOrRefreshContextGroup } from "../modules/context/application/build-or-refresh-context-group.js";
import { createDownloadControls } from "../modules/downloads/application/download-controls.js";
import { createGrabRelease } from "../modules/downloads/application/grab-release.js";
import { createProcessDownloadClaim } from "../modules/downloads/application/process-download-claim.js";
import { toQbittorrentState } from "../modules/downloads/domain/qbittorrent-state.js";
import { createProcessMediaProcessingJob } from "../modules/extraction/application/process-media-processing-job.js";
import { createSyncChannelUseCase } from "../modules/ingestion/application/sync-channel.js";
import { createSearchReleasesUseCase } from "../modules/search/application/search-releases.js";
import { createTelegramAccessUseCases } from "../modules/telegram-access/application/use-cases.js";
import { createLogger } from "../platform/logging/logger.js";
import { createQbittorrentServer } from "../protocols/qbittorrent/server.js";
import { createTelegramInternalServer } from "../protocols/telegram-internal/server.js";
import { createTorznabServer } from "../protocols/torznab/server.js";

// A one-chat, one-video fixture owned by this test — deliberately not the shared
// FAKE_CHATS fixture, so this e2e test doesn't silently break if that changes for
// unrelated reasons. The filename mirrors CONFIDENT_EPISODE_RESULT (Fauda S04E03,
// 1080p, WEB-DL) so the deterministic pre-pass and the fake LLM output agree, which
// is required for the release to auto-approve.
const E2E_VIDEO_BYTES = Buffer.from("synthetic-fake-video-bytes-for-e2e-sonarr-workflow-test");

const E2E_CHAT_FIXTURE: FakeChatFixture = {
  chat: {
    id: "e2e-chat-1",
    title: "E2E Sonarr Workflow Channel",
    type: "channel",
    username: "e2e_workflow_channel",
  },
  messages: [
    {
      chatId: "e2e-chat-1",
      messageId: 1001,
      date: 1_700_500_000,
      text: "Fauda.S04E03.1080p.WEB-DL",
      replyToMessageId: null,
      mediaGroupId: null,
      media: {
        fileName: "Fauda.S04E03.1080p.WEB-DL.mkv",
        mimeType: "video/x-matroska",
        sizeBytes: E2E_VIDEO_BYTES.length,
        durationSeconds: 2_640,
        width: 1920,
        height: 1080,
      },
    },
  ],
  media: {
    1001: {
      descriptor: {
        fileName: "Fauda.S04E03.1080p.WEB-DL.mkv",
        mimeType: "video/x-matroska",
        sizeBytes: E2E_VIDEO_BYTES.length,
        durationSeconds: 2_640,
        width: 1920,
        height: 1080,
      },
      bytes: E2E_VIDEO_BYTES,
    },
  },
};

function extractMagnetUri(torznabXml: string): string {
  const match = torznabXml.match(/<link>(.*?)<\/link>/);
  if (!match?.[1]) throw new Error("no <link> element found in torznab response");
  return match[1].replace(/&amp;/g, "&");
}

describe("v1 Sonarr workflow (e2e, fully synthetic)", () => {
  let dbDir: string;
  let stagingDir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let fakeTelegramServer: Server;
  let fakeTelegramBaseUrl: string;
  let torznabServer: Server;
  let torznabBaseUrl: string;
  let qbittorrentServer: Server;
  let qbittorrentBaseUrl: string;

  beforeEach(async () => {
    dbDir = await mkdtemp(path.join(tmpdir(), "telesift-e2e-db-"));
    stagingDir = await mkdtemp(path.join(tmpdir(), "telesift-e2e-staging-"));
    db = openDatabase(path.join(dbDir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);

    const telegramAccessUseCases = createTelegramAccessUseCases(createFakeTelegramAccessAdapter([E2E_CHAT_FIXTURE]));
    const fakeTelegramApp = createTelegramInternalServer(telegramAccessUseCases);
    fakeTelegramServer = fakeTelegramApp.listen(0);
    await new Promise<void>((resolve) => fakeTelegramServer.once("listening", resolve));
    const telegramAddress = fakeTelegramServer.address();
    if (!telegramAddress || typeof telegramAddress === "string") throw new Error("expected an AddressInfo");
    fakeTelegramBaseUrl = `http://127.0.0.1:${telegramAddress.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => fakeTelegramServer.close((err) => (err ? reject(err) : resolve())));
    if (torznabServer) await new Promise<void>((resolve, reject) => torznabServer.close((err) => (err ? reject(err) : resolve())));
    if (qbittorrentServer) await new Promise<void>((resolve, reject) => qbittorrentServer.close((err) => (err ? reject(err) : resolve())));
    await kysely.destroy();
    await rm(dbDir, { recursive: true, force: true });
    await rm(stagingDir, { recursive: true, force: true });
  });

  it("ingests through telegram-service, extracts and approves a release, and grabs+completes a download through Torznab/qBittorrent", async () => {
    // Every non-telegram-service role reaches Telegram through this same HTTP adapter,
    // pointed at the fake telegram-internal server started above — matching
    // AGENTS.md's e2e boundary ("through telegram-service").
    const httpTelegramAccess = createHttpTelegramAccessAdapter(fakeTelegramBaseUrl);

    const telegramChatRepo = createSqliteTelegramChatRepository(kysely);
    const chatSyncStateRepo = createSqliteChatSyncStateRepository(kysely);
    const messageRepo = createSqliteMessageRepository(kysely);
    const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
    const channelRepo = createSqliteChannelRepository(kysely);
    const contextGroupRepo = createSqliteContextGroupRepository(kysely);
    const extractionRunRepo = createSqliteExtractionRunRepository(kysely);
    const seriesRepo = createSqliteSeriesRepository(kysely);
    const seriesAliasRepo = createSqliteSeriesAliasRepository(kysely);
    const releaseRepo = createSqliteReleaseRepository(kysely);
    const releaseRevisionRepo = createSqliteReleaseRevisionRepository(kysely);
    const releaseSearchRepo = createSqliteReleaseSearchRepository(kysely);
    const downloadRepo = createSqliteDownloadRepository(kysely);

    // --- Step 1: ingestion, through telegram-service ---
    const syncChannelUseCase = createSyncChannelUseCase({
      telegramAccess: httpTelegramAccess,
      telegramChatRepo,
      chatSyncStateRepo,
      messageRepo,
      logger: createLogger("error"),
      config: { pageSize: 50, backfillMaxMessages: null, rescanWindowSize: 50, rescanIntervalMs: 60_000 },
    });

    const channel = await channelRepo.add({ type: "telegram_id", value: "e2e-chat-1" });
    await syncChannelUseCase.syncChannel(channel, 1_000);

    const persistedMessage = await messageRepo.findByChatAndTelegramId("e2e-chat-1", 1001);
    expect(persistedMessage).not.toBeNull();
    const persistedMediaAsset = await mediaAssetRepo.findByMessageId(persistedMessage!.id);
    expect(persistedMediaAsset).not.toBeNull();
    expect(persistedMediaAsset!.fileName).toBe("Fauda.S04E03.1080p.WEB-DL.mkv");

    // --- Step 2: seed a matching local series so the release auto-approves ---
    const series = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 1_500 });
    await seriesAliasRepo.create({
      seriesId: series.id,
      aliasNormalized: "fauda",
      aliasOriginal: "Fauda",
      language: "he",
      source: "manual",
      now: 1_500,
    });

    // --- Step 3: extraction, using a fake LLM confident in the same S04E03 result ---
    const buildOrRefreshContextGroup = createBuildOrRefreshContextGroup({
      mediaAssetRepo,
      messageRepo,
      contextGroupRepo,
      precedingWindowSize: 2,
      quietPeriodMs: 10_000,
    });
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo,
      releaseRevisionRepo,
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });
    const processMediaProcessingJob = createProcessMediaProcessingJob({
      mediaAssetRepo,
      messageRepo,
      telegramChatRepo,
      buildOrRefreshContextGroup,
      extractionRunRepo,
      llmExtractor: createFakeLlmExtractor(() => CONFIDENT_EPISODE_RESULT),
      seriesRepo,
      seriesAliasRepo,
      materializeRelease,
      versions: { pipelineVersion: "v1", promptVersion: "v1", modelVersion: "fake" },
    });

    const outcome = await processMediaProcessingJob(persistedMediaAsset!.id, 2_000);
    expect(outcome.kind).toBe("processed");
    if (outcome.kind !== "processed") throw new Error("unreachable");
    expect(outcome.release).not.toBeNull();
    expect(outcome.release!.reviewState).toBe("approved");
    const releaseId = outcome.release!.id;

    // --- Step 4: Torznab search, standing in for Sonarr's interactive search ---
    const searchReleases = createSearchReleasesUseCase({ seriesAliasRepo, releaseSearchRepo, seriesMatchThreshold: 0.8 });
    const torznabApp = createTorznabServer({ searchReleases, apiKey: null });
    torznabServer = torznabApp.listen(0);
    await new Promise<void>((resolve) => torznabServer.once("listening", resolve));
    const torznabAddress = torznabServer.address();
    if (!torznabAddress || typeof torznabAddress === "string") throw new Error("expected an AddressInfo");
    torznabBaseUrl = `http://127.0.0.1:${torznabAddress.port}`;

    const searchRes = await fetch(`${torznabBaseUrl}/api?t=tvsearch&q=Fauda&season=4&ep=3`);
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.text();
    expect(searchBody).toContain(`telesift:release:${releaseId}`);
    const magnetUri = extractMagnetUri(searchBody);
    expect(magnetUri).toBe(releaseIdToMagnetUri(releaseId));

    // --- Step 5: qBittorrent-compatible grab, standing in for Sonarr's download client ---
    const grabRelease = createGrabRelease({ releaseRepo, downloadRepo });
    const downloadControls = createDownloadControls({ releaseRepo, downloadRepo });
    const qbittorrentApp = createQbittorrentServer({
      releaseRepo,
      downloadRepo,
      grabRelease,
      downloadControls,
      stagingDirectory: stagingDir,
    });
    qbittorrentServer = qbittorrentApp.listen(0);
    await new Promise<void>((resolve) => qbittorrentServer.once("listening", resolve));
    const qbittorrentAddress = qbittorrentServer.address();
    if (!qbittorrentAddress || typeof qbittorrentAddress === "string") throw new Error("expected an AddressInfo");
    qbittorrentBaseUrl = `http://127.0.0.1:${qbittorrentAddress.port}/api/v2`;

    const addRes = await fetch(`${qbittorrentBaseUrl}/torrents/add`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ urls: magnetUri }),
    });
    expect(addRes.status).toBe(200);
    expect(await addRes.text()).toBe("Ok.");

    const infoBeforeDownload = (await (await fetch(`${qbittorrentBaseUrl}/torrents/info`)).json()) as Array<{
      hash: string;
      name: string;
      state: string;
    }>;
    expect(infoBeforeDownload).toHaveLength(1);
    expect(infoBeforeDownload[0]?.state).toBe("downloading");

    // --- Step 6: download-worker claims and completes the transfer, through telegram-service again ---
    const staging = createFsStagingAdapter(stagingDir);
    const processDownloadClaim = createProcessDownloadClaim({
      releaseRepo,
      mediaAssetRepo,
      messageRepo,
      telegramAccess: httpTelegramAccess,
      staging,
      downloadRepo,
      progressReportIntervalMs: 5_000,
      leaseDurationMs: 60_000,
    });

    const claimed = await downloadRepo.claim({ workerId: "e2e-worker", now: 3_000, leaseDurationMs: 60_000 });
    expect(claimed).not.toBeNull();

    await processDownloadClaim(claimed!, "e2e-worker", 4_000);

    const finished = await downloadRepo.findById(claimed!.id);
    expect(finished?.observedState).toBe("completed");
    expect(toQbittorrentState(finished!)).toBe("pausedUP");

    const stagedFileContent = await readFile(finished!.stagingPath!);
    expect(stagedFileContent.equals(E2E_VIDEO_BYTES)).toBe(true);

    // --- Step 7: the loop closes back through the protocol layer Sonarr actually polls ---
    const infoAfterDownload = (await (await fetch(`${qbittorrentBaseUrl}/torrents/info`)).json()) as Array<{
      hash: string;
      name: string;
      state: string;
    }>;
    expect(infoAfterDownload).toHaveLength(1);
    expect(infoAfterDownload[0]?.state).toBe("pausedUP");
  });
});
