import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { sql } from "kysely";
import { createSqliteChannelRepository } from "../../adapters/sqlite/channel-repository.js";
import { createSqliteChatSyncStateRepository } from "../../adapters/sqlite/chat-sync-state-repository.js";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteDownloadRepository } from "../../adapters/sqlite/download-repository.js";
import { createSqliteMediaAssetRepository } from "../../adapters/sqlite/media-asset-repository.js";
import { createSqliteMessageRepository } from "../../adapters/sqlite/message-repository.js";
import { createSqliteReleaseRepository } from "../../adapters/sqlite/release-repository.js";
import { createSqliteReleaseRevisionRepository } from "../../adapters/sqlite/release-revision-repository.js";
import { createSqliteReleaseSearchRepository } from "../../adapters/sqlite/release-search-repository.js";
import { createSqliteSeriesAliasRepository } from "../../adapters/sqlite/series-alias-repository.js";
import { createSqliteSeriesRepository } from "../../adapters/sqlite/series-repository.js";
import { createSqliteTelegramChatRepository } from "../../adapters/sqlite/telegram-chat-repository.js";
import { createHttpTelegramAccessAdapter } from "../../adapters/telegram-rpc-client/http-telegram-access-adapter.js";
import { createAppAuthUseCases } from "../../modules/app-auth/application/use-cases.js";
import { createDownloadControls } from "../../modules/downloads/application/download-controls.js";
import { createDownloadQueueUseCases } from "../../modules/downloads/application/download-queue.js";
import { createGrabRelease } from "../../modules/downloads/application/grab-release.js";
import { createChannelResolver } from "../../modules/ingestion/application/channel-resolution.js";
import { createMessageInspectionUseCases } from "../../modules/ingestion/application/message-inspection.js";
import { createChannelStatusUseCases, createIngestionUseCases } from "../../modules/ingestion/application/use-cases.js";
import { createReviewQueueUseCases } from "../../modules/review/application/review-queue.js";
import { createReviewUseCases } from "../../modules/review/application/review-use-cases.js";
import { createSearchReleasesUseCase } from "../../modules/search/application/search-releases.js";
import { createTelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import { loadAppConfig } from "../../platform/config/app-env.js";
import { createLogger } from "../../platform/logging/logger.js";
import { installShutdownHandler } from "../../platform/process-lifecycle/graceful-shutdown.js";
import { createAppApiServer } from "../../protocols/app-api/server.js";
import { createQbittorrentServer } from "../../protocols/qbittorrent/server.js";
import { createTorznabServer } from "../../protocols/torznab/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST_DIR = path.join(__dirname, "web", "dist");

async function main(): Promise<void> {
  const config = loadAppConfig();
  const logger = createLogger(config.logLevel);

  const kysely = createKyselyDb(openDatabase(config.databasePath));
  const channelRepo = createSqliteChannelRepository(kysely);
  const chatSyncStateRepo = createSqliteChatSyncStateRepository(kysely);
  const telegramChatRepo = createSqliteTelegramChatRepository(kysely);
  const messageRepo = createSqliteMessageRepository(kysely);
  const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
  const releaseRepo = createSqliteReleaseRepository(kysely);
  const releaseRevisionRepo = createSqliteReleaseRevisionRepository(kysely);
  const seriesRepo = createSqliteSeriesRepository(kysely);
  const seriesAliasRepo = createSqliteSeriesAliasRepository(kysely);
  const releaseSearchRepo = createSqliteReleaseSearchRepository(kysely);
  const downloadRepo = createSqliteDownloadRepository(kysely);

  const telegramAccessAdapter = createHttpTelegramAccessAdapter(config.telegramServiceUrl);
  const telegramAccess = createTelegramAccessUseCases(telegramAccessAdapter);
  const resolver = createChannelResolver({ telegramAccess: telegramAccessAdapter, telegramChatRepo });
  const searchReleases = createSearchReleasesUseCase({
    seriesAliasRepo,
    releaseSearchRepo,
    seriesMatchThreshold: config.torznabSeriesMatchThreshold,
  });
  const downloadControls = createDownloadControls({ releaseRepo, downloadRepo });

  const appApi = createAppApiServer(
    {
      appAuth: createAppAuthUseCases({ username: config.adminUsername, passwordHash: config.adminPasswordHash }),
      telegramAccess,
      ingestion: createIngestionUseCases(channelRepo),
      channelStatus: createChannelStatusUseCases({ channelRepo, chatSyncStateRepo, resolver }),
      messageInspection: createMessageInspectionUseCases({ messageRepo, mediaAssetRepo }),
      seriesRepo,
      reviewQueue: createReviewQueueUseCases({ releaseRepo, releaseRevisionRepo, mediaAssetRepo, messageRepo, seriesRepo }),
      review: createReviewUseCases({ releaseRepo, releaseRevisionRepo, seriesRepo }),
      downloadQueue: createDownloadQueueUseCases({ downloadRepo, releaseRepo }),
      downloadControls,
      search: searchReleases,
    },
    { secret: config.sessionSecret, cookieSecure: config.cookieSecure },
  );

  const torznabServer = createTorznabServer({ searchReleases, apiKey: config.torznabApiKey });
  const qbittorrentServer = createQbittorrentServer({
    releaseRepo,
    downloadRepo,
    grabRelease: createGrabRelease({ releaseRepo, downloadRepo }),
    downloadControls,
    stagingDirectory: config.downloadStagingDirectory,
  });

  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", async (_req, res) => {
    try {
      await sql`select 1`.execute(kysely);
      res.status(200).json({ status: "ok" });
    } catch (error) {
      res.status(503).json({ status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.use("/api", appApi);
  app.use("/torznab", torznabServer);
  app.use("/qbittorrent", qbittorrentServer);
  app.use(express.static(WEB_DIST_DIR));
  // Passing `root` (rather than a bare absolute path) keeps `send`'s dotfiles check scoped to
  // the request-relative path, matching express.static above — a bare absolute path would run
  // that check against every segment of WEB_DIST_DIR itself, which can spuriously 404 when the
  // deployment path contains a dot-prefixed directory (e.g. a checkout under a dotfile-managed home).
  app.use((_req, res) => res.sendFile("index.html", { root: WEB_DIST_DIR }));

  const server = app.listen(config.port, config.host, () => {
    logger.info("app listening", { host: config.host, port: config.port });
  });

  installShutdownHandler(logger, "app", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await kysely.destroy();
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
