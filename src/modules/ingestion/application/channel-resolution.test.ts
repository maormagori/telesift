import { describe, expect, it, vi } from "vitest";
import { createFakeTelegramAccessAdapter } from "../../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import type { FakeChatFixture } from "../../../adapters/telegram-fake/fixtures.js";
import type { Channel } from "../domain/channel.js";
import type { TelegramChat } from "../domain/telegram-chat.js";
import type { TelegramChatRepository, UpsertTelegramChatInput } from "../ports/telegram-chat-repository.js";
import { createChannelResolver } from "./channel-resolution.js";

function createFakeTelegramChatRepository(): TelegramChatRepository {
  const chats: TelegramChat[] = [];

  return {
    async upsert(input: UpsertTelegramChatInput) {
      const existing = chats.find((chat) => chat.telegramId === input.telegramId);
      if (existing) {
        existing.title = input.title;
        existing.type = input.type;
        existing.username = input.username;
        existing.updatedAt = input.now;
        return existing;
      }
      const created: TelegramChat = {
        telegramId: input.telegramId,
        title: input.title,
        type: input.type,
        username: input.username,
        createdAt: input.now,
        updatedAt: input.now,
      };
      chats.push(created);
      return created;
    },
    async findByTelegramId(telegramId: string) {
      return chats.find((chat) => chat.telegramId === telegramId) ?? null;
    },
    async list() {
      return [...chats];
    },
  };
}

function makeFixture(chatId: string, username: string | null = null): FakeChatFixture {
  return {
    chat: { id: chatId, title: `Chat ${chatId}`, type: "channel", username },
    messages: [],
    media: {},
  };
}

describe("channel resolver", () => {
  it("resolveExisting returns null when nothing is known locally yet", async () => {
    const resolver = createChannelResolver({
      telegramAccess: createFakeTelegramAccessAdapter([]),
      telegramChatRepo: createFakeTelegramChatRepository(),
    });
    const channel: Channel = { id: 1, identifier: { type: "telegram_id", value: "chat-1" }, enabled: true, createdAt: 0, updatedAt: 0 };

    expect(await resolver.resolveExisting(channel)).toBeNull();
  });

  it("resolveOrDiscover discovers and persists a channel visible on telegram-service by telegram_id", async () => {
    const resolver = createChannelResolver({
      telegramAccess: createFakeTelegramAccessAdapter([makeFixture("chat-1")]),
      telegramChatRepo: createFakeTelegramChatRepository(),
    });
    const channel: Channel = { id: 1, identifier: { type: "telegram_id", value: "chat-1" }, enabled: true, createdAt: 0, updatedAt: 0 };

    const chat = await resolver.resolveOrDiscover(channel, 1000);

    expect(chat).toMatchObject({ telegramId: "chat-1", title: "Chat chat-1" });
  });

  it("resolveOrDiscover discovers a channel by username", async () => {
    const resolver = createChannelResolver({
      telegramAccess: createFakeTelegramAccessAdapter([makeFixture("chat-1", "somechannel")]),
      telegramChatRepo: createFakeTelegramChatRepository(),
    });
    const channel: Channel = { id: 1, identifier: { type: "username", value: "somechannel" }, enabled: true, createdAt: 0, updatedAt: 0 };

    const chat = await resolver.resolveOrDiscover(channel, 1000);

    expect(chat).toMatchObject({ telegramId: "chat-1", username: "somechannel" });
  });

  it("resolveOrDiscover returns null when the channel isn't visible to this account", async () => {
    const resolver = createChannelResolver({
      telegramAccess: createFakeTelegramAccessAdapter([]),
      telegramChatRepo: createFakeTelegramChatRepository(),
    });
    const channel: Channel = { id: 1, identifier: { type: "telegram_id", value: "missing" }, enabled: true, createdAt: 0, updatedAt: 0 };

    expect(await resolver.resolveOrDiscover(channel, 1000)).toBeNull();
  });

  it("resolveOrDiscover reuses the local chat once known, without a remote call", async () => {
    const telegramAccess = createFakeTelegramAccessAdapter([makeFixture("chat-1")]);
    const telegramChatRepo = createFakeTelegramChatRepository();
    const resolver = createChannelResolver({ telegramAccess, telegramChatRepo });
    const channel: Channel = { id: 1, identifier: { type: "telegram_id", value: "chat-1" }, enabled: true, createdAt: 0, updatedAt: 0 };
    await resolver.resolveOrDiscover(channel, 1000);

    const listChatsSpy = vi.spyOn(telegramAccess, "listChats");
    const chat = await resolver.resolveOrDiscover(channel, 2000);

    expect(chat).toMatchObject({ telegramId: "chat-1" });
    expect(listChatsSpy).not.toHaveBeenCalled();
  });
});
