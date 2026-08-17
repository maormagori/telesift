import type { MediaAsset } from "../domain/media-asset.js";
import type { TelegramMessage } from "../domain/telegram-message.js";
import type { MediaAssetRepository } from "../ports/media-asset-repository.js";
import type { MessageRepository } from "../ports/message-repository.js";

export interface MessageWithMedia {
  message: TelegramMessage;
  media: MediaAsset | null;
}

export interface MessageInspectionDeps {
  messageRepo: MessageRepository;
  mediaAssetRepo: MediaAssetRepository;
}

export interface MessageInspectionUseCases {
  /** Raw messages for a chat, newest first, each paired with its local media metadata (if any), for the raw-inspection UI. */
  listMessagesPage(
    chatId: string,
    options: { beforeTelegramMessageId: number | null; limit: number },
  ): Promise<MessageWithMedia[]>;
}

export function createMessageInspectionUseCases(deps: MessageInspectionDeps): MessageInspectionUseCases {
  const { messageRepo, mediaAssetRepo } = deps;

  return {
    async listMessagesPage(chatId, options) {
      const messages = await messageRepo.listMessagesPage(chatId, options);
      return Promise.all(
        messages.map(async (message) => ({ message, media: await mediaAssetRepo.findByMessageId(message.id) })),
      );
    },
  };
}
