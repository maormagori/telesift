import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramCredentials } from "../../platform/config/env.js";

const { getMessages, downloadProfilePhoto, mockClient } = vi.hoisted(() => {
  const getMessages = vi.fn();
  const downloadProfilePhoto = vi.fn();
  return {
    getMessages,
    downloadProfilePhoto,
    mockClient: {
      connected: true,
      connect: vi.fn().mockResolvedValue(true),
      getMessages,
      downloadProfilePhoto,
    },
  };
});

vi.mock("teleproto", () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClient),
}));
vi.mock("teleproto/sessions/index.js", () => ({
  StringSession: vi.fn().mockImplementation(() => ({})),
}));

const { createTeleprotoTelegramAccessAdapter } = await import("./teleproto-telegram-access-adapter.js");

const CREDENTIALS: TelegramCredentials = { apiId: 1, apiHash: "hash", session: "session-string" };

describe("createTeleprotoTelegramAccessAdapter getMessages ordering", () => {
  beforeEach(() => {
    getMessages.mockReset();
    getMessages.mockResolvedValue([{ id: 102, date: 1_700_000_100, text: "hi" }]);
  });

  it("requests ascending order from teleproto, passing minId/maxId/limit through unchanged", async () => {
    const adapter = createTeleprotoTelegramAccessAdapter(CREDENTIALS);

    await adapter.getMessages("channel-1", { minId: 101, maxId: 500, limit: 50 });

    expect(getMessages).toHaveBeenCalledWith("channel-1", {
      limit: 50,
      minId: 101,
      maxId: 500,
      reverse: true,
    });
  });

  it("still requests reverse order when minId/maxId are absent", async () => {
    const adapter = createTeleprotoTelegramAccessAdapter(CREDENTIALS);

    await adapter.getMessages("channel-1", { limit: 50 });

    expect(getMessages).toHaveBeenCalledWith("channel-1", {
      limit: 50,
      minId: undefined,
      maxId: undefined,
      reverse: true,
    });
  });
});

describe("createTeleprotoTelegramAccessAdapter getLatestMessageId", () => {
  beforeEach(() => {
    getMessages.mockReset();
  });

  it("reads one message in teleproto's default newest-first order", async () => {
    getMessages.mockResolvedValue([{ id: 512, date: 1_700_000_100, text: "latest" }]);
    const adapter = createTeleprotoTelegramAccessAdapter(CREDENTIALS);

    expect(await adapter.getLatestMessageId("channel-1")).toBe(512);
    expect(getMessages).toHaveBeenCalledWith("channel-1", { limit: 1 });
  });

  it("returns null for a chat with no messages", async () => {
    getMessages.mockResolvedValue([]);
    const adapter = createTeleprotoTelegramAccessAdapter(CREDENTIALS);

    expect(await adapter.getLatestMessageId("channel-1")).toBeNull();
  });
});

describe("createTeleprotoTelegramAccessAdapter getChatPhoto", () => {
  beforeEach(() => {
    downloadProfilePhoto.mockReset();
  });

  it("downloads the small profile photo", async () => {
    const photo = Buffer.from("synthetic-photo");
    downloadProfilePhoto.mockResolvedValue(photo);
    const adapter = createTeleprotoTelegramAccessAdapter(CREDENTIALS);

    expect(await adapter.getChatPhoto("channel-1")).toEqual(photo);
    expect(downloadProfilePhoto).toHaveBeenCalledWith("channel-1", { isBig: false });
  });

  it("returns null when teleproto returns an empty buffer for a chat without a photo", async () => {
    downloadProfilePhoto.mockResolvedValue(Buffer.alloc(0));
    const adapter = createTeleprotoTelegramAccessAdapter(CREDENTIALS);

    expect(await adapter.getChatPhoto("channel-1")).toBeNull();
  });
});
