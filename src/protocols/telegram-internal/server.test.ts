import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeTelegramAccessAdapter } from "../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import { createTelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import type { ChatSummary, MessageSummary } from "../../modules/telegram-access/ports/models.js";
import { createTelegramInternalServer } from "./server.js";

describe("telegram-internal server", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const useCases = createTelegramAccessUseCases(createFakeTelegramAccessAdapter());
    const app = createTelegramInternalServer(useCases);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("GET /healthz returns 200", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /status returns the connection status", async () => {
    const res = await fetch(`${baseUrl}/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      connected: true,
      account: { id: "fake-account-1", username: "telesift_dev", firstName: "TeleSift Dev" },
    });
  });

  it("GET /chats lists the fixture chats", async () => {
    const res = await fetch(`${baseUrl}/chats`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatSummary[];
    expect(body).toHaveLength(2);
    expect(body.map((chat) => chat.id)).toEqual(["channel-1", "group-2"]);
  });

  it("GET /chats/:chatId/messages lists messages for a known chat", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MessageSummary[];
    expect(body).toHaveLength(2);
    expect(body[0]?.messageId).toBe(101);
  });

  it("GET /chats/:chatId/messages respects minId/limit pagination", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages?minId=101&limit=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MessageSummary[];
    expect(body).toHaveLength(1);
    expect(body[0]?.messageId).toBe(102);
  });

  it("GET /chats/:chatId/messages returns 404 for an unknown chat", async () => {
    const res = await fetch(`${baseUrl}/chats/does-not-exist/messages`);
    expect(res.status).toBe(404);
  });

  it("GET /chats/:chatId/messages/:messageId returns a single message", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages/102`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MessageSummary;
    expect(body.text).toBe("Fauda.S04E03.1080p.WEB-DL");
  });

  it("GET /chats/:chatId/messages/:messageId returns 404 for a missing message", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages/9999`);
    expect(res.status).toBe(404);
  });

  it("GET /chats/:chatId/messages/:messageId returns 400 for a malformed messageId", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages/not-a-number`);
    expect(res.status).toBe(400);
  });

  it("GET /chats/:chatId/messages/:messageId/media streams the media bytes with headers", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages/102/media`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/x-matroska");
    expect(res.headers.get("content-length")).toBe("42");
    expect(res.headers.get("content-disposition")).toContain("Fauda.S04E03.1080p.WEB-DL.mkv");
    const bytes = await res.text();
    expect(bytes).toBe("synthetic-fake-video-bytes-for-message-102");
  });

  it("GET /chats/:chatId/messages/:messageId/media returns 404 when the message has no media", async () => {
    const res = await fetch(`${baseUrl}/chats/channel-1/messages/101/media`);
    expect(res.status).toBe(404);
  });

  it("GET /chats/:chatId/messages/:messageId/media sets a valid header for a non-ASCII filename", async () => {
    // Node throws ERR_INVALID_CHAR for non-Latin-1 bytes in a raw `filename` param;
    // this would fail with a 500 (or an uncaught exception) without RFC 5987 encoding.
    const res = await fetch(`${baseUrl}/chats/group-2/messages/203/media`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''%D7%A4%D7%A8%D7%A7");
  });
});
