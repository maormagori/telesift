import { Readable } from "node:stream";
import type { GetMessagesOptions } from "../../modules/telegram-access/ports/models.js";
import {
  ChatNotAccessibleError,
  type MediaStream,
  type TelegramAccessPort,
} from "../../modules/telegram-access/ports/telegram-access-port.js";
import { FAKE_ACCOUNT, FAKE_CHATS, type FakeChatFixture } from "./fixtures.js";

export function createFakeTelegramAccessAdapter(): TelegramAccessPort {
  function findChat(chatId: string): FakeChatFixture {
    const fixture = FAKE_CHATS.find((entry) => entry.chat.id === chatId);
    if (!fixture) throw new ChatNotAccessibleError(chatId);
    return fixture;
  }

  return {
    async getStatus() {
      return { connected: true, account: FAKE_ACCOUNT };
    },

    async listChats() {
      return FAKE_CHATS.map((entry) => entry.chat);
    },

    async getMessages(chatId, options: GetMessagesOptions) {
      const fixture = findChat(chatId);
      let messages = fixture.messages;
      if (options.minId !== undefined) {
        const minId = options.minId;
        messages = messages.filter((message) => message.messageId > minId);
      }
      if (options.maxId !== undefined) {
        const maxId = options.maxId;
        messages = messages.filter((message) => message.messageId < maxId);
      }
      return messages.slice(0, options.limit);
    },

    async getMessage(chatId, messageId) {
      const fixture = findChat(chatId);
      return fixture.messages.find((message) => message.messageId === messageId) ?? null;
    },

    async getMediaStream(chatId, messageId): Promise<MediaStream | null> {
      const fixture = findChat(chatId);
      const asset = fixture.media[messageId];
      if (!asset) return null;
      return { descriptor: asset.descriptor, stream: Readable.from(asset.bytes) };
    },
  };
}
