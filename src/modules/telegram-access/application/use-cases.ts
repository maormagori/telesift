import type { ChatSummary, ConnectionStatus, GetMessagesOptions, MessageSummary } from "../ports/models.js";
import { ChatNotAccessibleError, type MediaStream, type TelegramAccessPort } from "../ports/telegram-access-port.js";

export class ChatNotFoundError extends Error {
  constructor(public readonly chatId: string) {
    super(`Chat not found: ${chatId}`);
    this.name = "ChatNotFoundError";
  }
}

export class MessageUnavailableError extends Error {
  constructor(
    public readonly chatId: string,
    public readonly messageId: number,
  ) {
    super(`Message unavailable: chat=${chatId} message=${messageId}`);
    this.name = "MessageUnavailableError";
  }
}

export interface TelegramAccessUseCases {
  getConnectionStatus(): Promise<ConnectionStatus>;
  listChats(): Promise<ChatSummary[]>;
  getMessages(chatId: string, options: GetMessagesOptions): Promise<MessageSummary[]>;
  getMessage(chatId: string, messageId: number): Promise<MessageSummary>;
  getMediaStream(chatId: string, messageId: number): Promise<MediaStream>;
}

export function createTelegramAccessUseCases(port: TelegramAccessPort): TelegramAccessUseCases {
  return {
    getConnectionStatus: () => port.getStatus(),
    listChats: () => port.listChats(),

    async getMessages(chatId, options) {
      return withChatTranslation(chatId, () => port.getMessages(chatId, options));
    },

    async getMessage(chatId, messageId) {
      const message = await withChatTranslation(chatId, () => port.getMessage(chatId, messageId));
      if (!message) throw new MessageUnavailableError(chatId, messageId);
      return message;
    },

    async getMediaStream(chatId, messageId) {
      const media = await withChatTranslation(chatId, () => port.getMediaStream(chatId, messageId));
      if (!media) throw new MessageUnavailableError(chatId, messageId);
      return media;
    },
  };
}

async function withChatTranslation<T>(chatId: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ChatNotAccessibleError) throw new ChatNotFoundError(chatId);
    throw error;
  }
}
