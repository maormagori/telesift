import { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { ChatIdParamSchema, GetMessagesOptionsSchema, MessageIdParamSchema } from "../../modules/telegram-access/ports/models.js";
import { isTelegramAccessNotFoundError, type TelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";

export function createTelegramInternalRoutes(useCases: TelegramAccessUseCases): Router {
  const router = Router();

  router.get("/status", async (_req: Request, res: Response) => {
    res.json(await useCases.getConnectionStatus());
  });

  router.get("/chats", async (_req: Request, res: Response) => {
    res.json(await useCases.listChats());
  });

  router.get("/chats/:chatId/messages", async (req: Request, res: Response) => {
    const { chatId } = ChatIdParamSchema.parse(req.params);
    const options = GetMessagesOptionsSchema.parse(req.query);
    res.json(await useCases.getMessages(chatId, options));
  });

  router.get("/chats/:chatId/messages/:messageId", async (req: Request, res: Response) => {
    const { chatId, messageId } = MessageIdParamSchema.parse(req.params);
    res.json(await useCases.getMessage(chatId, messageId));
  });

  router.get("/chats/:chatId/messages/:messageId/media", async (req: Request, res: Response) => {
    const { chatId, messageId } = MessageIdParamSchema.parse(req.params);
    const media = await useCases.getMediaStream(chatId, messageId);

    res.setHeader("Content-Type", media.descriptor.mimeType ?? "application/octet-stream");
    if (media.descriptor.sizeBytes !== null) {
      res.setHeader("Content-Length", media.descriptor.sizeBytes.toString());
    }
    const fileName = media.descriptor.fileName ?? `${chatId}-${messageId}`;
    // Content-Disposition's `filename` param is Latin-1 only (Node throws ERR_INVALID_CHAR
    // on non-ASCII bytes), so non-ASCII names must go through the RFC 5987 `filename*` form.
    // Every consumer of this API is `telegram-rpc-client`, which reads `filename*` first.
    const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    // Duration/width/height have no standard HTTP header, but telegram-rpc-client
    // needs them to round-trip a full MediaDescriptor without a second request.
    if (media.descriptor.durationSeconds !== null) {
      res.setHeader("X-Media-Duration-Seconds", media.descriptor.durationSeconds.toString());
    }
    if (media.descriptor.width !== null) res.setHeader("X-Media-Width", media.descriptor.width.toString());
    if (media.descriptor.height !== null) res.setHeader("X-Media-Height", media.descriptor.height.toString());

    // Without this handler, a mid-download failure (e.g. the Telegram connection
    // dropping) emits an unhandled 'error' on the source stream and crashes the process.
    media.stream.on("error", (error: unknown) => {
      if (!res.headersSent) {
        res.status(502).json({ error: "media_stream_failed" });
      } else {
        res.destroy();
      }
      req.destroy();
      console.error("media stream failed", { chatId, messageId, error });
    });
    media.stream.pipe(res);
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
  if (isTelegramAccessNotFoundError(err)) {
    res.status(404).json({ error: err.name, message: err.message });
    return;
  }
  res.status(500).json({ error: "internal_error" });
};
