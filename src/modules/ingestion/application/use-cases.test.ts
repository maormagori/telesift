import { describe, expect, it } from "vitest";
import { createFakeTelegramAccessAdapter } from "../../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import type { FakeChatFixture } from "../../../adapters/telegram-fake/fixtures.js";
import type { ChatSummary } from "../../telegram-access/ports/models.js";
import { ChannelNotFoundError, DEFAULT_BACKFILL_POLICY, type Channel, type ChannelIdentifier } from "../domain/channel.js";
import type { ChatSyncState } from "../domain/chat-sync-state.js";
import type { TelegramChat } from "../domain/telegram-chat.js";
import type { ChannelRepository } from "../ports/channel-repository.js";
import type { ChatSyncStateRepository } from "../ports/chat-sync-state-repository.js";
import type { TelegramChatRepository, UpsertTelegramChatInput } from "../ports/telegram-chat-repository.js";
import { createChannelResolver } from "./channel-resolution.js";
import { createChannelStatusUseCases, createIngestionUseCases } from "./use-cases.js";

function sameIdentifier(a: ChannelIdentifier, b: ChannelIdentifier): boolean {
  return a.type === b.type && a.value === b.value;
}

function createFakeChannelRepository(): ChannelRepository {
  const channels: Channel[] = [];
  let nextId = 1;

  return {
    async add(identifier, backfillPolicy) {
      const existing = channels.find((channel) => sameIdentifier(channel.identifier, identifier));
      if (existing) return existing;
      const now = Date.now();
      const created: Channel = { id: nextId++, identifier, enabled: true, backfillPolicy, createdAt: now, updatedAt: now };
      channels.push(created);
      return created;
    },

    async setEnabled(identifier, enabled) {
      const channel = channels.find((entry) => sameIdentifier(entry.identifier, identifier));
      if (!channel) throw new ChannelNotFoundError(identifier);
      channel.enabled = enabled;
      channel.updatedAt = Date.now();
      return channel;
    },

    async list() {
      return [...channels];
    },
  };
}

describe("ingestion use-cases", () => {
  it("adds a new channel as enabled", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());

    const channel = await useCases.addChannel({ type: "username", value: "somechannel" }, DEFAULT_BACKFILL_POLICY);

    expect(channel).toMatchObject({ identifier: { type: "username", value: "somechannel" }, enabled: true });
  });

  it("adding the same identifier twice is idempotent", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());
    const identifier: ChannelIdentifier = { type: "telegram_id", value: "123" };

    const first = await useCases.addChannel(identifier, DEFAULT_BACKFILL_POLICY);
    const second = await useCases.addChannel(identifier, DEFAULT_BACKFILL_POLICY);

    expect(second).toEqual(first);
    expect(await useCases.listChannels()).toHaveLength(1);
  });

  it("disables and re-enables a channel without removing it", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());
    const identifier: ChannelIdentifier = { type: "username", value: "somechannel" };
    await useCases.addChannel(identifier, DEFAULT_BACKFILL_POLICY);

    const disabled = await useCases.disableChannel(identifier);
    expect(disabled.enabled).toBe(false);
    expect(await useCases.listChannels()).toHaveLength(1);

    const reenabled = await useCases.enableChannel(identifier);
    expect(reenabled.enabled).toBe(true);
  });

  it("throws ChannelNotFoundError when enabling an unknown channel", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());

    await expect(useCases.enableChannel({ type: "username", value: "missing" })).rejects.toThrow(
      ChannelNotFoundError,
    );
  });

  it("lists every added channel", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());
    await useCases.addChannel({ type: "username", value: "a" }, DEFAULT_BACKFILL_POLICY);
    await useCases.addChannel({ type: "telegram_id", value: "1" }, DEFAULT_BACKFILL_POLICY);

    expect(await useCases.listChannels()).toHaveLength(2);
  });
});

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

function createFakeChatSyncStateRepository(): ChatSyncStateRepository {
  const states = new Map<string, ChatSyncState>();

  function getOrCreate(chatId: string, now: number): ChatSyncState {
    const existing = states.get(chatId);
    if (existing) return existing;
    const created: ChatSyncState = {
      chatId,
      newestSeenMessageId: null,
      oldestBackfilledMessageId: null,
      backfillCompletedAt: null,
      lastRescannedAt: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: now,
      updatedAt: now,
    };
    states.set(chatId, created);
    return created;
  }

  return {
    async get(chatId) {
      return states.get(chatId) ?? null;
    },
    async advanceIncrementalCursor(chatId, newestSeenMessageId, now) {
      const state = getOrCreate(chatId, now);
      state.newestSeenMessageId = newestSeenMessageId;
      state.updatedAt = now;
      return state;
    },
    async advanceBackfillCursor(chatId, oldestBackfilledMessageId, now) {
      const state = getOrCreate(chatId, now);
      state.oldestBackfilledMessageId = oldestBackfilledMessageId;
      state.updatedAt = now;
      return state;
    },
    async markBackfillCompleted(chatId, completedAt) {
      const state = getOrCreate(chatId, completedAt);
      state.backfillCompletedAt = completedAt;
      return state;
    },
    async recordRescan(chatId, rescannedAt) {
      const state = getOrCreate(chatId, rescannedAt);
      state.lastRescannedAt = rescannedAt;
      return state;
    },
    async recordError(chatId, error, at) {
      const state = getOrCreate(chatId, at);
      state.lastError = error;
      state.lastErrorAt = at;
      return state;
    },
  };
}

function makeFixture(chatId: string, username: string | null = null, type: ChatSummary["type"] = "channel"): FakeChatFixture {
  return {
    chat: { id: chatId, title: `Chat ${chatId}`, type, username },
    messages: [],
    media: {},
  };
}

function buildChannelStatus(fixtures: FakeChatFixture[]) {
  const channelRepo = createFakeChannelRepository();
  const chatSyncStateRepo = createFakeChatSyncStateRepository();
  const telegramAccess = createFakeTelegramAccessAdapter(fixtures);
  const resolver = createChannelResolver({ telegramAccess, telegramChatRepo: createFakeTelegramChatRepository() });
  const useCases = createChannelStatusUseCases({ channelRepo, chatSyncStateRepo, resolver, telegramAccess });
  return { channelRepo, chatSyncStateRepo, useCases };
}

describe("channel status use-cases", () => {
  it("addChannelResolved resolves a channel that's already visible to the account", async () => {
    const { useCases } = buildChannelStatus([makeFixture("chat-1")]);

    const result = await useCases.addChannelResolved({ type: "telegram_id", value: "chat-1" }, DEFAULT_BACKFILL_POLICY, 1000);

    expect(result.resolution).toMatchObject({ status: "resolved", chat: { telegramId: "chat-1" } });
  });

  it("addChannelResolved stores the requested backfill policy", async () => {
    const { useCases } = buildChannelStatus([makeFixture("chat-1")]);

    const result = await useCases.addChannelResolved(
      { type: "telegram_id", value: "chat-1" },
      { enabled: true, maxMessages: 25 },
      1000,
    );

    expect(result.channel.backfillPolicy).toEqual({ enabled: true, maxMessages: 25 });
  });

  it("addChannelResolved still persists the channel when it isn't visible yet", async () => {
    const { channelRepo, useCases } = buildChannelStatus([]);

    const result = await useCases.addChannelResolved({ type: "telegram_id", value: "chat-missing" }, DEFAULT_BACKFILL_POLICY, 1000);

    expect(result.resolution).toEqual({ status: "unresolved" });
    expect(await channelRepo.list()).toHaveLength(1);
  });

  it("listChannelsWithStatus combines channels, resolved chats, and sync state", async () => {
    const { channelRepo, chatSyncStateRepo, useCases } = buildChannelStatus([makeFixture("chat-1")]);

    await useCases.addChannelResolved({ type: "telegram_id", value: "chat-1" }, DEFAULT_BACKFILL_POLICY, 1000);
    await channelRepo.add({ type: "telegram_id", value: "chat-not-yet-visible" }, DEFAULT_BACKFILL_POLICY);
    await chatSyncStateRepo.advanceIncrementalCursor("chat-1", 42, 1000);

    const statuses = await useCases.listChannelsWithStatus();

    const resolved = statuses.find((entry) => entry.channel.identifier.value === "chat-1");
    expect(resolved?.chat).toMatchObject({ telegramId: "chat-1" });
    expect(resolved?.syncState?.newestSeenMessageId).toBe(42);

    const unresolved = statuses.find((entry) => entry.channel.identifier.value === "chat-not-yet-visible");
    expect(unresolved?.chat).toBeNull();
    expect(unresolved?.syncState).toBeNull();
  });

  it("listVisibleChats offers channels and groups but not private chats", async () => {
    const { useCases } = buildChannelStatus([
      makeFixture("chat-channel", null, "channel"),
      makeFixture("chat-group", null, "group"),
      makeFixture("chat-user", null, "user"),
    ]);

    const visible = await useCases.listVisibleChats();

    expect(visible.map((entry) => entry.chat.id)).toEqual(["chat-channel", "chat-group"]);
  });

  it("listVisibleChats marks chats already configured by id or by username", async () => {
    const { channelRepo, useCases } = buildChannelStatus([
      makeFixture("chat-by-id"),
      makeFixture("chat-by-username", "examplechannel"),
      makeFixture("chat-not-added"),
    ]);
    const byId = await channelRepo.add({ type: "telegram_id", value: "chat-by-id" }, DEFAULT_BACKFILL_POLICY);
    const byUsername = await channelRepo.add({ type: "username", value: "examplechannel" }, DEFAULT_BACKFILL_POLICY);

    const visible = await useCases.listVisibleChats();

    expect(visible.map((entry) => [entry.chat.id, entry.channel?.id ?? null])).toEqual([
      ["chat-by-id", byId.id],
      ["chat-by-username", byUsername.id],
      ["chat-not-added", null],
    ]);
  });
});

