import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { z } from "zod";
import {
  ChatSummarySchema,
  ConnectionStatusSchema,
  MediaDescriptorSchema,
  MessageSummarySchema,
  type ChatSummary,
  type ConnectionStatus,
  type GetMessagesOptions,
  type MediaDescriptor,
  type MessageSummary,
} from "../../modules/telegram-access/ports/models.js";
import {
  ChatNotAccessibleError,
  type MediaStream,
  type TelegramAccessPort,
} from "../../modules/telegram-access/ports/telegram-access-port.js";

const ErrorBodySchema = z.object({ error: z.string(), message: z.string().optional() });

export interface HttpTelegramAccessAdapterOptions {
  /**
   * Bounds time-to-first-byte only, not a media stream's full body — a large
   * transfer must not be cut off once headers have arrived. Undefined
   * preserves the previous no-timeout behavior.
   */
  requestTimeoutMs?: number;
}

export function createHttpTelegramAccessAdapter(
  baseUrl: string,
  options: HttpTelegramAccessAdapterOptions = {},
): TelegramAccessPort {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function get(pathname: string): Promise<Response> {
    if (!options.requestTimeoutMs) return fetch(`${normalizedBaseUrl}${pathname}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);
    try {
      return await fetch(`${normalizedBaseUrl}${pathname}`, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`telegram-service request timed out after ${options.requestTimeoutMs}ms: ${pathname}`);
      }
      throw error;
    } finally {
      // Clearing here only cancels the time-to-first-byte wait; it does not
      // affect a response body already being streamed by the caller.
      clearTimeout(timeout);
    }
  }

  async function readErrorName(res: Response): Promise<string | null> {
    try {
      return ErrorBodySchema.parse(await res.json()).error;
    } catch {
      return null;
    }
  }

  async function resolveNotFound(res: Response, chatId: string): Promise<null> {
    const errorName = await readErrorName(res);
    if (errorName === "ChatNotFoundError") throw new ChatNotAccessibleError(chatId);
    return null;
  }

  return {
    async getStatus(): Promise<ConnectionStatus> {
      const res = await get("/status");
      if (!res.ok) throw new Error(`telegram-service /status failed: ${res.status}`);
      return ConnectionStatusSchema.parse(await res.json());
    },

    async listChats(): Promise<ChatSummary[]> {
      const res = await get("/chats");
      if (!res.ok) throw new Error(`telegram-service /chats failed: ${res.status}`);
      return z.array(ChatSummarySchema).parse(await res.json());
    },

    async getMessages(chatId, options: GetMessagesOptions): Promise<MessageSummary[]> {
      const query = new URLSearchParams();
      if (options.minId !== undefined) query.set("minId", String(options.minId));
      if (options.maxId !== undefined) query.set("maxId", String(options.maxId));
      query.set("limit", String(options.limit));

      const res = await get(`/chats/${encodeURIComponent(chatId)}/messages?${query.toString()}`);
      if (res.status === 404) throw new ChatNotAccessibleError(chatId);
      if (!res.ok) throw new Error(`telegram-service messages failed: ${res.status}`);
      return z.array(MessageSummarySchema).parse(await res.json());
    },

    async getMessage(chatId, messageId): Promise<MessageSummary | null> {
      const res = await get(`/chats/${encodeURIComponent(chatId)}/messages/${messageId}`);
      if (res.status === 404) return resolveNotFound(res, chatId);
      if (!res.ok) throw new Error(`telegram-service message failed: ${res.status}`);
      return MessageSummarySchema.parse(await res.json());
    },

    async getMediaStream(chatId, messageId): Promise<MediaStream | null> {
      const res = await get(`/chats/${encodeURIComponent(chatId)}/messages/${messageId}/media`);
      if (res.status === 404) return resolveNotFound(res, chatId);
      if (!res.ok || !res.body) throw new Error(`telegram-service media failed: ${res.status}`);

      return {
        descriptor: mediaDescriptorFromHeaders(res.headers),
        stream: Readable.fromWeb(res.body as WebReadableStream<Uint8Array>),
      };
    },
  };
}

function fileNameFromContentDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  // Prefer the RFC 5987 `filename*` form (UTF-8, e.g. Hebrew names) over the
  // ASCII-only `filename` fallback the server also sends for older clients.
  const extended = disposition.match(/filename\*=UTF-8''([^;]+)/);
  if (extended?.[1]) return decodeURIComponent(extended[1]);
  const plain = disposition.match(/filename="([^"]*)"/);
  return plain?.[1] ?? null;
}

function mediaDescriptorFromHeaders(headers: Headers): MediaDescriptor {
  const fileName = fileNameFromContentDisposition(headers.get("content-disposition"));
  const contentLength = headers.get("content-length");
  const duration = headers.get("x-media-duration-seconds");
  const width = headers.get("x-media-width");
  const height = headers.get("x-media-height");

  return MediaDescriptorSchema.parse({
    fileName,
    mimeType: headers.get("content-type"),
    sizeBytes: contentLength ? Number(contentLength) : null,
    durationSeconds: duration ? Number(duration) : null,
    width: width ? Number(width) : null,
    height: height ? Number(height) : null,
  });
}
