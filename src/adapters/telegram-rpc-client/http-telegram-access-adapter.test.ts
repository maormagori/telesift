import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeTelegramAccessAdapter } from "../telegram-fake/fake-telegram-access-adapter.js";
import { createTelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import { ChatNotFoundError, MessageUnavailableError } from "../../modules/telegram-access/application/use-cases.js";
import { createTelegramInternalServer } from "../../protocols/telegram-internal/server.js";
import type { TelegramAccessPort } from "../../modules/telegram-access/ports/telegram-access-port.js";
import { createHttpTelegramAccessAdapter } from "./http-telegram-access-adapter.js";

describe("telegram-rpc-client contract", () => {
  let server: Server;
  let client: TelegramAccessPort;

  beforeAll(async () => {
    const useCases = createTelegramAccessUseCases(createFakeTelegramAccessAdapter());
    const app = createTelegramInternalServer(useCases);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected an AddressInfo");
    client = createHttpTelegramAccessAdapter(`http://127.0.0.1:${address.port}`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("round-trips getStatus", async () => {
    const status = await client.getStatus();
    expect(status).toEqual({
      connected: true,
      account: { id: "fake-account-1", username: "telesift_dev", firstName: "TeleSift Dev" },
    });
  });

  it("round-trips listChats", async () => {
    const chats = await client.listChats();
    expect(chats).toEqual([
      { id: "channel-1", title: "ערוץ הבדיקות", type: "channel", username: "test_channel_he" },
      { id: "group-2", title: "TV Releases Discussion", type: "group", username: null },
    ]);
  });

  it("round-trips getMessages with pagination options", async () => {
    const messages = await client.getMessages("channel-1", { minId: 101, limit: 10 });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe(102);
  });

  it("throws ChatNotAccessibleError when getMessages targets an unknown chat", async () => {
    await expect(client.getMessages("does-not-exist", { limit: 10 })).rejects.toThrow("Chat not accessible");
  });

  it("round-trips getMessage for a known message", async () => {
    const message = await client.getMessage("channel-1", 102);
    expect(message).toEqual({
      chatId: "channel-1",
      messageId: 102,
      date: 1_700_000_100,
      text: "Fauda.S04E03.1080p.WEB-DL",
      replyToMessageId: null,
      mediaGroupId: null,
      media: {
        fileName: "Fauda.S04E03.1080p.WEB-DL.mkv",
        mimeType: "video/x-matroska",
        sizeBytes: 42,
        durationSeconds: 2_640,
        width: 1920,
        height: 1080,
      },
    });
  });

  it("returns null from getMessage when the message does not exist", async () => {
    const message = await client.getMessage("channel-1", 9999);
    expect(message).toBeNull();
  });

  it("round-trips getMediaStream, including the full descriptor and bytes", async () => {
    const media = await client.getMediaStream("channel-1", 102);
    expect(media?.descriptor).toEqual({
      fileName: "Fauda.S04E03.1080p.WEB-DL.mkv",
      mimeType: "video/x-matroska",
      sizeBytes: 42,
      durationSeconds: 2_640,
      width: 1920,
      height: 1080,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of media!.stream) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString("utf8")).toBe("synthetic-fake-video-bytes-for-message-102");
  });

  it("returns null from getMediaStream when the message has no media", async () => {
    const media = await client.getMediaStream("channel-1", 101);
    expect(media).toBeNull();
  });

  it("round-trips a non-ASCII (Hebrew) filename through getMediaStream", async () => {
    const media = await client.getMediaStream("group-2", 203);
    expect(media?.descriptor.fileName).toBe("פרק חדש.mp4");
  });

  it("use-cases translate the rpc client's ChatNotAccessibleError the same way as any other adapter", async () => {
    const useCases = createTelegramAccessUseCases(client);
    await expect(useCases.getMessages("does-not-exist", { limit: 10 })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(useCases.getMessage("channel-1", 9999)).rejects.toBeInstanceOf(MessageUnavailableError);
  });
});
