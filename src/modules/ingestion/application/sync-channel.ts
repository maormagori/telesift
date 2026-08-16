import type { Logger } from "../../../platform/logging/logger.js";
import type { MessageSummary } from "../../telegram-access/ports/models.js";
import type { TelegramAccessPort } from "../../telegram-access/ports/telegram-access-port.js";
import { createChannelResolver } from "./channel-resolution.js";
import type { Channel } from "../domain/channel.js";
import type { ChatSyncStateRepository } from "../ports/chat-sync-state-repository.js";
import type { MessageRepository } from "../ports/message-repository.js";
import type { TelegramChatRepository } from "../ports/telegram-chat-repository.js";

const RESCAN_BRACKET_BUFFER = 20;
const PORT_PAGE_LIMIT = 200;

export interface SyncChannelConfig {
  pageSize: number;
  backfillMaxMessages: number | null;
  rescanWindowSize: number;
  rescanIntervalMs: number;
}

export interface SyncChannelDeps {
  telegramAccess: TelegramAccessPort;
  telegramChatRepo: TelegramChatRepository;
  chatSyncStateRepo: ChatSyncStateRepository;
  messageRepo: MessageRepository;
  logger: Logger;
  config: SyncChannelConfig;
}

export interface SyncChannelUseCase {
  syncChannel(channel: Channel, now: number): Promise<void>;
}

export function createSyncChannelUseCase(deps: SyncChannelDeps): SyncChannelUseCase {
  const { telegramAccess, telegramChatRepo, chatSyncStateRepo, messageRepo, logger, config } = deps;
  const resolver = createChannelResolver({ telegramAccess, telegramChatRepo });

  async function upsertPage(chatId: string, messages: MessageSummary[], now: number): Promise<void> {
    for (const message of messages) {
      await messageRepo.upsertMessage({
        chatId,
        telegramMessageId: message.messageId,
        text: message.text,
        replyToMessageId: message.replyToMessageId,
        mediaGroupId: message.mediaGroupId,
        sourceDate: message.date * 1000,
        sourceEditedAt: null,
        media: message.media,
        now,
      });
    }
  }

  async function advancePage(chatId: string, now: number): Promise<void> {
    const syncState = await chatSyncStateRepo.get(chatId);
    const cursor = syncState?.newestSeenMessageId ?? 0;
    if (config.backfillMaxMessages !== null && cursor >= config.backfillMaxMessages) return;

    const page = await telegramAccess.getMessages(chatId, { minId: cursor, limit: config.pageSize });
    await upsertPage(chatId, page, now);

    let newestId = cursor;
    if (page.length > 0) {
      newestId = Math.max(...page.map((message) => message.messageId));
      await chatSyncStateRepo.advanceIncrementalCursor(chatId, newestId, now);
      await chatSyncStateRepo.advanceBackfillCursor(chatId, newestId, now);
    }

    const caughtUp = page.length < config.pageSize;
    const capReached = config.backfillMaxMessages !== null && newestId >= config.backfillMaxMessages;
    if (caughtUp || capReached) {
      await chatSyncStateRepo.markBackfillCompleted(chatId, now);
    }
  }

  async function rescanIfDue(chatId: string, now: number): Promise<void> {
    const syncState = await chatSyncStateRepo.get(chatId);
    const due = !syncState?.lastRescannedAt || now - syncState.lastRescannedAt >= config.rescanIntervalMs;
    if (!due) return;

    const knownIds = await messageRepo.listRecentMessageIds(chatId, config.rescanWindowSize);
    if (knownIds.length > 0) {
      const minId = Math.min(...knownIds);
      const maxId = Math.max(...knownIds);
      const limit = Math.min(config.rescanWindowSize + RESCAN_BRACKET_BUFFER, PORT_PAGE_LIMIT);
      const fresh = await telegramAccess.getMessages(chatId, { minId: minId - 1, maxId: maxId + 1, limit });
      await upsertPage(chatId, fresh, now);

      const freshIds = new Set(fresh.map((message) => message.messageId));
      for (const id of knownIds.filter((knownId) => !freshIds.has(knownId))) {
        await messageRepo.markDeleted(chatId, id, now);
      }
    }

    await chatSyncStateRepo.recordRescan(chatId, now);
  }

  return {
    async syncChannel(channel, now) {
      try {
        const chat = await resolver.resolveOrDiscover(channel, now);
        if (!chat) {
          logger.warn("ingestion: channel not yet visible to this account, skipping", {
            identifierType: channel.identifier.type,
            identifierValue: channel.identifier.value,
          });
          return;
        }

        await advancePage(chat.telegramId, now);
        await rescanIfDue(chat.telegramId, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("ingestion: sync failed for channel", {
          identifierType: channel.identifier.type,
          identifierValue: channel.identifier.value,
          error: message,
        });
        const chat = await resolver.resolveExisting(channel);
        if (chat) await chatSyncStateRepo.recordError(chat.telegramId, message, now);
      }
    },
  };
}
