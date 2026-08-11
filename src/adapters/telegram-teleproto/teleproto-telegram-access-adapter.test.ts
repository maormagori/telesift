import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramCredentials } from "../../platform/config/env.js";

const { getMessages, mockClient } = vi.hoisted(() => {
  const getMessages = vi.fn();
  return {
    getMessages,
    mockClient: {
      connected: true,
      connect: vi.fn().mockResolvedValue(true),
      getMessages,
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
