import { Readable } from "node:stream";
import { TelegramClient } from "teleproto";
import { BadRequestError, ForbiddenError, NotFoundError } from "teleproto/errors/RPCBaseErrors.js";
// teleproto ships as CommonJS with no "exports" map, so Node's ESM resolver
// needs the fully-specified subpath (the README's bare "teleproto/sessions" only works for CJS/bundler consumers).
import { StringSession } from "teleproto/sessions/index.js";
import type { TelegramCredentials } from "../../platform/config/env.js";
import type { GetMessagesOptions } from "../../modules/telegram-access/ports/models.js";
import {
  ChatNotAccessibleError,
  type MediaStream,
  type TelegramAccessPort,
} from "../../modules/telegram-access/ports/telegram-access-port.js";
import { mapDialogToChatSummary, mapDocumentToMediaDescriptor, mapMessageToSummary } from "./mappers.js";

export function createTeleprotoTelegramAccessAdapter(credentials: TelegramCredentials): TelegramAccessPort {
  const session = new StringSession(credentials.session);
  const client = new TelegramClient(session, credentials.apiId, credentials.apiHash, {
    connectionRetries: 5,
  });

  // Login is out of scope for v1 (AGENTS.md): connect() only resumes the
  // operator-provisioned session, it never prompts for phone/code/password.
  let connecting: Promise<boolean> | null = null;
  async function ensureConnected(): Promise<void> {
    if (client.connected) return;
    connecting ??= client.connect().finally(() => {
      connecting = null;
    });
    await connecting;
  }

  // Only errors that mean the chat is genuinely gone/blocked become
  // ChatNotAccessibleError (-> 404). Flood waits, server errors, timeouts,
  // and auth failures are transient/operational and must surface as 500s,
  // not look like the chat or message doesn't exist.
  function isChatNotAccessible(error: unknown): boolean {
    return error instanceof BadRequestError || error instanceof ForbiddenError || error instanceof NotFoundError;
  }

  async function fetchSingleMessage(chatId: string, messageId: number) {
    await ensureConnected();
    try {
      const messages = await client.getMessages(chatId, { ids: messageId });
      return messages[0] ?? null;
    } catch (error) {
      if (isChatNotAccessible(error)) throw new ChatNotAccessibleError(chatId, { cause: error });
      throw error;
    }
  }

  return {
    async getStatus() {
      await ensureConnected();
      if (!(await client.isUserAuthorized())) {
        return { connected: false, account: null };
      }
      const me = await client.getMe();
      return {
        connected: true,
        account: {
          id: me.id.toString(),
          username: me.username ?? null,
          firstName: me.firstName ?? null,
        },
      };
    },

    async listChats() {
      await ensureConnected();
      const dialogs = await client.getDialogs({});
      return dialogs.map(mapDialogToChatSummary);
    },

    async getMessages(chatId, options: GetMessagesOptions) {
      await ensureConnected();
      try {
        // reverse: true makes teleproto return ascending (oldest-first) order starting
        // just after minId, instead of its default newest-first order capped at limit.
        // Without it, a minId cursor that advances to "highest ID seen" silently skips
        // older messages whenever a chat has more than `limit` new messages between polls.
        const messages = await client.getMessages(chatId, {
          limit: options.limit,
          minId: options.minId,
          maxId: options.maxId,
          reverse: true,
        });
        return messages.map((message) => mapMessageToSummary(chatId, message));
      } catch (error) {
        if (isChatNotAccessible(error)) throw new ChatNotAccessibleError(chatId, { cause: error });
        throw error;
      }
    },

    async getMessage(chatId, messageId) {
      const message = await fetchSingleMessage(chatId, messageId);
      if (!message) return null;
      return mapMessageToSummary(chatId, message);
    },

    async getMediaStream(chatId, messageId): Promise<MediaStream | null> {
      const message = await fetchSingleMessage(chatId, messageId);
      const descriptor = mapDocumentToMediaDescriptor(message?.document);
      if (!message || !descriptor) return null;

      const stream = Readable.from(client.iterDownload(message));
      return { descriptor, stream };
    },
  };
}
