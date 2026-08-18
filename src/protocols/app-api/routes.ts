import { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import type { AppAuthUseCases } from "../../modules/app-auth/application/use-cases.js";
import { ChannelNotFoundError } from "../../modules/ingestion/domain/channel.js";
import { parseChannelIdentifier } from "../../modules/ingestion/domain/channel-identifier.js";
import type { ChannelStatusUseCases } from "../../modules/ingestion/application/use-cases.js";
import type { IngestionUseCases } from "../../modules/ingestion/application/use-cases.js";
import type { MessageInspectionUseCases } from "../../modules/ingestion/application/message-inspection.js";
import type { SeriesRepository } from "../../modules/catalog/ports/series-repository.js";
import { releaseIdToMagnetUri } from "../../modules/catalog/domain/release-magnet.js";
import type { ReviewQueueUseCases } from "../../modules/review/application/review-queue.js";
import type { ReviewUseCases } from "../../modules/review/application/review-use-cases.js";
import type { DownloadQueueUseCases } from "../../modules/downloads/application/download-queue.js";
import type { DownloadControls } from "../../modules/downloads/application/download-controls.js";
import type { SearchReleasesOutput, SearchReleasesQuery } from "../../modules/search/application/search-releases.js";
import type { TelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import { isTelegramAccessNotFoundError } from "../../modules/telegram-access/application/use-cases.js";
import { ChatIdParamSchema, MessageIdParamSchema } from "../../modules/telegram-access/ports/models.js";
import { requireAuth } from "./session.js";

const LoginBodySchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const AddChannelBodySchema = z.object({ identifier: z.string().min(1) });
const ChannelIdentifierBodySchema = z.object({
  identifier: z.discriminatedUnion("type", [
    z.object({ type: z.literal("telegram_id"), value: z.string().min(1) }),
    z.object({ type: z.literal("username"), value: z.string().min(1) }),
  ]),
});
const MessagesPageQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
const ListReleasesQuerySchema = z.object({
  afterId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
const ReleaseIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const EditReleaseBodySchema = z.object({
  seriesId: z.number().int().positive().nullable().optional(),
  season: z.number().int().nullable().optional(),
  episode: z.number().int().nullable().optional(),
  resolution: z.string().min(1).nullable().optional(),
  source: z.string().min(1).nullable().optional(),
  codec: z.string().min(1).nullable().optional(),
  language: z.string().min(1).nullable().optional(),
});
const SeriesSearchQuerySchema = z.object({
  search: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
const DownloadIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const RetryDownloadParamSchema = z.object({ releaseId: z.coerce.number().int().positive() });
const RetryDownloadBodySchema = z.object({ category: z.string().min(1).nullable().default(null) });
const SearchQuerySchema = z.object({
  q: z.string().optional(),
  season: z.coerce.number().int().optional(),
  episode: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export interface AppApiDeps {
  appAuth: AppAuthUseCases;
  telegramAccess: TelegramAccessUseCases;
  ingestion: IngestionUseCases;
  channelStatus: ChannelStatusUseCases;
  messageInspection: MessageInspectionUseCases;
  seriesRepo: SeriesRepository;
  reviewQueue: ReviewQueueUseCases;
  review: ReviewUseCases;
  downloadQueue: DownloadQueueUseCases;
  downloadControls: DownloadControls;
  search: (query: SearchReleasesQuery) => Promise<SearchReleasesOutput>;
}

export function createAppApiRoutes(deps: AppApiDeps): Router {
  const {
    appAuth,
    telegramAccess,
    ingestion,
    channelStatus,
    messageInspection,
    seriesRepo,
    reviewQueue,
    review,
    downloadQueue,
    downloadControls,
    search,
  } = deps;
  const router = Router();

  router.post("/auth/login", (req: Request, res: Response, next: NextFunction) => {
    const { username, password } = LoginBodySchema.parse(req.body);
    if (!appAuth.verifyCredentials(username, password)) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    req.session.regenerate((err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      req.session.username = username;
      res.json({ username });
    });
  });

  router.post("/auth/logout", (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie("telesift.sid");
      res.status(204).end();
    });
  });

  router.get("/auth/session", (req: Request, res: Response) => {
    if (!req.session.username) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    res.json({ username: req.session.username });
  });

  router.use(requireAuth);

  router.get("/telegram/status", async (_req: Request, res: Response) => {
    res.json(await telegramAccess.getConnectionStatus());
  });

  router.get("/channels", async (_req: Request, res: Response) => {
    res.json(await channelStatus.listChannelsWithStatus());
  });

  router.post("/channels", async (req: Request, res: Response) => {
    const { identifier } = AddChannelBodySchema.parse(req.body);
    res.status(201).json(await channelStatus.addChannelResolved(parseChannelIdentifier(identifier), Date.now()));
  });

  router.post("/channels/enable", async (req: Request, res: Response) => {
    const { identifier } = ChannelIdentifierBodySchema.parse(req.body);
    res.json(await ingestion.enableChannel(identifier));
  });

  router.post("/channels/disable", async (req: Request, res: Response) => {
    const { identifier } = ChannelIdentifierBodySchema.parse(req.body);
    res.json(await ingestion.disableChannel(identifier));
  });

  router.get("/chats/:chatId/messages", async (req: Request, res: Response) => {
    const { chatId } = ChatIdParamSchema.parse(req.params);
    const { before, limit } = MessagesPageQuerySchema.parse(req.query);
    res.json(await messageInspection.listMessagesPage(chatId, { beforeTelegramMessageId: before ?? null, limit }));
  });

  router.get("/chats/:chatId/messages/:messageId/media", async (req: Request, res: Response) => {
    const { chatId, messageId } = MessageIdParamSchema.parse(req.params);
    const media = await telegramAccess.getMediaStream(chatId, messageId);

    res.setHeader("Content-Type", media.descriptor.mimeType ?? "application/octet-stream");
    if (media.descriptor.sizeBytes !== null) {
      res.setHeader("Content-Length", media.descriptor.sizeBytes.toString());
    }
    const fileName = media.descriptor.fileName ?? `${chatId}-${messageId}`;
    const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    media.stream.on("error", (error: unknown) => {
      if (!res.headersSent) {
        res.status(502).json({ error: "media_stream_failed" });
      } else {
        res.destroy();
      }
      req.destroy();
      console.error("app-api: media stream failed", { chatId, messageId, error });
    });
    media.stream.pipe(res);
  });

  router.get("/releases", async (req: Request, res: Response) => {
    const { afterId, limit } = ListReleasesQuerySchema.parse(req.query);
    res.json(await reviewQueue.listPendingReview({ afterId: afterId ?? null, limit }));
  });

  router.get("/releases/:id", async (req: Request, res: Response) => {
    const { id } = ReleaseIdParamSchema.parse(req.params);
    res.json(await reviewQueue.getReleaseDetail(id));
  });

  router.post("/releases/:id/approve", async (req: Request, res: Response) => {
    const { id } = ReleaseIdParamSchema.parse(req.params);
    res.json(await review.approveRelease(id, req.session.username!, Date.now()));
  });

  router.post("/releases/:id/reject", async (req: Request, res: Response) => {
    const { id } = ReleaseIdParamSchema.parse(req.params);
    res.json(await review.rejectRelease(id, req.session.username!, Date.now()));
  });

  router.post("/releases/:id/edit", async (req: Request, res: Response) => {
    const { id } = ReleaseIdParamSchema.parse(req.params);
    const input = EditReleaseBodySchema.parse(req.body);
    res.json(await review.editRelease(id, input, req.session.username!, Date.now()));
  });

  router.get("/series", async (req: Request, res: Response) => {
    const { search, limit } = SeriesSearchQuerySchema.parse(req.query);
    res.json(await seriesRepo.search(search, limit));
  });

  router.get("/downloads", async (_req: Request, res: Response) => {
    res.json(await downloadQueue.listDownloads());
  });

  router.post("/downloads/:id/pause", async (req: Request, res: Response) => {
    const { id } = DownloadIdParamSchema.parse(req.params);
    const download = await downloadControls.pauseDownload(id, Date.now());
    if (!download) {
      res.status(404).json({ error: "download_not_found" });
      return;
    }
    res.json(download);
  });

  router.post("/downloads/:id/resume", async (req: Request, res: Response) => {
    const { id } = DownloadIdParamSchema.parse(req.params);
    const download = await downloadControls.resumeDownload(id, Date.now());
    if (!download) {
      res.status(404).json({ error: "download_not_found" });
      return;
    }
    res.json(download);
  });

  router.post("/downloads/:id/cancel", async (req: Request, res: Response) => {
    const { id } = DownloadIdParamSchema.parse(req.params);
    const download = await downloadControls.cancelDownload(id, Date.now());
    if (!download) {
      res.status(404).json({ error: "download_not_found" });
      return;
    }
    res.json(download);
  });

  router.post("/downloads/:releaseId/retry", async (req: Request, res: Response) => {
    const { releaseId } = RetryDownloadParamSchema.parse(req.params);
    const { category } = RetryDownloadBodySchema.parse(req.body);
    res.status(201).json(await downloadControls.retryDownload(releaseId, category, Date.now()));
  });

  // Backs the operator-facing search simulator — calls the same use case as the
  // Torznab protocol endpoint, so results match exactly what Sonarr would see.
  router.get("/search", async (req: Request, res: Response) => {
    const { q, season, episode, offset, limit } = SearchQuerySchema.parse(req.query);
    const result = await search({ queryText: q ?? null, season: season ?? null, episode: episode ?? null, offset, limit });
    res.json({
      items: result.items.map((item) => ({ ...item, magnetUri: releaseIdToMagnetUri(item.release.id) })),
      total: result.total,
      matchedSeriesIds: result.matchedSeriesIds,
    });
  });

  router.use(errorMiddleware);

  return router;
}

const errorMiddleware: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "invalid_request", issues: err.issues });
    return;
  }
  if (err instanceof ChannelNotFoundError) {
    res.status(404).json({ error: err.name, message: err.message });
    return;
  }
  if (isTelegramAccessNotFoundError(err)) {
    res.status(404).json({ error: err.name, message: err.message });
    return;
  }
  // Both the review and downloads modules define their own ReleaseNotFoundError (each scoped
  // to their own repository failure mode) — matched by name rather than importing both classes.
  if (err instanceof Error && err.name === "ReleaseNotFoundError") {
    res.status(404).json({ error: err.name, message: err.message });
    return;
  }
  console.error("app-api: unhandled error", err);
  res.status(500).json({ error: "internal_error" });
};
